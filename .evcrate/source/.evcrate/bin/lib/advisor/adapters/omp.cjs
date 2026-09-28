'use strict';

const { parseJsonDocument } = require('../json-document.cjs');
const { createRoutingError, isRoutingError } = require('../errors.cjs');
const { DEFAULT_LIMITS, assertNoRecursion, createInvocation, isRunnerFailure } = require('../runner.cjs');
const { freezeAdapter, isPlainObject, resolveInvocationLimits, validateCapabilityAttestation } = require('../adapter-contract.cjs');
const { parseResult } = require('./omp-parser.cjs');

const EXECUTABLE = 'omp';
const MODEL_PATTERN = /^([^/\s]+)\/([^/\s]+)$/u;
const THINKING = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const PROBE_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, maxPromptBytes: 1,
  maxStdoutBytes: 512 * 1024, maxResultBytes: 512 * 1024, timeoutMs: 5_000 });
const GENERATION_LIMITS = Object.freeze({ ...DEFAULT_LIMITS,
  maxStdoutBytes: 512 * 1024, maxResultBytes: 512 * 1024, maxLines: 8192 });
const STATES = new WeakMap();
const CODES = new Set(['EXECUTABLE_UNAVAILABLE', 'CLI_VERSION_UNSUPPORTED', 'AUTH_UNAVAILABLE', 'MODEL_UNSUPPORTED',
  'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED', 'SESSION_UNSUPPORTED', 'OUTPUT_UNSUPPORTED', 'PROTOCOL_INVALID',
  'TIMEOUT', 'CANCELLED', 'OUTPUT_LIMIT', 'LINE_LIMIT', 'OUTPUT_INVALID', 'ADVISOR_RECURSION',
  'REQUEST_DEPTH_INVALID', 'INVOCATION_INVALID', 'CWD_INVALID', 'CWD_UNSAFE', 'TRANSIENT_PROVIDER_ERROR',
  'PROCESS_FAILED']);
const CONTROL_ARGV = Object.freeze(['--no-session', '--no-tools', '--no-lsp', '--no-pty', '--no-extensions',
  '--no-skills', '--no-rules']);

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
  const match = MODEL_PATTERN.exec(value.model);
  if (!match) fail('MODEL_UNSUPPORTED');
  if (!THINKING.has(value.effort)) fail('EFFORT_UNSUPPORTED');
  return Object.freeze({ ...value, provider: match[1], modelId: match[2] });
}
function assertContext(context) {
  state(context);
  assertNoRecursion({ environment: context.environment || process.env, requestDepth: context.requestDepth || 0 });
  if (!context.runner || typeof context.runner.run !== 'function') fail('ADAPTER_CONTRACT_INVALID');
}
function invocation(context, argv, prompt = '', limits = DEFAULT_LIMITS) {
  assertContext(context);
  return (context.createInvocation || createInvocation)({
    adapter: 'omp', executable: EXECUTABLE, argv: [...argv], cwd: context.cwd,
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
function parseVersion(stdout) {
  const match = /^omp(?:\s+|\/)v?([0-9]+\.[0-9]+\.[0-9]+)(?:[-+][0-9A-Za-z.-]+)?\s*$/u.exec(stdout.trim());
  if (!match) fail('CLI_VERSION_UNSUPPORTED');
  return match[1];
}
async function probeVersion(context) {
  const value = parseVersion((await command(context, ['--version'])).stdout);
  state(context).version = value;
  return value;
}
function usageStatus(value, route) {
  const allowed = ['generatedAt', 'reports', 'accountsWithoutUsage', 'disabledCredentials', 'capacity'];
  if (!isPlainObject(value) || Object.keys(value).some((key) => !allowed.includes(key))
    || Object.keys(value).length !== allowed.length || !Number.isSafeInteger(value.generatedAt)
    || !Array.isArray(value.reports) || !Array.isArray(value.accountsWithoutUsage)
    || !Array.isArray(value.disabledCredentials) || !isPlainObject(value.capacity)) fail('AUTH_UNAVAILABLE');
  const matchingReports = value.reports.filter((entry) => isPlainObject(entry) && entry.provider === route.provider);
  if (!matchingReports.length) fail('AUTH_UNAVAILABLE');
  const hasUsableReport = matchingReports.some((r) => Array.isArray(r.limits) && r.limits.length > 0
    && r.limits.every((l) => isPlainObject(l) && l.status === 'ok'));
  if (!hasUsableReport) fail('AUTH_UNAVAILABLE');
  const capacityEntries = value.capacity[route.provider];
  if (!Array.isArray(capacityEntries) || !capacityEntries.length) fail('AUTH_UNAVAILABLE');
  for (const entry of capacityEntries) {
    if (!isPlainObject(entry) || typeof entry.remainingAccounts !== 'number'
      || !Number.isFinite(entry.remainingAccounts) || entry.remainingAccounts <= 0) {
      fail('AUTH_UNAVAILABLE');
    }
  }
  return true;
}
async function probeAuth(context) {
  const current = state(context);
  const route = target(context);
  if (!current.version) fail('CLI_VERSION_UNSUPPORTED');
  let status;
  try {
    status = parseJsonDocument(
      (await command(context, ['usage', '--json', '--redact', '--provider', route.provider])).stdout.trim(),
      'AUTH_UNAVAILABLE', 'AUTH_UNAVAILABLE'
    );
    usageStatus(status, route);
  } catch (error) {
    const code = codeOf(error);
    if (!code || code === 'AUTH_UNAVAILABLE' || code === 'PROTOCOL_INVALID' || code === 'PROCESS_FAILED') {
      fail('AUTH_UNAVAILABLE');
    }
    throw error;
  }
  const attestation = Object.freeze({ authenticated: true });
  current.auth = attestation;
  current.route = route;
  return attestation;
}
function escapedRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); }
function required(help, marker, failure) {
  const escaped = escapedRegex(marker);
  const prefix = marker.startsWith('-') ? '(?:^|[\\s,])' : '(?:^|[^\\p{L}\\p{N}_])';
  const suffix = marker.startsWith('-') ? '(?=$|[\\s,=])' : '(?=$|[^\\p{L}\\p{N}_])';
  if (!new RegExp(`${prefix}${escaped}${suffix}`, 'u').test(help)) fail(failure);
}
function requiredOption(help, marker, failure) {
  const escaped = escapedRegex(marker);
  const pattern = `(?:^|\\n)[ \\t]*(?:-[A-Za-z],[ \\t]*)?${escaped}(?=$|[ \\t,=\\r\\n])`;
  if (!new RegExp(pattern, 'u').test(help)) fail(failure);
}
function catalogEntry(value, route) {
  if (!isPlainObject(value) || Object.keys(value).some((key) => key !== 'models')
    || !Array.isArray(value.models)) fail('OUTPUT_UNSUPPORTED');
  const matches = value.models.filter((entry) => isPlainObject(entry)
    && entry.provider === route.provider && entry.id === route.modelId && entry.selector === route.model);
  if (matches.length !== 1) fail('MODEL_UNSUPPORTED');
  if (!Array.isArray(matches[0].thinking) || matches[0].thinking.some((entry) => typeof entry !== 'string')
    || !matches[0].thinking.includes(route.effort)) fail('EFFORT_UNSUPPORTED');
  return matches[0];
}
async function probeCapabilities(context) {
  const current = state(context);
  const route = target(context);
  if (!current.version || !current.auth || !current.route || current.route.model !== route.model) fail('AUTH_UNAVAILABLE');
  const help = (await command(context, ['--help'])).stdout;
  requiredOption(help, '-p', 'OUTPUT_UNSUPPORTED');
  requiredOption(help, '--mode', 'OUTPUT_UNSUPPORTED');
  required(help, 'json', 'OUTPUT_UNSUPPORTED');
  requiredOption(help, '--model', 'MODEL_UNSUPPORTED');
  requiredOption(help, '--thinking', 'EFFORT_UNSUPPORTED');
  for (const marker of CONTROL_ARGV) requiredOption(help, marker, marker === '--no-tools' ? 'READ_ONLY_UNSUPPORTED' : 'SESSION_UNSUPPORTED');
  const usageHelp = (await command(context, ['usage', '--help'])).stdout;
  for (const marker of ['--json', '--redact', '--provider']) requiredOption(usageHelp, marker, 'AUTH_UNAVAILABLE');
  const modelsHelp = (await command(context, ['models', '--help'])).stdout;
  required(modelsHelp, 'find', 'MODEL_UNSUPPORTED');
  const catalog = parseJsonDocument(
    (await command(context, ['models', 'find', route.model, '--json', '--no-extensions'])).stdout.trim(),
    'OUTPUT_UNSUPPORTED', 'OUTPUT_UNSUPPORTED'
  );
  catalogEntry(catalog, route);
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
  const limits = resolveInvocationLimits(GENERATION_LIMITS, context.limits);
  return invocation(context, [...CONTROL_ARGV, '--model', route.model, '--thinking', route.effort,
    '--mode', 'json', '-p'], context.prompt, limits);
}
function classifyFailure(error) { const code = codeOf(error); return CODES.has(code) ? code : 'PROCESS_FAILED'; }

module.exports = freezeAdapter({ name: 'omp', authKeys: [], probeVersion, probeAuth,
  probeCapabilities, buildInvocation, parseResult, classifyFailure });
