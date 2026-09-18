'use strict';

const { createHash } = require('node:crypto');
const { createRoutingError, ERROR_CATALOG } = require('./errors.cjs');
const { parseJsonDocument } = require('./json-document.cjs');
const gen = require('./generated/advisor-contract-runtime.js');

const {
  CHECKPOINT_PROTOCOL_V2, CHECKPOINT_VERSION_V2, RESULT_PROTOCOL_V2, RESULT_VERSION_V2,
  CONTROLLER_PROTOCOL_V2, CONTROLLER_VERSION_V2,
  HISTORY_PROTOCOL_V1, HISTORY_VERSION_V1, MAX_ENVELOPE_BYTES, MAX_QUESTION_BYTES,
  MAX_TASK_BYTES, MAX_EVIDENCE_TEXT_BYTES, MAX_RESULT_BODY_BYTES, MAX_STATE_BYTES,
  MAX_EXECUTION_HISTORY_BYTES, MAX_OUTCOME_HISTORY_BYTES, MAX_EVIDENCE_FILES,
  MAX_CHANGED_PATHS, MAX_MODEL_ATTEMPTS, MAX_TOTAL_ATTEMPT_SUMMARIES, MAX_CORRECTION_CYCLES,
  DECISION_KINDS, ATTEMPT_SLOTS, ATTEMPT_PHASES, TERMINAL_CLASSIFICATIONS,
  CLEANUP_OUTCOMES, AUDIT_STATUSES, OUTCOME_RESULTS, EXECUTION_STATUSES,
  deepFreeze, AdvisorContractError
} = gen;

const STATE_PROTOCOL_V1 = 'evcrate-advisor-state';
const STATE_VERSION_V1 = 1;
const GATE_STATUSES = Object.freeze(['open', 'needs_evidence', 'in_consultation', 'needs_human', 'completed']);
const PRIMARY_RETRY_SCHEDULE_MS = Object.freeze([10000, 20000, 30000]);
const BACKUP_ATTEMPTS_LIMIT = 1;
const SENSITIVE_PATTERN = /(?:-----BEGIN[^\n]*PRIVATE KEY-----|["']?(?:api[_ -]?key|secret|password|token|credential)["']?\s*[:=]|["']?(?:raw\s+)?stderr["']?\s*[:=]|["']?stack\s+trace["']?\s*[:=]|\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/]+={0,2}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b|\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b)/iu;
const FENCE_PATTERN = /(?:^|\n)\s*```/u;

function fail(code = 'PROTOCOL_INVALID') { throw createRoutingError(code); }

function validateNonNegativeSafeInteger(value, code = 'PROTOCOL_INVALID') {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function validateArtifactRef(artifact, code = 'PROTOCOL_INVALID') {
  try { return gen.validateArtifactRef(artifact); } catch { fail(code); }
}

function validateCheckpointV2(checkpoint, code = 'PROTOCOL_INVALID') {
  try { return gen.validateCheckpointV2(checkpoint); }
  catch (err) {
    if (err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_SIZE_EXCEEDED' && code === 'PROTOCOL_INVALID') fail('REQUEST_INVALID');
    fail(code);
  }
}
function computeCheckpointDigestV2(checkpoint) {
  const validated = validateCheckpointV2(checkpoint);
  return createHash('sha256').update(JSON.stringify(validated), 'utf8').digest('hex');
}

function validateResultBodyV2(body) {
  try { return gen.validateResultBodyV2(body); } catch { fail('PROTOCOL_INVALID'); }
}

function parseAdviceBody(text) {
  if (typeof text !== 'string' || !text || text.trim() !== text || FENCE_PATTERN.test(text)) fail('PROTOCOL_INVALID');
  let body;
  try { body = parseJsonDocument(text, 'PROTOCOL_INVALID', 'PROTOCOL_INVALID'); } catch { fail('PROTOCOL_INVALID'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) fail('PROTOCOL_INVALID');
  return validateResultBodyV2(body);
}

function validateResultV2(result) {
  try { return gen.validateResultV2(result); } catch { fail('PROTOCOL_INVALID'); }
}

function validateReceiptV2(receipt) {
  try { return gen.validateReceiptV2(receipt); } catch { fail('PROTOCOL_INVALID'); }
}

function validateAttemptOutcome(attempt) {
  try { return gen.validateAttemptOutcome(attempt); } catch { fail('PROTOCOL_INVALID'); }
}

function validateSanitizedError(error, code = 'PROCESS_FAILED') {
  if (!error || typeof error !== 'object' || Array.isArray(error)) fail(code);
  const keys = Object.keys(error);
  if (keys.length !== 4 || !['code', 'category', 'action', 'message'].every((k) => keys.includes(k))) fail(code);
  if (typeof error.code !== 'string' || !Object.hasOwn(ERROR_CATALOG, error.code)) fail(code);
  const entry = ERROR_CATALOG[error.code];
  if (error.category !== entry.category || error.action !== entry.action || error.message !== entry.message) fail(code);
  return deepFreeze({ code: error.code, category: entry.category, action: entry.action, message: entry.message });
}

function validateEnvelopeV2(value, context = {}) {
  let validated;
  try { validated = gen.validateEnvelopeV2(value); } catch { fail('PROCESS_FAILED'); }
  if (value.status === 'ADVICE_READY') {
    const success = value.attempts.find((a) => a.terminal_classification === 'success' && a.cleanup_outcome === 'confirmed');
    if (!success || !success.model_started || success.phase !== 'model') fail('PROCESS_FAILED');
    if (!value.receipt || value.receipt.backend === null || value.receipt.model === null) fail('PROCESS_FAILED');
    if (success.route.backend !== value.receipt.backend || success.route.model !== value.receipt.model || success.route.effort !== value.receipt.effort) fail('PROCESS_FAILED');
    if (value.receipt.build_identity === null) fail('PROCESS_FAILED');
  } else if (value.status === 'FAILED') {
    validateSanitizedError(value.error, 'PROCESS_FAILED');
  }
  if (context?.checkpoint) {
    const chk = context.checkpoint;
    if (value.task_run_id !== chk.task_run_id || value.checkpoint_id !== chk.checkpoint_id
      || value.task_revision !== chk.task_revision || value.evidence_revision !== chk.evidence_revision) fail('PROCESS_FAILED');
    if (value.checkpoint_digest !== computeCheckpointDigestV2(chk)) fail('PROCESS_FAILED');
    if (value.status === 'ADVICE_READY' && value.result && value.result.checkpoint !== chk.checkpoint) fail('PROCESS_FAILED');
  }
  const expBuild = context?.expected_build_identity ?? context?.build_identity;
  if (expBuild !== undefined && expBuild !== null && value.receipt?.build_identity !== expBuild) fail('PROCESS_FAILED');
  return validated;
}

function validateTaskStateV1(state) {
  return require('./state-contract.cjs').validateTaskStateV1(state);
}

function validateHistoryExecutionV1(execution) {
  try { return gen.validateHistoryExecutionV1(execution, computeCheckpointDigestV2); } catch { fail('AUDIT_DEGRADED'); }
}

function validateHistoryOutcomeV1(outcome) {
  try { return gen.validateHistoryOutcomeV1(outcome); } catch { fail('AUDIT_DEGRADED'); }
}

function validateValidationResult(result, code = 'PROTOCOL_INVALID') {
  try { return gen.validateValidationResult(result); } catch { fail(code); }
}

module.exports = {
  CHECKPOINT_PROTOCOL_V2, CHECKPOINT_VERSION_V2, RESULT_PROTOCOL_V2, RESULT_VERSION_V2,
  CONTROLLER_PROTOCOL_V2, CONTROLLER_VERSION_V2, STATE_PROTOCOL_V1, STATE_VERSION_V1,
  HISTORY_PROTOCOL_V1, HISTORY_VERSION_V1, MAX_ENVELOPE_BYTES, MAX_QUESTION_BYTES,
  MAX_TASK_BYTES, MAX_EVIDENCE_TEXT_BYTES, MAX_RESULT_BODY_BYTES, MAX_STATE_BYTES,
  MAX_EXECUTION_HISTORY_BYTES, MAX_OUTCOME_HISTORY_BYTES, MAX_EVIDENCE_FILES,
  MAX_CHANGED_PATHS, MAX_MODEL_ATTEMPTS, MAX_TOTAL_ATTEMPT_SUMMARIES, MAX_CORRECTION_CYCLES,
  DECISION_KINDS, GATE_STATUSES, ATTEMPT_SLOTS, ATTEMPT_PHASES, TERMINAL_CLASSIFICATIONS,
  CLEANUP_OUTCOMES, AUDIT_STATUSES, OUTCOME_RESULTS, EXECUTION_STATUSES,
  PRIMARY_RETRY_SCHEDULE_MS, BACKUP_ATTEMPTS_LIMIT, SENSITIVE_PATTERN,
  validateCheckpointV2, validateResultBodyV2, parseAdviceBody, validateResultV2,
  validateAttemptOutcome, validateEnvelopeV2, validateReceiptV2, validateSanitizedError,
  validateValidationResult, validateArtifactRef, validateTaskStateV1,
  validateHistoryExecutionV1, validateHistoryOutcomeV1, validateNonNegativeSafeInteger,
  deepFreeze, computeCheckpointDigestV2
};
