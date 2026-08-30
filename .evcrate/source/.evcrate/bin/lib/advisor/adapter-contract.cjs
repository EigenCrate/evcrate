'use strict';

const { createRoutingError } = require('./errors.cjs');

const CANDIDATE_BACKENDS = Object.freeze(['claude', 'codex', 'antigravity', 'pi', 'omp']);
const ENABLED_BACKENDS = Object.freeze(['claude', 'codex', 'pi', 'omp']);
const ADAPTER_NAMES = CANDIDATE_BACKENDS;
const ADAPTER_AUTH_KEY_ALLOWLIST = Object.freeze(Object.fromEntries(
  CANDIDATE_BACKENDS.map((name) => [name, Object.freeze([])])
));
const REQUIRED_METHODS = Object.freeze([
  'probeVersion', 'probeAuth', 'probeCapabilities', 'buildInvocation', 'parseResult', 'classifyFailure'
]);
const CAPABILITY_KEYS = Object.freeze([
  'model', 'effort', 'noninteractive', 'session', 'tools', 'output'
]);
const INVOCATION_KEYS = Object.freeze([
  'adapter', 'executable', 'argv', 'cwd', 'workspaceRoot', 'prompt', 'authKeys', 'limits'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function fail(code) { throw createRoutingError(code); }
function assertAdapterName(name) {
  if (typeof name !== 'string' || !CANDIDATE_BACKENDS.includes(name)) fail('ADAPTER_UNSUPPORTED');
  return name;
}
function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function assertAdapterAuthKeys(name, authKeys) {
  assertAdapterName(name);
  if (!Array.isArray(authKeys) || authKeys.some((key) => typeof key !== 'string'
    || !/^[A-Z][A-Z0-9_]*$/u.test(key) || key.startsWith('EVCRATE_'))
    || !sameStringSet(ADAPTER_AUTH_KEY_ALLOWLIST[name], authKeys)) fail('ADAPTER_CONTRACT_INVALID');
  return authKeys;
}
function validateCapabilityAttestation(value) {
  if (!isPlainObject(value)) fail('ADAPTER_CONTRACT_INVALID');
  const keys = Object.keys(value);
  if (keys.length !== CAPABILITY_KEYS.length || keys.some((key) => !CAPABILITY_KEYS.includes(key))) {
    fail('ADAPTER_CONTRACT_INVALID');
  }
  if (typeof value.model !== 'string' || !value.model || typeof value.effort !== 'string'
    || !value.effort || typeof value.noninteractive !== 'boolean'
    || typeof value.session !== 'string' || !value.session
    || typeof value.tools !== 'string' || !value.tools
    || typeof value.output !== 'string' || !value.output) fail('ADAPTER_CONTRACT_INVALID');
  return Object.freeze({ ...value });
}
function validateAdapter(adapter) {
  if (!isPlainObject(adapter)) fail('ADAPTER_CONTRACT_INVALID');
  assertAdapterName(adapter.name);
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== 'function') fail('ADAPTER_CONTRACT_INVALID');
  }
  assertAdapterAuthKeys(adapter.name, adapter.authKeys);
  return adapter;
}
function freezeAdapter(adapter) {
  validateAdapter(adapter);
  if (Array.isArray(adapter.authKeys)) Object.freeze(adapter.authKeys);
  return Object.freeze(adapter);
}
function validateInvocationShape(invocation) {
  if (!isPlainObject(invocation)) fail('INVOCATION_INVALID');
  const keys = Object.keys(invocation);
  if (keys.length !== INVOCATION_KEYS.length || keys.some((key) => !INVOCATION_KEYS.includes(key))) {
    fail('INVOCATION_INVALID');
  }
  assertAdapterName(invocation.adapter);
  if (typeof invocation.executable !== 'string' || !invocation.executable
    || /[\u0000;|&`$<>()[\]{}]/u.test(invocation.executable)
    || /(?:^|[\\/])(sh|bash|zsh|dash|fish|cmd|powershell)(?:\.exe)?$/iu.test(invocation.executable)) {
    fail('INVOCATION_INVALID');
  }
  if (!Array.isArray(invocation.argv) || invocation.argv.some((arg) => typeof arg !== 'string'
    || arg.includes('\0'))) fail('INVOCATION_INVALID');
  if (typeof invocation.cwd !== 'string' || typeof invocation.workspaceRoot !== 'string'
    || typeof invocation.prompt !== 'string') fail('INVOCATION_INVALID');
  assertAdapterAuthKeys(invocation.adapter, invocation.authKeys);
  if (!isPlainObject(invocation.limits)) fail('INVOCATION_INVALID');
  return invocation;
}

module.exports = {
  ADAPTER_AUTH_KEY_ALLOWLIST,
  ADAPTER_NAMES,
  CANDIDATE_BACKENDS,
  CAPABILITY_KEYS,
  ENABLED_BACKENDS,
  INVOCATION_KEYS,
  REQUIRED_METHODS,
  assertAdapterAuthKeys,
  assertAdapterName,
  freezeAdapter,
  isPlainObject,
  sameStringSet,
  validateAdapter,
  validateCapabilityAttestation,
  validateInvocationShape
};
