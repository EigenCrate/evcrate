'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoutingError } = require('./advisor-routing/errors.cjs');
const { parseJsonDocument } = require('./advisor-routing/json-document.cjs');

const HANDOFF_SCHEMA = 'evcrate-advisor-handoff/v1';
const HANDOFF_TTL_MS = 5 * 60 * 1000;
const MAX_HANDOFF_BYTES = 48 * 1024;
const HANDOFF_KEY_NAME = '.handoff-key';
const HANDOFF_KEY_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const HEX_PATTERN = /^[a-f0-9]{64}$/u;
const DEFAULT_STATE_DIRECTORY = path.join(os.tmpdir(), 'evcrate-advisor-handoffs');

function fail() {
  throw createRoutingError('NATIVE_HANDOFF_INVALID');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function token() {
  return crypto.randomBytes(32).toString('base64url');
}

function tokenPath(directory, value) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) fail();
  return path.join(directory, `handoff-${value}.json`);
}

function privateDirectory(directory) {
  if (typeof directory !== 'string' || !directory || !path.isAbsolute(directory)) fail();
  try { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); }
  catch { fail(); }
  let stat;
  try { stat = fs.lstatSync(directory); }
  catch { fail(); }
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077)) fail();
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail();
  return directory;
}

function stateDirectory(options = {}) {
  return privateDirectory(options.stateDirectory || DEFAULT_STATE_DIRECTORY);
}

function assertPrivateFile(filename) {
  let stat;
  try { stat = fs.lstatSync(filename); }
  catch { fail(); }
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077)
    || stat.size > MAX_HANDOFF_BYTES) fail();
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail();
  return stat;
}

function readHandoffKey(filename) {
  let stat;
  try { stat = fs.lstatSync(filename); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail();
  }
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077)
    || stat.size !== HANDOFF_KEY_BYTES) fail();
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail();
  let key;
  try { key = fs.readFileSync(filename); } catch { fail(); }
  if (key.length !== HANDOFF_KEY_BYTES) fail();
  return key;
}

function handoffKey(directory) {
  const filename = path.join(directory, HANDOFF_KEY_NAME);
  const existing = readHandoffKey(filename);
  if (existing) return existing;
  const temporary = path.join(directory, `${HANDOFF_KEY_NAME}.tmp-${process.pid}-${token()}`);
  const key = crypto.randomBytes(HANDOFF_KEY_BYTES);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
    | (fs.constants.O_NOFOLLOW || 0);
  let fd;
  try {
    fd = fs.openSync(temporary, flags, 0o600);
    fs.writeFileSync(fd, key);
    fs.fsyncSync(fd);
    fs.fchmodSync(fd, 0o600);
    fs.closeSync(fd);
    fd = undefined;
    // A hard link publishes the fully written key without allowing a racing
    // creator to replace an existing key.
    fs.linkSync(temporary, filename);
    return key;
  } catch (error) {
    if (error?.code !== 'EEXIST') fail();
    const raced = readHandoffKey(filename);
    if (!raced) fail();
    return raced;
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(temporary); } catch {}
  }
}

function integrityPayload(record) {
  return JSON.stringify({
    schema: record.schema,
    version: record.version,
    token_hash: record.token_hash,
    expires_at: record.expires_at,
    active_host: record.active_host,
    checkpoint: record.checkpoint,
    descriptor: record.descriptor
  });
}

function integrityFor(record, key) {
  return crypto.createHmac('sha256', key).update(integrityPayload(record)).digest('hex');
}

function recordFor(value, handoffToken, expiresAt, key) {
  const record = {
    schema: HANDOFF_SCHEMA,
    version: 1,
    token_hash: crypto.createHash('sha256').update(handoffToken).digest('hex'),
    expires_at: expiresAt,
    active_host: value.activeHost,
    checkpoint: value.checkpoint,
    descriptor: value.descriptor,
    integrity: undefined
  };
  record.integrity = integrityFor(record, key);
  const encoded = JSON.stringify(record);
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > MAX_HANDOFF_BYTES) fail();
  return encoded;
}

function createHandoff(value, options = {}) {
  if (!isObject(value) || !Object.hasOwn(value, 'activeHost')
    || !Object.hasOwn(value, 'checkpoint') || !Object.hasOwn(value, 'descriptor')) fail();
  const directory = stateDirectory(options);
  const key = handoffKey(directory);
  const expiresAt = Date.now() + HANDOFF_TTL_MS;
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
    | (fs.constants.O_NOFOLLOW || 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const handoffToken = token();
    const filename = tokenPath(directory, handoffToken);
    let fd;
    try {
      fd = fs.openSync(filename, flags, 0o600);
      fs.writeFileSync(fd, recordFor(value, handoffToken, expiresAt, key), 'utf8');
      fs.fchmodSync(fd, 0o600);
      return Object.freeze({ token: handoffToken, expiresAt });
    } catch (error) {
      if (error?.code !== 'EEXIST' || fd !== undefined) {
        try { if (fd !== undefined) fs.closeSync(fd); } catch {}
        try { fs.unlinkSync(filename); } catch {}
        fail();
      }
    } finally {
      try { if (fd !== undefined) fs.closeSync(fd); } catch {}
    }
  }
  fail();
}

function validRecord(record, handoffToken, key) {
  if (!isObject(record) || Object.keys(record).length !== 8
    || record.schema !== HANDOFF_SCHEMA || record.version !== 1
    || typeof record.token_hash !== 'string' || !HEX_PATTERN.test(record.token_hash)
    || typeof record.integrity !== 'string' || !HEX_PATTERN.test(record.integrity)
    || !Number.isSafeInteger(record.expires_at) || record.expires_at <= Date.now()
    || typeof record.active_host !== 'string' || !Object.hasOwn(record, 'checkpoint')
    || !Object.hasOwn(record, 'descriptor')) fail();
  const actual = crypto.createHash('sha256').update(handoffToken).digest();
  const expected = Buffer.from(record.token_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) fail();
  const integrity = Buffer.from(integrityFor(record, key), 'hex');
  const suppliedIntegrity = Buffer.from(record.integrity, 'hex');
  if (integrity.length !== suppliedIntegrity.length
    || !crypto.timingSafeEqual(integrity, suppliedIntegrity)) fail();
  return record;
}

function readRecord(filename, handoffToken, key = handoffKey(path.dirname(filename))) {
  const stat = assertPrivateFile(filename);
  const encoded = fs.readFileSync(filename, 'utf8');
  if (Buffer.byteLength(encoded, 'utf8') !== stat.size) fail();
  let record;
  try { record = parseJsonDocument(encoded); } catch { fail(); }
  return validRecord(record, handoffToken, key);
}

function inspectHandoff(handoffToken, options = {}) {
  const directory = stateDirectory(options);
  const source = tokenPath(directory, handoffToken);
  return readRecord(source, handoffToken, handoffKey(directory));
}

function consumeHandoff(handoffToken, options = {}) {
  const directory = stateDirectory(options);
  const key = handoffKey(directory);
  const source = tokenPath(directory, handoffToken);
  assertPrivateFile(source);
  const claimed = path.join(directory, `.claim-${process.pid}-${token()}.json`);
  try {
    fs.renameSync(source, claimed);
    return readRecord(claimed, handoffToken, key);
  } catch {
    fail();
  } finally {
    try { fs.unlinkSync(claimed); } catch {}
  }
}

module.exports = {
  DEFAULT_STATE_DIRECTORY,
  HANDOFF_SCHEMA,
  HANDOFF_TTL_MS,
  MAX_HANDOFF_BYTES,
  consumeHandoff,
  createHandoff,
  inspectHandoff,
  stateDirectory
};
