'use strict';

const { createRoutingError, isRoutingError } = require('../errors.cjs');
const { parseJsonDocument } = require('../json-document.cjs');
const { parseAdviceBody } = require('../checkpoint-contract.cjs');
const {
  DEFAULT_LIMITS, assertNoRecursion, createInvocation, isRunnerFailure
} = require('../runner.cjs');
const {
  freezeAdapter, isPlainObject, resolveInvocationLimits, validateCapabilityAttestation
} = require('../adapter-contract.cjs');

const EXECUTABLE = 'codex';
const NO_TOOL_INSTRUCTION = 'You are a read-only advisor. Do not use tools, execute commands, inspect files, browse, or call subagents. Use only the checkpoint JSON below. Return one concise recommendation as your final answer.\n\nCheckpoint JSON:\n';
const PROBE_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, maxPromptBytes: 1,
  maxStdoutBytes: 512 * 1024, maxResultBytes: 512 * 1024, maxLines: 256, timeoutMs: 5_000 });
const FINAL_LIMITS = Object.freeze({ ...DEFAULT_LIMITS,
  maxPromptBytes: DEFAULT_LIMITS.maxPromptBytes + Buffer.byteLength(NO_TOOL_INSTRUCTION, 'utf8') });
const STATES = new WeakMap();
const EVENT_TYPES = new Set(['thread.started', 'turn.started', 'item.started', 'item.completed', 'turn.completed']);
const ITEM_TYPES = new Set(['agent_message', 'reasoning', 'context_compaction', 'command_execution',
  'file_change', 'mcp_tool_call', 'web_search', 'todo_list']);
const DISALLOWED_ITEMS = new Set(['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'todo_list']);
const LIFECYCLE_CODES = new Set(['EXECUTABLE_UNAVAILABLE', 'CLI_VERSION_UNSUPPORTED', 'AUTH_UNAVAILABLE',
  'MODEL_UNSUPPORTED', 'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED', 'SESSION_UNSUPPORTED',
  'OUTPUT_UNSUPPORTED', 'PROTOCOL_INVALID', 'TIMEOUT', 'CANCELLED', 'OUTPUT_LIMIT', 'LINE_LIMIT',
  'OUTPUT_INVALID', 'ADVISOR_RECURSION', 'REQUEST_DEPTH_INVALID', 'INVOCATION_INVALID', 'CWD_INVALID',
  'CWD_UNSAFE', 'TRANSIENT_PROVIDER_ERROR', 'PROCESS_FAILED']);

function fail(code) { throw createRoutingError(code); }
function state(context) {
  if (!isPlainObject(context)) fail('INVOCATION_INVALID');
  let value = STATES.get(context);
  if (!value) { value = {}; STATES.set(context, value); }
  return value;
}
function target(context) {
  const value = context?.target;
  if (!isPlainObject(value) || typeof value.model !== 'string' || typeof value.effort !== 'string') {
    fail('REQUEST_INVALID');
  }
  return value;
}
function assertContext(context) {
  state(context);
  assertNoRecursion({ environment: context.environment || process.env, requestDepth: context.requestDepth || 0 });
  if (!context.runner || typeof context.runner.run !== 'function') fail('ADAPTER_CONTRACT_INVALID');
}
function invocation(context, argv, prompt = '', limits = DEFAULT_LIMITS) {
  assertContext(context);
  return (context.createInvocation || createInvocation)({
    adapter: 'codex', executable: EXECUTABLE, argv: [...argv],
    cwd: context.cwd, workspaceRoot: context.workspaceRoot, prompt, authKeys: [], limits
  });
}
function codeOf(error) {
  return isRunnerFailure(error) ? error.error?.code : isRoutingError(error) ? error.code : error?.code;
}
async function command(context, argv, limits = PROBE_LIMITS) {
  const result = await context.runner.run(invocation(context, argv, '', limits), {
    environment: context.environment, requestDepth: 0, signal: context.signal
  });
  if (result?.error) throw result.failure || result.error;
  const output = result?.result || result;
  if (!output || typeof output.stdout !== 'string') fail('OUTPUT_INVALID');
  return Object.freeze({ stdout: output.stdout, stderr: typeof output.stderr === 'string' ? output.stderr : '' });
}
async function probeVersion(context) {
  const output = await command(context, ['--version']);
  const match = /^codex-cli\s+v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)\s*$/u.exec(output.stdout.trim());
  if (!match) fail('CLI_VERSION_UNSUPPORTED');
  state(context).version = match[1];
  return match[1];
}
async function probeAuth(context) {
  if (!state(context).version) fail('CLI_VERSION_UNSUPPORTED');
  const output = await command(context, ['login', 'status']);
  if (!/^(?:Logged in using (?:ChatGPT|API key))$/u.test(`${output.stdout.trim()}\n${output.stderr.trim()}`.trim())) {
    fail('AUTH_UNAVAILABLE');
  }
  const attestation = Object.freeze({ authenticated: true });
  state(context).auth = attestation;
  return attestation;
}
function required(help, marker, failure) { if (!help.includes(marker)) fail(failure); }
async function probeCapabilities(context) {
  const current = state(context);
  const route = target(context);
  if (!current.version || !current.auth) fail('AUTH_UNAVAILABLE');
  const help = (await command(context, ['exec', '--help'])).stdout;
  required(help, '--model', 'MODEL_UNSUPPORTED');
  required(help, '--config', 'EFFORT_UNSUPPORTED');
  required(help, '--ephemeral', 'SESSION_UNSUPPORTED');
  for (const marker of ['--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '--strict-config',
    '--skip-git-repo-check']) required(help, marker, 'READ_ONLY_UNSUPPORTED');
  required(help, '--json', 'OUTPUT_UNSUPPORTED');
  let catalog;
  try { catalog = parseJsonDocument((await command(context, ['debug', 'models', '--bundled'])).stdout); }
  catch { fail('OUTPUT_UNSUPPORTED'); }
  if (!isPlainObject(catalog) || !Array.isArray(catalog.models)) fail('OUTPUT_UNSUPPORTED');
  const model = catalog.models.find((entry) => isPlainObject(entry) && entry.slug === route.model);
  if (!model) fail('MODEL_UNSUPPORTED');
  if (!Array.isArray(model.supported_reasoning_levels)) fail('EFFORT_UNSUPPORTED');
  if (!model.supported_reasoning_levels.some((entry) => isPlainObject(entry) && entry.effort === route.effort)) {
    fail('EFFORT_UNSUPPORTED');
  }
  const capabilities = validateCapabilityAttestation({ model: route.model, effort: route.effort,
    noninteractive: true, session: 'isolated', tools: 'none', output: 'jsonl' });
  current.capabilities = capabilities;
  return capabilities;
}
function buildInvocation(context) {
  const current = state(context);
  const route = target(context);
  if (!current.capabilities) fail('OUTPUT_UNSUPPORTED');
  if (current.capabilities.model !== route.model) fail('MODEL_UNSUPPORTED');
  if (current.capabilities.effort !== route.effort) fail('EFFORT_UNSUPPORTED');
  if (typeof context.prompt !== 'string') fail('REQUEST_INVALID');
  const limits = resolveInvocationLimits(FINAL_LIMITS, context.limits);
  const prompt = context.checkpoint?.version === 2
    ? context.prompt
    : `${NO_TOOL_INSTRUCTION}${context.prompt}`;
  return invocation(context, ['exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config',
    '--skip-git-repo-check', '--sandbox', 'read-only', '--model', route.model, '--config',
    `model_reasoning_effort="${route.effort}"`, '--json', '-'], prompt, limits);
}
function eventKeys(value, allowed, requiredKeys = []) {
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))
    || requiredKeys.some((key) => !Object.hasOwn(value, key))) fail('PROTOCOL_INVALID');
}
function parseJsonl(text) {
  if (typeof text !== 'string' || !text || Buffer.byteLength(text, 'utf8') > 32 * 1024) fail('OUTPUT_LIMIT');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length || lines.length > 2048 || lines.some((line) => !line)) fail('PROTOCOL_INVALID');
  let phase = 'thread';
  let response;
  let terminal = false;
  const started = new Map();
  const completed = new Set();
  for (const raw of lines) {
    let event;
    try { event = parseJsonDocument(raw.endsWith('\r') ? raw.slice(0, -1) : raw); }
    catch { fail('PROTOCOL_INVALID'); }
    if (!isPlainObject(event) || !EVENT_TYPES.has(event.type) || terminal) fail('PROTOCOL_INVALID');
    if (event.type === 'thread.started') {
      if (phase !== 'thread') fail('PROTOCOL_INVALID');
      eventKeys(event, ['type', 'thread_id'], ['type', 'thread_id']);
      if (typeof event.thread_id !== 'string' || !event.thread_id) fail('PROTOCOL_INVALID');
      phase = 'turn';
    } else if (event.type === 'turn.started') {
      if (phase !== 'turn') fail('PROTOCOL_INVALID');
      eventKeys(event, ['type', 'turn_id'], ['type']);
      if (event.turn_id !== undefined && typeof event.turn_id !== 'string') fail('PROTOCOL_INVALID');
      phase = 'items';
    } else if (event.type === 'item.started') {
      if (phase !== 'items' || response !== undefined || !isPlainObject(event.item)) fail('PROTOCOL_INVALID');
      eventKeys(event, ['type', 'item'], ['type', 'item']);
      const item = event.item;
      if (!ITEM_TYPES.has(item.type) || typeof item.id !== 'string' || !item.id.trim() || started.has(item.id)) fail('PROTOCOL_INVALID');
      if (DISALLOWED_ITEMS.has(item.type)) fail('READ_ONLY_UNSUPPORTED');
      started.set(item.id, item.type);
    } else if (event.type === 'item.completed') {
      if (phase !== 'items' || response !== undefined || !isPlainObject(event.item)) fail('PROTOCOL_INVALID');
      eventKeys(event, ['type', 'item'], ['type', 'item']);
      const item = event.item;
      if (!ITEM_TYPES.has(item.type) || typeof item.id !== 'string' || !item.id.trim() || completed.has(item.id)) fail('PROTOCOL_INVALID');
      if (DISALLOWED_ITEMS.has(item.type)) fail('READ_ONLY_UNSUPPORTED');
      const startedType = started.get(item.id);
      if (startedType === undefined && item.type !== 'agent_message') fail('PROTOCOL_INVALID');
      if (startedType !== undefined && startedType !== item.type) fail('PROTOCOL_INVALID');
      if (startedType === undefined) started.set(item.id, item.type);
      completed.add(item.id);
      if (item.type === 'agent_message') {
        eventKeys(item, ['id', 'type', 'text'], ['id', 'type', 'text']);
        if (response !== undefined || typeof item.text !== 'string' || !item.text.trim()) fail('PROTOCOL_INVALID');
        if (Buffer.byteLength(item.text, 'utf8') > 16 * 1024) fail('OUTPUT_LIMIT');
        response = item.text;
      }
    } else {
      if (phase !== 'items' || response === undefined || started.size !== completed.size
        || [...started.keys()].some((id) => !completed.has(id))) fail('PROTOCOL_INVALID');
      eventKeys(event, ['type', 'usage'], ['type']);
      if (event.usage !== undefined && !isPlainObject(event.usage)) fail('PROTOCOL_INVALID');
      terminal = true;
    }
  }
  if (phase !== 'items' || response === undefined || !terminal) fail('PROTOCOL_INVALID');
  return Object.freeze({ recommendation: response });
}
function parseResult(context = {}) {
  const output = context.execution?.result || context.execution;
  if (!output || typeof output.stdout !== 'string') fail('PROTOCOL_INVALID');
  const response = parseJsonl(output.stdout);
  if (context.checkpoint?.version === 2) {
    return parseAdviceBody(response.recommendation);
  }
  return response;
}
function classifyFailure(error) {
  const code = codeOf(error);
  return LIFECYCLE_CODES.has(code) ? code : 'PROCESS_FAILED';
}

module.exports = freezeAdapter({ name: 'codex', authKeys: [], probeVersion, probeAuth,
  probeCapabilities, buildInvocation, parseResult, classifyFailure });
