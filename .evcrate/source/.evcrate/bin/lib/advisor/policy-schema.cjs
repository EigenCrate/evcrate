'use strict';

const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');

const CANDIDATE_BACKENDS = Object.freeze(['claude', 'codex', 'antigravity', 'pi', 'omp']);
const ENABLED_BACKENDS = Object.freeze(['claude', 'codex', 'pi', 'omp']);
const BACKENDS = CANDIDATE_BACKENDS;

const POLICY_KEYS_V2 = Object.freeze(['version', 'advisor', 'wait', 'history']);
const ADVISOR_KEYS_V2 = Object.freeze(['primary', 'backup']);
const ROUTE_KEYS_V2 = Object.freeze(['backend', 'model', 'effort']);
const WAIT_KEYS_V2 = Object.freeze(['mode', 'warn_after_ms', 'warn_every_ms']);
const HISTORY_KEYS_V2 = Object.freeze(['retention_days', 'max_bytes']);

const POLICY_KEYS_V1 = Object.freeze(['version', 'advisor']);
const TARGET_KEYS_V1 = Object.freeze(['backend', 'model', 'effort', 'timeout_ms']);

const POLICY_KEYS = POLICY_KEYS_V2;
const TARGET_KEYS = TARGET_KEYS_V1;
const validateTarget = validateRouteTarget;
const MAX_POLICY_BYTES = 16 * 1024;
const MAX_MODEL_BYTES = 256;
const MAX_EFFORT_BYTES = 64;
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 900_000;

const MIN_WARN_MS = 1_000;
const MAX_WARN_MS = 3_600_000;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;
const MIN_HISTORY_BYTES = 1_048_576;
const MAX_HISTORY_BYTES = 1_073_741_824;
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
function validateTargetV1(target) {
  assertKeys(target, TARGET_KEYS_V1);
  if (!CANDIDATE_BACKENDS.includes(target.backend)) fail('ROUTE_ENTRY_INVALID');
  text(target.model, MAX_MODEL_BYTES);
  text(target.effort, MAX_EFFORT_BYTES);
  if (typeof target.timeout_ms !== 'number' || !Number.isInteger(target.timeout_ms)
    || target.timeout_ms < MIN_TIMEOUT_MS || target.timeout_ms > MAX_TIMEOUT_MS) {
    fail('ROUTE_ENTRY_INVALID');
  }
  return target;
}
function validateRouteTarget(target) {
  assertKeys(target, ROUTE_KEYS_V2);
  if (!CANDIDATE_BACKENDS.includes(target.backend)) fail('ROUTE_ENTRY_INVALID');
  text(target.model, MAX_MODEL_BYTES);
  text(target.effort, MAX_EFFORT_BYTES);
  return target;
}
function validateIntegerRange(value, min, max) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail('ROUTE_ENTRY_INVALID');
  }
  return value;
}
function validateWait(wait) {
  assertKeys(wait, WAIT_KEYS_V2);
  if (wait.mode !== 'until_terminal') fail('ROUTE_ENTRY_INVALID');
  validateIntegerRange(wait.warn_after_ms, MIN_WARN_MS, MAX_WARN_MS);
  validateIntegerRange(wait.warn_every_ms, MIN_WARN_MS, MAX_WARN_MS);
  return wait;
}
function validateHistory(history) {
  assertKeys(history, HISTORY_KEYS_V2);
  validateIntegerRange(history.retention_days, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS);
  validateIntegerRange(history.max_bytes, MIN_HISTORY_BYTES, MAX_HISTORY_BYTES);
  return history;
}
function validateLegacyPolicy(policy) {
  if (!isPlainObject(policy)) fail('ROUTE_SCHEMA_INVALID');
  if (Object.hasOwn(policy, 'hosts')) fail('ROUTE_SCHEMA_HOSTS_V1');
  assertKeys(policy, POLICY_KEYS_V1);
  if (policy.version !== 1 || !Number.isInteger(policy.version) || typeof policy.version === 'boolean') {
    fail('ROUTE_SCHEMA_INVALID');
  }
  validateTargetV1(policy.advisor);
  return deepFreeze(policy);
}
function validatePolicy(policy) {
  if (!isPlainObject(policy)) fail('ROUTE_SCHEMA_INVALID');
  if (Object.hasOwn(policy, 'hosts')) fail('ROUTE_SCHEMA_MIGRATION_REQUIRED');
  if (policy.version === 1) fail('ROUTE_SCHEMA_V1_MIGRATION_REQUIRED');
  if (policy.version !== 2 || !Number.isInteger(policy.version) || typeof policy.version === 'boolean') {
    fail('ROUTE_SCHEMA_INVALID');
  }
  assertKeys(policy, POLICY_KEYS_V2);
  assertKeys(policy.advisor, ADVISOR_KEYS_V2);
  validateRouteTarget(policy.advisor.primary);
  validateRouteTarget(policy.advisor.backup);
  if (policy.advisor.primary.backend === policy.advisor.backup.backend
    && policy.advisor.primary.model === policy.advisor.backup.model
    && policy.advisor.primary.effort === policy.advisor.backup.effort) {
    fail('ROUTE_BACKUP_IDENTICAL');
  }
  validateWait(policy.wait);
  validateHistory(policy.history);
  return deepFreeze(policy);
}
function inspectPolicy(policy) {
  if (!isPlainObject(policy)) fail('ROUTE_SCHEMA_INVALID');
  if (Object.hasOwn(policy, 'hosts')) fail('ROUTE_SCHEMA_HOSTS_V1');
  if (policy.version === 2) {
    return { policy: validatePolicy(policy), legacy: false, migrationRequired: false };
  }
  if (policy.version === 1) {
    return { policy: validateLegacyPolicy(policy), legacy: true, migrationRequired: true };
  }
  fail('ROUTE_SCHEMA_INVALID');
}
function proposeMigration(legacyPolicy, backupRoute) {
  const validated = validateLegacyPolicy(legacyPolicy);
  const backup = validateRouteTarget(backupRoute);
  const primary = {
    backend: validated.advisor.backend,
    model: validated.advisor.model,
    effort: validated.advisor.effort
  };
  if (primary.backend === backup.backend && primary.model === backup.model && primary.effort === backup.effort) {
    fail('ROUTE_BACKUP_IDENTICAL');
  }
  return validatePolicy({
    version: 2,
    advisor: { primary, backup },
    wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
    history: { retention_days: 30, max_bytes: 104_857_600 }
  });
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
  ADVISOR_KEYS_V2,
  HISTORY_KEYS_V2,
  MAX_HISTORY_BYTES,
  MAX_WARN_MS,
  MIN_HISTORY_BYTES,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_WARN_MS,
  POLICY_KEYS_V1,
  POLICY_KEYS_V2,
  ROUTE_KEYS_V2,
  TARGET_KEYS_V1,
  WAIT_KEYS_V2,
  inspectPolicy,
  proposeMigration,
  validateHistory,
  validateLegacyPolicy,
  validateRouteTarget,
  validateWait,
  TARGET_KEYS,
  decodeUtf8,
  deepFreeze,
  parseJsonDocument,
  validatePolicy,
  validateTarget
};
