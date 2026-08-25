'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  HOSTS,
  deepFreeze,
  validateCapabilities,
  validateEntry,
  validatePolicy
} = require('./profile.cjs');
const { decodeUtf8, parseJsonDocument } = require('./policy-schema.cjs');
const { createRoutingError } = require('./errors.cjs');

const SCHEMA = 'evcrate-advisor-route/v1';
let capabilities;

function fail(code) {
  throw createRoutingError(code);
}

function assertHost(activeHost) {
  if (typeof activeHost !== 'string' || !HOSTS.includes(activeHost)) fail('HOST_INVALID');
  return activeHost;
}

function loadCapabilities() {
  try {
    const filename = path.join(__dirname, 'native-capabilities.json');
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 16 * 1024) {
      fail('NATIVE_CAPABILITY_UNSUPPORTED');
    }
    const document = decodeUtf8(fs.readFileSync(filename));
    return validateCapabilities(parseJsonDocument(document));
  } catch (error) {
    if (error?.name === 'AdvisorRoutingError' && error.code === 'NATIVE_CAPABILITY_UNSUPPORTED') {
      throw error;
    }
    fail('NATIVE_CAPABILITY_UNSUPPORTED');
  }
}

function capabilityDocument() {
  if (!capabilities) capabilities = loadCapabilities();
  return capabilities;
}

function capabilityFor(host) {
  const capability = capabilityDocument().hosts[host];
  if (!capability || capability.backend !== host || !Array.isArray(capability.efforts)
    || typeof capability.model !== 'string' || typeof capability.selector !== 'string') {
    fail('NATIVE_CAPABILITY_UNSUPPORTED');
  }
  return capability;
}

function builtinEntry(host) {
  const capability = capabilityFor(host);
  return {
    backend: host,
    model: capability.model,
    // Gemini 0.47.0 has no exact effort control; resolution below must fail
    // with EFFORT_UNSUPPORTED rather than silently downgrading or omitting it.
    effort: capability.efforts[0] || 'high',
    execution: 'auto'
  };
}

function exactCapability(host, route) {
  const capability = capabilityFor(host);
  if (!capability.efforts.includes(route.effort)) fail('EFFORT_UNSUPPORTED');
  if (route.model !== capability.model) fail('MODEL_UNSUPPORTED');
  return {
    backend: capability.backend,
    model: route.model,
    effort: route.effort,
    selector: capability.selector
  };
}

function resolveRoute({ activeHost, policy = null } = {}) {
  const host = assertHost(activeHost);
  if (policy !== null && policy !== undefined) validatePolicy(policy);
  const configured = policy?.hosts?.[host];
  const route = configured ? validateEntry(configured) : builtinEntry(host);
  const source = configured ? 'global' : 'builtin';
  const sameHost = route.backend === host;

  if (sameHost && route.execution === 'external' || !sameHost && route.execution === 'native') {
    fail('ROUTE_EXECUTION_INVALID');
  }

  const action = sameHost ? 'native' : 'external';
  const nativeCapability = action === 'native' ? exactCapability(host, route) : null;
  const descriptor = {
    schema: SCHEMA,
    version: 1,
    activeHost: host,
    route: {
      backend: route.backend,
      model: route.model,
      effort: route.effort,
      execution: route.execution
    },
    source,
    action,
    nativeCapability,
    adapter: action === 'external' ? route.backend : null
  };
  return deepFreeze(descriptor);
}

module.exports = {
  get BUILTIN_CAPABILITIES() {
    return capabilityDocument();
  },
  SCHEMA,
  builtinEntry,
  capabilityFor,
  exactCapability,
  loadCapabilities,
  resolveRoute
};
