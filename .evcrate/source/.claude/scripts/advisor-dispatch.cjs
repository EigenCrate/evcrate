#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const {
  MAX_POLICY_BYTES,
  loadGlobalPolicy,
  parseJsonDocument
} = require('./advisor-routing/profile.cjs');
const { decodeUtf8 } = require('./advisor-routing/policy-schema.cjs');
const { resolveRoute } = require('./advisor-routing/resolve-route.cjs');
const {
  createRoutingError,
  serializeRoutingError
} = require('./advisor-routing/errors.cjs');

const MAX_REQUEST_BYTES = MAX_POLICY_BYTES;
const REQUEST_KEYS = new Set(['operation', 'activeHost']);

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw createRoutingError('REQUEST_INVALID');
  }
  const keys = Object.keys(request);
  if (keys.some((key) => !REQUEST_KEYS.has(key)) || keys.length > REQUEST_KEYS.size) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (request.operation !== undefined && request.operation !== 'resolve') {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (typeof request.activeHost !== 'string' || !request.activeHost) {
    throw createRoutingError('REQUEST_INVALID');
  }
  return request;
}

function dispatchRequest(request) {
  const validated = validateRequest(request);
  const loaded = loadGlobalPolicy();
  return Object.freeze({
    ok: true,
    descriptor: resolveRoute({ activeHost: validated.activeHost, policy: loaded.policy })
  });
}

function readStdin() {
  const chunks = [];
  const chunk = Buffer.alloc(4096);
  let total = 0;
  for (;;) {
    const length = fs.readSync(0, chunk, 0, chunk.length, null);
    if (length === 0) break;
    total += length;
    if (total > MAX_REQUEST_BYTES) throw createRoutingError('REQUEST_INVALID');
    chunks.push(Buffer.from(chunk.subarray(0, length)));
  }
  try { return decodeUtf8(Buffer.concat(chunks, total)); }
  catch { throw createRoutingError('REQUEST_INVALID'); }
}

function readRequest(input) {
  const raw = input === undefined ? readStdin() : input;
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) throw createRoutingError('REQUEST_INVALID');
  if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) throw createRoutingError('REQUEST_INVALID');
  try { return parseJsonDocument(Buffer.isBuffer(raw) ? decodeUtf8(raw) : raw); }
  catch { throw createRoutingError('REQUEST_INVALID'); }
}

function main(input) {
  try {
    const result = dispatchRequest(readRequest(input));
    const encoded = JSON.stringify(result);
    if (input === undefined) process.stdout.write(`${encoded}\n`);
    return encoded;
  } catch (error) {
    const serialized = JSON.stringify({ ok: false, error: serializeRoutingError(error) });
    if (input === undefined) process.stdout.write(`${serialized}\n`);
    return serialized;
  }
}

if (require.main === module) {
  const output = main();
  if (output.includes('"ok":false')) process.exitCode = 1;
}

module.exports = {
  MAX_REQUEST_BYTES,
  dispatchRequest,
  main,
  readRequest,
  validateRequest
};
