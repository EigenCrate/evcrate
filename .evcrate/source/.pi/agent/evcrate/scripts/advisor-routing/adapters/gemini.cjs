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

const EXECUTABLE = 'gemini';
const MAX_RESULT_BYTES = 32 * 1024;
const MAX_PROBE_STDOUT_BYTES = 512 * 1024;
const PROBE_LIMITS = Object.freeze({
  ...DEFAULT_LIMITS,
  maxPromptBytes: 1,
  maxStdoutBytes: MAX_PROBE_STDOUT_BYTES,
  maxResultBytes: MAX_PROBE_STDOUT_BYTES,
  maxLines: 256,
  timeoutMs: 5_000
});

// 0.47.0 is deliberately recorded as having no exact effort control. The
// future record captures the observed effort selector, but remains disabled
// until a reviewed headless read-only/session boundary is evidenced too.
const VERSION_CAPABILITIES = Object.freeze({
  '0.47.0': Object.freeze({
    model: 'pro',
    efforts: Object.freeze([]),
    effortFlag: null,
    headlessFlag: '-p',
    approvalFlag: '--approval-mode',
    approvalMode: 'plan',
    outputFormats: Object.freeze(['json', 'stream-json']),
    sessionMarkers: Object.freeze(['--resume', '--list-sessions']),
    readOnlyPolicy: Object.freeze({ flag: '--approval-mode', value: 'plan', verified: false }),
    sessionPolicy: Object.freeze({ mode: 'fresh-process', verified: true })
  }),
  '0.48.0': Object.freeze({
    model: 'pro',
    efforts: Object.freeze(['low', 'medium', 'high']),
    effortFlag: '--effort',
    headlessFlag: '-p',
    approvalFlag: '--approval-mode',
    approvalMode: 'plan',
    outputFormats: Object.freeze(['json', 'stream-json']),
    sessionMarkers: Object.freeze(['--resume', '--list-sessions']),
    readOnlyPolicy: Object.freeze({ flag: '--approval-mode', value: 'plan', verified: false }),
    sessionPolicy: Object.freeze({ mode: 'fresh-process', verified: true })
  })
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
  if (!isObject(route) || typeof route.model !== 'string' || typeof route.effort !== 'string') {
    fail('REQUEST_INVALID');
  }
  if (Buffer.byteLength(route.model, 'utf8') > 256) fail('MODEL_UNSUPPORTED');
  if (Buffer.byteLength(route.effort, 'utf8') > 64) fail('EFFORT_UNSUPPORTED');
  return route;
}

function capabilityFor(version) {
  const capability = VERSION_CAPABILITIES[version];
  if (!capability) fail('CLI_VERSION_UNSUPPORTED');
  return capability;
}

function invocationFactory(context) {
  return typeof context.createInvocation === 'function' ? context.createInvocation : createInvocation;
}

function makeInvocation(context, argv, prompt = '', limits = DEFAULT_LIMITS) {
  const cwd = context.cwd || context.workspaceRoot || process.cwd();
  const workspaceRoot = context.workspaceRoot || cwd;
  return invocationFactory(context)({
    adapter: 'gemini',
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
  const match = /^v?([0-9]+\.[0-9]+\.[0-9]+)\s*$/u.exec(stdout.trim());
  if (!match || !VERSION_CAPABILITIES[match[1]]) fail('CLI_VERSION_UNSUPPORTED');
  return match[1];
}

function requireMarker(help, marker, code) {
  if (!help.includes(marker)) fail(code);
}

function parseAuthStatus(stdout) {
  let status;
  try { status = parseJsonDocument(stdout); }
  catch { fail('AUTH_UNAVAILABLE'); }
  if (Array.isArray(status)) return true;
  if (isObject(status) && Array.isArray(status.sessions)) return true;
  fail('AUTH_UNAVAILABLE');
}

async function probeVersion(context) {
  const state = contextState(context);
  const stdout = await probeOutput(context, ['--version'], 'CLI_VERSION_UNSUPPORTED');
  state.version = parseVersion(stdout);
  return true;
}

async function probeAuth(context) {
  const state = contextState(context);
  const capability = capabilityFor(state.version);
  const route = routeFor(context);
  // This gate runs before the auth/status child for Gemini 0.47.0. Omitting
  // the requested effort would make an apparently successful call invalid.
  if (!capability.effortFlag || !capability.efforts.includes(route.effort)) fail('EFFORT_UNSUPPORTED');
  let stdout;
  try { stdout = await runProbe(context, ['--list-sessions']); }
  catch (error) {
    const lifecycle = preserveLifecycleFailure(error);
    if (lifecycle) throw lifecycle;
    fail('AUTH_UNAVAILABLE');
  }
  parseAuthStatus(stdout);
  state.authenticated = true;
  return true;
}

async function probeCapabilities(context) {
  const state = contextState(context);
  if (!state.version || state.authenticated !== true) fail('CLI_VERSION_UNSUPPORTED');
  const capability = capabilityFor(state.version);
  const route = routeFor(context);
  if (route.model !== capability.model) fail('MODEL_UNSUPPORTED');
  if (!capability.effortFlag || !capability.efforts.includes(route.effort)) fail('EFFORT_UNSUPPORTED');
  const help = await probeOutput(context, ['--help'], 'OUTPUT_UNSUPPORTED');
  requireMarker(help, capability.headlessFlag, 'OUTPUT_UNSUPPORTED');
  requireMarker(help, '--model', 'MODEL_UNSUPPORTED');
  requireMarker(help, capability.readOnlyPolicy.flag, 'READ_ONLY_UNSUPPORTED');
  requireMarker(help, capability.readOnlyPolicy.value, 'READ_ONLY_UNSUPPORTED');
  requireMarker(help, '--output-format', 'OUTPUT_UNSUPPORTED');
  for (const format of capability.outputFormats) requireMarker(help, format, 'OUTPUT_UNSUPPORTED');
  for (const marker of capability.sessionMarkers) requireMarker(help, marker, 'SESSION_UNSUPPORTED');
  requireMarker(help, capability.effortFlag, 'EFFORT_UNSUPPORTED');
  for (const effort of capability.efforts) requireMarker(help, effort, 'EFFORT_UNSUPPORTED');
  if (capability.readOnlyPolicy?.verified !== true) fail('READ_ONLY_UNSUPPORTED');
  if (capability.sessionPolicy?.verified !== true) fail('SESSION_UNSUPPORTED');
  state.capabilities = Object.freeze({ model: route.model, effort: route.effort });
  return true;
}

function buildInvocation(context) {
  assertContext(context);
  const state = contextState(context);
  const route = routeFor(context);
  const capability = capabilityFor(state.version);
  if (!state.capabilities) fail('OUTPUT_UNSUPPORTED');
  if (route.model !== state.capabilities.model) fail('MODEL_UNSUPPORTED');
  if (route.effort !== state.capabilities.effort) fail('EFFORT_UNSUPPORTED');
  if (typeof context.brief !== 'string') fail('REQUEST_INVALID');
  const argv = [
    capability.headlessFlag, '', '--model', route.model,
    capability.effortFlag, route.effort,
    capability.approvalFlag, capability.approvalMode,
    '--output-format', 'json'
  ];
  return makeInvocation(context, argv, context.brief);
}

function authFailure(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return /(?:authentication required|auth(?:entication)?(?:s|_|-)*(?:required|failed|unavailable)|credential(?:s)?(?:s|_|-)*(?:required|failed|unavailable)|login required|not logged in|unauthorized|invalid token|token expired)/iu.test(text);
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

function parseJsonResult(value) {
  if (!isObject(value) || Object.keys(value).some((key) => !['response', 'stats', 'error'].includes(key))) {
    fail('PROTOCOL_INVALID');
  }
  if (value.error !== undefined) fail(authFailure(value.error) ? 'AUTH_UNAVAILABLE' : 'PROTOCOL_INVALID');
  if (typeof value.response !== 'string' || !value.response) fail('PROTOCOL_INVALID');
  if (value.stats !== undefined && !isObject(value.stats)) fail('PROTOCOL_INVALID');
  return Object.freeze({ response: value.response });
}

function parseStream(stdout) {
  const lines = stdout.split('\n').filter((line, index, all) => !(index === all.length - 1 && line === ''));
  if (!lines.length || lines.length > 2048) fail('PROTOCOL_INVALID');
  let terminal;
  for (const rawLine of lines) {
    if (!rawLine) fail('PROTOCOL_INVALID');
    let event;
    try { event = parseJsonDocument(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine); }
    catch { fail('PROTOCOL_INVALID'); }
    if (!isObject(event)) fail('PROTOCOL_INVALID');
    const type = event.event || event.type;
    if (!['init', 'message', 'tool_use', 'tool_result', 'error', 'result'].includes(type)) {
      fail('PROTOCOL_INVALID');
    }
    if (type === 'init') {
      const init = event.init;
      if (isObject(init) && init.approval_mode !== undefined && init.approval_mode !== 'plan') {
        fail('READ_ONLY_UNSUPPORTED');
      }
      if (isObject(init) && Array.isArray(init.tools)
        && init.tools.some((tool) => !isReadOnlyTool(tool))) {
        fail('READ_ONLY_UNSUPPORTED');
      }
    } else if (type === 'tool_use') {
      assertReadOnlyToolIdentity(
        event.tool_use?.name,
        event.tool_use?.tool_name,
        event.name,
        event.tool_name
      );
    } else if (type === 'error') {
      fail(failureCodeFromText(event.error || event.message));
    } else if (type === 'result') {
      if (terminal !== undefined) fail('PROTOCOL_INVALID');
      terminal = event.result && isObject(event.result) ? event.result : event;
    }
  }
  if (!terminal) fail('PROTOCOL_INVALID');
  if (terminal.status && /cancel/iu.test(terminal.status)) fail('CANCELLED');
  if (terminal.error !== undefined) {
    fail(failureCodeFromText(terminal.error));
  }
  return parseJsonResult({ response: terminal.response, stats: terminal.stats });
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
  if (/^\{\s*"(?:event|type)"\s*:/u.test(text)) return parseStream(result.stdout);
  let parsed;
  try { parsed = parseJsonDocument(text); }
  catch { fail('PROTOCOL_INVALID'); }
  return parseJsonResult(parsed);
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
  name: 'gemini',
  authKeys: [],
  probeVersion,
  probeAuth,
  probeCapabilities,
  buildInvocation,
  parseResult,
  classifyFailure
});
