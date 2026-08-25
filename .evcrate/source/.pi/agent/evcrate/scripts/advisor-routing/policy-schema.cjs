'use strict';

const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');

const HOSTS = Object.freeze(['claude', 'codex', 'gemini', 'antigravity', 'pi']);
const EXECUTIONS = Object.freeze(['auto', 'native', 'external']);
const ENTRY_KEYS = Object.freeze(['backend', 'model', 'effort', 'execution']);
const CAPABILITY_KEYS = Object.freeze(['backend', 'model', 'efforts', 'selector']);
const MAX_POLICY_BYTES = 16 * 1024;
const MAX_MODEL_BYTES = 256;
const MAX_EFFORT_BYTES = 64;
const CREDENTIAL_KEY = /(?:api[_ -]?key|token|secret|password|passwd|authorization|cookie|credential)/i;

function fail(code) {
  throw createRoutingError(code);
}

function bytes(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

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

function assertKeys(value, expected, code = 'ROUTE_SCHEMA_INVALID') {
  if (!isPlainObject(value)) fail(code);
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (code === 'ROUTE_SCHEMA_INVALID' && CREDENTIAL_KEY.test(key)) fail('ROUTE_CREDENTIAL_FIELD');
    if (!expectedSet.has(key)) fail(code);
  }
  if (Object.keys(value).length !== expected.length) fail(code);
}

function validateText(value, limit, code = 'ROUTE_ENTRY_INVALID') {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value) || bytes(value) > limit) fail(code);
  return value;
}

function validateEntry(entry) {
  assertKeys(entry, ENTRY_KEYS);
  if (!HOSTS.includes(entry.backend)) fail('ROUTE_ENTRY_INVALID');
  validateText(entry.model, MAX_MODEL_BYTES);
  validateText(entry.effort, MAX_EFFORT_BYTES);
  if (!EXECUTIONS.includes(entry.execution)) fail('ROUTE_ENTRY_INVALID');
  return entry;
}

function validatePolicy(policy) {
  assertKeys(policy, ['version', 'hosts']);
  if (policy.version !== 1 || !Number.isInteger(policy.version) || !isPlainObject(policy.hosts)) {
    fail('ROUTE_SCHEMA_INVALID');
  }
  for (const host of Object.keys(policy.hosts)) {
    if (CREDENTIAL_KEY.test(host)) fail('ROUTE_CREDENTIAL_FIELD');
    if (!HOSTS.includes(host)) fail('HOST_INVALID');
    validateEntry(policy.hosts[host]);
  }
  return deepFreeze(policy);
}

function validateCapabilities(value) {
  assertKeys(value, ['schema', 'version', 'hosts'], 'NATIVE_CAPABILITY_UNSUPPORTED');
  if (value.schema !== 'evcrate-advisor-native-capabilities/v1' || value.version !== 1
    || !isPlainObject(value.hosts)) fail('NATIVE_CAPABILITY_UNSUPPORTED');
  for (const host of HOSTS) {
    const capability = value.hosts[host];
    assertKeys(capability, CAPABILITY_KEYS, 'NATIVE_CAPABILITY_UNSUPPORTED');
    if (capability.backend !== host || !['model', 'resolved-model'].includes(capability.selector)) {
      fail('NATIVE_CAPABILITY_UNSUPPORTED');
    }
    validateText(capability.model, MAX_MODEL_BYTES, 'NATIVE_CAPABILITY_UNSUPPORTED');
    if (!Array.isArray(capability.efforts) || capability.efforts.length > 8
      || (host !== 'gemini' && capability.efforts.length === 0)
    ) fail('NATIVE_CAPABILITY_UNSUPPORTED');
    for (const effort of capability.efforts) {
      validateText(effort, MAX_EFFORT_BYTES, 'NATIVE_CAPABILITY_UNSUPPORTED');
    }
  }
  if (Object.keys(value.hosts).some((host) => !HOSTS.includes(host))) {
    fail('NATIVE_CAPABILITY_UNSUPPORTED');
  }
  return deepFreeze(value);
}

module.exports = {
  EXECUTIONS,
  HOSTS,
  MAX_EFFORT_BYTES,
  MAX_MODEL_BYTES,
  MAX_POLICY_BYTES,
  decodeUtf8,
  deepFreeze,
  parseJsonDocument,
  validateCapabilities,
  validateEntry,
  validatePolicy
};
