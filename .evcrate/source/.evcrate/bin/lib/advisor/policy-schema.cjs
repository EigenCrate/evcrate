'use strict';

const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');
const gen = require('./generated/advisor-contract-runtime.js');

const CANDIDATE_BACKENDS = gen.CANDIDATE_BACKENDS;
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
const MAX_POLICY_BYTES = gen.MAX_POLICY_BYTES;
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

function fail(code) { throw createRoutingError(code); }
const deepFreeze = gen.deepFreeze;

function checkCreds(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (CREDENTIAL_KEY.test(k)) fail('ROUTE_CREDENTIAL_FIELD');
    if (obj[k] && typeof obj[k] === 'object') checkCreds(obj[k]);
  }
}

function validateTargetV1(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target) || Object.getPrototypeOf(target) !== Object.prototype) fail('ROUTE_SCHEMA_INVALID');
  checkCreds(target);
  const keys = Object.keys(target);
  if (keys.length !== TARGET_KEYS_V1.length || keys.some((k) => !TARGET_KEYS_V1.includes(k))) fail('ROUTE_SCHEMA_INVALID');
  if (!CANDIDATE_BACKENDS.includes(target.backend)) fail('ROUTE_ENTRY_INVALID');
  if (typeof target.model !== 'string' || !target.model || target.model.trim() !== target.model || Buffer.byteLength(target.model, 'utf8') > MAX_MODEL_BYTES) fail('ROUTE_ENTRY_INVALID');
  if (typeof target.effort !== 'string' || !target.effort || target.effort.trim() !== target.effort || Buffer.byteLength(target.effort, 'utf8') > MAX_EFFORT_BYTES) fail('ROUTE_ENTRY_INVALID');
  if (typeof target.timeout_ms !== 'number' || !Number.isInteger(target.timeout_ms) || target.timeout_ms < MIN_TIMEOUT_MS || target.timeout_ms > MAX_TIMEOUT_MS) fail('ROUTE_ENTRY_INVALID');
  return target;
}

function validateRouteTarget(target) {
  checkCreds(target);
  try { return gen.validateRouteTarget(target); }
  catch (err) {
    if (err instanceof gen.AdvisorContractError) {
      if (err.issue.code === 'CONTRACT_KEYS_INVALID' || err.issue.code === 'CONTRACT_TYPE_INVALID') fail('ROUTE_SCHEMA_INVALID');
      fail('ROUTE_ENTRY_INVALID');
    }
    fail('ROUTE_SCHEMA_INVALID');
  }
}

function validateWait(wait) {
  checkCreds(wait);
  try { return gen.validateWaitPolicy(wait); }
  catch (err) {
    if (err instanceof gen.AdvisorContractError) {
      if (err.issue.code === 'CONTRACT_KEYS_INVALID' || err.issue.code === 'CONTRACT_TYPE_INVALID') fail('ROUTE_SCHEMA_INVALID');
      fail('ROUTE_ENTRY_INVALID');
    }
    fail('ROUTE_SCHEMA_INVALID');
  }
}

function validateHistory(history) {
  checkCreds(history);
  try { return gen.validateHistoryPolicy(history); }
  catch (err) {
    if (err instanceof gen.AdvisorContractError) {
      if (err.issue.code === 'CONTRACT_KEYS_INVALID' || err.issue.code === 'CONTRACT_TYPE_INVALID') fail('ROUTE_SCHEMA_INVALID');
      fail('ROUTE_ENTRY_INVALID');
    }
    fail('ROUTE_SCHEMA_INVALID');
  }
}

function validateLegacyPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.getPrototypeOf(policy) !== Object.prototype) fail('ROUTE_SCHEMA_INVALID');
  if (Object.hasOwn(policy, 'hosts')) fail('ROUTE_SCHEMA_HOSTS_V1');
  checkCreds(policy);
  const keys = Object.keys(policy);
  if (keys.length !== POLICY_KEYS_V1.length || keys.some((k) => !POLICY_KEYS_V1.includes(k))) fail('ROUTE_SCHEMA_INVALID');
  if (policy.version !== 1 || !Number.isInteger(policy.version) || typeof policy.version === 'boolean') fail('ROUTE_SCHEMA_INVALID');
  validateTargetV1(policy.advisor);
  return deepFreeze(policy);
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.getPrototypeOf(policy) !== Object.prototype) fail('ROUTE_SCHEMA_INVALID');
  if (Object.hasOwn(policy, 'hosts')) fail('ROUTE_SCHEMA_MIGRATION_REQUIRED');
  if (policy.version === 1) fail('ROUTE_SCHEMA_V1_MIGRATION_REQUIRED');
  checkCreds(policy);
  try { return gen.validatePolicyV2(policy); }
  catch (err) {
    if (err instanceof gen.AdvisorContractError) {
      if (err.issue.path.includes('backup') && err.issue.code === 'CONTRACT_VALUE_INVALID'
        && policy?.advisor?.primary?.backend === policy?.advisor?.backup?.backend
        && policy?.advisor?.primary?.model === policy?.advisor?.backup?.model
        && policy?.advisor?.primary?.effort === policy?.advisor?.backup?.effort) {
        fail('ROUTE_BACKUP_IDENTICAL');
      }
      if (err.issue.code === 'CONTRACT_KEYS_INVALID' || err.issue.code === 'CONTRACT_TYPE_INVALID' || err.issue.code === 'CONTRACT_VERSION_UNSUPPORTED') {
        fail('ROUTE_SCHEMA_INVALID');
      }
      fail('ROUTE_ENTRY_INVALID');
    }
    fail('ROUTE_SCHEMA_INVALID');
  }
}

function inspectPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.getPrototypeOf(policy) !== Object.prototype) fail('ROUTE_SCHEMA_INVALID');
  if (Object.hasOwn(policy, 'hosts')) fail('ROUTE_SCHEMA_HOSTS_V1');
  if (policy.version === 2) return { policy: validatePolicy(policy), legacy: false, migrationRequired: false };
  if (policy.version === 1) return { policy: validateLegacyPolicy(policy), legacy: true, migrationRequired: true };
  fail('ROUTE_SCHEMA_INVALID');
}

function proposeMigration(legacyPolicy, backupRoute) {
  const validated = validateLegacyPolicy(legacyPolicy);
  const backup = validateRouteTarget(backupRoute);
  const primary = { backend: validated.advisor.backend, model: validated.advisor.model, effort: validated.advisor.effort };
  if (primary.backend === backup.backend && primary.model === backup.model && primary.effort === backup.effort) {
    fail('ROUTE_BACKUP_IDENTICAL');
  }
  return validatePolicy({
    version: 2, advisor: { primary, backup },
    wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
    history: { retention_days: 30, max_bytes: 104_857_600 }
  });
}

module.exports = {
  BACKENDS, CANDIDATE_BACKENDS, ENABLED_BACKENDS, MAX_EFFORT_BYTES, MAX_MODEL_BYTES,
  MAX_POLICY_BYTES, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, POLICY_KEYS, ADVISOR_KEYS_V2,
  HISTORY_KEYS_V2, MAX_HISTORY_BYTES, MAX_WARN_MS, MIN_HISTORY_BYTES, MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS, MIN_WARN_MS, POLICY_KEYS_V1, POLICY_KEYS_V2, ROUTE_KEYS_V2,
  TARGET_KEYS_V1, WAIT_KEYS_V2, inspectPolicy, proposeMigration, validateHistory,
  validateLegacyPolicy, validateRouteTarget, validateWait, TARGET_KEYS, decodeUtf8,
  deepFreeze, parseJsonDocument, validatePolicy, validateTarget
};
