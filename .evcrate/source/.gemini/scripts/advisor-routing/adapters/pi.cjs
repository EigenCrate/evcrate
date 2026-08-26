'use strict';

const { isAbsolute, win32: win32Path } = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { parseJsonDocument } = require('../json-document.cjs');
const { createRoutingError, isRoutingError } = require('../errors.cjs');
const {
  DEFAULT_LIMITS,
  assertNoRecursion,
  createInvocation,
  isRunnerFailure
} = require('../runner.cjs');
const { freezeAdapter } = require('../adapter-contract.cjs');

const EXECUTABLE = 'pi';
const REVIEWED_VERSION = '0.84.1';
const THINKING_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const MODEL_PATTERN = /^([^/\s]+)\/([^/\s]+)$/u;
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
const PRESERVED_FAILURES = new Set([
  'EXECUTABLE_UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'ADVISOR_RECURSION',
  'REQUEST_DEPTH_INVALID', 'INVOCATION_INVALID', 'CWD_INVALID', 'CWD_UNSAFE',
  'PROMPT_OVERSIZED', 'OUTPUT_LIMIT', 'LINE_LIMIT', 'OUTPUT_INVALID'
]);
const STATES = new WeakMap();

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
    environment: context.environment || process['env'],
    requestDepth: context.requestDepth === undefined ? 0 : context.requestDepth
  });
  if (!context.runner || typeof context.runner.run !== 'function') {
    fail('ADAPTER_CONTRACT_INVALID');
  }
}

function routeFor(context) {
  const route = context?.descriptor?.route;
  if (!isObject(route) || typeof route.model !== 'string') fail('MODEL_UNSUPPORTED');
  const model = MODEL_PATTERN.exec(route.model);
  if (!model) fail('MODEL_UNSUPPORTED');
  if (typeof route.effort !== 'string' || !THINKING_LEVELS.includes(route.effort)) {
    fail('EFFORT_UNSUPPORTED');
  }
  return Object.freeze({
    ...route,
    provider: model[1],
    modelId: model[2]
  });
}

function invocationFactory(context) {
  return typeof context.createInvocation === 'function' ? context.createInvocation : createInvocation;
}

function makeInvocation(context, argv, prompt = '', limits = DEFAULT_LIMITS) {
  const cwd = context.cwd || context.workspaceRoot || process.cwd();
  const workspaceRoot = context.workspaceRoot || cwd;
  return invocationFactory(context)({
    adapter: 'pi',
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
  try {
    return await runProbe(context, argv);
  } catch (error) {
    const lifecycle = preserveLifecycleFailure(error);
    if (lifecycle) throw lifecycle;
    fail(fallback);
  }
}

function parseVersion(stdout) {
  const match = /^v?([0-9]+\.[0-9]+\.[0-9]+)\s*$/u.exec(stdout.trim());
  if (!match || match[1] !== REVIEWED_VERSION) fail('CLI_VERSION_UNSUPPORTED');
  return match[1];
}

function routeAuthFailure(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  if (/(?:model|provider).{0,40}(?:unknown|invalid|unsupported|not[ _-]?found|unavailable)/iu.test(text)) {
    return 'MODEL_UNSUPPORTED';
  }
  return 'AUTH_UNAVAILABLE';
}

function parseAuthStatus(stdout, route) {
  let status;
  try { status = parseJsonDocument(stdout.trim()); }
  catch { fail('AUTH_UNAVAILABLE'); }
  if (!isObject(status) || typeof status.status !== 'string' || typeof status.provider !== 'string') {
    fail('AUTH_UNAVAILABLE');
  }
  if (Object.prototype.hasOwnProperty.call(status, 'credentials')) fail('AUTH_UNAVAILABLE');
  if (status.provider !== route.provider) fail('MODEL_UNSUPPORTED');
  if (status.status !== 'ready') fail(routeAuthFailure(status.reason || status.status));
  if (typeof status.model !== 'string' || status.model !== route.modelId) fail('MODEL_UNSUPPORTED');
  return true;
}

function requireHelpMarker(help, marker, code) {
  if (!help.includes(marker)) fail(code);
}

function requireThinkingMarker(help, level) {
  const escaped = level.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  if (!new RegExp(`(?:^|[^A-Za-z])${escaped}(?:$|[^A-Za-z])`, 'u').test(help)) {
    fail('EFFORT_UNSUPPORTED');
  }
}

async function probeVersion(context) {
  const state = contextState(context);
  let stdout;
  try { stdout = await probeOutput(context, ['--version'], 'CLI_VERSION_UNSUPPORTED'); }
  catch (error) { throw error; }
  state.version = parseVersion(stdout);
  return true;
}

async function probeAuth(context) {
  const state = contextState(context);
  if (state.version !== REVIEWED_VERSION) fail('CLI_VERSION_UNSUPPORTED');
  const route = routeFor(context);
  let stdout;
  try {
    stdout = await runProbe(context, [
      'auth', 'check', '--provider', route.provider, '--model', route.modelId,
      '--json', '--no-refresh'
    ]);
  } catch (error) {
    const lifecycle = preserveLifecycleFailure(error);
    if (lifecycle) throw lifecycle;
    const diagnostic = errorCode(error);
    if (diagnostic === 'PROCESS_FAILED' && isRunnerFailure(error)) {
      const text = `${error.diagnostics?.stderr || ''}\n${error.diagnostics?.stdout || ''}`;
      fail(routeAuthFailure(text));
    }
    fail('AUTH_UNAVAILABLE');
  }
  state.authenticated = parseAuthStatus(stdout, route);
  state.route = route;
  return true;
}

async function probeCapabilities(context) {
  const state = contextState(context);
  if (state.version !== REVIEWED_VERSION || state.authenticated !== true) {
    fail('CLI_VERSION_UNSUPPORTED');
  }
  const route = routeFor(context);
  if (state.route?.provider !== route.provider || state.route?.modelId !== route.modelId) {
    fail('MODEL_UNSUPPORTED');
  }
  const help = await probeOutput(context, ['--help'], 'OUTPUT_UNSUPPORTED');
  requireHelpMarker(help, '-p', 'OUTPUT_UNSUPPORTED');
  requireHelpMarker(help, '--mode', 'OUTPUT_UNSUPPORTED');
  requireHelpMarker(help, 'json', 'OUTPUT_UNSUPPORTED');
  requireHelpMarker(help, '--provider', 'MODEL_UNSUPPORTED');
  requireHelpMarker(help, '--model', 'MODEL_UNSUPPORTED');
  requireHelpMarker(help, '--thinking', 'EFFORT_UNSUPPORTED');
  requireThinkingMarker(help, route.effort);
  requireHelpMarker(help, '--no-session', 'SESSION_UNSUPPORTED');
  requireHelpMarker(help, '--no-extensions', 'SESSION_UNSUPPORTED');
  requireHelpMarker(help, '--no-tools', 'READ_ONLY_UNSUPPORTED');
  state.capabilities = Object.freeze({
    provider: route.provider,
    model: route.model,
    thinking: route.effort,
    session: 'no-session',
    extensions: 'no-extensions',
    tools: 'no-tools'
  });
  return true;
}

function buildInvocation(context) {
  assertContext(context);
  const state = contextState(context);
  const route = routeFor(context);
  if (!state.capabilities) fail('OUTPUT_UNSUPPORTED');
  if (state.capabilities.provider !== route.provider || state.capabilities.model !== route.model) {
    fail('MODEL_UNSUPPORTED');
  }
  if (state.capabilities.thinking !== route.effort) fail('EFFORT_UNSUPPORTED');
  if (typeof context.brief !== 'string') fail('REQUEST_INVALID');
  return makeInvocation(context, [
    '-p', '--mode', 'json', '--no-session', '--no-extensions', '--no-tools',
    '--provider', route.provider, '--model', route.modelId,
    '--thinking', route.effort
  ], context.brief);
}

function authFailure(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return /(?:authentication|credential|login|not logged|unauthorized|token|api[ -]?key)/iu.test(text);
}

function failureCodeFromText(value, fallback = 'PROTOCOL_INVALID') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  if (authFailure(text)) return 'AUTH_UNAVAILABLE';
  if (/(?:cancel|cancell|interrupt|abort|stopp)/iu.test(text)) return 'CANCELLED';
  if (/(?:invalid|unknown|unsupported|unrecognized).{0,40}(?:model|provider)|(?:model|provider).{0,40}(?:invalid|unknown|unsupported|unrecognized|unavailable|not found)/iu.test(text)) {
    return 'MODEL_UNSUPPORTED';
  }
  if (/(?:invalid|unknown|unsupported|unrecognized).{0,40}(?:thinking|effort)|(?:thinking|effort).{0,40}(?:invalid|unknown|unsupported|unrecognized|unavailable|not found)/iu.test(text)) {
    return 'EFFORT_UNSUPPORTED';
  }
  if (/(?:read[- ]only|no[- ]tools|tool.{0,20}(?:disabled|unsupported)|permission.{0,20}(?:denied|unsupported)|write.{0,20}(?:denied|blocked))/iu.test(text)) {
    return 'READ_ONLY_UNSUPPORTED';
  }
  if (/(?:session|extension).{0,30}(?:disabled|unsupported|required|persist)/iu.test(text)) {
    return 'SESSION_UNSUPPORTED';
  }
  if (/(?:json|jsonl|event|output|protocol).{0,30}(?:invalid|unsupported|malformed|missing)/iu.test(text)) {
    return 'OUTPUT_UNSUPPORTED';
  }
  return fallback;
}

function diagnosticFailureCode(error) {
  if (!isRunnerFailure(error)) return null;
  const diagnostics = error.diagnostics || {};
  return failureCodeFromText(`${diagnostics.stderr || ''}\n${diagnostics.stdout || ''}`, null);
}

function assertRouteAttestation(message, route) {
  if (message.provider !== route.provider || message.model !== route.modelId) {
    fail('MODEL_UNSUPPORTED');
  }
  // Pi's JSON print schema exposes provider/model on AssistantMessage, while
  // the exact effort is enforced by the fixed --thinking argv. If a future
  // version emits thinkingLevel, reject any mismatch without inventing a
  // required field absent from the reviewed schema.
  if (message.thinkingLevel !== undefined && message.thinkingLevel !== route.effort) {
    fail('EFFORT_UNSUPPORTED');
  }
}

function textFromAssistantMessage(message, route) {
  if (!isObject(message) || message.role !== 'assistant' || !Array.isArray(message.content)) {
    fail('PROTOCOL_INVALID');
  }
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    fail(failureCodeFromText(message.errorMessage || message.stopReason, 'PROTOCOL_INVALID'));
  }
  assertRouteAttestation(message, route);
  const parts = [];
  for (const content of message.content) {
    if (!isObject(content) || typeof content.type !== 'string') fail('PROTOCOL_INVALID');
    if (content.type === 'text') {
      if (typeof content.text !== 'string') fail('PROTOCOL_INVALID');
      parts.push(content.text);
    } else if (content.type === 'thinking') {
      if (typeof content.thinking !== 'string') fail('PROTOCOL_INVALID');
    } else if (/tool/iu.test(content.type)) {
      fail('READ_ONLY_UNSUPPORTED');
    } else {
      fail('PROTOCOL_INVALID');
    }
  }
  const response = parts.join('');
  if (!response.trim()) fail('PROTOCOL_INVALID');
  if (Buffer.byteLength(response, 'utf8') > MAX_TEXT_BYTES) fail('OUTPUT_LIMIT');
  return response;
}

function assertMessageUpdate(event) {
  if (!isObject(event.assistantMessageEvent)) fail('PROTOCOL_INVALID');
  const update = event.assistantMessageEvent;
  if (typeof update.type !== 'string') fail('PROTOCOL_INVALID');
  if (/toolcall|tool_use/iu.test(update.type)) fail('READ_ONLY_UNSUPPORTED');
  if (!['text_start', 'text_delta', 'text_end', 'thinking_start', 'thinking_delta', 'thinking_end'].includes(update.type)) {
    fail('PROTOCOL_INVALID');
  }
  if (update.type.endsWith('_delta') && typeof update.delta !== 'string') fail('PROTOCOL_INVALID');
}

function messageIdentifier(message) {
  if (!isObject(message) || typeof message.id !== 'string' || !message.id.trim()) {
    fail('PROTOCOL_INVALID');
  }
  return message.id;
}

function validSessionHeader(event) {
  if (event.version !== 3 || typeof event.id !== 'string' || !event.id.trim()
    || typeof event.timestamp !== 'string' || !event.timestamp.trim()
    || !Number.isFinite(Date.parse(event.timestamp))
    || typeof event.cwd !== 'string' || !event.cwd.trim()
    || !(isAbsolute(event.cwd) || win32Path.isAbsolute(event.cwd))) return false;
  return true;
}

function parseJsonl(stdout, route) {
  const lines = stdout.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length || lines.length > 2048 || lines.some((line) => !line)) fail('PROTOCOL_INVALID');
  let session = false;
  let agentStarted = false;
  let turnStarted = false;
  let turnEnded = false;
  let agentEnded = false;
  let assistantResponse;
  let assistantMessageId;
  let assistantMessages = 0;
  const messageStates = new Map();
  let openMessageId;
  for (const line of lines) {
    let event;
    try { event = parseJsonDocument(line); }
    catch { fail('PROTOCOL_INVALID'); }
    if (!isObject(event) || typeof event.type !== 'string' || agentEnded) fail('PROTOCOL_INVALID');
    if (event.type === 'session') {
      if (session || agentStarted || !validSessionHeader(event)) fail('PROTOCOL_INVALID');
      session = true;
    } else if (event.type === 'agent_start') {
      if (!session || agentStarted) fail('PROTOCOL_INVALID');
      agentStarted = true;
    } else if (event.type === 'turn_start') {
      if (!agentStarted || turnStarted || turnEnded) fail('PROTOCOL_INVALID');
      turnStarted = true;
    } else if (event.type === 'message_start') {
      if (!turnStarted || turnEnded || !isObject(event.message)) fail('PROTOCOL_INVALID');
      const id = messageIdentifier(event.message);
      if (typeof event.message.role !== 'string' || messageStates.has(id)) fail('PROTOCOL_INVALID');
      if (openMessageId !== undefined) fail('PROTOCOL_INVALID');
      messageStates.set(id, { role: event.message.role, ended: false });
      openMessageId = id;
    } else if (event.type === 'message_update') {
      if (!turnStarted || turnEnded || openMessageId === undefined) fail('PROTOCOL_INVALID');
      const state = messageStates.get(openMessageId);
      if (!state || state.ended || state.role !== 'assistant') fail('PROTOCOL_INVALID');
      assertMessageUpdate(event);
    } else if (event.type === 'message_end') {
      if (!turnStarted || turnEnded || !isObject(event.message)) fail('PROTOCOL_INVALID');
      const id = messageIdentifier(event.message);
      const state = messageStates.get(id);
      if (!state || state.ended || openMessageId !== id) fail('PROTOCOL_INVALID');
      if (event.message.role !== state.role) fail('PROTOCOL_INVALID');
      state.ended = true;
      state.message = event.message;
      openMessageId = undefined;
      if (event.message.role === 'assistant') {
        assistantMessages += 1;
        if (assistantMessages > 1) fail('PROTOCOL_INVALID');
        assistantMessageId = id;
        assistantResponse = textFromAssistantMessage(event.message, route);
      }
    } else if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update'
      || event.type === 'tool_execution_end') {
      fail('READ_ONLY_UNSUPPORTED');
    } else if (event.type === 'turn_end') {
      if (!turnStarted || turnEnded || openMessageId !== undefined
        || [...messageStates.values()].some((state) => !state.ended)
        || !assistantResponse || !Array.isArray(event.toolResults) || !isObject(event.message)) fail('PROTOCOL_INVALID');
      const turnMessageId = messageIdentifier(event.message);
      const turnMessageState = messageStates.get(turnMessageId);
      if (turnMessageId !== assistantMessageId || !turnMessageState
        || turnMessageState.role !== 'assistant' || !turnMessageState.ended
        || textFromAssistantMessage(event.message, route) !== assistantResponse) fail('PROTOCOL_INVALID');
      if (event.toolResults.length) fail('READ_ONLY_UNSUPPORTED');
      turnEnded = true;
    } else if (event.type === 'agent_end') {
      if (!turnEnded || !assistantResponse || !Array.isArray(event.messages)) fail('PROTOCOL_INVALID');
      const agentMessageIds = new Set();
      for (const message of event.messages) {
        const id = messageIdentifier(message);
        if (agentMessageIds.has(id)) fail('PROTOCOL_INVALID');
        const state = messageStates.get(id);
        if (message?.role === 'assistant') textFromAssistantMessage(message, route);
        if (!state || !state.ended || state.role !== message.role
          || !state.message || !isDeepStrictEqual(state.message, message)) fail('PROTOCOL_INVALID');
        agentMessageIds.add(id);
      }
      if (agentMessageIds.size !== messageStates.size) fail('PROTOCOL_INVALID');
      const finalAssistant = event.messages.filter((message) => message?.role === 'assistant').at(-1);
      const finalId = finalAssistant ? messageIdentifier(finalAssistant) : null;
      const finalState = finalId ? messageStates.get(finalId) : null;
      if (!finalAssistant || !finalState || finalState.role !== 'assistant' || !finalState.ended
        || textFromAssistantMessage(finalAssistant, route) !== assistantResponse) fail('PROTOCOL_INVALID');
      agentEnded = true;
    } else {
      fail('PROTOCOL_INVALID');
    }
  }
  if (!session || !agentStarted || !turnStarted || !turnEnded || !agentEnded || !assistantResponse) {
    fail('PROTOCOL_INVALID');
  }
  return Object.freeze({ response: assistantResponse });
}

function parseResult(context = {}) {
  const execution = context.execution;
  const result = execution?.result && isObject(execution.result) ? execution.result : execution;
  if (!result || typeof result.stdout !== 'string') fail('PROTOCOL_INVALID');
  const maxResultBytes = Math.min(
    context.limits?.maxResultBytes || DEFAULT_LIMITS.maxResultBytes,
    MAX_RESULT_BYTES
  );
  if (Buffer.byteLength(result.stdout, 'utf8') > maxResultBytes) fail('OUTPUT_LIMIT');
  if (!result.stdout.trim()) fail('PROTOCOL_INVALID');
  return parseJsonl(result.stdout, routeFor(context));
}

function classifyFailure(failure) {
  const code = errorCode(failure);
  if (code === 'PROCESS_FAILED') {
    const diagnostic = diagnosticFailureCode(failure);
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
  name: 'pi',
  authKeys: [],
  probeVersion,
  probeAuth,
  probeCapabilities,
  buildInvocation,
  parseResult,
  classifyFailure
});
