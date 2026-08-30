'use strict';

const { createRoutingError } = require('./errors.cjs');
const {
  ADAPTER_NAMES,
  assertAdapterName,
  freezeAdapter,
  validateAdapter
} = require('./adapter-contract.cjs');
const claude = require('./adapters/claude.cjs');
const codex = require('./adapters/codex.cjs');
const omp = require('./adapters/omp.cjs');
const pi = require('./adapters/pi.cjs');

function unavailable(name) {
  const fail = () => { throw createRoutingError('CLI_CAPABILITY_UNSUPPORTED'); };
  return freezeAdapter({
    name,
    authKeys: [],
    probeVersion: fail,
    probeAuth: fail,
    probeCapabilities: fail,
    buildInvocation: fail,
    parseResult: fail,
    classifyFailure: () => 'CLI_CAPABILITY_UNSUPPORTED'
  });
}

const BUILTIN_ADAPTERS = Object.freeze({
  claude,
  codex,
  antigravity: unavailable('antigravity'),
  pi,
  omp
});

function exactNames(registry) {
  return Object.keys(registry).sort().join('\0') === [...ADAPTER_NAMES].sort().join('\0');
}
function validateRegistry(registry = BUILTIN_ADAPTERS) {
  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)
    || !exactNames(registry)) throw createRoutingError('ADAPTER_REGISTRY_INVALID');
  for (const name of ADAPTER_NAMES) {
    try { validateAdapter(registry[name]); }
    catch { throw createRoutingError('ADAPTER_REGISTRY_INVALID'); }
    if (registry[name].name !== name) throw createRoutingError('ADAPTER_REGISTRY_INVALID');
  }
  return Object.freeze(registry);
}
const REGISTRY = validateRegistry(BUILTIN_ADAPTERS);
function getAdapter(name, registry = REGISTRY) {
  assertAdapterName(name);
  const selected = validateRegistry(registry)[name];
  if (!selected) throw createRoutingError('ADAPTER_UNSUPPORTED');
  return selected;
}
function listAdapters(registry = REGISTRY) {
  validateRegistry(registry);
  return Object.freeze([...ADAPTER_NAMES]);
}

module.exports = { ADAPTER_NAMES, BUILTIN_ADAPTERS: REGISTRY, getAdapter, listAdapters, validateRegistry };
