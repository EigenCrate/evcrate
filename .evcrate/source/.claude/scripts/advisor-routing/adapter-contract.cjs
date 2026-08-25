'use strict';

const { createRoutingError } = require('./errors.cjs');

const ADAPTER_NAMES = Object.freeze(['claude', 'codex', 'gemini', 'antigravity', 'pi']);
const ADAPTER_AUTH_KEY_ALLOWLIST = Object.freeze(Object.fromEntries(
  ADAPTER_NAMES.map((name) => [name, Object.freeze([])])
));
const REQUIRED_METHODS = Object.freeze([
  'probeVersion',
  'probeAuth',
  'probeCapabilities',
  'buildInvocation',
  'parseResult',
  'classifyFailure'
]);

const CONFORMANCE_TABLE = Object.freeze([
  Object.freeze({ category: 'executable', errorCode: 'EXECUTABLE_UNAVAILABLE' }),
  Object.freeze({ category: 'version', errorCode: 'CLI_VERSION_UNSUPPORTED' }),
  Object.freeze({ category: 'auth', errorCode: 'AUTH_UNAVAILABLE' }),
  Object.freeze({ category: 'model', errorCode: 'MODEL_UNSUPPORTED' }),
  Object.freeze({ category: 'effort', errorCode: 'EFFORT_UNSUPPORTED' }),
  Object.freeze({ category: 'read-only', errorCode: 'READ_ONLY_UNSUPPORTED' }),
  Object.freeze({ category: 'session', errorCode: 'SESSION_UNSUPPORTED' }),
  Object.freeze({ category: 'output', errorCode: 'OUTPUT_UNSUPPORTED' }),
  Object.freeze({ category: 'timeout', errorCode: 'TIMEOUT' }),
  Object.freeze({ category: 'cancel', errorCode: 'CANCELLED' }),
  Object.freeze({ category: 'recursion', errorCode: 'ADVISOR_RECURSION' })
]);

const INVOCATION_KEYS = Object.freeze([
  'adapter',
  'executable',
  'argv',
  'cwd',
  'workspaceRoot',
  'prompt',
  'authKeys',
  'limits'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function fail(code) {
  throw createRoutingError(code);
}

function assertAdapterName(name) {
  if (typeof name !== 'string' || !ADAPTER_NAMES.includes(name)) fail('ADAPTER_UNSUPPORTED');
  return name;
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const expected = [...new Set(left)].sort();
  const actual = [...new Set(right)].sort();
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}

function assertAdapterAuthKeys(name, authKeys) {
  assertAdapterName(name);
  if (!Array.isArray(authKeys) || authKeys.some((key) => typeof key !== 'string'
    || !/^[A-Z][A-Z0-9_]*$/u.test(key) || key.startsWith('EVCRATE_'))
    || !sameStringSet(ADAPTER_AUTH_KEY_ALLOWLIST[name], authKeys)) {
    fail('ADAPTER_CONTRACT_INVALID');
  }
  return authKeys;
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
  if (!Array.isArray(invocation.authKeys) || invocation.authKeys.some((key) =>
    typeof key !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(key) || key.startsWith('EVCRATE_'))) {
    fail('INVOCATION_INVALID');
  }
  if (!isPlainObject(invocation.limits)) fail('INVOCATION_INVALID');
  return invocation;
}

module.exports = {
  ADAPTER_NAMES,
  ADAPTER_AUTH_KEY_ALLOWLIST,
  CONFORMANCE_TABLE,
  INVOCATION_KEYS,
  REQUIRED_METHODS,
  assertAdapterName,
  assertAdapterAuthKeys,
  freezeAdapter,
  isPlainObject,
  validateAdapter,
  validateInvocationShape
};
