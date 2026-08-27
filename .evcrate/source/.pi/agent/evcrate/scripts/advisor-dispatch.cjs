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
  createInvocation,
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
const {
  checkpointFromBrief,
  normalizeResult,
  serializeCheckpoint,
  validateCheckpoint,
  validateLegacyBrief
} = require('./advisor-routing/checkpoint-contract.cjs');

const MAX_REQUEST_BYTES = MAX_POLICY_BYTES;
const MAX_BRIEF_BYTES = DEFAULT_LIMITS.maxPromptBytes;
const EXTERNAL_ADVISOR_TIMEOUT_MS = 15 * 60 * 1000;
const DEBUG_PHASES = Object.freeze([
  'probe-version',
  'probe-auth',
  'probe-capabilities',
  'build-invocation',
  'final-run',
  'parse-result'
]);
const REQUEST_KEYS = new Set(['operation', 'activeHost', 'brief', 'checkpoint']);

function monotonicMilliseconds() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function debugStatus(error) {
  const code = error?.code || error?.error?.code;
  return {
    CANCELLED: 'cancelled',
    EXECUTABLE_UNAVAILABLE: 'spawn-failed',
    LINE_LIMIT: 'line-limit',
    OUTPUT_INVALID: 'output-invalid',
    OUTPUT_LIMIT: 'output-limit',
    PROCESS_FAILED: 'process-failed',
    TIMEOUT: 'timeout'
  }[code] || 'failed';
}

function emitDebug(debugSink, event) {
  if (typeof debugSink !== 'function') return;
  try { debugSink(Object.freeze(event)); } catch { /* diagnostics must not affect dispatch */ }
}

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
  const hasBrief = request.brief !== undefined;
  const hasCheckpoint = request.checkpoint !== undefined;
  if (operation === 'resolve' && (hasBrief || hasCheckpoint)) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (operation === 'dispatch' && hasBrief === hasCheckpoint) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (operation === 'dispatch' && hasCheckpoint) {
    return Object.freeze({
      ...request,
      checkpoint: validateCheckpoint(request.checkpoint, request.activeHost),
      brief: undefined
    });
  }
  if (operation === 'dispatch' && (typeof request.brief !== 'string'
    || Buffer.byteLength(request.brief, 'utf8') > MAX_BRIEF_BYTES)) {
    throw createRoutingError('REQUEST_INVALID');
  }
  if (operation === 'dispatch') {
    const embeddedCheckpoint = checkpointFromBrief(request.brief, request.activeHost);
    if (embeddedCheckpoint) {
      return Object.freeze({
        ...request,
        brief: undefined,
        checkpoint: embeddedCheckpoint
      });
    }
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
  return validateLegacyBrief(brief);
}

function assertBoundedResult(result, maxBytes) {
  let encoded;
  try { encoded = JSON.stringify(result); }
  catch { throw createRoutingError('OUTPUT_INVALID'); }
  if (encoded === undefined) throw createRoutingError('OUTPUT_INVALID');
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) throw createRoutingError('OUTPUT_LIMIT');
  return result;
}

function normalizeNativeResult(result, checkpoint) {
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || result.protocol !== 'evcrate-advisor-result' || result.version !== 1
    || result.status !== 'ADVICE_READY') {
    throw createRoutingError('PROTOCOL_INVALID');
  }
  return normalizeResult(result, {
    checkpoint,
    maxBytes: DEFAULT_LIMITS.maxResultBytes
  });
}

async function dispatchExternal({ descriptor, brief, checkpoint }, dependencies = {}) {
  if (checkpoint !== undefined && brief !== undefined) throw createRoutingError('REQUEST_INVALID');
  const validatedCheckpoint = checkpoint === undefined
    ? checkpointFromBrief(brief, descriptor?.activeHost)
    : validateCheckpoint(checkpoint, descriptor?.activeHost);
  const validatedBrief = validatedCheckpoint === null || validatedCheckpoint === undefined
    ? validateBrief(brief)
    : serializeCheckpoint(validatedCheckpoint);
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
  const debugSink = typeof dependencies.debugSink === 'function' ? dependencies.debugSink : null;
  let activePhase = null;
  let phaseObserved = false;
  const observedRunner = debugSink ? {
    run(invocation, options = {}) {
      return runner.run(invocation, {
        ...options,
        onLifecycle(event) {
          if (activePhase) {
            phaseObserved = true;
            emitDebug(debugSink, { phase: activePhase, ...event });
          }
          if (typeof options.onLifecycle === 'function') {
            try { options.onLifecycle(event); } catch { /* observer isolation */ }
          }
        }
      });
    }
  } : runner;
  const runPhase = async (name, operation) => {
    if (!debugSink) return operation();
    const startedAt = monotonicMilliseconds();
    const previousPhase = activePhase;
    activePhase = name;
    phaseObserved = false;
    try {
      const result = await operation();
      if (!phaseObserved) {
        emitDebug(debugSink, {
          phase: name,
          status: 'completed',
          pid: null,
          elapsed_ms: Math.max(0, Math.round(monotonicMilliseconds() - startedAt)),
          termination_wait_ms: 0
        });
      }
      return result;
    } catch (error) {
      if (!phaseObserved) {
        emitDebug(debugSink, {
          phase: name,
          status: debugStatus(error),
          pid: null,
          elapsed_ms: Math.max(0, Math.round(monotonicMilliseconds() - startedAt)),
          termination_wait_ms: 0
        });
      }
      throw error;
    } finally {
      activePhase = previousPhase;
      phaseObserved = false;
    }
  };
  const context = {
    descriptor,
    brief: validatedBrief,
    checkpoint: validatedCheckpoint || undefined,
    environment: probeEnvironment,
    runner: observedRunner,
    signal: dependencies.signal
  };
  try {
    await runPhase('probe-version', () => adapter.probeVersion(context));
    await runPhase('probe-auth', () => adapter.probeAuth(context));
    await runPhase('probe-capabilities', () => adapter.probeCapabilities(context));
    const invocation = await runPhase('build-invocation', async () => {
      const built = await adapter.buildInvocation(context);
      validateInvocationShape(built);
      if (built.adapter !== adapter.name) {
        throw createRoutingError('ADAPTER_CONTRACT_INVALID');
      }
      assertAdapterAuthKeys(adapter.name, built.authKeys);
      if (!sameStringSet(adapter.authKeys, built.authKeys)) {
        throw createRoutingError('ADAPTER_CONTRACT_INVALID');
      }
      return built;
    });
    const limits = normalizeLimits(invocation.limits);
    const execution = await runPhase('final-run', async () => {
      const finalInvocation = createInvocation({
        ...invocation,
        limits: { ...limits, timeoutMs: EXTERNAL_ADVISOR_TIMEOUT_MS }
      });
      const result = await observedRunner.run(finalInvocation, {
        environment: context.environment,
        requestDepth: 0,
        signal: dependencies.signal
      });
      if (result?.error) throw result.failure || result.error;
      return result;
    });
    const normalized = await runPhase('parse-result', async () => {
      const parsed = await adapter.parseResult({ ...context, execution: execution?.result || execution });
      const bounded = assertBoundedResult(parsed, limits.maxResultBytes);
      return normalizeResult(bounded, {
        checkpoint: validatedCheckpoint || undefined,
        maxBytes: limits.maxResultBytes
      });
    });
    return Object.freeze({
      ok: true,
      descriptor,
      result: assertBoundedResult(normalized, limits.maxResultBytes)
    });
  } catch (error) {
    throw normalizeFailure(adapter, error, context);
  }
}

async function dispatchNative({ descriptor, checkpoint }, dependencies = {}) {
  if (!descriptor || descriptor.action !== 'native' || descriptor.adapter !== null
    || descriptor.activeHost !== descriptor.route?.backend || !checkpoint
    || typeof dependencies.nativeAdvisor !== 'function') {
    throw createRoutingError('NATIVE_DISPATCH_UNSUPPORTED');
  }
  assertNoRecursion({
    environment: dependencies.environment || process.env,
    requestDepth: dependencies.requestDepth === undefined ? 0 : dependencies.requestDepth
  });
  let result;
  try {
    result = await dependencies.nativeAdvisor({ checkpoint, descriptor });
  } catch (error) {
    if (isRoutingError(error)) throw error;
    throw createRoutingError('PROCESS_FAILED');
  }
  const bounded = assertBoundedResult(result, DEFAULT_LIMITS.maxResultBytes);
  const normalized = normalizeNativeResult(bounded, checkpoint);
  return Object.freeze({
    ok: true,
    descriptor,
    result: assertBoundedResult(normalized, DEFAULT_LIMITS.maxResultBytes)
  });
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
    if (descriptor.action === 'native') {
      return dispatchNative({ descriptor, checkpoint: validated.checkpoint }, dependencies);
    }
    return dispatchExternal({
      descriptor,
      brief: validated.brief,
      checkpoint: validated.checkpoint
    }, dependencies);
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
  DEBUG_PHASES,
  EXTERNAL_ADVISOR_TIMEOUT_MS,
  MAX_REQUEST_BYTES,
  MAX_BRIEF_BYTES,
  dispatchExternal,
  dispatchNative,
  dispatchRequest,
  main,
  readRequest,
  validateRequest,
  validateBrief
};
