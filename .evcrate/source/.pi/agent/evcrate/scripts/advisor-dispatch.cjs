#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const {
  MAX_POLICY_BYTES,
  loadGlobalPolicy,
  parseJsonDocument
} = require('./advisor-routing/profile.cjs');
const { decodeUtf8 } = require('./advisor-routing/policy-schema.cjs');
const { resolveRoute } = require('./advisor-routing/resolve-route.cjs');
const { getAdapter } = require('./advisor-routing/adapter-registry.cjs');
const {
  DEFAULT_LIMITS,
  assertNoRecursion,
  buildProbeEnvironment,
  createRunner,
  isRunnerFailure,
  normalizeLimits
} = require('./advisor-routing/runner.cjs');
const {
  assertAdapterAuthKeys,
  validateAdapter,
  validateInvocationShape
} = require('./advisor-routing/adapter-contract.cjs');
const {
  createRoutingError,
  isRoutingError,
  serializeRoutingError
} = require('./advisor-routing/errors.cjs');

const MAX_REQUEST_BYTES = MAX_POLICY_BYTES;
const MAX_BRIEF_BYTES = DEFAULT_LIMITS.maxPromptBytes;
const REQUEST_KEYS = new Set(['operation', 'activeHost', 'brief']);

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw createRoutingError('REQUEST_INVALID');
  }
  const keys = Object.keys(request);
  if (keys.some((key) => !REQUEST_KEYS.has(key)) || keys.length > REQUEST_KEYS.size) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (request.operation !== undefined && !['resolve', 'dispatch'].includes(request.operation)) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (typeof request.activeHost !== 'string' || !request.activeHost) {
    throw createRoutingError('REQUEST_INVALID');
  }
  const operation = request.operation || 'resolve';
  if (operation === 'resolve' && request.brief !== undefined) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (operation === 'dispatch' && (typeof request.brief !== 'string'
    || Buffer.byteLength(request.brief, 'utf8') > MAX_BRIEF_BYTES)) {
    throw createRoutingError('REQUEST_INVALID');
  }
  return request;
}

function normalizeFailure(adapter, error, context) {
  const classifierContext = {
    descriptor: context.descriptor,
    brief: context.brief,
    runner: context.runner
  };
  if (isRunnerFailure(error)) {
    try {
      const classified = adapter.classifyFailure(error, classifierContext);
      if (isRoutingError(classified)) return classified;
      if (typeof classified === 'string') return createRoutingError(classified);
    } catch (classificationError) {
      if (isRoutingError(classificationError)) return classificationError;
    }
    return error.error;
  }
  if (isRoutingError(error)) return error;
  try {
    const classified = adapter.classifyFailure(error, classifierContext);
    if (isRoutingError(classified)) return classified;
    if (typeof classified === 'string') return createRoutingError(classified);
  } catch (classificationError) {
    if (isRoutingError(classificationError)) return classificationError;
  }
  return createRoutingError('PROCESS_FAILED');
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const expected = [...new Set(left)].sort();
  const actual = [...new Set(right)].sort();
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}

function validateBrief(brief) {
  if (typeof brief !== 'string' || Buffer.byteLength(brief, 'utf8') > MAX_BRIEF_BYTES) {
    throw createRoutingError('REQUEST_INVALID');
  }
  return brief;
}

function assertBoundedResult(result, maxBytes) {
  let encoded;
  try { encoded = JSON.stringify(result); }
  catch { throw createRoutingError('OUTPUT_INVALID'); }
  if (encoded === undefined) throw createRoutingError('OUTPUT_INVALID');
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) throw createRoutingError('OUTPUT_LIMIT');
  return result;
}

async function dispatchExternal({ descriptor, brief }, dependencies = {}) {
  validateBrief(brief);
  assertNoRecursion({
    environment: dependencies.environment || process.env,
    requestDepth: dependencies.requestDepth === undefined ? 0 : dependencies.requestDepth
  });
  if (!descriptor || descriptor.action !== 'external' || typeof descriptor.adapter !== 'string') {
    throw createRoutingError('NATIVE_DISPATCH_UNSUPPORTED');
  }
  if (descriptor.activeHost === descriptor.route?.backend) {
    throw createRoutingError('NATIVE_DISPATCH_UNSUPPORTED');
  }
  const registry = dependencies.registry || { getAdapter };
  const adapter = registry.getAdapter(descriptor.adapter);
  validateAdapter(adapter);
  const sourceEnvironment = dependencies.environment || process.env;
  const probeEnvironment = buildProbeEnvironment({
    source: sourceEnvironment,
    adapter: adapter.name,
    authKeys: adapter.authKeys
  });
  const runner = dependencies.runner || createRunner({
    spawn: dependencies.spawn,
    kill: dependencies.kill,
    setTimeout: dependencies.setTimeout,
    clearTimeout: dependencies.clearTimeout
  });
  const context = {
    descriptor,
    brief,
    environment: probeEnvironment,
    runner,
    signal: dependencies.signal
  };
  try {
    await adapter.probeVersion(context);
    await adapter.probeAuth(context);
    await adapter.probeCapabilities(context);
    const invocation = await adapter.buildInvocation(context);
    validateInvocationShape(invocation);
    if (invocation.adapter !== adapter.name) {
      throw createRoutingError('ADAPTER_CONTRACT_INVALID');
    }
    assertAdapterAuthKeys(adapter.name, invocation.authKeys);
    if (!sameStringSet(adapter.authKeys, invocation.authKeys)) {
      throw createRoutingError('ADAPTER_CONTRACT_INVALID');
    }
    const limits = normalizeLimits(invocation.limits);
    const execution = await runner.run(invocation, {
      environment: context.environment,
      requestDepth: 0,
      signal: dependencies.signal
    });
    if (execution?.error) throw execution.failure || execution.error;
    const parsed = await adapter.parseResult({ ...context, execution: execution?.result || execution });
    return Object.freeze({
      ok: true,
      descriptor,
      result: assertBoundedResult(parsed, limits.maxResultBytes)
    });
  } catch (error) {
    throw normalizeFailure(adapter, error, context);
  }
}

function dispatchRequest(request, dependencies = {}) {
  const validated = validateRequest(request);
  const loaded = loadGlobalPolicy();
  const descriptor = resolveRoute({ activeHost: validated.activeHost, policy: loaded.policy });
  const response = Object.freeze({
    ok: true,
    descriptor
  });
  if ((validated.operation || 'resolve') === 'dispatch') {
    return dispatchExternal({ descriptor, brief: validated.brief }, dependencies);
  }
  return response;
}

function readStdin() {
  const chunks = [];
  const chunk = Buffer.alloc(4096);
  let total = 0;
  for (;;) {
    const length = fs.readSync(0, chunk, 0, chunk.length, null);
    if (length === 0) break;
    total += length;
    if (total > MAX_REQUEST_BYTES) throw createRoutingError('REQUEST_INVALID');
    chunks.push(Buffer.from(chunk.subarray(0, length)));
  }
  try { return decodeUtf8(Buffer.concat(chunks, total)); }
  catch { throw createRoutingError('REQUEST_INVALID'); }
}

function readRequest(input) {
  const raw = input === undefined ? readStdin() : input;
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) throw createRoutingError('REQUEST_INVALID');
  if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) throw createRoutingError('REQUEST_INVALID');
  try { return parseJsonDocument(Buffer.isBuffer(raw) ? decodeUtf8(raw) : raw); }
  catch { throw createRoutingError('REQUEST_INVALID'); }
}

function encodeResult(result, input) {
  const encoded = JSON.stringify(result);
  if (input === undefined) process.stdout.write(`${encoded}\n`);
  return encoded;
}

function encodeError(error, input) {
  return encodeResult({ ok: false, error: serializeRoutingError(error) }, input);
}

function main(input) {
  try {
    const result = dispatchRequest(readRequest(input));
    if (result && typeof result.then === 'function') {
      return result.then((value) => encodeResult(value, input)).catch((error) => encodeError(error, input));
    }
    return encodeResult(result, input);
  } catch (error) {
    return encodeError(error, input);
  }
}

if (require.main === module) {
  Promise.resolve(main()).then((output) => {
    if (typeof output === 'string' && output.includes('"ok":false')) process.exitCode = 1;
  });
}

module.exports = {
  MAX_REQUEST_BYTES,
  MAX_BRIEF_BYTES,
  dispatchExternal,
  dispatchRequest,
  main,
  readRequest,
  validateRequest
};
