'use strict';

const { parseJsonDocument } = require('../json-document.cjs');
const { createRoutingError, isRoutingError } = require('../errors.cjs');
const {
  DEFAULT_LIMITS,
  assertNoRecursion,
  createInvocation,
  isRunnerFailure
} = require('../runner.cjs');
const { freezeAdapter } = require('../adapter-contract.cjs');

const EXECUTABLE = 'claude';
const SUPPORTED_VERSION = '2.1.207';
const SUPPORTED_MODEL = 'opus';
const SUPPORTED_EFFORT = 'high';
const MAX_TURNS = 3;
// Claude has no safe model-list endpoint. This version-pinned, no-model help
// probe exercises the exact reviewed selector and execution controls without
// starting a session or making a model call; any rejected selector fails closed.
const CAPABILITY_PROBE = Object.freeze([
  '--model', SUPPORTED_MODEL,
  '--effort', SUPPORTED_EFFORT,
  '--permission-mode', 'plan',
  '--output-format', 'json',
  '--no-session-persistence',
  '--max-turns', String(MAX_TURNS),
  '--help'
]);
const PROBE_LIMITS = Object.freeze({
  ...DEFAULT_LIMITS,
  maxPromptBytes: 1,
  maxLines: 256,
  timeoutMs: 5_000
});
const STATES = new WeakMap();
const RESULT_KEYS = new Set([
  'type', 'subtype', 'is_error', 'result', 'session_id', 'uuid', 'num_turns',
  'duration_ms', 'duration_api_ms', 'total_cost_usd', 'usage', 'permission_denials',
  'stop_reason', 'model'
]);
const PRESERVED_FAILURES = new Set([
  'EXECUTABLE_UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'ADVISOR_RECURSION',
  'REQUEST_DEPTH_INVALID', 'INVOCATION_INVALID', 'CWD_INVALID', 'CWD_UNSAFE',
  'PROMPT_OVERSIZED', 'OUTPUT_LIMIT', 'LINE_LIMIT', 'OUTPUT_INVALID'
]);
const VERSION_PATTERN = new RegExp(
  `^${SUPPORTED_VERSION.replaceAll('.', '\\.')}(?:\\s+\\(Claude Code\\))?\\s*$`, 'u'
);

function fail(code) {
  throw createRoutingError(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function limitsFor(context) {
  if (context?.limits === undefined) return DEFAULT_LIMITS;
  if (!isPlainObject(context.limits)) fail('INVOCATION_INVALID');
  return { ...DEFAULT_LIMITS, ...context.limits };
}

function probeLimits(context) {
  if (context?.limits !== undefined && !isPlainObject(context.limits)) {
    fail('INVOCATION_INVALID');
  }
  return { ...PROBE_LIMITS, ...(context?.limits || {}) };
}

function contextState(context) {
  if (!isPlainObject(context)) fail('INVOCATION_INVALID');
  let state = STATES.get(context);
  if (!state) {
    state = {};
    STATES.set(context, state);
  }
  return state;
}

function assertContext(context) {
  contextState(context);
  assertNoRecursion({
    environment: context.environment || process['env'],
    requestDepth: context.requestDepth === undefined ? 0 : context.requestDepth
  });
  if (!context.runner || typeof context.runner.run !== 'function') {
    fail('ADAPTER_CONTRACT_INVALID');
  }
}

function locationsFor(context) {
  const cwd = typeof context?.cwd === 'string' ? context.cwd : process.cwd();
  const workspaceRoot = typeof context?.workspaceRoot === 'string'
    ? context.workspaceRoot : cwd;
  return { cwd, workspaceRoot };
}

function routeFor(context) {
  const route = context?.descriptor?.route;
  if (!isPlainObject(route) || typeof route.model !== 'string') fail('MODEL_UNSUPPORTED');
  if (route.model !== SUPPORTED_MODEL) fail('MODEL_UNSUPPORTED');
  if (route.effort !== SUPPORTED_EFFORT) fail('EFFORT_UNSUPPORTED');
  return route;
}

function makeInvocation(context, argv, prompt = '', limits = limitsFor(context)) {
  const { cwd, workspaceRoot } = locationsFor(context);
  const factory = typeof context.createInvocation === 'function'
    ? context.createInvocation : createInvocation;
  return factory({
    adapter: 'claude',
    executable: EXECUTABLE,
    argv,
    cwd,
    workspaceRoot,
    prompt,
    authKeys: [],
    limits
  });
}

function errorCode(error) {
  if (isRunnerFailure(error)) return error.error?.code;
  return isRoutingError(error) ? error.code : error?.code || error?.error?.code;
}

function stageFailure(error, fallback, final = false) {
  const code = errorCode(error);
  if (PRESERVED_FAILURES.has(code) && (final || code !== 'OUTPUT_INVALID')) {
    return createRoutingError(code);
  }
  if (code === 'ADVISOR_RECURSION' || code === 'REQUEST_DEPTH_INVALID') {
    return createRoutingError(code);
  }
  return createRoutingError(fallback);
}

async function runCommand(context, argv, fallback, prompt = '', final = false) {
  assertContext(context);
  const invocation = makeInvocation(context, argv, prompt,
    final ? limitsFor(context) : probeLimits(context));
  let execution;
  try {
    execution = await context.runner.run(invocation, {
      environment: context.environment,
      requestDepth: 0,
      signal: context.signal
    });
  } catch (error) {
    throw stageFailure(error, fallback, final);
  }
  if (!execution || typeof execution !== 'object') fail('PROCESS_FAILED');
  if (execution.error) throw stageFailure(execution.failure || execution.error, fallback, final);
  const result = execution.result && typeof execution.result === 'object'
    ? execution.result : execution;
  if (!result || typeof result.stdout !== 'string') fail(fallback);
  const limits = final ? limitsFor(context) : probeLimits(context);
  const stdoutBytes = Buffer.byteLength(result.stdout, 'utf8');
  if (stdoutBytes > limits.maxStdoutBytes || stdoutBytes > limits.maxResultBytes) {
    fail(final ? 'OUTPUT_LIMIT' : fallback);
  }
  return result;
}

async function probeVersion(context) {
  const state = contextState(context);
  const result = await runCommand(context, ['--version'], 'CLI_VERSION_UNSUPPORTED');
  if (!VERSION_PATTERN.test(result.stdout)) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  state.version = SUPPORTED_VERSION;
  return true;
}

async function probeAuth(context) {
  const state = contextState(context);
  if (state.version !== SUPPORTED_VERSION) fail('CLI_VERSION_UNSUPPORTED');
  const result = await runCommand(context, ['auth', 'status'], 'AUTH_UNAVAILABLE');
  let status;
  try { status = parseJsonDocument(result.stdout); } catch { fail('AUTH_UNAVAILABLE'); }
  if (!isPlainObject(status)
    || Object.keys(status).some((key) => !['loggedIn', 'authMethod', 'apiProvider'].includes(key))
    || typeof status.loggedIn !== 'boolean'
    || typeof status.authMethod !== 'string'
    || !status.authMethod
    || status.authMethod === 'none'
    || status.loggedIn !== true) {
    fail('AUTH_UNAVAILABLE');
  }
  state.authenticated = true;
  return true;
}

function requireHelpFeature(help, pattern, code) {
  if (!pattern.test(help)) fail(code);
}

async function probeCapabilities(context) {
  const state = contextState(context);
  if (state.version !== SUPPORTED_VERSION || state.authenticated !== true) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  routeFor(context);
  const result = await runCommand(context, ['--help'], 'OUTPUT_UNSUPPORTED');
  const help = result.stdout;
  requireHelpFeature(help, /(?:^|\n)\s*(?:-p,\s*)?--print(?:\s|$)/mu, 'OUTPUT_UNSUPPORTED');
  requireHelpFeature(help, /--model\s+<model>/u, 'MODEL_UNSUPPORTED');
  requireHelpFeature(help, /--effort\s+<level>/u, 'EFFORT_UNSUPPORTED');
  requireHelpFeature(help, /\b(?:low|medium|high|xhigh|max)\b/u, 'EFFORT_UNSUPPORTED');
  requireHelpFeature(help, /--permission-mode\s+<[^>]+>/u, 'READ_ONLY_UNSUPPORTED');
  requireHelpFeature(help, /\bplan\b/u, 'READ_ONLY_UNSUPPORTED');
  requireHelpFeature(help, /--no-session-persistence\b/u, 'SESSION_UNSUPPORTED');
  requireHelpFeature(help, /--output-format\s+<[^>]+>/u, 'OUTPUT_UNSUPPORTED');
  requireHelpFeature(help, /\bjson\b/u, 'OUTPUT_UNSUPPORTED');
  const controlProbe = await runCommand(context, CAPABILITY_PROBE, 'OUTPUT_UNSUPPORTED');
  if (!/Usage:\s+claude\b/u.test(controlProbe.stdout)) fail('OUTPUT_UNSUPPORTED');
  state.capabilities = Object.freeze({ model: SUPPORTED_MODEL, effort: SUPPORTED_EFFORT });
  return true;
}

async function buildInvocation(context) {
  assertContext(context);
  const state = contextState(context);
  if (!state.capabilities) fail('OUTPUT_UNSUPPORTED');
  const route = routeFor(context);
  if (route.model !== state.capabilities.model) fail('MODEL_UNSUPPORTED');
  if (route.effort !== state.capabilities.effort) fail('EFFORT_UNSUPPORTED');
  if (typeof context.brief !== 'string') fail('REQUEST_INVALID');
  return makeInvocation(context, [
    '-p',
    '--model', route.model,
    '--effort', route.effort,
    '--permission-mode', 'plan',
    '--output-format', 'json',
    '--no-session-persistence',
    '--max-turns', String(MAX_TURNS)
  ], context.brief);
}

function parseProtocol(text, maxBytes) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maxBytes) {
    fail('OUTPUT_LIMIT');
  }
  let value;
  try { value = parseJsonDocument(text); } catch { fail('PROTOCOL_INVALID'); }
  if (!isPlainObject(value)
    || Object.keys(value).some((key) => !RESULT_KEYS.has(key))
    || value.type !== 'result'
    || value.subtype !== 'success'
    || value.is_error !== false
    || typeof value.result !== 'string'
    || value.result.length === 0
    || Buffer.byteLength(value.result, 'utf8') > maxBytes) {
    fail('PROTOCOL_INVALID');
  }
  return Object.freeze({ response: value.result });
}

async function parseResult({ execution, ...context } = {}) {
  const result = execution?.result && typeof execution.result === 'object'
    ? execution.result : execution;
  if (!result || typeof result.stdout !== 'string') fail('PROTOCOL_INVALID');
  return parseProtocol(result.stdout, limitsFor(context).maxResultBytes);
}

function classifyFailure(error) {
  const code = errorCode(error);
  if (code && (PRESERVED_FAILURES.has(code) || [
    'CLI_VERSION_UNSUPPORTED', 'AUTH_UNAVAILABLE', 'MODEL_UNSUPPORTED',
    'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED', 'SESSION_UNSUPPORTED',
    'OUTPUT_UNSUPPORTED', 'PROTOCOL_INVALID', 'PROCESS_FAILED'
  ].includes(code))) return code;
  return 'PROCESS_FAILED';
}

module.exports = freezeAdapter({
  name: 'claude',
  authKeys: [],
  probeVersion,
  probeAuth,
  probeCapabilities,
  buildInvocation,
  parseResult,
  classifyFailure
});
