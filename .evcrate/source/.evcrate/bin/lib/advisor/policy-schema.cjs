'use strict';

const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');

const CANDIDATE_BACKENDS = Object.freeze(['claude', 'codex', 'antigravity', 'pi', 'omp']);
const ENABLED_BACKENDS = Object.freeze(['claude', 'codex', 'pi', 'omp']);
const BACKENDS = CANDIDATE_BACKENDS;
const TARGET_KEYS = Object.freeze(['backend', 'model', 'effort', 'timeout_ms']);
const POLICY_KEYS = Object.freeze(['version', 'advisor']);
const MAX_POLICY_BYTES = 16 * 1024;
const MAX_MODEL_BYTES = 256;
const MAX_EFFORT_BYTES = 64;
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 900_000;
const CREDENTIAL_KEY = /(?:api[_ -]?key|token|secret|password|passwd|authorization|cookie|credential)/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function fail(code) { throw createRoutingError(code); }
function bytes(value) { return Buffer.byteLength(String(value), 'utf8'); }
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
function assertKeys(value, expected) {
  if (!isPlainObject(value)) fail('ROUTE_SCHEMA_INVALID');
  const keys = Object.keys(value);
  if (keys.some((key) => CREDENTIAL_KEY.test(key))) fail('ROUTE_CREDENTIAL_FIELD');
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    fail('ROUTE_SCHEMA_INVALID');
  }
}
function text(value, limit) {
  if (typeof value !== 'string' || !value || value.trim() !== value
    || CONTROL.test(value) || bytes(value) > limit) fail('ROUTE_ENTRY_INVALID');
  return value;
}
function validateTarget(target) {
  assertKeys(target, TARGET_KEYS);
  if (!CANDIDATE_BACKENDS.includes(target.backend)) fail('ROUTE_ENTRY_INVALID');
  text(target.model, MAX_MODEL_BYTES);
  text(target.effort, MAX_EFFORT_BYTES);
  if (typeof target.timeout_ms !== 'number' || !Number.isInteger(target.timeout_ms)
    || target.timeout_ms < MIN_TIMEOUT_MS || target.timeout_ms > MAX_TIMEOUT_MS) {
    fail('ROUTE_ENTRY_INVALID');
  }
  return target;
}
function validatePolicy(policy) {
  if (!isPlainObject(policy)) fail('ROUTE_SCHEMA_INVALID');
  if (Object.hasOwn(policy, 'hosts')) fail('ROUTE_SCHEMA_MIGRATION_REQUIRED');
  assertKeys(policy, POLICY_KEYS);
  if (policy.version !== 1 || !Number.isInteger(policy.version) || typeof policy.version === 'boolean') {
    fail('ROUTE_SCHEMA_INVALID');
  }
  validateTarget(policy.advisor);
  return deepFreeze(policy);
}

module.exports = {
  BACKENDS,
  CANDIDATE_BACKENDS,
  ENABLED_BACKENDS,
  MAX_EFFORT_BYTES,
  MAX_MODEL_BYTES,
  MAX_POLICY_BYTES,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  POLICY_KEYS,
  TARGET_KEYS,
  decodeUtf8,
  deepFreeze,
  parseJsonDocument,
  validatePolicy,
  validateTarget
};
