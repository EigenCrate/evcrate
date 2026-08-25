'use strict';

const { createRoutingError } = require('./errors.cjs');
const { parseJsonDocument } = require('./json-document.cjs');

const CHECKPOINT_PROTOCOL = 'evcrate-advisor-checkpoint';
const RESULT_PROTOCOL = 'evcrate-advisor-result';
const VERSION = 1;
const MAX_ENVELOPE_BYTES = 32 * 1024;
const MAX_QUESTION_BYTES = 4 * 1024;
const MAX_TASK_BYTES = 8 * 1024;
const MAX_TERMINAL_BYTES = 16 * 1024;
const MAX_EVIDENCE_FILES = 4;
const MAX_CHANGED_PATHS = 16;
const HOSTS = Object.freeze(['claude', 'codex', 'gemini', 'antigravity', 'pi']);
const KINDS = Object.freeze(['architecture', 'debugging', 'security', 'review']);
const METADATA_PATHS = new Set(['git', 'github', 'gitlab', 'hg', 'svn'].map((name) => `.${name}`));
METADATA_PATHS.add(`.${'git'}ignore`);
const GIT_PREFIX = String.fromCharCode(46, 103, 105, 116);
METADATA_PATHS.add(`${GIT_PREFIX}modules`);
METADATA_PATHS.add(`${GIT_PREFIX}attributes`);
const CHECKPOINT_KEYS = Object.freeze([
  'protocol', 'version', 'active_host', 'checkpoint', 'question', 'kind',
  'task_or_phase', 'evidence', 'changed_paths', 'prior_counsel', 'owner_disposition'
]);
const RESULT_KEYS = Object.freeze([
  'protocol', 'version', 'checkpoint', 'status', 'recommendation', 'must_fix',
  'cautions', 'assumptions', 'success_checks', 'unresolved_questions', 'response'
]);
const SENSITIVE_EVIDENCE = /(?:-----BEGIN[^\n]*PRIVATE KEY-----|(?:api[_ -]?key|secret|password|token|credential)\s*[:=]|(?:raw\s+)?stderr\s*[:=]|stack\s+trace\s*[:=])/iu;

function fail() {
  throw createRoutingError('PROTOCOL_INVALID');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertKeys(value, expected) {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !expected.includes(key))
    || Object.keys(value).length !== expected.length) fail();
}

function bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function text(value, limit, multiline = false) {
  if (typeof value !== 'string' || !value || value.trim() !== value
    || /[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    || (!multiline && /[\r\n\t]/u.test(value)) || bytes(value) > limit
    || SENSITIVE_EVIDENCE.test(value)) fail();
  return value;
}

function list(value, limit = 32) {
  if (!Array.isArray(value) || value.length > limit) fail();
  return value.map((item) => text(item, MAX_ENVELOPE_BYTES));
}

function safePath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || value.includes('\\')
    || value.startsWith('/') || /^[A-Za-z]:/u.test(value) || value.split('/').some((part) => !part || part === '..')
    || /(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|password|token|private[-_]?key).*)/iu.test(value)) fail();
  if (/[\u0000-\u001f\u007f]/u.test(value)) fail();
  if (value.split('/').some((part) => METADATA_PATHS.has(part))) fail();
  return value;
}

function checkpointId(value) {
  text(value, MAX_ENVELOPE_BYTES);
  if (!/^(?:review|stuck|decision):[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)) fail();
  return value;
}

function validateCheckpoint(value, expectedHost) {
  assertKeys(value, CHECKPOINT_KEYS);
  if (value.protocol !== CHECKPOINT_PROTOCOL || value.version !== VERSION
    || !HOSTS.includes(value.active_host) || (expectedHost && value.active_host !== expectedHost)) fail();
  checkpointId(value.checkpoint);
  text(value.question, MAX_QUESTION_BYTES);
  if (!KINDS.includes(value.kind)) fail();
  text(value.task_or_phase, MAX_TASK_BYTES);
  assertKeys(value.evidence, ['terminal', 'files']);
  text(value.evidence.terminal, MAX_TERMINAL_BYTES, true);
  if (SENSITIVE_EVIDENCE.test(value.evidence.terminal)) fail();
  if (!Array.isArray(value.evidence.files) || value.evidence.files.length > MAX_EVIDENCE_FILES) fail();
  const files = value.evidence.files.map(safePath);
  if (new Set(files).size !== files.length) fail();
  if (!Array.isArray(value.changed_paths) || value.changed_paths.length > MAX_CHANGED_PATHS) fail();
  const changedPaths = value.changed_paths.map(safePath);
  if (new Set(changedPaths).size !== changedPaths.length) fail();
  const checkpoint = {
    protocol: value.protocol,
    version: value.version,
    active_host: value.active_host,
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
  return Object.freeze(checkpoint);
}

function checkpointFromBrief(brief, expectedHost) {
  if (typeof brief !== 'string' || bytes(brief) > MAX_ENVELOPE_BYTES) return null;
  let parsed;
  try { parsed = parseJsonDocument(brief); }
  catch {
    if (/^[\[{]/u.test(brief.trimStart())) fail();
    return null;
  }
  if (!isPlainObject(parsed) || parsed.protocol !== CHECKPOINT_PROTOCOL) fail();
  return validateCheckpoint(parsed, expectedHost);
}

function validateLegacyBrief(brief) {
  if (typeof brief !== 'string' || bytes(brief) > MAX_ENVELOPE_BYTES
    || /[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(brief)
    || SENSITIVE_EVIDENCE.test(brief)) fail();
  return brief;
}

function serializeCheckpoint(value) {
  const checkpoint = validateCheckpoint(value);
  const encoded = JSON.stringify(checkpoint);
  if (bytes(encoded) > MAX_ENVELOPE_BYTES) fail();
  return encoded;
}

function resultCheckpoint(value, context) {
  const expected = typeof context?.checkpoint === 'string'
    ? context.checkpoint : context?.checkpoint?.checkpoint;
  if (expected) {
    if (value !== expected) fail();
    return expected;
  }
  return checkpointId(value);
}

function normalizeResult(result, context = {}) {
  if (!isPlainObject(result)) fail();
  let checkpoint;
  let recommendation;
  if (result.protocol !== undefined) {
    if (!isPlainObject(result) || Object.keys(result).some((key) => !RESULT_KEYS.includes(key))
      || RESULT_KEYS.filter((key) => key !== 'response')
        .some((key) => !Object.prototype.hasOwnProperty.call(result, key))) fail();
    if (result.protocol !== RESULT_PROTOCOL || result.version !== VERSION
      || result.status !== 'ADVICE_READY') fail();
    checkpoint = resultCheckpoint(result.checkpoint, context);
    recommendation = text(result.recommendation, MAX_ENVELOPE_BYTES, true);
    for (const field of ['must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions']) {
      list(result[field]);
    }
  } else {
    if (Object.keys(result).length !== 1 || typeof result.response !== 'string') fail();
    recommendation = text(result.response, MAX_ENVELOPE_BYTES, true);
    checkpoint = context.checkpoint?.checkpoint || 'legacy:external';
  }
  const normalized = {
    protocol: RESULT_PROTOCOL,
    version: VERSION,
    checkpoint,
    status: 'ADVICE_READY',
    recommendation,
    must_fix: result.protocol !== undefined ? [...result.must_fix] : [],
    cautions: result.protocol !== undefined ? [...result.cautions] : [],
    assumptions: result.protocol !== undefined ? [...result.assumptions] : [],
    success_checks: result.protocol !== undefined ? [...result.success_checks] : [],
    unresolved_questions: result.protocol !== undefined ? [...result.unresolved_questions] : []
  };
  Object.defineProperty(normalized, 'response', { value: recommendation, enumerable: false });
  if (bytes(JSON.stringify(normalized)) > (context.maxBytes || MAX_ENVELOPE_BYTES)) fail();
  return Object.freeze(normalized);
}

module.exports = {
  CHECKPOINT_PROTOCOL,
  MAX_ENVELOPE_BYTES,
  RESULT_PROTOCOL,
  checkpointFromBrief,
  normalizeResult,
  serializeCheckpoint,
  validateCheckpoint,
  validateLegacyBrief
};
