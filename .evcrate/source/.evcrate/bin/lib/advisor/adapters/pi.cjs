'use strict';

const { isAbsolute, win32: win32Path } = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { parseJsonDocument } = require('../json-document.cjs');
const { createRoutingError, isRoutingError } = require('../errors.cjs');
const { parseAdviceBody } = require('../checkpoint-contract.cjs');
const { DEFAULT_LIMITS, assertNoRecursion, createInvocation, isRunnerFailure } = require('../runner.cjs');
const { freezeAdapter, isPlainObject, resolveInvocationLimits, validateCapabilityAttestation } = require('../adapter-contract.cjs');

const EXECUTABLE = 'pi';
const MODEL_PATTERN = /^([^/\s]+)\/([^/\s]+)$/u;
const THINKING = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const PROBE_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, maxPromptBytes: 1,
  maxStdoutBytes: 5 * 1024 * 1024, maxResultBytes: 5 * 1024 * 1024, maxLines: 256, timeoutMs: 5_000 });
const STATES = new WeakMap();
const CODES = new Set(['EXECUTABLE_UNAVAILABLE', 'CLI_VERSION_UNSUPPORTED', 'AUTH_UNAVAILABLE', 'MODEL_UNSUPPORTED',
  'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED', 'SESSION_UNSUPPORTED', 'OUTPUT_UNSUPPORTED', 'PROTOCOL_INVALID',
  'TIMEOUT', 'CANCELLED', 'OUTPUT_LIMIT', 'LINE_LIMIT', 'OUTPUT_INVALID', 'ADVISOR_RECURSION',
  'REQUEST_DEPTH_INVALID', 'INVOCATION_INVALID', 'CWD_INVALID', 'CWD_UNSAFE', 'TRANSIENT_PROVIDER_ERROR',
  'PROCESS_FAILED']);
const NO_MODE = Object.freeze(['-p', '--mode', 'json', '--no-session', '--no-extensions', '--no-skills',
  '--no-prompt-templates', '--no-context-files', '--no-themes', '--no-approve', '--no-tools']);

function fail(code) { throw createRoutingError(code); }
function state(context) {
  if (!isPlainObject(context)) fail('INVOCATION_INVALID');
  let value = STATES.get(context);
  if (!value) { value = {}; STATES.set(context, value); }
  return value;
}
function target(context) {
  const route = context?.target;
  if (!isPlainObject(route) || typeof route.model !== 'string' || typeof route.effort !== 'string') fail('REQUEST_INVALID');
  const match = MODEL_PATTERN.exec(route.model);
  if (!match) fail('MODEL_UNSUPPORTED');
  if (!THINKING.has(route.effort)) fail('EFFORT_UNSUPPORTED');
  return Object.freeze({ provider: match[1], modelId: match[2], model: route.model, effort: route.effort });
}
function assertContext(context) {
  state(context);
  assertNoRecursion({ environment: context.environment || process.env, requestDepth: context.requestDepth || 0 });
  if (!context.runner || typeof context.runner.run !== 'function') fail('ADAPTER_CONTRACT_INVALID');
}
function invocation(context, argv, prompt = '', limits = DEFAULT_LIMITS) {
  assertContext(context);
  return (context.createInvocation || createInvocation)({ adapter: 'pi', executable: EXECUTABLE,
    argv: [...argv], cwd: context.cwd, workspaceRoot: context.workspaceRoot, prompt, authKeys: [], limits });
}
function codeOf(error) { return isRunnerFailure(error) ? error.error?.code : isRoutingError(error) ? error.code : error?.code; }
async function command(context, argv, limits = PROBE_LIMITS) {
  const value = await context.runner.run(invocation(context, argv, '', limits), {
    environment: context.environment, requestDepth: 0, signal: context.signal
  });
  if (value?.error) throw value.failure || value.error;
  const output = value?.result || value;
  if (!output || typeof output.stdout !== 'string') fail('OUTPUT_INVALID');
  return Object.freeze({ stdout: output.stdout, stderr: typeof output.stderr === 'string' ? output.stderr : '' });
}
function parseVersion(stdout) {
  const match = /^v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)\s*$/u.exec(stdout.trim());
  if (!match) fail('CLI_VERSION_UNSUPPORTED');
  return match[1];
}
async function probeVersion(context) {
  const value = parseVersion((await command(context, ['--version'])).stdout);
  state(context).version = value;
  return value;
}
function authCode(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  if (/(?:model|provider).{0,40}(?:unknown|invalid|unsupported|not[ _-]?found|unavailable)/iu.test(text)) return 'MODEL_UNSUPPORTED';
  return 'AUTH_UNAVAILABLE';
}
function modelAvailable(output, route) {
  return output.split(/\r?\n/u).some((line) => {
    const fields = line.trim().split(/\s+/u);
    return fields[0] === route.provider && fields[1] === route.modelId;
  });
}
async function probeAuth(context) {
  const current = state(context);
  const route = target(context);
  if (!current.version) fail('CLI_VERSION_UNSUPPORTED');
  let status;
  try { status = parseJsonDocument((await command(context, ['auth', 'check', '--provider', route.provider,
    '--model', route.modelId, '--json', '--no-refresh'])).stdout.trim()); }
  catch (error) { if (codeOf(error)) throw error; fail('AUTH_UNAVAILABLE'); }
  if (!isPlainObject(status) || Object.keys(status).some((key) => !['status', 'provider', 'model', 'reason', 'authType'].includes(key))
    || typeof status.status !== 'string' || typeof status.provider !== 'string'
    || (status.model !== undefined && (typeof status.model !== 'string' || status.model !== route.modelId))
    || (status.reason !== undefined && typeof status.reason !== 'string')
    || (status.authType !== undefined && (typeof status.authType !== 'string' || !status.authType))) fail('AUTH_UNAVAILABLE');
  if (status.provider !== route.provider) fail('MODEL_UNSUPPORTED');
  if (status.status !== 'ready') fail(authCode(status.reason || status.status));
  const attestation = Object.freeze({ authenticated: true });
  current.auth = attestation;
  current.route = route;
  return attestation;
}
function required(help, marker, failure) { if (!help.includes(marker)) fail(failure); }
async function probeCapabilities(context) {
  const current = state(context);
  const route = target(context);
  if (!current.version || !current.auth || current.route.model !== route.model) fail('MODEL_UNSUPPORTED');
  const help = (await command(context, ['--offline', '--help'])).stdout;
  for (const marker of ['-p', '--mode', 'json']) required(help, marker, 'OUTPUT_UNSUPPORTED');
  for (const marker of ['--provider', '--model', '--list-models', '--offline']) required(help, marker, 'MODEL_UNSUPPORTED');
  required(help, '--thinking', 'EFFORT_UNSUPPORTED');
  if (!help.includes(route.effort)) fail('EFFORT_UNSUPPORTED');
  for (const marker of ['--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates',
    '--no-context-files', '--no-themes']) required(help, marker, 'SESSION_UNSUPPORTED');
  for (const marker of ['--no-approve', '--no-tools']) required(help, marker, 'READ_ONLY_UNSUPPORTED');
  const models = await command(context, ['--offline', '--list-models', `${route.provider}/${route.modelId}`]);
  if (!modelAvailable(models.stdout, route)) fail('MODEL_UNSUPPORTED');
  current.capabilities = validateCapabilityAttestation({ model: route.model, effort: route.effort,
    noninteractive: true, session: 'isolated', tools: 'none', output: 'jsonl' });
  return current.capabilities;
}
function buildInvocation(context) {
  const current = state(context);
  const route = target(context);
  if (!current.capabilities) fail('OUTPUT_UNSUPPORTED');
  if (current.capabilities.model !== route.model) fail('MODEL_UNSUPPORTED');
  if (current.capabilities.effort !== route.effort) fail('EFFORT_UNSUPPORTED');
  if (typeof context.prompt !== 'string') fail('REQUEST_INVALID');
  const limits = resolveInvocationLimits(DEFAULT_LIMITS, context.limits);
  return invocation(context, [...NO_MODE, '--provider', route.provider, '--model', route.modelId,
    '--thinking', route.effort], context.prompt, limits);
}
const SESSION_KEYS = Object.freeze(['type', 'version', 'id', 'timestamp', 'cwd']);
const EVENT_KEYS = Object.freeze({
  agent_end: ['type', 'messages', 'willRetry'],
  agent_start: ['type'],
  agent_settled: ['type'],
  message_end: ['type', 'message'],
  message_start: ['type', 'message'],
  message_update: ['type', 'assistantMessageEvent', 'usage'],
  session: SESSION_KEYS,
  tool_execution_end: ['type', 'toolCallId', 'toolName', 'result', 'isError'],
  tool_execution_start: ['type', 'toolCallId', 'toolName', 'args'],
  tool_execution_update: ['type', 'toolCallId', 'toolName', 'args', 'partialResult'],
  turn_end: ['type', 'message', 'toolResults'],
  turn_start: ['type'],
});
const USER_MESSAGE_KEYS = Object.freeze(['role', 'content', 'timestamp']);
const ASSISTANT_MESSAGE_KEYS = Object.freeze([
  'role', 'content', 'api', 'provider', 'model', 'responseModel', 'responseId',
  'diagnostics', 'usage', 'stopReason', 'deferred', 'errorMessage', 'rawStopReason', 'timestamp'
]);
const TEXT_CONTENT_KEYS = Object.freeze(['type', 'text', 'textSignature']);
const THINKING_CONTENT_KEYS = Object.freeze(['type', 'thinking', 'thinkingSignature', 'redacted']);
const IMAGE_CONTENT_KEYS = Object.freeze(['type', 'data', 'mimeType']);
const TOOL_CALL_KEYS = Object.freeze(['type', 'id', 'name', 'arguments', 'thoughtSignature']);
const USAGE_KEYS = Object.freeze(['input', 'output', 'cacheRead', 'cacheWrite', 'cacheWrite1h',
  'reasoning', 'totalTokens', 'cost']);
const COST_KEYS = Object.freeze(['input', 'output', 'cacheRead', 'cacheWrite', 'total']);

function exactKeys(value, allowed, required = allowed) {
  if (!isPlainObject(value)) fail('PROTOCOL_INVALID');
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))
    || required.some((key) => !Object.hasOwn(value, key))) fail('PROTOCOL_INVALID');
}
function finiteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('PROTOCOL_INVALID');
}
function usageShape(value) {
  exactKeys(value, USAGE_KEYS, ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'cost']);
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'cacheWrite1h', 'reasoning', 'totalTokens']) {
    if (value[key] !== undefined) finiteNumber(value[key]);
  }
  exactKeys(value.cost, COST_KEYS);
  for (const key of COST_KEYS) finiteNumber(value.cost[key]);
  return value;
}
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('PROTOCOL_INVALID');
}
function contentPart(part, allowImages, allowTools) {
  if (!isPlainObject(part) || typeof part.type !== 'string') fail('PROTOCOL_INVALID');
  if (part.type === 'text') {
    exactKeys(part, TEXT_CONTENT_KEYS, ['type', 'text']);
    if (typeof part.text !== 'string') fail('PROTOCOL_INVALID');
    if (part.textSignature !== undefined && typeof part.textSignature !== 'string') fail('PROTOCOL_INVALID');
    return;
  }
  if (part.type === 'thinking') {
    exactKeys(part, THINKING_CONTENT_KEYS, ['type', 'thinking']);
    if (typeof part.thinking !== 'string') fail('PROTOCOL_INVALID');
    if (part.thinkingSignature !== undefined && typeof part.thinkingSignature !== 'string') fail('PROTOCOL_INVALID');
    if (part.redacted !== undefined && typeof part.redacted !== 'boolean') fail('PROTOCOL_INVALID');
    return;
  }
  if (part.type === 'image' && allowImages) {
    exactKeys(part, IMAGE_CONTENT_KEYS);
    if (typeof part.data !== 'string' || typeof part.mimeType !== 'string') fail('PROTOCOL_INVALID');
    return;
  }
  if (part.type === 'toolCall' && allowTools) {
    fail('READ_ONLY_UNSUPPORTED');
  }
  if (/tool/iu.test(part.type)) fail('READ_ONLY_UNSUPPORTED');
  fail('PROTOCOL_INVALID');
}
function messageShape(message) {
  if (!isPlainObject(message) || typeof message.role !== 'string') fail('PROTOCOL_INVALID');
  if (message.role === 'user') {
    exactKeys(message, USER_MESSAGE_KEYS);
    if (typeof message.content === 'string') {
      if (!message.content) fail('PROTOCOL_INVALID');
    } else if (Array.isArray(message.content)) {
      message.content.forEach((part) => contentPart(part, true, false));
    } else fail('PROTOCOL_INVALID');
    timestamp(message.timestamp);
    return message;
  }
  if (message.role !== 'assistant') fail('READ_ONLY_UNSUPPORTED');
  exactKeys(message, ASSISTANT_MESSAGE_KEYS, ['role', 'content', 'api', 'provider', 'model', 'usage', 'stopReason', 'timestamp']);
  if (!Array.isArray(message.content)) fail('PROTOCOL_INVALID');
  message.content.forEach((part) => contentPart(part, false, true));
  for (const key of ['api', 'provider', 'model']) {
    if (typeof message[key] !== 'string' || !message[key]) fail('PROTOCOL_INVALID');
  }
  if (!['pending', 'stop', 'length', 'toolUse', 'error', 'aborted', 'deferred'].includes(message.stopReason)) {
    fail('PROTOCOL_INVALID');
  }
  if (message.responseModel !== undefined && typeof message.responseModel !== 'string') fail('PROTOCOL_INVALID');
  if (message.responseId !== undefined && typeof message.responseId !== 'string') fail('PROTOCOL_INVALID');
  if (message.rawStopReason !== undefined && typeof message.rawStopReason !== 'string') fail('PROTOCOL_INVALID');
  if (message.diagnostics !== undefined || message.deferred !== undefined || message.errorMessage !== undefined) {
    fail('PROTOCOL_INVALID');
  }
  usageShape(message.usage);
  timestamp(message.timestamp);
  return message;
}
function sessionHeader(event, expectedCwd) {
  exactKeys(event, SESSION_KEYS);
  if (event.type !== 'session' || event.version !== 3 || typeof event.id !== 'string' || !event.id.trim()
    || typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp))) fail('PROTOCOL_INVALID');
  if (typeof expectedCwd !== 'string' || (!isAbsolute(expectedCwd) && !win32Path.isAbsolute(expectedCwd))) fail('CWD_INVALID');
  if (typeof event.cwd !== 'string' || (!isAbsolute(event.cwd) && !win32Path.isAbsolute(event.cwd))) fail('CWD_UNSAFE');
  if (event.cwd !== expectedCwd) fail('CWD_UNSAFE');
  return true;
}
function routeAttestation(message, route) {
  if (message.provider !== route.provider || message.model !== route.modelId) fail('MODEL_UNSUPPORTED');
  if (message.responseModel !== undefined
    && (typeof message.responseModel !== 'string' || message.responseModel !== route.modelId)) {
    fail('MODEL_UNSUPPORTED');
  }
}
function assistantText(message, route) {
  messageShape(message);
  if (message.role !== 'assistant') fail('PROTOCOL_INVALID');
  if (message.stopReason === 'toolUse') fail('READ_ONLY_UNSUPPORTED');
  if (message.stopReason === 'length') fail('OUTPUT_LIMIT');
  if (message.stopReason !== 'stop') fail('PROTOCOL_INVALID');
  routeAttestation(message, route);
  let text = '';
  for (const part of message.content) {
    if (part.type === 'text') text += part.text;
    else if (part.type === 'thinking') continue;
    else if (/tool/iu.test(part.type)) fail('READ_ONLY_UNSUPPORTED');
    else fail('PROTOCOL_INVALID');
  }
  if (!text.trim()) fail('PROTOCOL_INVALID');
  if (Buffer.byteLength(text, 'utf8') > 16 * 1024) fail('OUTPUT_LIMIT');
  return text;
}
function updateShape(event) {
  exactKeys(event, EVENT_KEYS.message_update, ['type', 'assistantMessageEvent']);
  if (event.usage !== undefined) usageShape(event.usage);
  const update = event.assistantMessageEvent;
  if (!isPlainObject(update) || typeof update.type !== 'string') fail('PROTOCOL_INVALID');
  const allowed = {
    text_start: ['type', 'contentIndex'],
    text_delta: ['type', 'contentIndex', 'delta'],
    text_end: ['type', 'contentIndex', 'content'],
    thinking_start: ['type', 'contentIndex'],
    thinking_delta: ['type', 'contentIndex', 'delta'],
    thinking_end: ['type', 'contentIndex', 'content'],
  }[update.type];
  if (!allowed) fail(/tool/iu.test(update.type) ? 'READ_ONLY_UNSUPPORTED' : 'PROTOCOL_INVALID');
  exactKeys(update, allowed);
  if (!Number.isSafeInteger(update.contentIndex) || update.contentIndex < 0) fail('PROTOCOL_INVALID');
  if (update.type.endsWith('_delta') && typeof update.delta !== 'string') fail('PROTOCOL_INVALID');
  if (update.type.endsWith('_end') && typeof update.content !== 'string') fail('PROTOCOL_INVALID');
}
function parseJsonl(text, route, expectedCwd) {
  if (typeof text !== 'string' || !text || Buffer.byteLength(text, 'utf8') > 32 * 1024) fail('OUTPUT_LIMIT');
  const lines = text.split(/\r?\n/u); if (lines.at(-1) === '') lines.pop();
  if (!lines.length || lines.length > 2048 || lines.some((line) => !line)) fail('PROTOCOL_INVALID');
  let phase = 0; let open; let answer; let finalAssistant; const messages = [];
  for (const line of lines) {
    let event; try { event = parseJsonDocument(line); } catch { fail('PROTOCOL_INVALID'); }
    if (!isPlainObject(event) || typeof event.type !== 'string') fail('PROTOCOL_INVALID');
    switch (event.type) {
      case 'session':
        if (phase || !sessionHeader(event, expectedCwd)) fail('PROTOCOL_INVALID'); phase = 1; break;
      case 'agent_start':
        exactKeys(event, EVENT_KEYS.agent_start);
        if (phase !== 1) fail('PROTOCOL_INVALID'); phase = 2; break;
      case 'turn_start':
        exactKeys(event, EVENT_KEYS.turn_start);
        if (phase !== 2) fail('PROTOCOL_INVALID'); phase = 3; break;
      case 'message_start': {
        exactKeys(event, EVENT_KEYS.message_start);
        if (phase !== 3 || open || messages.length >= 2) fail('PROTOCOL_INVALID');
        const message = messageShape(event.message);
        if ((messages.length === 0 && message.role !== 'user') || (messages.length === 1 && message.role !== 'assistant')) {
          fail('PROTOCOL_INVALID');
        }
        open = message;
        break;
      }
      case 'message_update':
        if (phase !== 3 || !open || open.role !== 'assistant') fail('PROTOCOL_INVALID');
        updateShape(event);
        break;
      case 'message_end': {
        exactKeys(event, EVENT_KEYS.message_end);
        if (phase !== 3 || !open) fail('PROTOCOL_INVALID');
        if (!isPlainObject(event.message) || event.message.role !== open.role) fail('PROTOCOL_INVALID');
        const message = messageShape(event.message);
        if (message.role === 'user' && !isDeepStrictEqual(message, open)) fail('PROTOCOL_INVALID');
        messages.push(message);
        if (message.role === 'assistant') {
          if (answer) fail('PROTOCOL_INVALID');
          answer = assistantText(message, route);
          finalAssistant = message;
        }
        open = undefined;
        break;
      }
      case 'tool_execution_start':
      case 'tool_execution_update':
      case 'tool_execution_end':
        exactKeys(event, EVENT_KEYS[event.type]);
        fail('READ_ONLY_UNSUPPORTED');
        break;
      case 'turn_end':
        exactKeys(event, EVENT_KEYS.turn_end);
        if (phase !== 3 || open || messages.length !== 2 || !answer || !Array.isArray(event.toolResults)
          || event.toolResults.length || !isDeepStrictEqual(event.message, finalAssistant)) {
          fail(event.toolResults?.length ? 'READ_ONLY_UNSUPPORTED' : 'PROTOCOL_INVALID');
        }
        messageShape(event.message);
        if (assistantText(event.message, route) !== answer) fail('PROTOCOL_INVALID');
        phase = 4;
        break;
      case 'agent_end':
        exactKeys(event, EVENT_KEYS.agent_end);
        if (phase !== 4 || event.willRetry !== false || !Array.isArray(event.messages)
          || event.messages.length !== 2) fail('PROTOCOL_INVALID');
        for (const [index, message] of event.messages.entries()) {
          messageShape(message);
          if (!isDeepStrictEqual(messages[index], message)) fail('PROTOCOL_INVALID');
        }
        if (!finalAssistant) fail('PROTOCOL_INVALID');
        phase = 5;
        break;
      case 'agent_settled':
        exactKeys(event, EVENT_KEYS.agent_settled);
        if (phase !== 5) fail('PROTOCOL_INVALID');
        phase = 6;
        break;
      default:
        fail('PROTOCOL_INVALID');
    }
  }
  if (phase !== 6 || !answer) fail('PROTOCOL_INVALID');
  return Object.freeze({ recommendation: answer });
}
function parseResult(context = {}) {
  const output = context.execution?.result || context.execution;
  if (!output || typeof output.stdout !== 'string') fail('PROTOCOL_INVALID');
  const result = parseJsonl(output.stdout, target(context), context.cwd);
  if (context.checkpoint?.version === 2) {
    return parseAdviceBody(result.recommendation);
  }
  return result;
}
function classifyFailure(error) { const code = codeOf(error); return CODES.has(code) ? code : 'PROCESS_FAILED'; }

module.exports = freezeAdapter({ name: 'pi', authKeys: [], probeVersion, probeAuth,
  probeCapabilities, buildInvocation, parseResult, classifyFailure });
