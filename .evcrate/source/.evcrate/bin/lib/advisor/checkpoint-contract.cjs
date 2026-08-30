'use strict';

const { createRoutingError } = require('./errors.cjs');

const CHECKPOINT_PROTOCOL = 'evcrate-advisor-checkpoint';
const RESULT_PROTOCOL = 'evcrate-advisor-result';
const VERSION = 1;
const MAX_ENVELOPE_BYTES = 32 * 1024;
const MAX_QUESTION_BYTES = 4 * 1024;
const MAX_TASK_BYTES = 8 * 1024;
const MAX_TERMINAL_BYTES = 16 * 1024;
const MAX_EVIDENCE_FILES = 4;
const MAX_CHANGED_PATHS = 16;
const KINDS = Object.freeze(['architecture', 'debugging', 'security', 'review']);
const CHECKPOINT_KEYS = Object.freeze([
  'protocol', 'version', 'checkpoint', 'question', 'kind', 'task_or_phase',
  'evidence', 'changed_paths', 'prior_counsel', 'owner_disposition'
]);
const EVIDENCE_KEYS = Object.freeze(['terminal', 'files']);
const RESULT_KEYS = Object.freeze([
  'protocol', 'version', 'checkpoint', 'status', 'recommendation', 'must_fix',
  'cautions', 'assumptions', 'success_checks', 'unresolved_questions'
]);
const ADAPTER_RESULT_KEYS = Object.freeze([
  'recommendation', 'must_fix', 'cautions', 'assumptions', 'success_checks',
  'unresolved_questions'
]);
const METADATA_PATHS = new Set([
  '.git', '.gitignore', '.gitmodules', '.gitattributes', '.github', '.gitlab', '.hg', '.svn'
]);
const SENSITIVE = /(?:-----BEGIN[^\n]*PRIVATE KEY-----|["']?(?:api[_ -]?key|secret|password|token|credential)["']?\s*[:=]|["']?(?:raw\s+)?stderr["']?\s*[:=]|["']?stack\s+trace["']?\s*[:=]|\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/]+={0,2}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b|\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b)/iu;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function fail() { throw createRoutingError('PROTOCOL_INVALID'); }
function bytes(value) { return Buffer.byteLength(value, 'utf8'); }
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
function assertKeys(value, expected) {
  if (!isPlainObject(value)) fail();
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) fail();
}
function text(value, limit, multiline = false) {
  if (typeof value !== 'string' || !value || value.trim() !== value || CONTROL.test(value)
    || (!multiline && /[\r\n\t]/u.test(value)) || bytes(value) > limit || SENSITIVE.test(value)) fail();
  return value;
}
function safePath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || value.includes('\\')
    || value.startsWith('/') || /^[A-Za-z]:/u.test(value) || CONTROL.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')
    || value.split('/').some((part) => METADATA_PATHS.has(`.${part.replace(/^\./u, '')}`))
    || /(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|password|token|private[-_]?key).*)/iu.test(value)) fail();
  return value;
}
function checkpointId(value) {
  text(value, MAX_ENVELOPE_BYTES);
  if (!/^(?:review|stuck|decision):[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)) fail();
  return value;
}
function boundedList(value) {
  if (!Array.isArray(value) || value.length > 32) fail();
  return value.map((item) => text(item, MAX_ENVELOPE_BYTES, true));
}

function validateCheckpoint(value) {
  assertKeys(value, CHECKPOINT_KEYS);
  if (value.protocol !== CHECKPOINT_PROTOCOL || value.version !== VERSION) fail();
  checkpointId(value.checkpoint);
  text(value.question, MAX_QUESTION_BYTES);
  if (!KINDS.includes(value.kind)) fail();
  text(value.task_or_phase, MAX_TASK_BYTES);
  assertKeys(value.evidence, EVIDENCE_KEYS);
  text(value.evidence.terminal, MAX_TERMINAL_BYTES, true);
  if (!Array.isArray(value.evidence.files) || value.evidence.files.length > MAX_EVIDENCE_FILES) fail();
  const files = value.evidence.files.map(safePath);
  if (new Set(files).size !== files.length) fail();
  if (!Array.isArray(value.changed_paths) || value.changed_paths.length > MAX_CHANGED_PATHS) fail();
  const changedPaths = value.changed_paths.map(safePath);
  if (new Set(changedPaths).size !== changedPaths.length) fail();
  const checkpoint = {
    protocol: value.protocol,
    version: value.version,
    checkpoint: value.checkpoint,
    question: value.question,
    kind: value.kind,
    task_or_phase: value.task_or_phase,
    evidence: { terminal: value.evidence.terminal, files },
    changed_paths: changedPaths,
    prior_counsel: text(value.prior_counsel, MAX_ENVELOPE_BYTES, true),
    owner_disposition: text(value.owner_disposition, MAX_ENVELOPE_BYTES, true)
  };
  if (bytes(JSON.stringify(checkpoint)) > MAX_ENVELOPE_BYTES) fail();
  return deepFreeze(checkpoint);
}

function serializeCheckpoint(value) {
  const checkpoint = validateCheckpoint(value);
  const encoded = JSON.stringify(checkpoint);
  if (bytes(encoded) > MAX_ENVELOPE_BYTES) fail();
  return encoded;
}

function normalizeResult(adapterResult, context = {}) {
  if (!isPlainObject(adapterResult)) fail();
  const keys = Object.keys(adapterResult);
  if (!keys.length || keys.some((key) => !ADAPTER_RESULT_KEYS.includes(key))) fail();
  if (!Object.hasOwn(adapterResult, 'recommendation')) fail();
  const checkpoint = validateCheckpoint(context.checkpoint);
  const lists = {};
  for (const field of ADAPTER_RESULT_KEYS.slice(1)) {
    lists[field] = adapterResult[field] === undefined ? [] : boundedList(adapterResult[field]);
  }
  const result = {
    protocol: RESULT_PROTOCOL,
    version: VERSION,
    checkpoint: checkpoint.checkpoint,
    status: 'ADVICE_READY',
    recommendation: text(adapterResult.recommendation, MAX_ENVELOPE_BYTES, true),
    ...lists
  };
  if (bytes(JSON.stringify(result)) > (context.maxBytes || MAX_ENVELOPE_BYTES)) {
    throw createRoutingError('OUTPUT_LIMIT');
  }
  return deepFreeze(result);
}

module.exports = {
  ADAPTER_RESULT_KEYS,
  CHECKPOINT_KEYS,
  CHECKPOINT_PROTOCOL,
  KINDS,
  MAX_CHANGED_PATHS,
  MAX_ENVELOPE_BYTES,
  MAX_EVIDENCE_FILES,
  MAX_QUESTION_BYTES,
  MAX_TASK_BYTES,
  MAX_TERMINAL_BYTES,
  RESULT_KEYS,
  RESULT_PROTOCOL,
  boundedList,
  checkpointId,
  normalizeResult,
  safePath,
  serializeCheckpoint,
  text,
  validateCheckpoint
};
