'use strict';

const path = require('node:path');
const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');
const { validateTaskStateV1, uuid, text } = require('./state-contract.cjs');
const { deepFreeze, validateArtifactRef, validateNonNegativeSafeInteger } = require('./contracts-v2.cjs');
const { isUnsafeWindowsPath } = require('./windows-platform.cjs');

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_RAW_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const PARSED_ARGUMENTS = new WeakMap();
const COMMANDS = new Set([
  'code', 'code/auto', 'code/no-test', 'code/parallel',
  'cook', 'cook/auto', 'cook/auto/fast', 'cook/auto/parallel',
  'bootstrap', 'bootstrap/auto', 'bootstrap/auto/fast', 'bootstrap/auto/parallel',
  'fix', 'fix/ci', 'fix/fast', 'fix/hard', 'fix/logs', 'fix/parallel', 'fix/test', 'fix/types', 'fix/ui'
]);
const CONTEXT_KEYS = ['project_root', 'command', 'work_target', 'plan_path', 'phase_path', 'phase_id'];
const RUN_KEYS = ['task_run_id', 'project_id', 'task_revision', 'scope_revision', 'evidence_revision'];
const fail = (code = 'ADVICE_MODE_INVALID') => { throw createRoutingError(code); };

function keys(value, expected, code) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  const names = Reflect.ownKeys(value);
  if (names.length !== expected.length || names.some((name) => !expected.includes(name)
    || !Object.getOwnPropertyDescriptor(value, name).enumerable
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, name), 'value'))) fail(code);
}
function metadata(value, max, code) {
  if (typeof value !== 'string' || !value || !value.isWellFormed()
    || Buffer.byteLength(value) > max || CONTROL.test(value)) fail(code);
}
function relativePath(value, code) {
  metadata(value, 1024, code);
  // Apply the existing sensitive/metadata/traversal policy to each component;
  // activation paths have a 1 KiB aggregate bound, versus 512-byte evidence paths.
  try {
    for (const component of value.split('/')) {
      validateArtifactRef({ id: 'activation', path: component, digest: '0'.repeat(64), description: 'Selected path' });
    }
  } catch { fail(code); }
}
function context(value, code) {
  keys(value, CONTEXT_KEYS, code);
  metadata(value.project_root, 4096, code);
  if (!path.isAbsolute(value.project_root)
    || value.project_root.split(/[\\/]/u).some((part) => part === '.' || part === '..')
    || (process.platform === 'win32' && isUnsafeWindowsPath(value.project_root))) fail(code);
  metadata(value.command, 128, code);
  if (!COMMANDS.has(value.command)) fail(code);
  metadata(value.work_target, 4096, code);
  if (value.plan_path !== null) relativePath(value.plan_path, code);
  if (value.phase_path !== null) {
    if (value.plan_path === null) fail(code);
    relativePath(value.phase_path, code);
  }
  if (value.phase_id !== null) {
    metadata(value.phase_id, 128, code);
    try { text(value.phase_id); } catch { fail(code); }
  }
}
function run(value) {
  const code = 'ADVICE_HANDOFF_INVALID';
  keys(value, RUN_KEYS, code);
  try {
    uuid(value.task_run_id);
    validateNonNegativeSafeInteger(value.task_revision, code);
    validateNonNegativeSafeInteger(value.scope_revision, code);
    validateNonNegativeSafeInteger(value.evidence_revision, code);
    // Reuse the canonical lowercase digest validator without another regex.
    validateArtifactRef({ id: 'activation', path: 'run', digest: value.project_id, description: 'Bound project' });
  } catch { fail(code); }
  if (value.task_revision < 1) fail(code);
}

function parseAdviceArguments(raw) {
  if (typeof raw !== 'string' || !raw.isWellFormed() || raw.includes('\0')) fail();
  if (Buffer.byteLength(raw) > MAX_RAW_BYTES) fail('ADVICE_MODE_OVERSIZED');
  let start = -1;
  for (let index = raw.indexOf('--advice'); index !== -1; index = raw.indexOf('--advice', index + 8)) {
    if ((index === 0 || /\s/u.test(raw[index - 1]))
      && (index + 8 === raw.length || /\s/u.test(raw[index + 8]))) {
      if (start !== -1) fail('ADVICE_MODE_DUPLICATE_FLAG');
      start = index;
    }
  }
  if (start === -1 || /\S/u.test(raw.slice(start + 8))) {
    return Object.freeze({ mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: raw });
  }
  while (start > 0 && /\s/u.test(raw[start - 1])) start -= 1;
  return Object.freeze({ mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: raw.slice(0, start) });
}

function parseActivationRequest(input) {
  if (input && PARSED_ARGUMENTS.has(input)) return input;
  let request = input;
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.byteLength > MAX_INPUT_BYTES) fail('ADVICE_MODE_OVERSIZED');
    if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) fail();
    request = decodeUtf8(input, 'ADVICE_MODE_INVALID');
  }
  if (typeof request === 'string') {
    if (Buffer.byteLength(request) > MAX_INPUT_BYTES) fail('ADVICE_MODE_OVERSIZED');
    if (!request.isWellFormed() || request.charCodeAt(0) === 0xfeff) fail();
    request = parseJsonDocument(request, 'ADVICE_MODE_INVALID', 'ADVICE_MODE_INVALID');
  }
  keys(request, ['protocol', 'version', 'raw_arguments', 'context', 'handoff']);
  if (request.protocol !== 'evcrate-advice-mode' || request.version !== 1) fail();
  const parsed = parseAdviceArguments(request.raw_arguments);
  context(request.context, 'ADVICE_MODE_INVALID');
  if (request.handoff !== null) {
    const handoff = request.handoff;
    keys(handoff, ['kind', 'context', 'run'], 'ADVICE_HANDOFF_INVALID');
    if (!['pre-run', 'same-run'].includes(handoff.kind)) fail('ADVICE_HANDOFF_INVALID');
    context(handoff.context, 'ADVICE_HANDOFF_INVALID');
    if (handoff.kind === 'pre-run') {
      if (handoff.run !== null) fail('ADVICE_HANDOFF_INVALID');
    } else {
      run(handoff.run);
      if (handoff.context.phase_id === null) fail('ADVICE_HANDOFF_INVALID');
    }
    for (const key of CONTEXT_KEYS) {
      // Only unknown pre-run selections can be refined by the receiver.
      if (handoff.kind === 'pre-run' && ['plan_path', 'phase_path', 'phase_id'].includes(key)
        && handoff.context[key] === null) continue;
      if (request.context[key] !== handoff.context[key]) fail('ADVICE_CONTEXT_MISMATCH');
    }
  }
  const encoded = JSON.stringify(request);
  if (Buffer.byteLength(encoded) > MAX_INPUT_BYTES) fail('ADVICE_MODE_OVERSIZED');
  const validated = deepFreeze(JSON.parse(encoded));
  PARSED_ARGUMENTS.set(validated, parsed);
  return validated;
}

function evaluateActivation(request, observedState = null) {
  const validated = parseActivationRequest(request);
  const parsed = PARSED_ARGUMENTS.get(validated);
  let { mode, reason } = parsed;
  let binding = null;
  if (validated.handoff !== null) {
    mode = 'inherited';
    reason = 'INHERITED_PRE_RUN';
    if (validated.handoff.kind === 'same-run') {
      const state = validateTaskStateV1(observedState);
      binding = validated.handoff.run;
      if (state.gate_status === 'completed') fail('ADVICE_RUN_COMPLETED');
      if (state.task_run_id.toLowerCase() !== binding.task_run_id.toLowerCase()
        || state.project_id !== binding.project_id || state.phase_id !== validated.context.phase_id) fail('ADVICE_CONTEXT_MISMATCH');
      if (['task_revision', 'scope_revision', 'evidence_revision'].some((key) => state[key] !== binding[key])) fail('ADVICE_HANDOFF_STALE');
      reason = 'INHERITED_SAME_RUN';
    }
  }
  return Object.freeze({ protocol: 'evcrate-advice-mode', version: 1, status: 'MODE_READY',
    mode, reason, work_arguments: parsed.work_arguments, context: validated.context, run: binding, error: null });
}

module.exports = { MAX_INPUT_BYTES, MAX_RAW_BYTES, MAX_OUTPUT_BYTES, parseAdviceArguments, parseActivationRequest, evaluateActivation };
