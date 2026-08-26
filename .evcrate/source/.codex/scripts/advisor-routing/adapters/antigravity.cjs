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

const EXECUTABLE = 'agy';
const REVIEWED_VERSION = '1.0.0';
const SUPPORTED_MODEL = 'pro';
const SUPPORTED_EFFORTS = Object.freeze(['low', 'medium', 'high']);
const PRINT_TIMEOUT = '30s';
const MAX_RESULT_BYTES = 32 * 1024;
const MAX_PROBE_STDOUT_BYTES = 512 * 1024;
// The documented --sandbox flag restricts terminal execution, but does not
// deny workspace file writes. No launch-time deny-write flag is available in
// the reviewed AGY contract, so this adapter remains fail-closed.
const READ_ONLY_POLICY = Object.freeze({ flag: '--sandbox', verified: false });
const PROBE_LIMITS = Object.freeze({
  ...DEFAULT_LIMITS,
  maxPromptBytes: 1,
  maxStdoutBytes: MAX_PROBE_STDOUT_BYTES,
  maxResultBytes: MAX_PROBE_STDOUT_BYTES,
  maxLines: 256,
  timeoutMs: 5_000
});
const STATES = new WeakMap();
const PRESERVED_FAILURES = new Set([
  'EXECUTABLE_UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'ADVISOR_RECURSION',
  'REQUEST_DEPTH_INVALID', 'INVOCATION_INVALID', 'CWD_INVALID', 'CWD_UNSAFE',
  'PROMPT_OVERSIZED', 'OUTPUT_LIMIT', 'LINE_LIMIT', 'OUTPUT_INVALID'
]);
const READ_ONLY_TOOLS = Object.freeze([
  'read', 'read_file', 'find', 'grep', 'glob', 'search', 'search_file_content',
  'list_files', 'list_directory', 'ls', 'stat', 'get_internal_docs'
]);

function fail(code) {
  throw createRoutingError(code);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isReadOnlyTool(value) {
  return typeof value === 'string' && READ_ONLY_TOOLS.includes(value);
}

function assertReadOnlyToolIdentity(...values) {
  const identities = values.filter((value) => value !== undefined);
  if (!identities.length || identities.some((value) => !isReadOnlyTool(value))
    || new Set(identities).size !== 1) {
    fail('READ_ONLY_UNSUPPORTED');
  }
}

function contextState(context) {
  if (!isObject(context)) fail('INVOCATION_INVALID');
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
  if (!context.runner || typeof context.runner.run !== 'function') fail('ADAPTER_CONTRACT_INVALID');
}

function routeFor(context) {
  const route = context?.descriptor?.route;
  if (!isObject(route) || route.model !== SUPPORTED_MODEL) fail('MODEL_UNSUPPORTED');
  if (!SUPPORTED_EFFORTS.includes(route.effort)) fail('EFFORT_UNSUPPORTED');
  return route;
}

function invocationFactory(context) {
  return typeof context.createInvocation === 'function' ? context.createInvocation : createInvocation;
}

function makeInvocation(context, argv, prompt = '', limits = DEFAULT_LIMITS) {
  const cwd = context.cwd || context.workspaceRoot || process.cwd();
  const workspaceRoot = context.workspaceRoot || cwd;
  return invocationFactory(context)({
    adapter: 'antigravity',
    executable: EXECUTABLE,
    argv: [...argv],
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

function preserveLifecycleFailure(error) {
  return PRESERVED_FAILURES.has(errorCode(error)) ? error : null;
}

async function runProbe(context, argv) {
  assertContext(context);
  let execution;
  try {
    execution = await context.runner.run(makeInvocation(context, argv, '', PROBE_LIMITS), {
      environment: context.environment || process['env'],
      requestDepth: 0,
      signal: context.signal
    });
  } catch (error) {
    if (isRoutingError(error) || isRunnerFailure(error)) throw error;
    fail('PROCESS_FAILED');
  }
  if (execution?.error) throw execution.failure || execution.error;
  const result = execution?.result || execution;
  if (!result || typeof result.stdout !== 'string') fail('OUTPUT_INVALID');
  if (Buffer.byteLength(result.stdout, 'utf8') > MAX_PROBE_STDOUT_BYTES) fail('OUTPUT_LIMIT');
  return result.stdout;
}

async function probeOutput(context, argv, fallback) {
  try { return await runProbe(context, argv); }
  catch (error) {
    const lifecycle = preserveLifecycleFailure(error);
    if (lifecycle) throw lifecycle;
    fail(fallback);
  }
}

function parseVersion(stdout) {
  const match = /^(?:agy(?:\s+version)?\s+)?([0-9]+\.[0-9]+\.[0-9]+)\s*$/iu.exec(stdout.trim());
  if (!match || match[1] !== REVIEWED_VERSION) fail('CLI_VERSION_UNSUPPORTED');
  return match[1];
}

function requireMarker(help, marker, code) {
  if (!help.includes(marker)) fail(code);
}

async function probeVersion(context) {
  const state = contextState(context);
  const stdout = await probeOutput(context, ['--version'], 'CLI_VERSION_UNSUPPORTED');
  state.version = parseVersion(stdout);
  return true;
}

async function probeAuth(context) {
  const state = contextState(context);
  if (state.version !== REVIEWED_VERSION) fail('CLI_VERSION_UNSUPPORTED');
  // AGY has no documented credential-status command. Its headless process
  // reports cached-credential failures in the structured terminal envelope;
  // this stage intentionally performs no model call and reads no profile.
  state.authenticated = true;
  return true;
}

async function probeCapabilities(context) {
  const state = contextState(context);
  if (state.version !== REVIEWED_VERSION || state.authenticated !== true) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  const route = routeFor(context);
  const help = await probeOutput(context, ['--help'], 'OUTPUT_UNSUPPORTED');
  requireMarker(help, '-p', 'OUTPUT_UNSUPPORTED');
  requireMarker(help, '--model', 'MODEL_UNSUPPORTED');
  requireMarker(help, '--effort', 'EFFORT_UNSUPPORTED');
  for (const effort of SUPPORTED_EFFORTS) requireMarker(help, effort, 'EFFORT_UNSUPPORTED');
  requireMarker(help, '--output-format', 'OUTPUT_UNSUPPORTED');
  requireMarker(help, 'stream-json', 'OUTPUT_UNSUPPORTED');
  requireMarker(help, '--input-format', 'SESSION_UNSUPPORTED');
  requireMarker(help, '--print-timeout', 'OUTPUT_UNSUPPORTED');
  requireMarker(help, READ_ONLY_POLICY.flag, 'READ_ONLY_UNSUPPORTED');
  if (READ_ONLY_POLICY.verified !== true) fail('READ_ONLY_UNSUPPORTED');
  state.capabilities = Object.freeze({ model: route.model, effort: route.effort });
  return true;
}

function buildInvocation(context) {
  assertContext(context);
  const state = contextState(context);
  const route = routeFor(context);
  if (!state.capabilities) fail('OUTPUT_UNSUPPORTED');
  if (route.model !== state.capabilities.model) fail('MODEL_UNSUPPORTED');
  if (route.effort !== state.capabilities.effort) fail('EFFORT_UNSUPPORTED');
  if (typeof context.brief !== 'string') fail('REQUEST_INVALID');
  const prompt = `${JSON.stringify({
    event: 'user',
    message: { content: context.brief }
  })}\n`;
  return makeInvocation(context, [
    '--model', route.model,
    '--effort', route.effort,
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--print-timeout', PRINT_TIMEOUT,
    '--sandbox'
  ], prompt);
}

function authFailure(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return /(?:authentication required|auth(?:entication)?(?:\s|_|-)*(?:required|failed|unavailable)|credential(?:s)?(?:\s|_|-)*(?:required|failed|unavailable)|login required|not logged in|unauthorized|invalid token|token expired)/iu.test(text);
}

function failureCodeFromText(value, fallback = 'PROTOCOL_INVALID') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  if (authFailure(text)) return 'AUTH_UNAVAILABLE';
  if (/(?:cancel|cancell|interrupt|stopp)/iu.test(text)) return 'CANCELLED';
  if (/(?:invalid|unknown|unsupported|unrecognized).{0,40}model|model.{0,40}(?:invalid|unknown|unsupported|unrecognized|unavailable|not found|not recognized)/iu.test(text)) {
    return 'MODEL_UNSUPPORTED';
  }
  if (/(?:invalid|unknown|unsupported|unrecognized).{0,40}effort|effort.{0,40}(?:invalid|unknown|unsupported|unrecognized|not found|not recognized)/iu.test(text)) {
    return 'EFFORT_UNSUPPORTED';
  }
  if (/(?:read[- ]only|permission.{0,20}(?:denied|unsupported)|write.{0,20}(?:denied|blocked)|sandbox)/iu.test(text)) {
    return 'READ_ONLY_UNSUPPORTED';
  }
  return fallback;
}

function diagnosticFailureCode(error) {
  if (!isRunnerFailure(error)) return null;
  const diagnostics = error.diagnostics || {};
  return failureCodeFromText(`${diagnostics.stderr || ''}\n${diagnostics.stdout || ''}`, null);
}

function validateReadOnlyInit(event) {
  const init = event.init;
  if (!isObject(init) || !Array.isArray(init.tools) || typeof init.permission_mode !== 'string') {
    fail('READ_ONLY_UNSUPPORTED');
  }
  if (init.tools.some((tool) => !isReadOnlyTool(tool))) {
    fail('READ_ONLY_UNSUPPORTED');
  }
  if (!['sandbox', 'read-only'].includes(init.permission_mode)) fail('READ_ONLY_UNSUPPORTED');
}

function parseJsonEnvelope(value) {
  if (!isObject(value) || Object.keys(value).some((key) => ![
    'conversation_id', 'status', 'response', 'error', 'duration_seconds', 'num_turns', 'usage',
    'structured_output', 'json_schema'
  ].includes(key))) fail('PROTOCOL_INVALID');
  if (value.status && /cancel/iu.test(value.status)) fail('CANCELLED');
  if (value.error !== undefined) fail(failureCodeFromText(value.error));
  if (value.status !== 'SUCCESS' || typeof value.response !== 'string' || !value.response) {
    fail('PROTOCOL_INVALID');
  }
  return Object.freeze({ response: value.response });
}

function parseStream(stdout) {
  const lines = stdout.split('\n').filter((line, index, all) => !(index === all.length - 1 && line === ''));
  if (!lines.length || lines.length > 2048) fail('PROTOCOL_INVALID');
  let initialized = false;
  let terminal;
  for (const rawLine of lines) {
    if (!rawLine) fail('PROTOCOL_INVALID');
    let event;
    try { event = parseJsonDocument(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine); }
    catch { fail('PROTOCOL_INVALID'); }
    if (!isObject(event) || typeof event.event !== 'string') fail('PROTOCOL_INVALID');
    if (event.event === 'init') {
      if (initialized || terminal) fail('PROTOCOL_INVALID');
      validateReadOnlyInit(event);
      initialized = true;
    } else if (event.event === 'step_update') {
      if (!initialized || terminal || !isObject(event.step_update)) fail('PROTOCOL_INVALID');
      const toolNames = [
        event.step_update.tool_name,
        event.step_update.tool_info?.name,
        event.step_update.tool_info?.tool_name
      ];
      if (event.step_update.step_type === 'tool' || toolNames.some((value) => value !== undefined)) {
        assertReadOnlyToolIdentity(...toolNames);
      }
    } else if (event.event === 'result') {
      if (!initialized || terminal) fail('PROTOCOL_INVALID');
      terminal = isObject(event.result) ? event.result : null;
      if (!terminal) fail('PROTOCOL_INVALID');
    } else {
      fail('PROTOCOL_INVALID');
    }
  }
  if (!initialized || !terminal) fail('PROTOCOL_INVALID');
  return parseJsonEnvelope(terminal);
}

function parseResult({ execution, ...context } = {}) {
  const result = execution?.result && isObject(execution.result) ? execution.result : execution;
  if (!result || typeof result.stdout !== 'string') fail('PROTOCOL_INVALID');
  const maxResultBytes = Math.min(
    context.limits?.maxResultBytes || DEFAULT_LIMITS.maxResultBytes,
    MAX_RESULT_BYTES
  );
  if (Buffer.byteLength(result.stdout, 'utf8') > maxResultBytes) {
    fail('OUTPUT_LIMIT');
  }
  const text = result.stdout.trim();
  if (!text) fail('PROTOCOL_INVALID');
  if (/^\{\s*"event"\s*:/u.test(text)) return parseStream(result.stdout);
  let parsed;
  try { parsed = parseJsonDocument(text); }
  catch { fail('PROTOCOL_INVALID'); }
  return parseJsonEnvelope(parsed);
}

function classifyFailure(error) {
  const code = errorCode(error);
  if (code === 'PROCESS_FAILED') {
    const diagnostic = diagnosticFailureCode(error);
    if (diagnostic) return diagnostic;
  }
  if (code && (PRESERVED_FAILURES.has(code) || [
    'CLI_VERSION_UNSUPPORTED', 'AUTH_UNAVAILABLE', 'MODEL_UNSUPPORTED',
    'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED', 'SESSION_UNSUPPORTED',
    'OUTPUT_UNSUPPORTED', 'PROTOCOL_INVALID', 'PROCESS_FAILED'
  ].includes(code))) return code;
  return 'PROCESS_FAILED';
}

module.exports = freezeAdapter({
  name: 'antigravity',
  authKeys: [],
  probeVersion,
  probeAuth,
  probeCapabilities,
  buildInvocation,
  parseResult,
  classifyFailure
});
