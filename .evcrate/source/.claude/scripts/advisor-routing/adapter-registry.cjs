'use strict';

const { createRoutingError } = require('./errors.cjs');
const {
  ADAPTER_NAMES,
  assertAdapterName,
  freezeAdapter,
  validateAdapter
} = require('./adapter-contract.cjs');
const claudeAdapter = require('./adapters/claude.cjs');
const codexAdapter = require('./adapters/codex.cjs');
const geminiAdapter = require('./adapters/gemini.cjs');
const antigravityAdapter = require('./adapters/antigravity.cjs');
const piAdapter = require('./adapters/pi.cjs');

function unsupported() {
  throw createRoutingError('ADAPTER_UNSUPPORTED');
}

function unavailableAdapter(name) {
  return freezeAdapter({
    name,
    authKeys: [],
    probeVersion: unsupported,
    probeAuth: unsupported,
    probeCapabilities: unsupported,
    buildInvocation: unsupported,
    parseResult: unsupported,
    classifyFailure: unsupported
  });
}

const BUILTIN_ADAPTERS = Object.freeze({
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  antigravity: antigravityAdapter,
  pi: piAdapter
});

function validateRegistry(registry = BUILTIN_ADAPTERS) {
  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)) {
    throw createRoutingError('ADAPTER_REGISTRY_INVALID');
  }
  const names = Object.keys(registry).sort();
  if (names.join('\0') !== [...ADAPTER_NAMES].sort().join('\0')) {
    throw createRoutingError('ADAPTER_REGISTRY_INVALID');
  }
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

module.exports = {
  ADAPTER_NAMES,
  BUILTIN_ADAPTERS: REGISTRY,
  getAdapter,
  listAdapters,
  validateRegistry
};
