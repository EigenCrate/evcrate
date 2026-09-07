'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoutingError } = require('./errors.cjs');
const {
  MAX_EFFORT_BYTES,
  MAX_MODEL_BYTES,
  MAX_POLICY_BYTES,
  decodeUtf8,
  parseJsonDocument,
  deepFreeze,
  validatePolicy,
  validateTarget,
  CANDIDATE_BACKENDS,
  ENABLED_BACKENDS
} = require('./policy-schema.cjs');

function fail(code) { throw createRoutingError(code); }
function existingStat(file) {
  try { return fs.lstatSync(file); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    fail('ROUTE_PATH_UNSAFE');
  }
}
function assertDirectorySafety(stat) {
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('ROUTE_PATH_UNSAFE');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('ROUTE_PATH_UNSAFE');
  if (process.platform !== 'win32' && (stat.mode & 0o022) !== 0) fail('ROUTE_PATH_UNSAFE');
}
function assertPolicyFileSafety(stat) {
  if (stat.isSymbolicLink() || !stat.isFile()) fail('ROUTE_PATH_UNSAFE');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('ROUTE_PATH_UNSAFE');
  if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) fail('ROUTE_PATH_UNSAFE');
}
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function realPath(file) {
  try { return fs.realpathSync.native(file); }
  catch { fail('ROUTE_PATH_UNSAFE'); }
}
function resolveHomeValue(home) {
  if (typeof home !== 'string' || !home || home.includes('\0') || !path.isAbsolute(home)
    || path.parse(home).root === path.normalize(home)) fail('HOME_UNAVAILABLE');
  return path.normalize(home);
}
function platformHome() {
  try { return resolveHomeValue(os.homedir()); }
  catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail('HOME_UNAVAILABLE');
  }
}
function stableDirectory(file, missingCode = 'HOME_UNAVAILABLE') {
  const stat = existingStat(file);
  if (!stat) fail(missingCode);
  assertDirectorySafety(stat);
  return { path: file, identity: identity(stat), realpath: realPath(file) };
}
function createContext(home) {
  const homeDirectory = stableDirectory(resolveHomeValue(home));
  const policyDirectoryPath = path.join(homeDirectory.path, '.evcrate');
  const policyDirectoryStat = existingStat(policyDirectoryPath);
  const policyDirectory = policyDirectoryStat
    ? stableDirectory(policyDirectoryPath)
    : null;
  return Object.freeze({
    homeDirectory,
    policyDirectory,
    policyPath: path.join(policyDirectoryPath, 'advisor-routing.json')
  });
}
function assertContextStable(context) {
  for (const directory of [context.homeDirectory, context.policyDirectory].filter(Boolean)) {
    const current = existingStat(directory.path);
    if (!current || !sameIdentity(identity(current), directory.identity)
      || realPath(directory.path) !== directory.realpath) fail('ROUTE_PATH_UNSAFE');
    assertDirectorySafety(current);
  }
}
function resolvePolicyPath() { return createContext(platformHome()).policyPath; }
function readPolicyFile(context, expectedStat) {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== 'number') fail('ROUTE_PATH_UNSAFE');
  assertContextStable(context);
  let descriptor;
  try {
    descriptor = fs.openSync(context.policyPath, fs.constants.O_RDONLY | noFollow);
    const initial = fs.fstatSync(descriptor);
    assertPolicyFileSafety(initial);
    if (!sameIdentity(identity(initial), identity(expectedStat))) fail('ROUTE_PATH_UNSAFE');
    if (initial.size > MAX_POLICY_BYTES) fail('ROUTE_POLICY_OVERSIZED');
    const buffer = Buffer.alloc(initial.size);
    const length = fs.readSync(descriptor, buffer, 0, initial.size, 0);
    const final = fs.fstatSync(descriptor);
    const current = existingStat(context.policyPath);
    if (length !== initial.size || !sameIdentity(identity(final), identity(initial))
      || final.size !== initial.size || !current || !sameIdentity(identity(current), identity(final))) {
      fail(final.size > MAX_POLICY_BYTES ? 'ROUTE_POLICY_OVERSIZED' : 'ROUTE_PATH_UNSAFE');
    }
    assertPolicyFileSafety(final);
    assertContextStable(context);
    return decodeUtf8(buffer, 'ROUTE_POLICY_MALFORMED');
  } catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail(error.code === 'EFBIG' ? 'ROUTE_POLICY_OVERSIZED' : 'ROUTE_PATH_UNSAFE');
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* best effort */ }
    }
  }
}
function loadFromContext(context) {
  if (!context.policyDirectory) fail('ROUTE_POLICY_REQUIRED');
  assertContextStable(context);
  const stat = existingStat(context.policyPath);
  if (!stat) {
    assertContextStable(context);
    if (existingStat(context.policyPath)) fail('ROUTE_PATH_UNSAFE');
    fail('ROUTE_POLICY_REQUIRED');
  }
  assertPolicyFileSafety(stat);
  let policy;
  try { policy = validatePolicy(parseJsonDocument(readPolicyFile(context, stat))); }
  catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail('ROUTE_POLICY_MALFORMED');
  }
  return Object.freeze({ policy, path: context.policyPath });
}
function loadGlobalPolicy(home = undefined) {
  const resolvedHome = home !== undefined ? resolveHomeValue(home) : platformHome();
  return loadFromContext(createContext(resolvedHome));
}

module.exports = {
  CANDIDATE_BACKENDS,
  ENABLED_BACKENDS,
  MAX_EFFORT_BYTES,
  MAX_MODEL_BYTES,
  MAX_POLICY_BYTES,
  deepFreeze,
  loadGlobalPolicy,
  loadFromContext,
  parseJsonDocument,
  resolvePolicyPath,
  validatePolicy,
  validateTarget
};
