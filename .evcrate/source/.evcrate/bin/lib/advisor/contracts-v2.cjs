'use strict';

const { createHash } = require('node:crypto');
const { createRoutingError, ERROR_CATALOG } = require('./errors.cjs');
const { parseJsonDocument } = require('./json-document.cjs');
const CHECKPOINT_PROTOCOL_V2 = 'evcrate-advisor-checkpoint';
const CHECKPOINT_VERSION_V2 = 2;

const RESULT_PROTOCOL_V2 = 'evcrate-advisor-result';
const RESULT_VERSION_V2 = 2;

const CONTROLLER_PROTOCOL_V2 = 'evcrate-advisor-controller';
const CONTROLLER_VERSION_V2 = 2;

const STATE_PROTOCOL_V1 = 'evcrate-advisor-state';
const STATE_VERSION_V1 = 1;

const HISTORY_PROTOCOL_V1 = 'evcrate-advisor-history';
const HISTORY_VERSION_V1 = 1;

// Bounds
const MAX_ENVELOPE_BYTES = 32 * 1024;
const MAX_QUESTION_BYTES = 4 * 1024;
const MAX_TASK_BYTES = 8 * 1024;
const MAX_EVIDENCE_TEXT_BYTES = 16 * 1024;
const MAX_RESULT_BODY_BYTES = 16 * 1024;
const MAX_STATE_BYTES = 64 * 1024;
const MAX_EXECUTION_HISTORY_BYTES = 128 * 1024;
const MAX_OUTCOME_HISTORY_BYTES = 64 * 1024;
const MAX_EVIDENCE_FILES = 4;
const MAX_CHANGED_PATHS = 16;
const MAX_MODEL_ATTEMPTS = 5;
const MAX_TOTAL_ATTEMPT_SUMMARIES = 8;
const MAX_CORRECTION_CYCLES = 3;

// Enums
const CANDIDATE_BACKENDS = Object.freeze(['claude', 'codex', 'antigravity', 'pi', 'omp']);
const DECISION_KINDS = Object.freeze(['direction', 'review', 'stuck', 'decision', 'reconcile']);
const GATE_STATUSES = Object.freeze(['open', 'needs_evidence', 'in_consultation', 'needs_human', 'completed']);
const ATTEMPT_SLOTS = Object.freeze(['primary', 'backup']);
const ATTEMPT_PHASES = Object.freeze(['preflight', 'model']);
const TERMINAL_CLASSIFICATIONS = Object.freeze(['success', 'transient', 'fatal', 'cancelled', 'skipped']);
const CLEANUP_OUTCOMES = Object.freeze(['confirmed', 'unconfirmed', 'not_needed']);
const AUDIT_STATUSES = Object.freeze(['recorded', 'degraded', 'disabled']);
const OUTCOME_RESULTS = Object.freeze(['resolved', 'unresolved', 'regressed', 'unknown']);
const EXECUTION_STATUSES = Object.freeze(['started', 'ADVICE_READY', 'FAILED']);

const PRIMARY_RETRY_SCHEDULE_MS = Object.freeze([10000, 20000, 30000]);
const BACKUP_ATTEMPTS_LIMIT = 1;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const METADATA_PATHS = new Set([
  '.git', '.gitignore', '.gitmodules', '.gitattributes', '.github', '.gitlab', '.hg', '.svn'
]);
const RAW_STACK_PATTERN = /(?:\bat\s+(?:async\s+|new\s+)?[\w$.<>]+\s+\([^)]*:\d+(?::\d+)?\)|\bat\s+\S+:\d+:\d+|\bnode:internal\/|\bFile\s+["'][^"']+["'],\s+line\s+\d+|\b(?:goroutine\s+\d+\s+\[|stack\s+backtrace:)|(?:^|\n)\s*[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+(?:\([^)]*\))?\n\s+.*\.go:\d+|\b\d+:\s+0x[0-9a-fA-F]+\s+-\s+)/u;
const SENSITIVE_PATTERN = /(?:-----BEGIN[^\n]*PRIVATE KEY-----|["']?(?:api[_ -]?key|secret|password|token|credential)["']?\s*[:=]|["']?(?:raw\s+)?stderr["']?\s*[:=]|["']?stack\s+trace["']?\s*[:=]|\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/]+={0,2}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b|\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b)/iu;

function fail(code = 'PROTOCOL_INVALID') {
  throw createRoutingError(code);
}

function bytes(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

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

function assertKeys(value, expected, code = 'PROTOCOL_INVALID') {
  if (!isPlainObject(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    fail(code);
  }
}

function validateText(value, limit, multiline = false, code = 'PROTOCOL_INVALID') {
  if (typeof value !== 'string' || !value || value.trim() !== value
    || CONTROL_PATTERN.test(value) || (!multiline && /[\r\n\t]/u.test(value))
    || bytes(value) > limit || SENSITIVE_PATTERN.test(value)
    || RAW_STACK_PATTERN.test(value)) {
    fail(code);
  }
  return value;
}

function validateOptionalText(value, limit, multiline = false, code = 'PROTOCOL_INVALID') {
  if (value === null) return null;
  return validateText(value, limit, multiline, code);
}

function validateUuid(value, code = 'PROTOCOL_INVALID') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail(code);
  return value;
}

function validateDigest(value, code = 'PROTOCOL_INVALID') {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(code);
  return value;
}

function validateNonNegativeSafeInteger(value, code = 'PROTOCOL_INVALID') {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(code);
  }
  return value;
}

function validateSafeRelativePath(value, code = 'PROTOCOL_INVALID') {
  if (typeof value !== 'string' || !value || value.length > 512 || value.includes('\\')
    || value.startsWith('/') || /^[A-Za-z]:/u.test(value) || CONTROL_PATTERN.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')
    || value.split('/').some((part) => METADATA_PATHS.has(`.${part.replace(/^\./u, '')}`))
    || /(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|password|token|private[-_]?key).*)/iu.test(value)) {
    fail(code);
  }
  return value;
}

function validateRouteTriple(target, code = 'ROUTE_ENTRY_INVALID') {
  assertKeys(target, ['backend', 'model', 'effort'], code);
  if (!CANDIDATE_BACKENDS.includes(target.backend)) fail(code);
  validateText(target.model, 256, false, code);
  validateText(target.effort, 64, false, code);
  return target;
}

// Sanitized Error Schema
const SANITIZED_ERROR_KEYS = Object.freeze(['code', 'category', 'action', 'message']);
function validateSanitizedError(error, code = 'PROCESS_FAILED') {
  if (!isPlainObject(error)) fail(code);
  assertKeys(error, SANITIZED_ERROR_KEYS, code);
  if (typeof error.code !== 'string' || !Object.hasOwn(ERROR_CATALOG, error.code)) fail(code);
  const catalogEntry = ERROR_CATALOG[error.code];
  if (error.category !== catalogEntry.category) fail(code);
  if (error.action !== catalogEntry.action || error.message !== catalogEntry.message) fail(code);
  return deepFreeze({
    code: error.code,
    category: catalogEntry.category,
    action: catalogEntry.action,
    message: catalogEntry.message
  });
}

// Validation Result Schema
const VALIDATION_RESULT_KEYS = Object.freeze(['suite', 'command', 'status', 'passed', 'failed', 'details']);
function validateValidationResult(result, code = 'PROTOCOL_INVALID') {
  assertKeys(result, VALIDATION_RESULT_KEYS, code);
  validateText(result.suite, 128, false, code);
  validateText(result.command, 512, false, code);
  if (!['passed', 'failed', 'skipped'].includes(result.status)) fail(code);
  validateNonNegativeSafeInteger(result.passed, code);
  validateNonNegativeSafeInteger(result.failed, code);
  validateOptionalText(result.details, MAX_TASK_BYTES, true, code);
  return deepFreeze(result);
}

// Artifact Reference Schema
const ARTIFACT_REF_KEYS = Object.freeze(['id', 'path', 'digest', 'description']);
function validateArtifactRef(artifact, code = 'PROTOCOL_INVALID') {
  assertKeys(artifact, ARTIFACT_REF_KEYS, code);
  validateText(artifact.id, 128, false, code);
  validateSafeRelativePath(artifact.path, code);
  validateDigest(artifact.digest, code);
  validateText(artifact.description, 1024, true, code);
  return deepFreeze(artifact);
}

// Checkpoint V2 Validator
const CHECKPOINT_V2_KEYS = Object.freeze([
  'protocol', 'version', 'task_run_id', 'checkpoint_id', 'phase_id',
  'task_revision', 'evidence_revision', 'checkpoint', 'kind', 'question',
  'task', 'proposal', 'evidence', 'prior'
]);
const TASK_KEYS = Object.freeze(['goal', 'non_goals', 'authorized_paths', 'scope_rationale', 'invariants', 'success_criteria']);
const PROPOSAL_KEYS = Object.freeze(['next_action', 'rationale', 'intended_changed_paths']);
const EVIDENCE_V2_KEYS = Object.freeze(['summary', 'files', 'validation_results', 'artifacts']);
const PRIOR_KEYS = Object.freeze(['prior_consultation_id', 'prior_counsel', 'prior_disposition', 'observed_outcome']);

function validateCheckpointV2(value) {
  assertKeys(value, CHECKPOINT_V2_KEYS);
  if (value.protocol !== CHECKPOINT_PROTOCOL_V2 || value.version !== CHECKPOINT_VERSION_V2) fail();
  validateUuid(value.task_run_id);
  validateText(value.checkpoint_id, 128);
  validateText(value.phase_id, 128);
  validateNonNegativeSafeInteger(value.task_revision);
  validateNonNegativeSafeInteger(value.evidence_revision);
  validateText(value.checkpoint, 128);
  if (!DECISION_KINDS.includes(value.kind)) fail();
  validateText(value.question, MAX_QUESTION_BYTES);

  // task
  assertKeys(value.task, TASK_KEYS);
  validateText(value.task.goal, MAX_TASK_BYTES, true);
  if (!Array.isArray(value.task.non_goals)) fail();
  value.task.non_goals.forEach((item) => validateText(item, MAX_TASK_BYTES, true));
  if (!Array.isArray(value.task.authorized_paths)) fail();
  value.task.authorized_paths.forEach(validateSafeRelativePath);
  if (new Set(value.task.authorized_paths).size !== value.task.authorized_paths.length) fail();
  validateText(value.task.scope_rationale, MAX_TASK_BYTES, true);
  if (!Array.isArray(value.task.invariants)) fail();
  value.task.invariants.forEach((item) => validateText(item, MAX_TASK_BYTES, true));
  if (!Array.isArray(value.task.success_criteria)) fail();
  value.task.success_criteria.forEach((item) => validateText(item, MAX_TASK_BYTES, true));

  // proposal
  assertKeys(value.proposal, PROPOSAL_KEYS);
  validateText(value.proposal.next_action, MAX_TASK_BYTES, true);
  validateText(value.proposal.rationale, MAX_TASK_BYTES, true);
  if (!Array.isArray(value.proposal.intended_changed_paths) || value.proposal.intended_changed_paths.length > MAX_CHANGED_PATHS) fail();
  value.proposal.intended_changed_paths.forEach(validateSafeRelativePath);
  if (new Set(value.proposal.intended_changed_paths).size !== value.proposal.intended_changed_paths.length) fail();

  // evidence
  assertKeys(value.evidence, EVIDENCE_V2_KEYS);
  validateText(value.evidence.summary, MAX_EVIDENCE_TEXT_BYTES, true);
  if (!Array.isArray(value.evidence.files) || value.evidence.files.length > MAX_EVIDENCE_FILES) fail();
  let aggregateEvidenceTextBytes = bytes(value.evidence.summary);
  value.evidence.files.forEach((file) => {
    assertKeys(file, ['path', 'excerpt', 'digest']);
    validateSafeRelativePath(file.path);
    validateText(file.excerpt, MAX_EVIDENCE_TEXT_BYTES, true);
    validateDigest(file.digest);
    aggregateEvidenceTextBytes += bytes(file.excerpt);
  });
  if (new Set(value.evidence.files.map((f) => f.path)).size !== value.evidence.files.length) fail();
  if (!Array.isArray(value.evidence.validation_results) || value.evidence.validation_results.length > 16) fail();
  value.evidence.validation_results.forEach((r) => {
    validateValidationResult(r);
    aggregateEvidenceTextBytes += bytes(r.suite);
    aggregateEvidenceTextBytes += bytes(r.command);
    if (typeof r.details === 'string') {
      aggregateEvidenceTextBytes += bytes(r.details);
    }
  });
  if (!Array.isArray(value.evidence.artifacts) || value.evidence.artifacts.length > 16) fail();
  value.evidence.artifacts.forEach((a) => {
    validateArtifactRef(a);
    aggregateEvidenceTextBytes += bytes(a.id);
    aggregateEvidenceTextBytes += bytes(a.description);
  });
  if (aggregateEvidenceTextBytes > MAX_EVIDENCE_TEXT_BYTES) fail('REQUEST_INVALID');
  // prior
  assertKeys(value.prior, PRIOR_KEYS);
  if (value.prior.prior_consultation_id !== null) validateUuid(value.prior.prior_consultation_id);
  validateOptionalText(value.prior.prior_counsel, MAX_TASK_BYTES, true);
  validateOptionalText(value.prior.prior_disposition, MAX_TASK_BYTES, true);
  validateOptionalText(value.prior.observed_outcome, MAX_TASK_BYTES, true);

  if (bytes(JSON.stringify(value)) > MAX_ENVELOPE_BYTES) fail('REQUEST_INVALID');
  return deepFreeze(value);
}
function computeCheckpointDigestV2(checkpoint) {
  const validated = validateCheckpointV2(checkpoint);
  return createHash('sha256').update(JSON.stringify(validated), 'utf8').digest('hex');
}


// Result V2 Validator
const RESULT_V2_KEYS = Object.freeze([
  'protocol', 'version', 'checkpoint', 'status',
  'recommendation', 'rationale', 'must_fix', 'cautions',
  'assumptions', 'success_checks', 'unresolved_questions'
]);
const ADVISOR_BODY_KEYS_V2 = Object.freeze([
  'recommendation', 'rationale', 'must_fix', 'cautions',
  'assumptions', 'success_checks', 'unresolved_questions'
]);

function validateResultBodyV2(body) {
  assertKeys(body, ADVISOR_BODY_KEYS_V2);
  validateText(body.recommendation, MAX_RESULT_BODY_BYTES, true);
  validateText(body.rationale, MAX_RESULT_BODY_BYTES, true);
  ['must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'].forEach((listKey) => {
    if (!Array.isArray(body[listKey])) fail();
    body[listKey].forEach((item) => validateText(item, MAX_RESULT_BODY_BYTES, true));
  });
  if (bytes(JSON.stringify(body)) > MAX_RESULT_BODY_BYTES) fail();
  return deepFreeze(body);
}

const FENCE_PATTERN = /(?:^|\n)\s*```/u;

function parseAdviceBody(text) {
  if (typeof text !== 'string' || !text || text.trim() !== text) {
    fail('PROTOCOL_INVALID');
  }
  if (FENCE_PATTERN.test(text)) {
    fail('PROTOCOL_INVALID');
  }
  let body;
  try {
    body = parseJsonDocument(text, 'PROTOCOL_INVALID', 'PROTOCOL_INVALID');
  } catch {
    fail('PROTOCOL_INVALID');
  }
  if (!isPlainObject(body)) {
    fail('PROTOCOL_INVALID');
  }
  return validateResultBodyV2(body);
}
function validateResultV2(value) {
  assertKeys(value, RESULT_V2_KEYS);
  if (value.protocol !== RESULT_PROTOCOL_V2 || value.version !== RESULT_VERSION_V2 || value.status !== 'ADVICE_READY') fail();
  validateText(value.checkpoint, 128);
  validateResultBodyV2({
    recommendation: value.recommendation,
    rationale: value.rationale,
    must_fix: value.must_fix,
    cautions: value.cautions,
    assumptions: value.assumptions,
    success_checks: value.success_checks,
    unresolved_questions: value.unresolved_questions
  });
  if (bytes(JSON.stringify(value)) > MAX_ENVELOPE_BYTES) fail();
  return deepFreeze(value);
}

// Attempt Outcome Validator
const ATTEMPT_KEYS = Object.freeze([
  'attempt_id', 'slot', 'route', 'phase', 'model_started',
  'elapsed_ms', 'terminal_classification', 'retry_delay_ms', 'cleanup_outcome'
]);

function validateAttemptOutcome(attempt) {
  assertKeys(attempt, ATTEMPT_KEYS);
  validateText(attempt.attempt_id, 128);
  if (!ATTEMPT_SLOTS.includes(attempt.slot)) fail();
  validateRouteTriple(attempt.route);
  if (!ATTEMPT_PHASES.includes(attempt.phase)) fail();
  if (typeof attempt.model_started !== 'boolean') fail();
  validateNonNegativeSafeInteger(attempt.elapsed_ms);
  if (!TERMINAL_CLASSIFICATIONS.includes(attempt.terminal_classification)) fail();
  if (attempt.retry_delay_ms !== null) {
    validateNonNegativeSafeInteger(attempt.retry_delay_ms);
  }
  if (!CLEANUP_OUTCOMES.includes(attempt.cleanup_outcome)) fail();
  return deepFreeze(attempt);
}

// Envelope V2 Validator
const ENVELOPE_V2_SUCCESS_KEYS = Object.freeze([
  'protocol', 'version', 'correlation_id', 'task_run_id', 'checkpoint_id',
  'task_revision', 'evidence_revision', 'checkpoint_digest',
  'status', 'receipt', 'attempts', 'result', 'audit_status'
]);
const ENVELOPE_V2_FAILURE_KEYS = Object.freeze([
  'protocol', 'version', 'correlation_id', 'task_run_id', 'checkpoint_id',
  'task_revision', 'evidence_revision', 'checkpoint_digest',
  'status', 'receipt', 'attempts', 'error', 'audit_status'
]);
const RECEIPT_V2_KEYS = Object.freeze([
  'backend', 'model', 'effort', 'controller_version', 'adapter_version',
  'build_identity', 'elapsed_ms'
]);

function validateReceiptV2(receipt) {
  assertKeys(receipt, RECEIPT_V2_KEYS);
  if (receipt.backend !== null && !CANDIDATE_BACKENDS.includes(receipt.backend)) fail();
  validateOptionalText(receipt.backend, 32);
  validateOptionalText(receipt.model, 256);
  validateOptionalText(receipt.effort, 64);
  if (receipt.controller_version !== CONTROLLER_VERSION_V2) fail();
  validateOptionalText(receipt.adapter_version, 128);
  validateOptionalText(receipt.build_identity, 128);
  validateNonNegativeSafeInteger(receipt.elapsed_ms);
  return deepFreeze(receipt);
}

function validateEnvelopeV2(value, context = {}) {
  if (!isPlainObject(value)) fail('PROCESS_FAILED');
  const isSuccess = value.status === 'ADVICE_READY';
  assertKeys(value, isSuccess ? ENVELOPE_V2_SUCCESS_KEYS : ENVELOPE_V2_FAILURE_KEYS, 'PROCESS_FAILED');
  if (value.protocol !== CONTROLLER_PROTOCOL_V2 || value.version !== CONTROLLER_VERSION_V2) fail('PROCESS_FAILED');
  validateUuid(value.correlation_id, 'PROCESS_FAILED');
  validateUuid(value.task_run_id, 'PROCESS_FAILED');
  validateText(value.checkpoint_id, 128, false, 'PROCESS_FAILED');
  validateNonNegativeSafeInteger(value.task_revision, 'PROCESS_FAILED');
  validateNonNegativeSafeInteger(value.evidence_revision, 'PROCESS_FAILED');
  validateDigest(value.checkpoint_digest, 'PROCESS_FAILED');
  validateReceiptV2(value.receipt);

  if (!Array.isArray(value.attempts) || value.attempts.length > MAX_TOTAL_ATTEMPT_SUMMARIES) fail('PROCESS_FAILED');
  value.attempts.forEach(validateAttemptOutcome);
  if (new Set(value.attempts.map((a) => a.attempt_id)).size !== value.attempts.length) fail('PROCESS_FAILED');
  const modelStartedAttempts = value.attempts.filter((a) => a.model_started);
  if (modelStartedAttempts.length > MAX_MODEL_ATTEMPTS) fail('PROCESS_FAILED');

  if (!AUDIT_STATUSES.includes(value.audit_status)) fail('PROCESS_FAILED');
  if (isSuccess) {
    const successfulAttempt = value.attempts.find(
      (a) => a.terminal_classification === 'success' && a.cleanup_outcome === 'confirmed'
    );
    if (!successfulAttempt) fail('PROCESS_FAILED');
    if (!successfulAttempt.model_started || successfulAttempt.phase !== 'model') {
      fail('PROCESS_FAILED');
    }
    if (value.receipt.backend === null || value.receipt.model === null) {
      fail('PROCESS_FAILED');
    }
    if (successfulAttempt.route.backend !== value.receipt.backend || successfulAttempt.route.model !== value.receipt.model) {
      fail('PROCESS_FAILED');
    }
    if (successfulAttempt.route.effort !== value.receipt.effort) {
      fail('PROCESS_FAILED');
    }
    if (value.receipt.build_identity === null) {
      fail('PROCESS_FAILED');
    }
    validateResultV2(value.result);
  } else if (value.status === 'FAILED') {
    validateSanitizedError(value.error, 'PROCESS_FAILED');
  } else {
    fail('PROCESS_FAILED');
  }
  if (context?.checkpoint) {
    const chk = context.checkpoint;
    if (value.task_run_id !== chk.task_run_id) fail('PROCESS_FAILED');
    if (value.checkpoint_id !== chk.checkpoint_id) fail('PROCESS_FAILED');
    if (value.task_revision !== chk.task_revision) fail('PROCESS_FAILED');
    if (value.evidence_revision !== chk.evidence_revision) fail('PROCESS_FAILED');
    const expectedDigest = computeCheckpointDigestV2(chk);
    if (value.checkpoint_digest !== expectedDigest) fail('PROCESS_FAILED');
    if (isSuccess && value.result && value.result.checkpoint !== chk.checkpoint) fail('PROCESS_FAILED');
  }
  const expectedBuildId = context?.expected_build_identity ?? context?.build_identity;
  if (expectedBuildId !== undefined && expectedBuildId !== null) {
    if (value.receipt.build_identity !== expectedBuildId) fail('PROCESS_FAILED');
  }
  if (bytes(JSON.stringify(value)) > MAX_ENVELOPE_BYTES) fail('PROCESS_FAILED');
  return deepFreeze(value);
}

// Task State V1 Validator
const TASK_STATE_V1_KEYS = Object.freeze([
  'schema_version', 'task_run_id', 'project_id', 'task_revision',
  'phase_id', 'gate_status', 'unresolved_episode_id', 'correction_count',
  'pending_consultation_id', 'last_consultation_id', 'disposition', 'outcome'
]);

function validateTaskStateV1(state) {
  assertKeys(state, TASK_STATE_V1_KEYS, 'STALE_STATE_REVISION');
  if (state.schema_version !== STATE_VERSION_V1) fail('STALE_STATE_REVISION');
  validateUuid(state.task_run_id, 'STALE_STATE_REVISION');
  validateText(state.project_id, 128, false, 'STALE_STATE_REVISION');
  validateNonNegativeSafeInteger(state.task_revision, 'STALE_STATE_REVISION');
  validateText(state.phase_id, 128, false, 'STALE_STATE_REVISION');
  if (!GATE_STATUSES.includes(state.gate_status)) fail('STALE_STATE_REVISION');
  validateOptionalText(state.unresolved_episode_id, 128, false, 'STALE_STATE_REVISION');
  if (!Number.isSafeInteger(state.correction_count) || state.correction_count < 0 || state.correction_count > MAX_CORRECTION_CYCLES) {
    fail('STALE_STATE_REVISION');
  }
  if (state.pending_consultation_id !== null) validateUuid(state.pending_consultation_id, 'STALE_STATE_REVISION');
  if (state.last_consultation_id !== null) validateUuid(state.last_consultation_id, 'STALE_STATE_REVISION');
  validateOptionalText(state.disposition, 2048, true, 'STALE_STATE_REVISION');
  validateOptionalText(state.outcome, 2048, true, 'STALE_STATE_REVISION');
  if (bytes(JSON.stringify(state)) > MAX_STATE_BYTES) fail('STALE_STATE_REVISION');
  return deepFreeze(state);
}

// History Execution V1 Validator
const HISTORY_EXECUTION_V1_KEYS = Object.freeze([
  'schema_version', 'consultation_id', 'task_run_id', 'project_id',
  'checkpoint_digest', 'route', 'attempts', 'status', 'result', 'error',
  'started_at', 'completed_at'
]);

function validateHistoryExecutionV1(execution) {
  assertKeys(execution, HISTORY_EXECUTION_V1_KEYS, 'AUDIT_DEGRADED');
  if (execution.schema_version !== HISTORY_VERSION_V1) fail('AUDIT_DEGRADED');
  validateUuid(execution.consultation_id, 'AUDIT_DEGRADED');
  validateUuid(execution.task_run_id, 'AUDIT_DEGRADED');
  validateText(execution.project_id, 128, false, 'AUDIT_DEGRADED');
  validateDigest(execution.checkpoint_digest, 'AUDIT_DEGRADED');
  validateRouteTriple(execution.route, 'AUDIT_DEGRADED');
  if (!Array.isArray(execution.attempts) || execution.attempts.length > MAX_TOTAL_ATTEMPT_SUMMARIES) fail('AUDIT_DEGRADED');
  execution.attempts.forEach(validateAttemptOutcome);
  if (new Set(execution.attempts.map((a) => a.attempt_id)).size !== execution.attempts.length) fail('AUDIT_DEGRADED');
  const modelStartedAttempts = execution.attempts.filter((a) => a.model_started);
  if (modelStartedAttempts.length > MAX_MODEL_ATTEMPTS) fail('AUDIT_DEGRADED');

  if (!EXECUTION_STATUSES.includes(execution.status)) fail('AUDIT_DEGRADED');
  validateNonNegativeSafeInteger(execution.started_at, 'AUDIT_DEGRADED');
  if (execution.started_at === 0) fail('AUDIT_DEGRADED');

  if (execution.status === 'started') {
    if (execution.result !== null || execution.error !== null || execution.completed_at !== null) {
      fail('AUDIT_DEGRADED');
    }
  } else if (execution.status === 'ADVICE_READY') {
    if (execution.result === null || execution.error !== null) fail('AUDIT_DEGRADED');
    validateResultV2(execution.result);
    validateNonNegativeSafeInteger(execution.completed_at, 'AUDIT_DEGRADED');
    if (execution.completed_at < execution.started_at) fail('AUDIT_DEGRADED');
  } else if (execution.status === 'FAILED') {
    if (execution.error === null || execution.result !== null) fail('AUDIT_DEGRADED');
    validateSanitizedError(execution.error, 'AUDIT_DEGRADED');
    validateNonNegativeSafeInteger(execution.completed_at, 'AUDIT_DEGRADED');
    if (execution.completed_at < execution.started_at) fail('AUDIT_DEGRADED');
  }

  if (bytes(JSON.stringify(execution)) > MAX_EXECUTION_HISTORY_BYTES) fail('AUDIT_DEGRADED');
  return deepFreeze(execution);
}

// History Outcome V1 Validator
const HISTORY_OUTCOME_V1_KEYS = Object.freeze([
  'schema_version', 'consultation_id', 'task_run_id', 'disposition',
  'actual_changes_revision', 'validation_reference', 'outcome',
  'correction_number', 'recorded_at'
]);

function validateHistoryOutcomeV1(outcome) {
  assertKeys(outcome, HISTORY_OUTCOME_V1_KEYS, 'AUDIT_DEGRADED');
  if (outcome.schema_version !== HISTORY_VERSION_V1) fail('AUDIT_DEGRADED');
  validateUuid(outcome.consultation_id, 'AUDIT_DEGRADED');
  validateUuid(outcome.task_run_id, 'AUDIT_DEGRADED');
  validateText(outcome.disposition, 4096, true, 'AUDIT_DEGRADED');
  validateNonNegativeSafeInteger(outcome.actual_changes_revision, 'AUDIT_DEGRADED');
  validateText(outcome.validation_reference, 512, false, 'AUDIT_DEGRADED');
  if (!OUTCOME_RESULTS.includes(outcome.outcome)) fail('AUDIT_DEGRADED');
  if (!Number.isSafeInteger(outcome.correction_number) || outcome.correction_number < 1 || outcome.correction_number > MAX_CORRECTION_CYCLES) {
    fail('AUDIT_DEGRADED');
  }
  validateNonNegativeSafeInteger(outcome.recorded_at, 'AUDIT_DEGRADED');
  if (outcome.recorded_at === 0) fail('AUDIT_DEGRADED');
  if (bytes(JSON.stringify(outcome)) > MAX_OUTCOME_HISTORY_BYTES) fail('AUDIT_DEGRADED');
  return deepFreeze(outcome);
}

module.exports = {
  CHECKPOINT_PROTOCOL_V2,
  CHECKPOINT_VERSION_V2,
  RESULT_PROTOCOL_V2,
  RESULT_VERSION_V2,
  CONTROLLER_PROTOCOL_V2,
  CONTROLLER_VERSION_V2,
  STATE_PROTOCOL_V1,
  STATE_VERSION_V1,
  HISTORY_PROTOCOL_V1,
  HISTORY_VERSION_V1,
  MAX_ENVELOPE_BYTES,
  MAX_QUESTION_BYTES,
  MAX_TASK_BYTES,
  MAX_EVIDENCE_TEXT_BYTES,
  MAX_RESULT_BODY_BYTES,
  MAX_STATE_BYTES,
  MAX_EXECUTION_HISTORY_BYTES,
  MAX_OUTCOME_HISTORY_BYTES,
  MAX_EVIDENCE_FILES,
  MAX_CHANGED_PATHS,
  MAX_MODEL_ATTEMPTS,
  MAX_TOTAL_ATTEMPT_SUMMARIES,
  MAX_CORRECTION_CYCLES,
  DECISION_KINDS,
  GATE_STATUSES,
  ATTEMPT_SLOTS,
  ATTEMPT_PHASES,
  TERMINAL_CLASSIFICATIONS,
  CLEANUP_OUTCOMES,
  AUDIT_STATUSES,
  OUTCOME_RESULTS,
  EXECUTION_STATUSES,
  PRIMARY_RETRY_SCHEDULE_MS,
  BACKUP_ATTEMPTS_LIMIT,
  validateCheckpointV2,
  validateResultBodyV2,
  parseAdviceBody,
  validateResultV2,
  validateAttemptOutcome,
  validateEnvelopeV2,
  validateReceiptV2,
  validateSanitizedError,
  validateValidationResult,
  validateArtifactRef,
  validateTaskStateV1,
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  validateNonNegativeSafeInteger,
  deepFreeze,
  computeCheckpointDigestV2,
};
