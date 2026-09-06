'use strict';

const { isAbsolute, win32: win32Path } = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { parseJsonDocument } = require('../json-document.cjs');
const { createRoutingError } = require('../errors.cjs');
const { isPlainObject } = require('../adapter-contract.cjs');

function fail(code) { throw createRoutingError(code); }
const MODEL_PATTERN = /^([^/\s]+)\/([^/\s]+)$/u;
function target(context) {
  const value = context?.target;
  const match = value && typeof value.model === 'string' ? MODEL_PATTERN.exec(value.model) : null;
  if (!match) fail('MODEL_UNSUPPORTED');
  return { provider: match[1], modelId: match[2] };
}

const SESSION_KEYS = Object.freeze(['type', 'version', 'id', 'timestamp', 'cwd']);
const EVENT_KEYS = Object.freeze({
  agent_end: ['type', 'messages', 'isTerminal'], agent_start: ['type'], message_end: ['type', 'message'],
  message_start: ['type', 'message'], message_update: ['type', 'assistantMessageEvent'], session: SESSION_KEYS,
  turn_end: ['type', 'message', 'toolResults'], turn_start: ['type'],
});
const USER_MESSAGE_KEYS = Object.freeze(['role', 'content', 'attribution', 'timestamp']);
const ASSISTANT_MESSAGE_KEYS = Object.freeze(['role', 'content', 'api', 'provider', 'model', 'responseModel',
  'responseId', 'usage', 'stopReason', 'rawStopReason', 'timestamp', 'duration', 'ttft', 'completedAt']);
const TEXT_CONTENT_KEYS = Object.freeze(['type', 'text', 'textSignature']);
const THINKING_CONTENT_KEYS = Object.freeze(['type', 'thinking', 'thinkingSignature', 'redacted']);
const USAGE_KEYS = Object.freeze(['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'reasoningTokens', 'totalTokens', 'cost']);
const COST_KEYS = Object.freeze(['input', 'output', 'cacheRead', 'cacheWrite', 'total']);
function exactKeys(value, allowed, required = allowed) {
  if (!isPlainObject(value)) fail('PROTOCOL_INVALID');
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) fail('PROTOCOL_INVALID');
}
function finite(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('PROTOCOL_INVALID'); }
function timestamp(value) { if (!Number.isSafeInteger(value) || value < 0) fail('PROTOCOL_INVALID'); }
function contentPart(part) {
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
  if (/tool/iu.test(part.type)) fail('READ_ONLY_UNSUPPORTED');
  fail('PROTOCOL_INVALID');
}
function usageShape(value) {
  exactKeys(value, USAGE_KEYS, ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'cost']);
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'reasoningTokens', 'totalTokens']) {
    if (value[key] !== undefined) finite(value[key]);
  }
  exactKeys(value.cost, COST_KEYS);
  for (const key of COST_KEYS) finite(value.cost[key]);
}
function messageShape(message, route) {
  if (!isPlainObject(message) || typeof message.role !== 'string') fail('PROTOCOL_INVALID');
  if (message.role === 'user') {
    exactKeys(message, USER_MESSAGE_KEYS, ['role', 'content', 'timestamp']);
    if (typeof message.content === 'string') {
      if (!message.content) fail('PROTOCOL_INVALID');
    } else if (Array.isArray(message.content)) {
      message.content.forEach(contentPart);
    } else fail('PROTOCOL_INVALID');
    if (message.attribution !== undefined && (typeof message.attribution !== 'string' || !message.attribution)) {
      fail('PROTOCOL_INVALID');
    }
    timestamp(message.timestamp);
    return message;
  }
  if (message.role !== 'assistant') fail('READ_ONLY_UNSUPPORTED');
  exactKeys(message, ASSISTANT_MESSAGE_KEYS, ['role', 'content', 'api', 'provider', 'model', 'usage', 'stopReason', 'timestamp']);
  if (!Array.isArray(message.content)) fail('PROTOCOL_INVALID');
  message.content.forEach(contentPart);
  for (const key of ['api', 'provider', 'model']) {
    if (typeof message[key] !== 'string' || !message[key]) fail('PROTOCOL_INVALID');
  }
  if (message.provider !== route.provider || message.model !== route.modelId) fail('MODEL_UNSUPPORTED');
  if (!['pending', 'stop', 'length', 'error', 'aborted', 'deferred'].includes(message.stopReason)) fail('PROTOCOL_INVALID');
  if (message.responseModel !== undefined
    && (typeof message.responseModel !== 'string' || message.responseModel !== message.model)) fail('MODEL_UNSUPPORTED');
  if (message.responseId !== undefined && typeof message.responseId !== 'string') fail('PROTOCOL_INVALID');
  if (message.rawStopReason !== undefined && typeof message.rawStopReason !== 'string') fail('PROTOCOL_INVALID');
  for (const key of ['duration', 'ttft', 'completedAt']) {
    if (message[key] !== undefined) finite(message[key]);
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
}
function assistantText(message) {
  if (message.stopReason !== 'stop') fail('PROTOCOL_INVALID');
  let text = '';
  for (const part of message.content) {
    if (part.type === 'text') text += part.text;
    else if (part.type !== 'thinking') fail(/tool/iu.test(part.type) ? 'READ_ONLY_UNSUPPORTED' : 'PROTOCOL_INVALID');
  }
  if (!text.trim()) fail('PROTOCOL_INVALID');
  if (Buffer.byteLength(text, 'utf8') > 16 * 1024) fail('OUTPUT_LIMIT');
  return text;
}
function assistantEquivalent(left, right) {
  return left.role === right.role && left.content.length === right.content.length
    && isDeepStrictEqual(left.content, right.content) && left.provider === right.provider
    && left.model === right.model && left.stopReason === right.stopReason;
}
function updateShape(event) {
  exactKeys(event, EVENT_KEYS.message_update);
  const update = event.assistantMessageEvent;
  if (!isPlainObject(update) || typeof update.type !== 'string') fail('PROTOCOL_INVALID');
  const allowed = {
    text_start: ['type', 'contentIndex'], text_delta: ['type', 'contentIndex', 'delta'],
    text_end: ['type', 'contentIndex', 'content'], thinking_start: ['type', 'contentIndex'],
    thinking_delta: ['type', 'contentIndex', 'delta'], thinking_end: ['type', 'contentIndex', 'content'],
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
        if (phase || sessionHeader(event, expectedCwd)) fail('PROTOCOL_INVALID'); phase = 1; break;
      case 'agent_start':
        exactKeys(event, EVENT_KEYS.agent_start); if (phase !== 1) fail('PROTOCOL_INVALID'); phase = 2; break;
      case 'turn_start':
        exactKeys(event, EVENT_KEYS.turn_start); if (phase !== 2) fail('PROTOCOL_INVALID'); phase = 3; break;
      case 'message_start': {
        exactKeys(event, EVENT_KEYS.message_start);
        if (phase !== 3 || open || messages.length >= 2) fail('PROTOCOL_INVALID');
        const message = messageShape(event.message, route);
        if ((messages.length === 0 && message.role !== 'user') || (messages.length === 1 && message.role !== 'assistant')) fail('PROTOCOL_INVALID');
        open = message; break;
      }
      case 'message_update':
        if (phase !== 3 || !open || open.role !== 'assistant') fail('PROTOCOL_INVALID');
        updateShape(event); break;
      case 'message_end': {
        exactKeys(event, EVENT_KEYS.message_end);
        if (phase !== 3 || !open) fail('PROTOCOL_INVALID');
        const message = messageShape(event.message, route);
        if (message.role !== open.role) fail('PROTOCOL_INVALID');
        if (message.role === 'user' && !isDeepStrictEqual(message, open)) fail('PROTOCOL_INVALID');
        messages.push(message);
        if (message.role === 'assistant') { answer = assistantText(message); finalAssistant = message; }
        open = undefined; break;
      }
      case 'turn_end':
        exactKeys(event, EVENT_KEYS.turn_end);
        if (phase !== 3 || open || messages.length !== 2 || !answer || !Array.isArray(event.toolResults)
          || event.toolResults.length || !isPlainObject(event.message)) {
          fail(event.toolResults?.length ? 'READ_ONLY_UNSUPPORTED' : 'PROTOCOL_INVALID');
        }
        const turnMessage = messageShape(event.message, route);
        if (turnMessage.role !== 'assistant' || !assistantEquivalent(turnMessage, finalAssistant)
          || assistantText(turnMessage) !== answer) fail('PROTOCOL_INVALID');
        phase = 4; break;
      case 'agent_end':
        exactKeys(event, EVENT_KEYS.agent_end, ['type', 'messages', 'isTerminal']);
        if (phase !== 4 || !Array.isArray(event.messages) || event.messages.length !== messages.length) fail('PROTOCOL_INVALID');
        for (const [index, message] of event.messages.entries()) {
          const shaped = messageShape(message, route);
          if (index === 0 && !isDeepStrictEqual(shaped, messages[index])) fail('PROTOCOL_INVALID');
          if (index === 1 && !assistantEquivalent(shaped, messages[index])) fail('PROTOCOL_INVALID');
        }
        if (event.isTerminal !== true) fail('PROTOCOL_INVALID');
        phase = 5; break;
      case 'tool_execution_start':
      case 'tool_execution_update':
      case 'tool_execution_end':
        fail('READ_ONLY_UNSUPPORTED'); break;
      case 'advisor_yielded':
        break;
      default:
        fail(/tool/iu.test(event.type) ? 'READ_ONLY_UNSUPPORTED' : 'PROTOCOL_INVALID');
    }
  }
  if (phase !== 5 || !answer) fail('PROTOCOL_INVALID');
  return Object.freeze({ recommendation: answer });
}
function parseResult(context = {}) {
  const output = context.execution?.result || context.execution;
  if (!output || typeof output.stdout !== 'string') fail('PROTOCOL_INVALID');
  return parseJsonl(output.stdout, target(context), context.cwd);
}
module.exports = { parseResult };