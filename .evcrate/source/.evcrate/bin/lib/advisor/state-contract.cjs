'use strict';

const { createHash } = require('node:crypto');
const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');
const {
  MAX_STATE_BYTES, GATE_STATUSES, validateCheckpointV2, computeCheckpointDigestV2,
  validateValidationResult, validateReceiptV2, deepFreeze
} = require('./contracts-v2.cjs');
const { validateBaseline } = require('./state-baseline.cjs');

const OPERATIONS = Object.freeze(['init', 'get', 'checkpoint', 'disposition', 'outcome', 'human-decision', 'complete']);
const MAX_OPERATIONS = 64;
const MAX_HUMAN_DECISIONS = 16;
const STATE_KEYS = Object.freeze([
  'schema_version', 'task_run_id', 'project_id', 'task_revision', 'phase_id', 'gate_status',
  'unresolved_episode_id', 'correction_count', 'pending_consultation_id', 'last_consultation_id',
  'disposition', 'outcome', 'task', 'initial_baseline', 'scope_revision', 'scope',
  'evidence_revision', 'current_baseline', 'pending', 'last_terminal', 'correction',
  'episode_validation_command', 'human_continuation', 'operation_ledger', 'human_decisions'
]);
const PAYLOAD_KEYS = Object.freeze({
  init: ['phase_id', 'task', 'baseline_paths'], get: [], checkpoint: ['checkpoint'],
  disposition: ['consultation_id', 'evidence_revision', 'action', 'rationale', 'correction'],
  outcome: ['consultation_id', 'action_id', 'episode_id', 'result', 'validation', 'actual_changed_paths'],
  'human-decision': ['action', 'rationale', 'authorized_paths'], complete: []
});
const DISPOSITIONS = Object.freeze(['accept', 'reject-with-evidence', 'need-evidence', 'reconcile']);
const HUMAN_ACTIONS = Object.freeze(['continue', 'revise-scope', 'abandon', 'recover-pending']);
const fail = (code = 'STATE_INVALID') => { throw createRoutingError(code); };
function keys(value, expected) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== expected.length || Object.keys(value).some((key) => !expected.includes(key))) fail();
}
function text(value, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value
    || Buffer.byteLength(value) > max || /[\u0000-\u001f\u007f]/u.test(value)) fail();
}
function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) fail();
}
function integer(value) { if (!Number.isSafeInteger(value) || value < 0) fail(); }
function digest(value) { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail(); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function equal(left, right) { return canonical(left) === canonical(right); }
function paths(value) {
  if (!Array.isArray(value) || value.length > 32 || new Set(value).size !== value.length) fail();
  // Reuse the checkpoint's path policy, including sensitive and metadata paths.
  validateTask({ goal: 'State scope', non_goals: [], authorized_paths: value, scope_rationale: 'Selected files', invariants: [], success_criteria: [] });
}
function validateTask(task) {
  validateCheckpointV2({
    protocol: 'evcrate-advisor-checkpoint', version: 2,
    task_run_id: '00000000-0000-4000-8000-000000000000', checkpoint_id: 'state-contract', phase_id: 'state',
    task_revision: 0, evidence_revision: 0, checkpoint: 'state', kind: 'direction', question: 'Validate the task contract.',
    task, proposal: { next_action: 'Inspect state', rationale: 'Validate state', intended_changed_paths: [] },
    evidence: { summary: 'Task contract validation', files: [], validation_results: [], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  });
  if (task.authorized_paths.length > 32) fail();
}
function rationale(value) {
  // The checkpoint text policy also rejects credentials, stacks and unsafe controls.
  validateTask({ goal: 'State decision', non_goals: [], authorized_paths: [], scope_rationale: value, invariants: [], success_criteria: [] });
}
function validateCorrectionChoice(value) {
  keys(value, ['action_id', 'episode_id', 'validation_command']);
  uuid(value.action_id); text(value.episode_id); text(value.validation_command, 512);
}
function validateDisposition(value) {
  keys(value, PAYLOAD_KEYS.disposition);
  uuid(value.consultation_id); integer(value.evidence_revision);
  if (!DISPOSITIONS.includes(value.action)) fail();
  rationale(value.rationale);
  if (value.correction !== null) {
    validateCorrectionChoice(value.correction);
    if (value.action !== 'accept') fail();
  }
}
function validateOutcome(value) {
  keys(value, PAYLOAD_KEYS.outcome);
  uuid(value.consultation_id);
  if (value.action_id === null) {
    if (value.episode_id !== null || !['resolved', 'unknown'].includes(value.result)) fail();
  } else { uuid(value.action_id); text(value.episode_id); }
  if (!['resolved', 'unresolved', 'regressed', 'unknown'].includes(value.result)) fail();
  validateValidationResult(value.validation, 'STATE_INVALID');
  paths(value.actual_changed_paths);
  if (value.validation.status === 'passed' && value.validation.failed !== 0) fail();
  if (value.result === 'resolved' && value.validation.status !== 'passed') fail();
  if (['unresolved', 'regressed'].includes(value.result) && value.validation.status !== 'failed') fail();
  if (value.result !== 'unknown' && value.validation.status === 'skipped') fail();
}
function validateHumanPayload(value) {
  keys(value, PAYLOAD_KEYS['human-decision']);
  if (!HUMAN_ACTIONS.includes(value.action)) fail();
  rationale(value.rationale); paths(value.authorized_paths);
  if ((value.action === 'revise-scope') !== (value.authorized_paths.length > 0)) fail();
}
function assertJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return;
  if (typeof value !== 'object' || seen.has(value) || seen.size >= 32
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
    || Object.getOwnPropertySymbols(value).length !== 0) fail();
  seen.add(value);
  const names = Object.keys(value);
  if (Array.isArray(value) && (names.length !== value.length || names.some((key, index) => key !== String(index)))) fail();
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!Object.hasOwn(descriptor, 'value')) fail();
    assertJsonValue(descriptor.value, seen);
  }
  seen.delete(value);
}
function parseStateRequest(input) {
  let encoded;
  try {
    if (Buffer.isBuffer(input) && input.length > MAX_STATE_BYTES) fail();
    if (!Buffer.isBuffer(input) && typeof input !== 'string') assertJsonValue(input);
    encoded = Buffer.isBuffer(input) ? decodeUtf8(input, 'STATE_INVALID')
      : typeof input === 'string' ? input : JSON.stringify(input);
  } catch { fail(); }
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > MAX_STATE_BYTES) fail();
  const request = parseJsonDocument(encoded, 'STATE_INVALID', 'STATE_INVALID');
  keys(request, ['protocol', 'version', 'operation', 'task_run_id', 'operation_id', 'expected_revision', 'payload']);
  if (request.protocol !== 'evcrate-advisor-state' || request.version !== 1 || !OPERATIONS.includes(request.operation)) fail();
  uuid(request.task_run_id);
  if (request.operation === 'get') {
    if (request.operation_id !== null || request.expected_revision !== null) fail();
  } else { uuid(request.operation_id); integer(request.expected_revision); }
  keys(request.payload, PAYLOAD_KEYS[request.operation]);
  const payload = request.payload;
  if (request.operation === 'init') {
    text(payload.phase_id); validateTask(payload.task); paths(payload.baseline_paths);
    if (request.expected_revision !== 0) fail('STALE_STATE_REVISION');
  } else if (request.operation === 'checkpoint') validateCheckpointV2(payload.checkpoint, 'REQUEST_INVALID');
  else if (request.operation === 'disposition') validateDisposition(payload);
  else if (request.operation === 'outcome') validateOutcome(payload);
  else if (request.operation === 'human-decision') validateHumanPayload(payload);
  return deepFreeze(request);
}
function effectiveTask(state) {
  return { ...state.task, authorized_paths: state.scope.authorized_paths, scope_rationale: state.scope.rationale };
}
function validateProcess(value) {
  if (value === null) return;
  keys(value, ['pid', 'start']); integer(value.pid);
  if (value.pid === 0) fail();
  if (value.start !== null && (typeof value.start !== 'string' || !/^\d{1,32}$/u.test(value.start))) fail();
}
function validateTerminal(value, state) {
  keys(value, ['consultation_id', 'status', 'checkpoint_id', 'checkpoint_digest', 'task_revision', 'evidence_revision',
    'scope_revision', 'result_digest', 'envelope_digest', 'receipt', 'has_concerns', 'validation_commands', 'intended_changed_paths']);
  uuid(value.consultation_id); text(value.checkpoint_id); digest(value.checkpoint_digest); digest(value.envelope_digest);
  integer(value.task_revision); integer(value.evidence_revision); integer(value.scope_revision);
  if (value.task_revision >= state.task_revision || value.evidence_revision > state.evidence_revision || value.scope_revision > state.scope_revision) fail();
  if (!['ADVICE_READY', 'FAILED'].includes(value.status) || typeof value.has_concerns !== 'boolean') fail();
  validateReceiptV2(value.receipt);
  if (value.status === 'ADVICE_READY') {
    digest(value.result_digest);
    if (value.receipt.backend === null || value.receipt.model === null || value.receipt.build_identity === null) fail();
  } else if (value.result_digest !== null || value.has_concerns) fail();
  if (!Array.isArray(value.validation_commands) || value.validation_commands.length > 16
    || new Set(value.validation_commands).size !== value.validation_commands.length) fail();
  value.validation_commands.forEach((command) => text(command, 512));
  paths(value.intended_changed_paths);
  if (value.intended_changed_paths.some((path) => !state.scope.authorized_paths.includes(path))) fail();
}
function validateState(value) {
  keys(value, STATE_KEYS);
  if (value.schema_version !== 1) fail();
  uuid(value.task_run_id); digest(value.project_id); text(value.phase_id); integer(value.task_revision);
  if (value.task_revision === 0 || !GATE_STATUSES.includes(value.gate_status)) fail();
  integer(value.scope_revision); integer(value.evidence_revision); integer(value.correction_count);
  if (value.scope_revision > value.task_revision || value.evidence_revision > value.task_revision || value.correction_count > 3) fail();
  validateTask(value.task); validateBaseline(value.initial_baseline); validateBaseline(value.current_baseline);
  keys(value.scope, ['authorized_paths', 'rationale', 'added_baseline']);
  paths(value.scope.authorized_paths); rationale(value.scope.rationale); validateBaseline(value.scope.added_baseline);
  const originalPaths = value.initial_baseline.map((record) => record.path);
  const addedPaths = value.scope.added_baseline.map((record) => record.path);
  const currentPaths = value.current_baseline.map((record) => record.path);
  paths(originalPaths); paths(addedPaths); paths(currentPaths);
  if (value.task.authorized_paths.some((path) => !originalPaths.includes(path) || !value.scope.authorized_paths.includes(path))
    || addedPaths.some((path) => originalPaths.includes(path) || !value.scope.authorized_paths.includes(path))
    || value.scope.authorized_paths.some((path) => !originalPaths.includes(path) && !addedPaths.includes(path))
    || !equal([...originalPaths, ...addedPaths].sort(), [...currentPaths].sort())) fail();
  if (value.scope_revision === 0 && (!equal(value.scope.authorized_paths, value.task.authorized_paths)
    || value.scope.rationale !== value.task.scope_rationale || addedPaths.length !== 0)) fail();
  if (value.unresolved_episode_id !== null) text(value.unresolved_episode_id);
  if (value.episode_validation_command !== null) text(value.episode_validation_command, 512);
  if ((value.unresolved_episode_id === null) !== (value.episode_validation_command === null)
    || (value.unresolved_episode_id === null && (value.correction_count !== 0 || value.correction !== null || value.human_continuation !== null))) fail();
  if (value.pending_consultation_id !== null) uuid(value.pending_consultation_id);
  if (value.last_consultation_id !== null) uuid(value.last_consultation_id);
  if ((value.pending === null) !== (value.pending_consultation_id === null)
    || (value.pending !== null) !== (value.gate_status === 'in_consultation')) fail();
  if (value.pending !== null) {
    const pending = value.pending;
    keys(pending, ['consultation_id', 'checkpoint', 'checkpoint_digest', 'baseline', 'process']);
    uuid(pending.consultation_id); digest(pending.checkpoint_digest); validateProcess(pending.process);
    validateCheckpointV2(pending.checkpoint); validateBaseline(pending.baseline);
    const checkpoint = pending.checkpoint;
    if (pending.consultation_id !== value.pending_consultation_id || pending.checkpoint_digest !== computeCheckpointDigestV2(checkpoint)
      || checkpoint.task_run_id !== value.task_run_id || checkpoint.phase_id !== value.phase_id
      || checkpoint.task_revision >= value.task_revision || checkpoint.evidence_revision !== value.evidence_revision
      || checkpoint.prior.prior_consultation_id !== value.last_consultation_id
      || !equal(checkpoint.task, effectiveTask(value)) || !equal(pending.baseline, value.current_baseline)
      || checkpoint.proposal.intended_changed_paths.some((path) => !value.scope.authorized_paths.includes(path))) fail();
    for (const file of [...checkpoint.evidence.files, ...checkpoint.evidence.artifacts]) {
      if (!pending.baseline.some((record) => record.path === file.path && record.status === 'file' && record.digest === file.digest)) fail();
    }
  }
  if ((value.last_terminal === null) !== (value.last_consultation_id === null)) fail();
  if (value.last_terminal !== null) {
    validateTerminal(value.last_terminal, value);
    if (value.last_terminal.consultation_id !== value.last_consultation_id) fail();
  }
  if (value.disposition !== null) {
    validateDisposition(value.disposition);
    if (value.disposition.evidence_revision > value.evidence_revision) fail();
  }
  if (value.correction !== null) {
    const correction = value.correction;
    keys(correction, ['action_id', 'episode_id', 'validation_command', 'consultation_id', 'checkpoint_digest', 'result_digest',
      'baseline', 'evidence_revision', 'scope_revision', 'continued_by']);
    validateCorrectionChoice({ action_id: correction.action_id, episode_id: correction.episode_id, validation_command: correction.validation_command });
    uuid(correction.consultation_id); digest(correction.checkpoint_digest); digest(correction.result_digest);
    validateBaseline(correction.baseline); integer(correction.evidence_revision); integer(correction.scope_revision);
    if (!equal(correction.baseline, value.current_baseline) || correction.evidence_revision !== value.evidence_revision
      || correction.scope_revision !== value.scope_revision || correction.episode_id !== value.unresolved_episode_id
      || correction.validation_command !== value.episode_validation_command) fail();
    if (correction.continued_by !== null) text(correction.continued_by);
    if ((value.correction_count === 3) !== (correction.continued_by !== null)) fail();
  }
  if (value.outcome !== null) {
    keys(value.outcome, [...PAYLOAD_KEYS.outcome, 'evidence_revision', 'correction_number', 'recorded_at', 'checkpoint_digest', 'result_digest', 'baseline_digest']);
    validateOutcome(Object.fromEntries(PAYLOAD_KEYS.outcome.map((key) => [key, value.outcome[key]])));
    integer(value.outcome.evidence_revision); integer(value.outcome.correction_number); integer(value.outcome.recorded_at);
    digest(value.outcome.checkpoint_digest); digest(value.outcome.result_digest); digest(value.outcome.baseline_digest);
    if (value.outcome.evidence_revision > value.evidence_revision) fail();
    if (value.outcome.result === 'unknown' && value.outcome.action_id !== null
      && (value.correction === null || value.outcome.action_id !== value.correction.action_id)) fail();
    if (value.outcome.actual_changed_paths.some((path) => !value.scope.authorized_paths.includes(path))) fail();
  }
  if (!Array.isArray(value.operation_ledger) || value.operation_ledger.length === 0 || value.operation_ledger.length > MAX_OPERATIONS) fail();
  const operationIds = new Set();
  const actions = new Set();
  const reservations = new Set();
  const attachments = new Set();
  let previousRevision = 0;
  let activeAction = null;
  let activeConsultation = null;
  let activeEpisode = null;
  let activeCommand = null;
  let failures = 0;
  let terminalOutcomes = 0;
  for (const entry of value.operation_ledger) {
    keys(entry, ['operation_id', 'operation', 'digest', 'revision', 'consultation_id', 'action_id', 'episode_id',
      'outcome_result', 'validation_command', 'checkpoint_digest', 'result_digest']);
    uuid(entry.operation_id); digest(entry.digest); integer(entry.revision);
    if (!OPERATIONS.filter((op) => op !== 'get').concat('attach').includes(entry.operation)
      || operationIds.has(entry.operation_id.toLowerCase()) || entry.revision <= previousRevision || entry.revision > value.task_revision) fail();
    operationIds.add(entry.operation_id.toLowerCase()); previousRevision = entry.revision;
    if (entry.consultation_id !== null) uuid(entry.consultation_id);
    if (entry.action_id !== null) uuid(entry.action_id);
    if (entry.episode_id !== null) text(entry.episode_id);
    if (entry.validation_command !== null) text(entry.validation_command, 512);
    if (entry.operation === 'attach') {
      digest(entry.checkpoint_digest);
      if (entry.result_digest !== null) digest(entry.result_digest);
    } else if (entry.checkpoint_digest !== null || entry.result_digest !== null) fail();
    if (['checkpoint', 'attach', 'disposition', 'outcome'].includes(entry.operation) !== (entry.consultation_id !== null)) fail();
    if (!['disposition', 'outcome'].includes(entry.operation) && (entry.action_id !== null || entry.episode_id !== null)) fail();
    if ((entry.action_id === null) !== (entry.episode_id === null)) fail();
    if (entry.operation !== 'outcome' && entry.outcome_result !== null) fail();
    if ((entry.operation === 'disposition' && entry.action_id !== null) !== (entry.validation_command !== null)) fail();
    if (entry.operation === 'checkpoint') {
      if (reservations.has(entry.consultation_id)) fail();
      reservations.add(entry.consultation_id);
    } else if (entry.operation === 'attach') {
      if (entry.operation_id !== entry.consultation_id || !reservations.has(entry.consultation_id) || attachments.has(entry.consultation_id)) fail();
      attachments.add(entry.consultation_id);
    } else if (entry.operation === 'disposition' || entry.operation === 'outcome') {
      if (!attachments.has(entry.consultation_id)) fail();
      if (entry.operation === 'disposition' && entry.action_id !== null) {
        if (actions.has(entry.action_id.toLowerCase()) || activeAction !== null || (activeEpisode !== null
          && (activeEpisode !== entry.episode_id || activeCommand !== entry.validation_command))) fail();
        actions.add(entry.action_id.toLowerCase()); activeAction = entry.action_id; activeEpisode = entry.episode_id;
        activeCommand = entry.validation_command; activeConsultation = entry.consultation_id;
      } else if (entry.operation === 'outcome') {
        if (entry.action_id === null) {
          if (activeAction !== null || activeEpisode !== null || !['resolved', 'unknown'].includes(entry.outcome_result)) fail();
          if (entry.outcome_result === 'resolved') terminalOutcomes += 1;
          continue;
        }
        if (entry.action_id === null || activeAction !== entry.action_id || activeEpisode !== entry.episode_id || activeConsultation !== entry.consultation_id
          || !['resolved', 'unresolved', 'regressed', 'unknown'].includes(entry.outcome_result)) fail();
        if (entry.outcome_result !== 'unknown') {
          activeAction = null; activeConsultation = null; terminalOutcomes += 1;
          if (entry.outcome_result === 'resolved') { activeEpisode = null; activeCommand = null; failures = 0; }
          else failures = Math.min(3, failures + 1);
        }
      }
    }
  }
  if (value.operation_ledger[0].operation !== 'init' || value.operation_ledger[0].revision !== 1
    || value.operation_ledger.slice(1).some((entry) => entry.operation === 'init')
    || failures !== value.correction_count || activeEpisode !== value.unresolved_episode_id
    || activeCommand !== value.episode_validation_command || activeAction !== (value.correction?.action_id ?? null)) fail();
  const payloadEntry = (operation, payload, revision) => value.operation_ledger.find((entry) => entry.operation === operation
    && (revision === undefined || entry.revision === revision)
    && entry.digest === hash({ protocol: 'evcrate-advisor-state', version: 1, operation, task_run_id: value.task_run_id,
      operation_id: entry.operation_id, expected_revision: entry.revision - 1, payload }));
  const lastEntry = (operation) => value.operation_ledger.findLast((entry) => entry.operation === operation);
  const linkedResult = (link) => value.operation_ledger.some((entry) => entry.operation === 'attach'
    && entry.consultation_id === link.consultation_id && entry.checkpoint_digest === link.checkpoint_digest
    && entry.result_digest === link.result_digest);
  if ((value.last_terminal === null) !== (lastEntry('attach') === undefined)) fail();
  if (value.last_terminal !== null && (!linkedResult(value.last_terminal)
    || lastEntry('attach').consultation_id !== value.last_consultation_id || lastEntry('attach').digest !== value.last_terminal.envelope_digest)) fail();
  if (value.pending !== null && (!payloadEntry('checkpoint', { checkpoint: value.pending.checkpoint })
    || !reservations.has(value.pending_consultation_id) || attachments.has(value.pending_consultation_id))) fail();
  if ((value.disposition === null) !== (lastEntry('disposition') === undefined)
    || (value.outcome === null) !== (lastEntry('outcome') === undefined)) fail();
  if (value.disposition !== null && !payloadEntry('disposition', value.disposition, lastEntry('disposition').revision)) fail();
  if (value.correction !== null && (!linkedResult(value.correction) || !value.operation_ledger.some((entry) => entry.operation === 'disposition'
    && entry.action_id === value.correction.action_id && entry.consultation_id === value.correction.consultation_id))) fail();
  if (value.outcome !== null && (!linkedResult(value.outcome) || !payloadEntry('outcome',
    Object.fromEntries(PAYLOAD_KEYS.outcome.map((key) => [key, value.outcome[key]])), lastEntry('outcome').revision))) fail();
  if (!Array.isArray(value.human_decisions) || value.human_decisions.length > MAX_HUMAN_DECISIONS
    || value.human_decisions.length !== value.operation_ledger.filter((entry) => entry.operation === 'human-decision').length) fail();
  const events = new Set();
  let humanRevision = 0;
  let scopeRevision = 0;
  const authorized = [...value.task.authorized_paths];
  let scopeRationale = value.task.scope_rationale;
  for (const decision of value.human_decisions) {
    keys(decision, ['event_id', 'source', 'action', 'rationale', 'authorized_paths', 'revision', 'episode_id', 'consumed_by']);
    text(decision.event_id); text(decision.source); integer(decision.revision);
    if (decision.episode_id !== null) text(decision.episode_id);
    if (decision.consumed_by !== null) uuid(decision.consumed_by);
    const payload = { action: decision.action, rationale: decision.rationale, authorized_paths: decision.authorized_paths };
    validateHumanPayload(payload);
    if (events.has(decision.event_id) || decision.revision <= humanRevision || decision.revision > value.task_revision
      || !payloadEntry('human-decision', payload, decision.revision)) fail();
    if (decision.action === 'continue') {
      if (decision.episode_id === null || (decision.consumed_by !== null && !value.operation_ledger.some((entry) =>
        entry.operation === 'disposition' && entry.action_id === decision.consumed_by
        && entry.episode_id === decision.episode_id && entry.revision > decision.revision))) fail();
    } else if (decision.consumed_by !== null) fail();
    if (decision.action === 'revise-scope') {
      const additions = decision.authorized_paths.filter((path) => !authorized.includes(path));
      if (additions.length === 0) fail();
      authorized.push(...additions); scopeRevision += 1; scopeRationale = decision.rationale;
    }
    events.add(decision.event_id); humanRevision = decision.revision;
  }
  if (scopeRevision !== value.scope_revision || value.evidence_revision !== terminalOutcomes + scopeRevision
    || !equal(authorized, value.scope.authorized_paths) || scopeRationale !== value.scope.rationale) fail();
  const continuation = (id, actionId) => value.human_decisions.some((decision) => decision.event_id === id
    && decision.action === 'continue' && decision.episode_id === value.unresolved_episode_id && decision.consumed_by === actionId);
  if (value.human_continuation !== null && (!continuation(value.human_continuation, null) || value.correction_count !== 3 || value.correction !== null)) fail();
  if (value.correction?.continued_by !== null && value.correction?.continued_by !== undefined
    && !continuation(value.correction.continued_by, value.correction.action_id)) fail();
  if (value.gate_status === 'needs_human' && (value.correction_count !== 3 || value.human_continuation !== null || value.correction !== null)) fail();
  if (value.correction_count === 3 && value.pending === null && value.correction === null && value.human_continuation === null
    && !['needs_human', 'completed'].includes(value.gate_status)) fail();
  if (value.gate_status === 'completed') {
    const abandoned = value.human_decisions.at(-1)?.action === 'abandon';
    if (value.pending !== null || (!abandoned && (value.correction !== null || value.unresolved_episode_id !== null
      || value.outcome?.result !== 'resolved' || value.last_terminal?.status !== 'ADVICE_READY'
      || value.outcome.consultation_id !== value.last_consultation_id || value.outcome.evidence_revision !== value.evidence_revision))) fail();
  }
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_STATE_BYTES) fail();
  return deepFreeze(value);
}
function validateTaskStateV1(value) {
  try { return validateState(value); } catch (error) {
    if (error?.code === 'STATE_INVALID') throw error;
    fail();
  }
}

module.exports = {
  OPERATIONS, MAX_OPERATIONS, MAX_HUMAN_DECISIONS, STATE_KEYS,
  parseStateRequest, validateTaskStateV1, effectiveTask, keys, text, uuid, hash, equal, fail
};
