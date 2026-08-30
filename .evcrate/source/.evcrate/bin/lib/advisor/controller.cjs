'use strict';

const { monotonicMilliseconds, createRunner, createDeadlineRunner } = require('./runner.cjs');
const { parseJsonDocument, decodeUtf8 } = require('./json-document.cjs');
const { validateCheckpoint, serializeCheckpoint, normalizeResult, MAX_ENVELOPE_BYTES } = require('./checkpoint-contract.cjs');
const { loadGlobalPolicy } = require('./profile.cjs');
const { validatePolicy } = require('./policy-schema.cjs');
const { getAdapter } = require('./adapter-registry.cjs');
const { createWorkspace, cleanupWorkspace, verifyWorkspace } = require('./isolated-workspace.cjs');
const { createRoutingError, isRoutingError } = require('./errors.cjs');
const { buildSuccessEnvelope, buildFailureEnvelope } = require('./controller-envelope.cjs');

const CONTROLLER_VERSION = 1;
const VERSION_LIMIT = 128;
const CONTROL = /[\u0000-\u001f\u007f]/u;

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
  const target = Object.freeze({ ...policy.advisor });
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
  const now = dependency(dependencies, 'monotonicMilliseconds', monotonicMilliseconds);
  const makeUuid = dependency(dependencies, 'randomUUID', require('node:crypto').randomUUID);
  const correlationId = makeUuid();
  let started;
  try { started = now(); } catch { started = monotonicMilliseconds(); }
  let adapter = null;
  let adapterVersion = null;
  let workspace = null;
  let receipt = () => ({ backend: target?.backend ?? null, model: target?.model ?? null,
    effort: target?.effort ?? null, controller_version: CONTROLLER_VERSION,
    adapter_version: adapterVersion, elapsed_ms: elapsed(now, started) });
  try {
    const request = await input;
    if (dependencies.signal?.aborted) fail('CANCELLED');
    const checkpoint = parseInput(request);
    const loaded = await dependency(dependencies, 'loadGlobalPolicy', loadGlobalPolicy)();
    const selected = targetFromPolicy(loaded?.policy ?? loaded);
    target = selected.target;
    adapter = registryLookup(dependencies, target.backend);
    const environment = dependencies.environment || process.env;
    const workspaceFactory = dependency(dependencies, 'createWorkspace', createWorkspace);
    workspace = normalizeWorkspace(
      await workspaceFactory({ environment }),
      dependency(dependencies, 'verifyWorkspace', verifyWorkspace)
    );
    const baseRunner = dependencies.runner || createRunner();
    const deadline = started + target.timeout_ms;
    const deadlineRunner = createDeadlineRunner({ runner: baseRunner, deadline, now });
    const context = {
      checkpoint,
      prompt: serializeCheckpoint(checkpoint),
      target,
      runner: deadlineRunner,
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
    const execution = await deadlineRunner.run(invocation, {
      environment, requestDepth: 0, signal: dependencies.signal
    });
    if (execution?.error) throw execution.failure || execution.error;
    const adapterResult = await adapter.parseResult({ ...context, execution: execution?.result || execution });
    const result = normalizeResult(adapterResult, { checkpoint, maxBytes: MAX_ENVELOPE_BYTES });
    return buildSuccessEnvelope({ correlation_id: correlationId, receipt: receipt(), result });
  } catch (error) {
    const code = dependencies.signal?.aborted ? 'CANCELLED' : failureCode(error, adapter);
    return buildFailureEnvelope({ correlation_id: correlationId, receipt: receipt(), error: createRoutingError(code) });
  } finally {
    if (workspace) {
      const cleanup = dependency(dependencies, 'cleanupWorkspace', cleanupWorkspace);
      try { await cleanup(workspace); } catch { /* workspace cleanup cannot change the terminal envelope */ }
    }
  }
}

module.exports = { CONTROLLER_VERSION, parseInput, runController, targetFromPolicy };
