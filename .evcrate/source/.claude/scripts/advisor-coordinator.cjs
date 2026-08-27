#!/usr/bin/env node
'use strict';

const {
  dispatchExternal,
  dispatchNative,
  dispatchRequest,
  readRequest
} = require('./advisor-dispatch.cjs');
const { validateCheckpoint } = require('./advisor-routing/checkpoint-contract.cjs');
const {
  createRoutingError,
  serializeRoutingError
} = require('./advisor-routing/errors.cjs');
const {
  consumeHandoff,
  createHandoff,
  inspectHandoff
} = require('./advisor-handoff.cjs');

const ROUTE_SCHEMA = 'evcrate-advisor-route/v1';
const COORDINATOR_OPERATIONS = new Set(['dispatch', 'resume-native']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  return isObject(value) && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function validateCoordinatorRequest(request) {
  if (!isObject(request) || !COORDINATOR_OPERATIONS.has(request.operation)
    || typeof request.active_host !== 'string' || !request.active_host) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (request.operation === 'dispatch') {
    if (!exactKeys(request, ['operation', 'active_host', 'checkpoint'])
      && !exactKeys(request, ['operation', 'active_host', 'checkpoint', 'debug'])) {
      throw createRoutingError('REQUEST_INVALID');
    }
    if (request.debug !== undefined && typeof request.debug !== 'boolean') {
      throw createRoutingError('REQUEST_INVALID');
    }
    return Object.freeze({
      operation: request.operation,
      active_host: request.active_host,
      checkpoint: validateCheckpoint(request.checkpoint, request.active_host),
      debug: request.debug === true
    });
  }
  if (!exactKeys(request, ['operation', 'active_host', 'token'])
    || typeof request.token !== 'string') {
    throw createRoutingError('REQUEST_INVALID');
  }
  return Object.freeze({
    operation: request.operation,
    active_host: request.active_host,
    token: request.token
  });
}

function validateStoredDescriptor(descriptor, activeHost) {
  if (!isObject(descriptor) || descriptor.schema !== ROUTE_SCHEMA || descriptor.version !== 1
    || descriptor.activeHost !== activeHost || descriptor.action !== 'native'
    || descriptor.adapter !== null || !isObject(descriptor.route)
    || descriptor.route.backend !== activeHost || !isObject(descriptor.nativeCapability)) {
    throw createRoutingError('NATIVE_HANDOFF_INVALID');
  }
  return descriptor;
}

function dependency(dependencies, name, fallback) {
  return typeof dependencies[name] === 'function' ? dependencies[name] : fallback;
}

function nativeDependencies(dependencies) {
  const safe = { nativeAdvisor: dependencies.nativeAdvisor };
  for (const key of ['environment', 'requestDepth']) {
    if (dependencies[key] !== undefined) safe[key] = dependencies[key];
  }
  return safe;
}

async function dispatchCoordinator(request, dependencies = {}) {
  const validated = validateCoordinatorRequest(request);
  if (validated.operation === 'resume-native') {
    if (typeof dependencies.nativeAdvisor !== 'function') {
      throw createRoutingError('NATIVE_DISPATCH_UNSUPPORTED');
    }
    const preview = inspectHandoff(validated.token, dependencies);
    if (preview.active_host !== validated.active_host) {
      throw createRoutingError('NATIVE_HANDOFF_INVALID');
    }
    const handoff = consumeHandoff(validated.token, dependencies);
    if (handoff.active_host !== validated.active_host) {
      throw createRoutingError('NATIVE_HANDOFF_INVALID');
    }
    const checkpoint = validateCheckpoint(handoff.checkpoint, validated.active_host);
    const descriptor = validateStoredDescriptor(handoff.descriptor, validated.active_host);
    return dispatchNative({ descriptor, checkpoint }, nativeDependencies(dependencies));
  }

  const resolve = dependency(dependencies, 'dispatchRequest', dispatchRequest);
  const resolved = await resolve({ operation: 'resolve', activeHost: validated.active_host });
  if (!resolved || !isObject(resolved.descriptor)) {
    throw createRoutingError('PROTOCOL_INVALID');
  }
  const descriptor = resolved.descriptor;
  if (validated.debug && descriptor.action !== 'external') {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (descriptor.action === 'external') {
    if (validated.debug && typeof dependencies.markDebugExternal === 'function') {
      dependencies.markDebugExternal();
    }
    const externalDispatch = dependency(dependencies, 'dispatchExternal', dispatchExternal);
    return externalDispatch({
      descriptor,
      checkpoint: validated.checkpoint,
      debug: validated.debug
    }, dependencies);
  }
  if (descriptor.action !== 'native') throw createRoutingError('PROTOCOL_INVALID');

  if (typeof dependencies.nativeAdvisor === 'function') {
    return dispatchNative(
      { descriptor, checkpoint: validated.checkpoint },
      nativeDependencies(dependencies)
    );
  }

  // A standalone CLI has no host-owned callback transport. Do not create a
  // handoff that no process can resume; library callers retain the explicit
  // two-phase handoff by leaving this dependency enabled.
  if (dependencies.allowNativeHandoff === false) {
    throw createRoutingError('NATIVE_DISPATCH_UNSUPPORTED');
  }

  const handoff = createHandoff({
    activeHost: validated.active_host,
    checkpoint: validated.checkpoint,
    descriptor
  }, dependencies);
  return Object.freeze({
    ok: true,
    status: 'NATIVE_HANDOFF_PENDING',
    descriptor,
    handoff: Object.freeze({
      token: handoff.token,
      expires_at: handoff.expiresAt
    })
  });
}

async function main(input, dependencies = {}) {
  try {
    const request = readRequest(input);
    return await dispatchCoordinator(request, dependencies);
  } catch (error) {
    return { ok: false, error: serializeRoutingError(error) };
  }
}

function writeOutput(output) {
  const encoded = JSON.stringify(output);
  process.stdout.write(`${encoded}\n`);
  if (!output || output.ok !== true) process.exitCode = 1;
  return encoded;
}

if (require.main === module) {
  main(undefined, { allowNativeHandoff: false }).then(writeOutput).catch((error) => {
    writeOutput({ ok: false, error: serializeRoutingError(error) });
  });
}

module.exports = {
  dispatchCoordinator,
  main,
  validateCoordinatorRequest,
  writeOutput
};
