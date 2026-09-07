'use strict';

const { parseJsonDocument } = require('../json-document.cjs');
const { createRoutingError, isRoutingError } = require('../errors.cjs');
const { parseAdviceBody } = require('../checkpoint-contract.cjs');
const { DEFAULT_LIMITS, assertNoRecursion, createInvocation, isRunnerFailure } = require('../runner.cjs');
const { freezeAdapter, isPlainObject, resolveInvocationLimits, validateCapabilityAttestation } = require('../adapter-contract.cjs');
const EXECUTABLE = 'claude';
const PROBE_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, maxPromptBytes: 1,
  maxStdoutBytes: 512 * 1024, maxResultBytes: 512 * 1024, maxLines: 256, timeoutMs: 5_000 });
const STATES = new WeakMap();
const RESULT_KEYS = new Set(['type', 'subtype', 'is_error', 'result', 'session_id', 'uuid', 'duration_ms',
  'duration_api_ms', 'total_cost_usd', 'usage', 'permission_denials', 'stop_reason', 'model']);
const CODES = new Set(['EXECUTABLE_UNAVAILABLE', 'CLI_VERSION_UNSUPPORTED', 'AUTH_UNAVAILABLE', 'MODEL_UNSUPPORTED',
  'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED', 'SESSION_UNSUPPORTED', 'OUTPUT_UNSUPPORTED', 'PROTOCOL_INVALID',
  'TIMEOUT', 'CANCELLED', 'OUTPUT_LIMIT', 'LINE_LIMIT', 'OUTPUT_INVALID', 'ADVISOR_RECURSION',
  'REQUEST_DEPTH_INVALID', 'INVOCATION_INVALID', 'CWD_INVALID', 'CWD_UNSAFE', 'TRANSIENT_PROVIDER_ERROR',
  'PROCESS_FAILED']);
const CONTROL_ARGV = Object.freeze([
  '-p', '--safe-mode', '--disable-slash-commands', '--disallowed-tools', '*', '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}', '--permission-mode', 'plan', '--no-session-persistence'
]);

function fail(code) { throw createRoutingError(code); }
function state(context) {
  if (!isPlainObject(context)) fail('INVOCATION_INVALID');
  let value = STATES.get(context);
  if (!value) { value = {}; STATES.set(context, value); }
  return value;
}
function target(context) {
  const value = context?.target;
  if (!isPlainObject(value) || typeof value.model !== 'string' || typeof value.effort !== 'string') fail('REQUEST_INVALID');
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
    adapter: 'claude', executable: EXECUTABLE, argv: [...argv], cwd: context.cwd,
    workspaceRoot: context.workspaceRoot, prompt, authKeys: [], limits
  });
}
function codeOf(error) { return isRunnerFailure(error) ? error.error?.code : isRoutingError(error) ? error.code : error?.code; }
async function command(context, argv, limits = PROBE_LIMITS) {
  const result = await context.runner.run(invocation(context, argv, '', limits), {
    environment: context.environment, requestDepth: 0, signal: context.signal
  });
  if (result?.error) throw result.failure || result.error;
  const output = result?.result || result;
  if (!output || typeof output.stdout !== 'string') fail('OUTPUT_INVALID');
  return Object.freeze({ stdout: output.stdout, stderr: typeof output.stderr === 'string' ? output.stderr : '' });
}
function version(stdout) {
  const match = /^v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)(?:\s+\(Claude Code\))?\s*$/u.exec(stdout.trim());
  if (!match) fail('CLI_VERSION_UNSUPPORTED');
  return match[1];
}
async function probeVersion(context) {
  const value = version((await command(context, ['--version'])).stdout);
  state(context).version = value;
  return value;
}
async function probeAuth(context) {
  if (!state(context).version) fail('CLI_VERSION_UNSUPPORTED');
  let value;
  try { value = parseJsonDocument((await command(context, ['auth', 'status'])).stdout); }
  catch { fail('AUTH_UNAVAILABLE'); }
  if (!isPlainObject(value) || Object.keys(value).some((key) => !['loggedIn', 'authMethod', 'apiProvider'].includes(key))
    || value.loggedIn !== true || typeof value.authMethod !== 'string' || !value.authMethod || value.authMethod === 'none') {
    fail('AUTH_UNAVAILABLE');
  }
  const attestation = Object.freeze({ authenticated: true });
  state(context).auth = attestation;
  return attestation;
}
function required(help, pattern, code) { if (!pattern.test(help)) fail(code); }
async function probeCapabilities(context) {
  const current = state(context);
  const route = target(context);
  if (!current.version || !current.auth) fail('AUTH_UNAVAILABLE');
  const help = (await command(context, ['--help'])).stdout;
  required(help, /(?:^|\n)\s*(?:-p,\s*)?--print(?:\s|$)/mu, 'OUTPUT_UNSUPPORTED');
  required(help, /--safe-mode\b/u, 'READ_ONLY_UNSUPPORTED');
  required(help, /--disable-slash-commands\b/u, 'READ_ONLY_UNSUPPORTED');
  required(help, /--disallowed-tools\b/u, 'READ_ONLY_UNSUPPORTED');
  required(help, /--strict-mcp-config\b/u, 'READ_ONLY_UNSUPPORTED');
  required(help, /--mcp-config\b/u, 'READ_ONLY_UNSUPPORTED');
  required(help, /--permission-mode\s+<[^>]+>/u, 'READ_ONLY_UNSUPPORTED');
  required(help, /\bplan\b/u, 'READ_ONLY_UNSUPPORTED');
  required(help, /--no-session-persistence\b/u, 'SESSION_UNSUPPORTED');
  required(help, /--model\s+<[^>]+>/u, 'MODEL_UNSUPPORTED');
  required(help, /--effort\s+<[^>]+>/u, 'EFFORT_UNSUPPORTED');
  required(help, /--output-format\s+<[^>]+>/u, 'OUTPUT_UNSUPPORTED');
  required(help, /\bjson\b/u, 'OUTPUT_UNSUPPORTED');
  const probe = [...CONTROL_ARGV, '--model', route.model, '--effort', route.effort, '--output-format', 'json', '--help'];
  const checked = (await command(context, probe)).stdout;
  if (!/Usage:\s+claude\b/u.test(checked)) fail('OUTPUT_UNSUPPORTED');
  current.capabilities = validateCapabilityAttestation({ model: route.model, effort: route.effort,
    noninteractive: true, session: 'isolated', tools: 'none', output: 'json' });
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
  return invocation(context, [...CONTROL_ARGV, '--model', route.model, '--effort', route.effort,
    '--output-format', 'json'], context.prompt, limits);
}
function parseResult(context = {}) {
  const output = context.execution?.result || context.execution;
  if (!output || typeof output.stdout !== 'string' || Buffer.byteLength(output.stdout, 'utf8') > 32 * 1024) fail('OUTPUT_LIMIT');
  let result;
  try { result = parseJsonDocument(output.stdout); } catch { fail('PROTOCOL_INVALID'); }
  if (!isPlainObject(result) || Object.keys(result).some((key) => !RESULT_KEYS.has(key))
    || result.type !== 'result' || result.subtype !== 'success' || result.is_error !== false
    || typeof result.result !== 'string' || !result.result.trim()) fail('PROTOCOL_INVALID');
  if (Array.isArray(result.permission_denials) && result.permission_denials.length > 0) {
    fail('READ_ONLY_UNSUPPORTED');
  }
  if (result.permission_denials !== undefined && !Array.isArray(result.permission_denials)) {
    fail('PROTOCOL_INVALID');
  }
  if (result.stop_reason !== undefined) {
    if (typeof result.stop_reason !== 'string') fail('PROTOCOL_INVALID');
    if (result.stop_reason === 'tool_use' || result.stop_reason === 'tool_call') fail('READ_ONLY_UNSUPPORTED');
    if (result.stop_reason === 'max_tokens') fail('OUTPUT_LIMIT');
    if (result.stop_reason !== 'end_turn' && result.stop_reason !== 'stop') fail('PROTOCOL_INVALID');
  }
  const route = target(context);
  if (result.model !== undefined && result.model !== route.model) fail('MODEL_UNSUPPORTED');
  if (Buffer.byteLength(result.result, 'utf8') > 16 * 1024) fail('OUTPUT_LIMIT');
  if (context.checkpoint?.version === 2) {
    return parseAdviceBody(result.result);
  }
  return Object.freeze({ recommendation: result.result });
}
function classifyFailure(error) { const code = codeOf(error); return CODES.has(code) ? code : 'PROCESS_FAILED'; }

module.exports = freezeAdapter({ name: 'claude', authKeys: [], probeVersion, probeAuth,
  probeCapabilities, buildInvocation, parseResult, classifyFailure });
