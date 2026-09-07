'use strict';

const {
  monotonicMilliseconds, createRunner, createDeadlineRunner, createProbeRunner,
  createGenerationRunner, buildProbeEnvironment
} = require('./runner.cjs');
const { parseJsonDocument, decodeUtf8 } = require('./json-document.cjs');
const {
  validateCheckpoint, serializeCheckpoint, formatMentorPrompt, checkpointDigest,
  normalizeResult, MAX_ENVELOPE_BYTES
} = require('./checkpoint-contract.cjs');
const { loadGlobalPolicy } = require('./profile.cjs');
const { validatePolicy } = require('./policy-schema.cjs');
const { getAdapter } = require('./adapter-registry.cjs');
const { createWorkspace, cleanupWorkspace, verifyWorkspace } = require('./isolated-workspace.cjs');
const {
  createRoutingError, isRoutingError, serializeRoutingError, ERROR_CODES
} = require('./errors.cjs');
const { validateCapabilityAttestation, isPlainObject } = require('./adapter-contract.cjs');
const { buildSuccessEnvelope, buildFailureEnvelope } = require('./controller-envelope.cjs');

const DIAGNOSTIC_PROTOCOL = 'evcrate-advisor-diagnostic';
const DIAGNOSTIC_VERSION = 1;
const DIAGNOSTIC_OPERATION = 'qualify';
const REQUEST_ID_LIMIT = 128;
const CONTROLLER_VERSION = 1;
const VERSION_LIMIT = 128;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function fail(code) { throw createRoutingError(code); }
function codeOf(error) { return isRoutingError(error) ? error.code : error?.code || error?.error?.code; }
function dependency(deps, name, fallback) { return typeof deps[name] === 'function' ? deps[name] : fallback; }
function parseInput(input) {
  let text;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = input;
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.byteLength > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = decodeUtf8(input, 'REQUEST_INVALID');
  } else fail('REQUEST_INVALID');
  try { return validateCheckpoint(parseJsonDocument(text, 'REQUEST_INVALID', 'REQUEST_INVALID')); }
  catch (error) {
    if (isRoutingError(error)) {
      if (error.code === 'PROTOCOL_INVALID') fail('REQUEST_INVALID');
      throw error;
    }
    fail('REQUEST_INVALID');
  }
}
function targetFromPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ROUTE_SCHEMA_INVALID');
  const policy = validatePolicy(value);
  const target = Object.freeze({ ...policy.advisor.primary });
  return { policy, target };
}
function version(value) {
  if (typeof value !== 'string' || !value || CONTROL.test(value) || Buffer.byteLength(value, 'utf8') > VERSION_LIMIT) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  return value;
}
function elapsed(now, started) {
  try { return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(now() - started))); }
  catch { return 0; }
}
function failureCode(error, adapter) {
  let code = codeOf(error);
  if (adapter && typeof adapter.classifyFailure === 'function') {
    try { code = adapter.classifyFailure(error) || code; } catch { /* use the original typed error */ }
  }
  return typeof code === 'string' ? code : 'PROCESS_FAILED';
}
function registryLookup(deps, name) {
  if (deps.registry && typeof deps.registry.getAdapter === 'function') return deps.registry.getAdapter(name);
  if (typeof deps.getAdapter === 'function') return deps.getAdapter(name);
  return getAdapter(name);
}
function normalizeWorkspace(value, verify) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.path !== 'string' || typeof value.realpath !== 'string') fail('CWD_UNSAFE');
  return verify(value);
}
async function runController(input, dependencies = {}) {
  let target = null;
  let checkpoint = null;
  let digest = null;
  let attempts = [];
  let modelStarted = false;
  let childSpawned = false;
  const now = dependency(dependencies, 'monotonicMilliseconds', monotonicMilliseconds);
  const makeUuid = dependency(dependencies, 'randomUUID', require('node:crypto').randomUUID);
  const correlationId = makeUuid();
  let started;
  try { started = now(); } catch { started = monotonicMilliseconds(); }
  let adapter = null;
  let adapterVersion = null;
  let workspace = null;
  let receipt = () => ({ backend: target?.backend ?? null, model: target?.model ?? null,
    effort: target?.effort ?? null, controller_version: checkpoint?.version === 2 ? 2 : CONTROLLER_VERSION,
    adapter_version: adapterVersion, elapsed_ms: elapsed(now, started) });
  let envelope;
  let cleanupOutcome = 'confirmed';
  let lastRoutingError = null;
  try {
    const request = await input;
    if (dependencies.signal?.aborted) fail('CANCELLED');
    checkpoint = parseInput(request);
    if (checkpoint.version === 2) {
      digest = checkpointDigest(checkpoint);
    }
    const environment = dependencies.environment || process.env;
    const loaded = await dependency(dependencies, 'loadGlobalPolicy', loadGlobalPolicy)(environment?.HOME);
    const selected = targetFromPolicy(loaded?.policy ?? loaded);
    target = selected.target;
    adapter = registryLookup(dependencies, target.backend);
    const workspaceFactory = dependency(dependencies, 'createWorkspace', createWorkspace);
    workspace = normalizeWorkspace(
      await workspaceFactory({ environment }),
      dependency(dependencies, 'verifyWorkspace', verifyWorkspace)
    );
    const baseRunner = dependencies.runner || createRunner();
    childSpawned = false;
    const probeTrackingRunner = {
      run: async (inv, opts) => {
        const res = await baseRunner.run(inv, opts);
        if (res?.cleanupOutcome === 'unconfirmed') {
          cleanupOutcome = 'unconfirmed';
        }
        return res;
      }
    };
    const generationTrackingRunner = {
      run: async (inv, opts) => {
        const res = await baseRunner.run(inv, opts);
        if (res?.cleanupOutcome === 'unconfirmed') {
          cleanupOutcome = 'unconfirmed';
        }
        if (res && (!res.error || (res.error.code !== 'EXECUTABLE_UNAVAILABLE' && res.error.code !== 'CWD_INVALID' && res.error.code !== 'CWD_UNSAFE' && res.error.code !== 'PROMPT_OVERSIZED'))) {
          childSpawned = true;
        }
        return res;
      }
    };
    const probeTimeoutMs = 30_000;
    const probeDeadline = started + probeTimeoutMs;
    const probeRunner = (dependencies.createProbeRunner || createProbeRunner)({
      runner: probeTrackingRunner,
      deadline: probeDeadline,
      now
    });
    const generationRunner = (dependencies.createGenerationRunner || createGenerationRunner)({
      runner: generationTrackingRunner,
      wait: selected.policy?.wait || {},
      now
    });
    const context = {
      checkpoint,
      prompt: checkpoint.version === 2 ? formatMentorPrompt(checkpoint) : serializeCheckpoint(checkpoint),
      target,
      runner: probeRunner,
      environment,
      signal: dependencies.signal,
      cwd: workspace.realpath,
      workspaceRoot: workspace.realpath,
      requestDepth: 0,
      createInvocation: dependencies.createInvocation
    };
    adapterVersion = version(await adapter.probeVersion(context));
    await adapter.probeAuth(context);
    await adapter.probeCapabilities(context);
    const invocation = await adapter.buildInvocation(context);
    const execution = await generationRunner.run(invocation, {
      environment, requestDepth: 0, signal: dependencies.signal
    });
    modelStarted = childSpawned;
    if (execution?.error) {
      cleanupOutcome = execution.cleanupOutcome || 'unconfirmed';
      throw execution.failure || execution.error;
    }
    if (dependencies.signal?.aborted) fail('CANCELLED');
    const adapterResult = await adapter.parseResult({ ...context, execution: execution?.result || execution });
    if (dependencies.signal?.aborted) fail('CANCELLED');
    const result = normalizeResult(adapterResult, { checkpoint, maxBytes: MAX_ENVELOPE_BYTES });
    if (dependencies.signal?.aborted) fail('CANCELLED');
    if (checkpoint.version === 2) {
      attempts = [{
        attempt_id: correlationId,
        slot: 'primary',
        route: { backend: target.backend, model: target.model, effort: target.effort },
        phase: 'model',
        model_started: true,
        elapsed_ms: elapsed(now, started),
        terminal_classification: 'success',
        retry_delay_ms: null,
        cleanup_outcome: cleanupOutcome
      }];
    }
    envelope = buildSuccessEnvelope({
      correlation_id: correlationId,
      checkpoint,
      checkpoint_digest: digest,
      receipt: receipt(),
      attempts,
      result,
      cleanup_outcome: cleanupOutcome
    });
  } catch (error) {
    if (error?.cleanupOutcome) {
      cleanupOutcome = error.cleanupOutcome;
    }
    const code = dependencies.signal?.aborted ? 'CANCELLED' : failureCode(error, adapter);
    lastRoutingError = isRoutingError(error) ? error : createRoutingError(code);
    if (checkpoint?.version === 2 && target?.backend && target?.model && target?.effort) {
      modelStarted = Boolean(childSpawned);
      attempts = [{
        attempt_id: correlationId,
        slot: 'primary',
        route: { backend: target.backend, model: target.model, effort: target.effort },
        phase: modelStarted ? 'model' : 'preflight',
        model_started: modelStarted,
        elapsed_ms: elapsed(now, started),
        terminal_classification: dependencies.signal?.aborted ? 'cancelled' : 'fatal',
        retry_delay_ms: null,
        cleanup_outcome: cleanupOutcome
      }];
    } else {
      attempts = [];
    }
    envelope = buildFailureEnvelope({
      correlation_id: correlationId,
      checkpoint,
      checkpoint_digest: digest,
      receipt: receipt(),
      attempts,
      error: lastRoutingError,
      cleanup_outcome: cleanupOutcome
    });
  } finally {
    if (workspace) {
      const cleanup = dependency(dependencies, 'cleanupWorkspace', cleanupWorkspace);
      try {
        const cleanupResult = await cleanup(workspace);
        if (cleanupResult?.outcome !== 'confirmed') {
          cleanupOutcome = 'unconfirmed';
          if (envelope?.status === 'ADVICE_READY') {
            if (checkpoint?.version === 2 && attempts.length > 0) {
              attempts[0] = { ...attempts[0], cleanup_outcome: 'unconfirmed', terminal_classification: 'fatal' };
            }
            envelope = buildFailureEnvelope({
              correlation_id: correlationId,
              checkpoint,
              checkpoint_digest: digest,
              receipt: receipt(),
              attempts,
              error: createRoutingError('CLEANUP_UNCONFIRMED'),
              cleanup_outcome: 'unconfirmed'
            });
          }
        }
      } catch {
        cleanupOutcome = 'unconfirmed';
        if (envelope?.status === 'ADVICE_READY') {
          if (checkpoint?.version === 2 && attempts.length > 0) {
            attempts[0] = { ...attempts[0], cleanup_outcome: 'unconfirmed', terminal_classification: 'fatal' };
          }
          envelope = buildFailureEnvelope({
            correlation_id: correlationId,
            checkpoint,
            checkpoint_digest: digest,
            receipt: receipt(),
            attempts,
            error: createRoutingError('CLEANUP_UNCONFIRMED'),
            cleanup_outcome: 'unconfirmed'
          });
        }
      }
    }
    if (dependencies.signal?.aborted) {
      if (checkpoint?.version === 2 && attempts.length > 0) {
        attempts[0] = { ...attempts[0], cleanup_outcome: cleanupOutcome, terminal_classification: 'cancelled' };
      }
      envelope = buildFailureEnvelope({
        correlation_id: correlationId,
        checkpoint,
        checkpoint_digest: digest,
        receipt: receipt(),
        attempts,
        error: createRoutingError('CANCELLED'),
        cleanup_outcome: cleanupOutcome
      });
    } else if (envelope && envelope.cleanup_outcome !== cleanupOutcome) {
      if (checkpoint?.version === 2 && attempts.length > 0) {
        attempts[0] = { ...attempts[0], cleanup_outcome: cleanupOutcome };
      }
      envelope = envelope.status === 'ADVICE_READY'
        ? buildSuccessEnvelope({
          correlation_id: correlationId,
          checkpoint,
          checkpoint_digest: digest,
          receipt: receipt(),
          attempts,
          result: envelope.result,
          cleanup_outcome: cleanupOutcome
        })
        : buildFailureEnvelope({
          correlation_id: correlationId,
          checkpoint,
          checkpoint_digest: digest,
          receipt: receipt(),
          attempts,
          error: lastRoutingError || envelope.error,
          cleanup_outcome: cleanupOutcome
        });
    }
    if (envelope && typeof dependencies.onAttempt === 'function') {
      try {
        dependencies.onAttempt({
          attempt_id: correlationId,
          terminal_classification: envelope.status === 'ADVICE_READY'
            ? 'success'
            : (dependencies.signal?.aborted ? 'cancelled' : 'fatal'),
          cleanup_outcome: cleanupOutcome,
          error: envelope.error || null
        });
      } catch {}
    }
  }
  return envelope;
}

function diagnosticRequestId(value) {
  if (typeof value !== 'string' || !REQUEST_ID.test(value) || CONTROL.test(value)
    || Buffer.byteLength(value, 'utf8') > REQUEST_ID_LIMIT) fail('REQUEST_INVALID');
  return value;
}
function validateDiagnosticRequest(value) {
  if (!isPlainObject(value)) fail('REQUEST_INVALID');
  const keys = Object.keys(value);
  if (keys.length !== 4 || keys.some((key) => !['protocol', 'protocolVersion', 'requestId', 'operation'].includes(key))) {
    fail('REQUEST_INVALID');
  }
  if (value.protocol !== DIAGNOSTIC_PROTOCOL || value.protocolVersion !== DIAGNOSTIC_VERSION
    || value.operation !== DIAGNOSTIC_OPERATION) fail('REQUEST_INVALID');
  diagnosticRequestId(value.requestId);
  return Object.freeze({
    protocol: DIAGNOSTIC_PROTOCOL,
    protocolVersion: DIAGNOSTIC_VERSION,
    requestId: value.requestId,
    operation: DIAGNOSTIC_OPERATION
  });
}
function parseDiagnosticRequest(input) {
  let text;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = input;
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.byteLength > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
    text = decodeUtf8(input, 'REQUEST_INVALID');
  } else fail('REQUEST_INVALID');
  try { return validateDiagnosticRequest(parseJsonDocument(text, 'REQUEST_INVALID', 'REQUEST_INVALID')); }
  catch (error) {
    if (isRoutingError(error)) throw error.code === 'PROTOCOL_INVALID'
      ? createRoutingError('REQUEST_INVALID') : error;
    fail('REQUEST_INVALID');
  }
}
function serializeDiagnosticRequest(value) {
  const request = validateDiagnosticRequest(value);
  const encoded = JSON.stringify(request);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
  return encoded;
}
function isDiagnosticRequest(value) {
  return isPlainObject(value) && value.protocol === DIAGNOSTIC_PROTOCOL;
}
function diagnosticFailure(requestId, target, probes, error) {
  return {
    protocol: DIAGNOSTIC_PROTOCOL,
    protocolVersion: DIAGNOSTIC_VERSION,
    requestId,
    status: 'FAILED',
    target,
    probes,
    error: serializeRoutingError(error)
  };
}
function diagnosticText(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value || CONTROL.test(value)
    || Buffer.byteLength(value, 'utf8') > VERSION_LIMIT) fail('ADAPTER_CONTRACT_INVALID');
  return value;
}
function diagnosticCapabilities(value, target) {
  let capabilities;
  try { capabilities = validateCapabilityAttestation(value); }
  catch { fail('ADAPTER_CONTRACT_INVALID'); }
  if (capabilities.model !== target.model) fail('MODEL_UNSUPPORTED');
  if (capabilities.effort !== target.effort) fail('EFFORT_UNSUPPORTED');
  return {
    status: 'passed',
    model: capabilities.model,
    effort: capabilities.effort,
    noninteractive: capabilities.noninteractive,
    session: diagnosticText(capabilities.session),
    tools: diagnosticText(capabilities.tools),
    output: diagnosticText(capabilities.output)
  };
}
async function boundedProbe(fn, context, deadline, now) {
  if (context.signal?.aborted) fail('CANCELLED');
  const remaining = Math.floor(deadline - now());
  if (remaining < 1) fail('TIMEOUT');
  let timer;
  let onAbort;
  const expiry = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(createRoutingError('TIMEOUT')), remaining);
    onAbort = () => reject(createRoutingError('CANCELLED'));
    context.signal?.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(() => fn(context)), expiry]); }
  finally {
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', onAbort);
  }
}
function safeDiagnosticRequestId(input) {
  try {
    const raw = Buffer.isBuffer(input) || input instanceof Uint8Array
      ? decodeUtf8(input, 'REQUEST_INVALID') : input;
    const value = typeof raw === 'string' ? parseJsonDocument(raw) : raw;
    return isPlainObject(value) && typeof value.requestId === 'string'
      && REQUEST_ID.test(value.requestId)
      && Buffer.byteLength(value.requestId, 'utf8') <= REQUEST_ID_LIMIT
      ? value.requestId : null;
  } catch { return null; }
}
async function runQualificationDiagnostic(input, dependencies = {}) {
  const probes = {
    version: { status: 'not-run' },
    auth: { status: 'not-run' },
    capabilities: { status: 'not-run' }
  };
  let target = null;
  let requestId = safeDiagnosticRequestId(input);
  const now = dependency(dependencies, 'monotonicMilliseconds', monotonicMilliseconds);
  let started;
  try { started = now(); } catch { started = monotonicMilliseconds(); }
  let adapter = null;
  try {
    const rawRequest = await input;
    requestId = safeDiagnosticRequestId(rawRequest) ?? requestId;
    const request = parseDiagnosticRequest(rawRequest);
    if (dependencies.signal?.aborted) fail('CANCELLED');
    const sourceEnvironment = dependencies.environment || process.env;
    const loaded = await dependency(dependencies, 'loadGlobalPolicy', loadGlobalPolicy)(sourceEnvironment?.HOME);
    target = targetFromPolicy(loaded?.policy ?? loaded).target;
    adapter = registryLookup(dependencies, target.backend);
    if (!adapter || typeof adapter.probeVersion !== 'function' || typeof adapter.probeAuth !== 'function'
      || typeof adapter.probeCapabilities !== 'function') fail('ADAPTER_CONTRACT_INVALID');
    const environment = buildProbeEnvironment({
      source: sourceEnvironment,
      adapter: target.backend,
      authKeys: Array.isArray(adapter.authKeys) ? adapter.authKeys : [],
      requestDepth: 0
    });
    let cwd;
    try { cwd = dependencies.cwd || process.cwd(); } catch { fail('CWD_INVALID'); }
    const workspaceRoot = dependencies.workspaceRoot || cwd;
    const baseRunner = dependencies.runner || createRunner();
    const timeoutMs = Number.isFinite(target.timeout_ms) ? target.timeout_ms : 900_000;
    const deadline = started + timeoutMs;
    const deadlineRunner = createDeadlineRunner({ runner: baseRunner, deadline, now });
    const context = {
      request, target, runner: deadlineRunner, environment, signal: dependencies.signal,
      cwd, workspaceRoot, requestDepth: 0, createInvocation: dependencies.createInvocation
    };
    const adapterVersion = version(await boundedProbe(adapter.probeVersion, context, deadline, now));
    probes.version = { status: 'passed', value: adapterVersion };
    await boundedProbe(adapter.probeAuth, context, deadline, now);
    probes.auth = { status: 'passed' };
    const capabilities = await boundedProbe(adapter.probeCapabilities, context, deadline, now);
    probes.capabilities = diagnosticCapabilities(capabilities, target);
    const result = {
      protocol: DIAGNOSTIC_PROTOCOL,
      protocolVersion: DIAGNOSTIC_VERSION,
      requestId: request.requestId,
      status: 'QUALIFIED',
      target: { backend: target.backend, model: target.model, effort: target.effort },
      probes
    };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_ENVELOPE_BYTES) fail('OUTPUT_LIMIT');
    return result;
  } catch (error) {
    const code = dependencies.signal?.aborted ? 'CANCELLED' : failureCode(error, adapter);
    const safeError = createRoutingError(ERROR_CODES[code] ? code : 'PROCESS_FAILED');
    return diagnosticFailure(requestId, target ? {
      backend: target.backend, model: target.model, effort: target.effort
    } : null, probes, safeError);
  }
}

module.exports = {
  CONTROLLER_VERSION,
  DIAGNOSTIC_PROTOCOL,
  DIAGNOSTIC_VERSION,
  DIAGNOSTIC_OPERATION,
  parseInput,
  parseDiagnosticRequest,
  validateDiagnosticRequest,
  serializeDiagnosticRequest,
  isDiagnosticRequest,
  runController,
  runQualificationDiagnostic,
  targetFromPolicy
};
