'use strict';

const { createRoutingError, isRoutingError } = require('../errors.cjs');
const { parseJsonDocument } = require('../json-document.cjs');
const {
  DEFAULT_LIMITS,
  assertNoRecursion,
  createInvocation,
  isRunnerFailure
} = require('../runner.cjs');
const { freezeAdapter } = require('../adapter-contract.cjs');

const EXECUTABLE = 'codex';
const REVIEWED_VERSION = '0.149.1';
const REVIEWED_MODEL = 'gpt-5.6-sol';
const REVIEWED_EFFORT = 'high';
const EFFORT_CONFIG = 'model_reasoning_effort="high"';
const MAX_RESULT_BYTES = 32 * 1024;
const MAX_TEXT_BYTES = 16 * 1024;
const MAX_PROBE_STDOUT_BYTES = 512 * 1024;
const PROBE_LIMITS = Object.freeze({
  ...DEFAULT_LIMITS,
  maxPromptBytes: 1,
  maxStdoutBytes: MAX_PROBE_STDOUT_BYTES,
  maxResultBytes: MAX_PROBE_STDOUT_BYTES,
  maxLines: 256,
  timeoutMs: 5_000
});
const STATES = new WeakMap();
const EVENT_TYPES = new Set([
  'thread.started',
  'turn.started',
  'item.started',
  'item.completed',
  'turn.completed'
]);
const ITEM_TYPES = new Set([
  'agent_message', 'reasoning', 'command_execution', 'file_change',
  'mcp_tool_call', 'web_search', 'todo_list', 'context_compaction'
]);

function fail(code) {
  throw createRoutingError(code);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
    environment: context.environment || process.env,
    requestDepth: context.requestDepth === undefined ? 0 : context.requestDepth
  });
  if (!context.runner || typeof context.runner.run !== 'function') {
    fail('ADAPTER_CONTRACT_INVALID');
  }
}

function routeOf(context) {
  const route = context.descriptor?.route;
  if (!isObject(route)) fail('REQUEST_INVALID');
  if (typeof route.model !== 'string' || Buffer.byteLength(route.model, 'utf8') > 256) {
    fail('MODEL_UNSUPPORTED');
  }
  if (typeof route.effort !== 'string' || Buffer.byteLength(route.effort, 'utf8') > 64) {
    fail('EFFORT_UNSUPPORTED');
  }
  return route;
}

function invocationFactory(context) {
  return typeof context.createInvocation === 'function' ? context.createInvocation : createInvocation;
}

function makeInvocation(context, argv, prompt, limits) {
  const cwd = context.cwd || context.workspaceRoot || process.cwd();
  const workspaceRoot = context.workspaceRoot || cwd;
  return invocationFactory(context)({
    adapter: 'codex',
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
  if (isRunnerFailure(error)) return error.error.code;
  return error?.code || error?.error?.code || null;
}

function preserveLifecycleFailure(error) {
  const code = errorCode(error);
  if (code === 'TIMEOUT' || code === 'CANCELLED' || code === 'EXECUTABLE_UNAVAILABLE'
    || code === 'ADVISOR_RECURSION' || code === 'REQUEST_DEPTH_INVALID'
    || code === 'INVOCATION_INVALID' || code === 'CWD_INVALID' || code === 'CWD_UNSAFE'
    || code === 'PROMPT_OVERSIZED' || code === 'OUTPUT_LIMIT' || code === 'LINE_LIMIT') {
    return error;
  }
  return null;
}

async function runProbe(context, argv) {
  assertContext(context);
  let execution;
  try {
    const invocation = makeInvocation(context, argv, '', PROBE_LIMITS);
    execution = await context.runner.run(invocation, {
      environment: context.environment || process.env,
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

function probeFailure(error, fallback) {
  const lifecycle = preserveLifecycleFailure(error);
  if (lifecycle) throw lifecycle;
  const code = errorCode(error);
  if (code === 'OUTPUT_LIMIT' || code === 'CWD_INVALID'
    || code === 'CWD_UNSAFE') throw error;
  fail(fallback);
}

function parseVersion(stdout) {
  const match = /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+)[ \t]*\r?\n?$/u.exec(stdout);
  if (!match || match[1] !== REVIEWED_VERSION) fail('CLI_VERSION_UNSUPPORTED');
  return match[1];
}

function parseAuth(stdout) {
  const status = stdout.trim();
  if (!/^Logged in using (?:ChatGPT|API key)$/u.test(status)) fail('AUTH_UNAVAILABLE');
  return true;
}

function requireHelpMarker(help, marker, code) {
  if (!help.includes(marker)) fail(code);
}

function validateHelp(help) {
  requireHelpMarker(help, '--model', 'MODEL_UNSUPPORTED');
  requireHelpMarker(help, '--config', 'EFFORT_UNSUPPORTED');
  requireHelpMarker(help, '--ephemeral', 'SESSION_UNSUPPORTED');
  for (const marker of ['--sandbox', 'read-only', '--skip-git-repo-check',
    '--ask-for-approval', 'never']) requireHelpMarker(help, marker, 'READ_ONLY_UNSUPPORTED');
  for (const marker of ['--json', 'JSONL', 'stdin', 'or if `-` is used']) {
    requireHelpMarker(help, marker, 'OUTPUT_UNSUPPORTED');
  }
}

function parseModelCatalog(stdout, route) {
  let document;
  try { document = parseJsonDocument(stdout); } catch { fail('OUTPUT_UNSUPPORTED'); }
  if (!isObject(document) || Object.keys(document).some((key) => key !== 'models')
    || !Array.isArray(document.models)) fail('OUTPUT_UNSUPPORTED');
  const model = document.models.find((entry) => isObject(entry) && entry.slug === route.model);
  if (!model) fail('MODEL_UNSUPPORTED');
  if (!Array.isArray(model.supported_reasoning_levels)) fail('EFFORT_UNSUPPORTED');
  const effort = model.supported_reasoning_levels.find((entry) =>
    isObject(entry) && entry.effort === route.effort
  );
  if (!effort) fail('EFFORT_UNSUPPORTED');
  return Object.freeze({ model: route.model, effort: route.effort });
}

async function probeVersion(context) {
  const state = contextState(context);
  let stdout;
  try { stdout = await runProbe(context, ['--version']); }
  catch (error) { probeFailure(error, 'CLI_VERSION_UNSUPPORTED'); }
  state.version = parseVersion(stdout);
  return true;
}

async function probeAuth(context) {
  const state = contextState(context);
  if (state.version !== REVIEWED_VERSION) fail('CLI_VERSION_UNSUPPORTED');
  let stdout;
  try { stdout = await runProbe(context, ['login', 'status']); }
  catch (error) { probeFailure(error, 'AUTH_UNAVAILABLE'); }
  state.authenticated = parseAuth(stdout);
  return true;
}

async function probeCapabilities(context) {
  const state = contextState(context);
  if (state.version !== REVIEWED_VERSION || state.authenticated !== true) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  const route = routeOf(context);
  let help;
  try { help = await runProbe(context, ['exec', '--help']); }
  catch (error) { probeFailure(error, 'OUTPUT_UNSUPPORTED'); }
  validateHelp(help);
  let catalog;
  try { catalog = await runProbe(context, ['debug', 'models', '--bundled']); }
  catch (error) { probeFailure(error, 'OUTPUT_UNSUPPORTED'); }
  const selected = parseModelCatalog(catalog, route);
  if (selected.model !== REVIEWED_MODEL) fail('MODEL_UNSUPPORTED');
  if (selected.effort !== REVIEWED_EFFORT) fail('EFFORT_UNSUPPORTED');
  state.capabilities = selected;
  state.route = Object.freeze({ model: route.model, effort: route.effort });
  return true;
}

function buildInvocation(context) {
  assertContext(context);
  const state = contextState(context);
  if (!state.capabilities || !state.route) fail('OUTPUT_UNSUPPORTED');
  const route = routeOf(context);
  if (route.model !== state.route.model) fail('MODEL_UNSUPPORTED');
  if (route.effort !== state.route.effort) fail('EFFORT_UNSUPPORTED');
  if (typeof context.brief !== 'string') fail('REQUEST_INVALID');
  const argv = [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox', 'read-only',
    '--ask-for-approval', 'never',
    '--model', route.model,
    '--config', EFFORT_CONFIG,
    '--json', '-'
  ];
  return makeInvocation(context, argv, context.brief, DEFAULT_LIMITS);
}

function validateItem(item, terminal = false) {
  if (!isObject(item) || typeof item.type !== 'string' || !ITEM_TYPES.has(item.type)) {
    fail('PROTOCOL_INVALID');
  }
  if (item.id !== undefined && typeof item.id !== 'string') fail('PROTOCOL_INVALID');
  if (terminal && Object.keys(item).some((key) => !['id', 'type', 'text'].includes(key))) {
    fail('PROTOCOL_INVALID');
  }
  return item;
}

function validateEventKeys(event, allowed, required) {
  const keys = Object.keys(event);
  if (keys.some((key) => !allowed.includes(key))
    || required.some((key) => !Object.prototype.hasOwnProperty.call(event, key))) {
    fail('PROTOCOL_INVALID');
  }
}

function parseJsonl(stdout) {
  if (!stdout || Buffer.byteLength(stdout, 'utf8') > MAX_RESULT_BYTES) fail('OUTPUT_LIMIT');
  const rawLines = stdout.split('\n');
  if (rawLines.at(-1) === '') rawLines.pop();
  if (rawLines.length === 0 || rawLines.length > 2048) fail('PROTOCOL_INVALID');
  let response;
  let turnCompleted = false;
  for (const rawLine of rawLines) {
    if (!rawLine) fail('PROTOCOL_INVALID');
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    let event;
    try { event = parseJsonDocument(line); } catch { fail('PROTOCOL_INVALID'); }
    if (!isObject(event) || !EVENT_TYPES.has(event.type)) fail('PROTOCOL_INVALID');
    if (turnCompleted) fail('PROTOCOL_INVALID');
    if (response !== undefined && event.type !== 'turn.completed') fail('PROTOCOL_INVALID');
    if (event.type === 'thread.started') {
      validateEventKeys(event, ['type', 'thread_id'], ['type', 'thread_id']);
      if (typeof event.thread_id !== 'string' || !event.thread_id) fail('PROTOCOL_INVALID');
    } else if (event.type === 'turn.started') {
      validateEventKeys(event, ['type', 'turn_id'], ['type']);
      if (event.turn_id !== undefined && typeof event.turn_id !== 'string') fail('PROTOCOL_INVALID');
    } else if (event.type === 'item.started') {
      validateEventKeys(event, ['type', 'item'], ['type', 'item']);
      validateItem(event.item);
    } else if (event.type === 'item.completed') {
      validateEventKeys(event, ['type', 'item'], ['type', 'item']);
      const item = validateItem(event.item, event.item?.type === 'agent_message');
      if (item.type === 'agent_message') {
        if (response !== undefined || typeof item.text !== 'string' || !item.text.trim()) {
          fail('PROTOCOL_INVALID');
        }
        if (Buffer.byteLength(item.text, 'utf8') > MAX_TEXT_BYTES) fail('OUTPUT_LIMIT');
        response = item.text;
      }
    } else if (event.type === 'turn.completed') {
      validateEventKeys(event, ['type', 'usage'], ['type']);
      if (event.usage !== undefined && !isObject(event.usage)) fail('PROTOCOL_INVALID');
      if (response === undefined) fail('PROTOCOL_INVALID');
      turnCompleted = true;
    }
  }
  if (response === undefined || !turnCompleted) fail('PROTOCOL_INVALID');
  return Object.freeze({ response });
}

function parseResult(context = {}) {
  const execution = context?.execution;
  const result = execution?.result && isObject(execution.result) ? execution.result : execution;
  if (!result || typeof result.stdout !== 'string') fail('PROTOCOL_INVALID');
  return parseJsonl(result.stdout);
}

function classifyFailure(failure) {
  const code = errorCode(failure);
  if (code && [
    'EXECUTABLE_UNAVAILABLE', 'CLI_VERSION_UNSUPPORTED', 'AUTH_UNAVAILABLE',
    'MODEL_UNSUPPORTED', 'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED',
    'SESSION_UNSUPPORTED', 'OUTPUT_UNSUPPORTED', 'PROTOCOL_INVALID', 'TIMEOUT',
    'CANCELLED', 'ADVISOR_RECURSION', 'REQUEST_DEPTH_INVALID', 'OUTPUT_LIMIT',
    'LINE_LIMIT', 'OUTPUT_INVALID', 'CWD_INVALID', 'CWD_UNSAFE', 'INVOCATION_INVALID'
  ].includes(code)) return code;
  return 'PROCESS_FAILED';
}

module.exports = freezeAdapter({
  name: 'codex',
  authKeys: Object.freeze([]),
  probeVersion,
  probeAuth,
  probeCapabilities,
  buildInvocation,
  parseResult,
  classifyFailure
});
