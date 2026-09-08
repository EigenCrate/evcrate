'use strict';

const { randomUUID } = require('node:crypto');
const { stateLocation, transactState, processIdentity, processStatus } = require('./state-io.cjs');
const { recordOutcome: recordHistoryOutcome } = require('./history-store.cjs');
const { captureBaseline, assertBaselineFresh } = require('./state-baseline.cjs');
const { loadGlobalPolicy } = require('./profile.cjs');
const { validateCheckpointV2, computeCheckpointDigestV2, validateEnvelopeV2, deepFreeze } = require('./contracts-v2.cjs');
const { ADVISOR_BUILD_IDENTITY } = require('./checkpoint-contract.cjs');
const {
  MAX_OPERATIONS, MAX_HUMAN_DECISIONS, parseStateRequest, validateTaskStateV1,
  effectiveTask, keys, text, uuid, hash, equal, fail
} = require('./state-contract.cjs');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function checkState(current, location, taskRunId) {
  if (current === null) fail('STATE_NOT_FOUND');
  validateTaskStateV1(current);
  if (current.project_id !== location.projectId || current.task_run_id !== taskRunId) fail('STATE_CONFLICT');
  return current;
}
function gate(state, fallback = 'needs_evidence') {
  if (state.pending !== null) return 'in_consultation';
  return state.correction_count === 3 && state.human_continuation === null && state.correction === null
    ? 'needs_human' : fallback;
}
function fresh(location, state) { assertBaselineFresh(location.projectRoot, state.current_baseline); }
function increment(revision) {
  if (!Number.isSafeInteger(revision + 1)) fail('STATE_GATE_BLOCKED');
  return revision + 1;
}
function ledgerSpace(state, slots = 1) {
  if (state.operation_ledger.length + slots > MAX_OPERATIONS) fail('STATE_GATE_BLOCKED');
}
function record(state, request, requestDigest, result = {}) {
  ledgerSpace(state);
  state.operation_ledger.push({
    operation_id: request.operation_id, operation: request.operation, digest: requestDigest,
    revision: state.task_revision, consultation_id: result.consultation_id ?? request.payload.consultation_id ?? null,
    action_id: request.payload.action_id ?? request.payload.correction?.action_id ?? null,
    episode_id: request.payload.episode_id ?? request.payload.correction?.episode_id ?? null,
    outcome_result: request.operation === 'outcome' ? request.payload.result : null,
    validation_command: request.operation === 'disposition' ? request.payload.correction?.validation_command ?? null : null,
    checkpoint_digest: null, result_digest: null
  });
}
function response(request, state, result = {}) {
  return deepFreeze({ protocol: 'evcrate-advisor-state', version: 1, operation: request.operation, status: 'STATE_READY', state, ...result });
}
function replayResult(request, state, entry) {
  if (request.operation === 'checkpoint') {
    const checkpoint = state.pending_consultation_id === entry.consultation_id ? state.pending.checkpoint : request.payload.checkpoint;
    return { checkpoint, consultation_id: entry.consultation_id };
  }
  return {};
}
function initialize(request, location) {
  const { task, phase_id: phaseId, baseline_paths: selectedPaths } = request.payload;
  if (task.authorized_paths.some((path) => !selectedPaths.includes(path))) fail('STATE_GATE_BLOCKED');
  const baseline = captureBaseline(location.projectRoot, selectedPaths);
  return {
    schema_version: 1, task_run_id: request.task_run_id, project_id: location.projectId,
    task_revision: 1, phase_id: phaseId, gate_status: 'open', unresolved_episode_id: null,
    correction_count: 0, pending_consultation_id: null, last_consultation_id: null,
    disposition: null, outcome: null, task, initial_baseline: baseline,
    scope_revision: 0, scope: { authorized_paths: task.authorized_paths, rationale: task.scope_rationale, added_baseline: [] },
    evidence_revision: 0, current_baseline: baseline, pending: null, last_terminal: null,
    correction: null, episode_validation_command: null, human_continuation: null,
    operation_ledger: [], human_decisions: []
  };
}
function matchCheckpoint(state, checkpoint, location, reserved = false) {
  validateCheckpointV2(checkpoint);
  if (checkpoint.task_run_id !== state.task_run_id || checkpoint.phase_id !== state.phase_id
    || !equal(checkpoint.task, effectiveTask(state))) fail('STATE_CONFLICT');
  if (!reserved && checkpoint.task_revision !== state.task_revision) fail('STALE_STATE_REVISION');
  if (checkpoint.evidence_revision !== state.evidence_revision) fail('STALE_EVIDENCE_REVISION');
  if (checkpoint.proposal.intended_changed_paths.some((path) => !state.scope.authorized_paths.includes(path))) fail('STATE_GATE_BLOCKED');
  if (checkpoint.prior.prior_consultation_id !== state.last_consultation_id) fail('STATE_CONFLICT');
  fresh(location, state);
  for (const file of [...checkpoint.evidence.files, ...checkpoint.evidence.artifacts]) {
    if (!state.current_baseline.some((record) => record.path === file.path && record.status === 'file' && record.digest === file.digest)) {
      fail('STALE_EVIDENCE_REVISION');
    }
  }
}
function reserve(state, payload, location) {
  if (state.pending !== null) fail('STATE_PENDING');
  // An accepted checkpoint requires end-to-end lifecycle headroom:
  // checkpoint (1) + attach (1) + disposition (1) + outcome (1) + complete (1) = 5 slots.
  ledgerSpace(state, 5);
  matchCheckpoint(state, payload.checkpoint, location);
  const consultationId = randomUUID();
  state.pending_consultation_id = consultationId;
  state.pending = {
    consultation_id: consultationId, checkpoint: payload.checkpoint,
    checkpoint_digest: computeCheckpointDigestV2(payload.checkpoint), baseline: state.current_baseline, process: null
  };
  state.gate_status = 'in_consultation';
  return { consultation_id: consultationId, checkpoint: payload.checkpoint };
}
function disposition(state, payload, location) {
  if (state.pending !== null) fail('STATE_PENDING');
  const terminal = state.last_terminal;
  if (terminal === null || terminal.status !== 'ADVICE_READY' || terminal.consultation_id !== payload.consultation_id) fail('STATE_GATE_BLOCKED');
  if (payload.evidence_revision !== state.evidence_revision || terminal.evidence_revision !== state.evidence_revision
    || terminal.scope_revision !== state.scope_revision) fail('STALE_EVIDENCE_REVISION');
  fresh(location, state);
  const choice = payload.correction;
  if (choice !== null) {
    if (state.correction !== null) fail('STATE_PENDING');
    if (state.operation_ledger.some((entry) => entry.action_id?.toLowerCase() === choice.action_id.toLowerCase())) fail('STATE_CONFLICT');
    if (!terminal.validation_commands.includes(choice.validation_command)) fail('STATE_GATE_BLOCKED');
    if (state.unresolved_episode_id !== null && (choice.episode_id !== state.unresolved_episode_id
      || choice.validation_command !== state.episode_validation_command)) fail('STATE_CONFLICT');
    if (state.correction_count === 3 && state.human_continuation === null) fail('STATE_GATE_BLOCKED');
    state.unresolved_episode_id = choice.episode_id;
    state.episode_validation_command = choice.validation_command;
    state.correction = {
      ...choice, consultation_id: payload.consultation_id, checkpoint_digest: terminal.checkpoint_digest,
      result_digest: terminal.result_digest, baseline: state.current_baseline,
      evidence_revision: state.evidence_revision, scope_revision: state.scope_revision,
      continued_by: state.human_continuation
    };
    if (state.human_continuation !== null) {
      state.human_decisions.find((decision) => decision.event_id === state.human_continuation).consumed_by = choice.action_id;
    }
    state.human_continuation = null;
  }
  // A further consultation/disposition never erases an unfinished correction.
  state.disposition = payload;
  state.gate_status = gate(state, payload.action === 'accept' && (choice !== null || !terminal.has_concerns) ? 'open' : 'needs_evidence');
}
function noCorrectionOutcome(state, payload, location) {
  const terminal = state.last_terminal;
  if (state.correction !== null || state.unresolved_episode_id !== null
    || terminal?.status !== 'ADVICE_READY' || terminal.has_concerns
    || terminal.consultation_id !== payload.consultation_id
    || state.disposition?.consultation_id !== payload.consultation_id
    || state.disposition.action !== 'accept' || state.disposition.correction !== null
    || state.outcome?.consultation_id === payload.consultation_id && state.outcome.result === 'resolved'
    || payload.actual_changed_paths.length !== 0
    || !terminal.validation_commands.includes(payload.validation.command)) fail('STATE_GATE_BLOCKED');
  if (terminal.evidence_revision !== state.evidence_revision || terminal.scope_revision !== state.scope_revision
    || state.disposition.evidence_revision !== state.evidence_revision) fail('STALE_EVIDENCE_REVISION');
  fresh(location, state);
  if (payload.result === 'resolved') state.evidence_revision = increment(state.evidence_revision);
  state.outcome = {
    ...payload,
    evidence_revision: state.evidence_revision,
    correction_number: 1,
    recorded_at: Date.now(),
    checkpoint_digest: terminal.checkpoint_digest,
    result_digest: terminal.result_digest,
    baseline_digest: hash(state.current_baseline)
  };
  state.gate_status = payload.result === 'resolved' ? 'open' : 'needs_evidence';
}
function outcome(state, payload, location) {
  if (state.pending !== null) fail('STATE_PENDING');
  if (payload.action_id === null) return noCorrectionOutcome(state, payload, location);
  const correction = state.correction;
  if (correction === null || payload.action_id !== correction.action_id || payload.episode_id !== correction.episode_id
    || payload.consultation_id !== correction.consultation_id) fail('STATE_CONFLICT');
  if (payload.validation.command !== correction.validation_command) fail('STATE_GATE_BLOCKED');
  const observed = captureBaseline(location.projectRoot, state.current_baseline.map((record) => record.path));
  const changed = observed.filter((record, index) => !equal(record, correction.baseline[index])).map((record) => record.path);
  if (changed.some((path) => !state.scope.authorized_paths.includes(path))
    || !equal(changed, [...payload.actual_changed_paths].sort())) fail('STATE_GATE_BLOCKED');
  if (payload.result !== 'unknown' && changed.length === 0) fail('STATE_GATE_BLOCKED');
  const activeCycle = Math.min(3, (state.correction_count || 0) + 1);
  state.outcome = {
    ...payload,
    evidence_revision: state.evidence_revision,
    correction_number: activeCycle,
    recorded_at: Date.now(),
    checkpoint_digest: correction.checkpoint_digest,
    result_digest: correction.result_digest,
    baseline_digest: hash(observed)
  };
  if (payload.result === 'unknown') {
    // Interrupted runs retain their original execution baseline and action identity.
    state.gate_status = 'needs_evidence';
    return;
  }
  state.current_baseline = observed;
  state.evidence_revision = increment(state.evidence_revision);
  state.outcome.evidence_revision = state.evidence_revision;
  state.correction = null;
  if (payload.result === 'resolved') {
    state.unresolved_episode_id = null;
    state.episode_validation_command = null;
    state.correction_count = 0;
    state.human_continuation = null;
    const linked = state.last_consultation_id === payload.consultation_id && state.disposition?.consultation_id === payload.consultation_id
      && state.disposition.action === 'accept';
    state.gate_status = linked ? 'open' : 'needs_evidence';
  } else {
    state.correction_count = Math.min(3, state.correction_count + 1);
    state.gate_status = gate(state);
  }
}
function humanDecision(state, payload, location, event) {
  if (event === null) fail('HUMAN_EVENT_REQUIRED');
  if (state.human_decisions.length >= MAX_HUMAN_DECISIONS) fail('STATE_GATE_BLOCKED');
  if (state.human_decisions.some((decision) => decision.event_id === event.event_id)) fail('STATE_CONFLICT');
  if (payload.action === 'recover-pending') {
    if (state.pending === null) fail('STATE_GATE_BLOCKED');
    if (state.pending.process !== null && processStatus(state.pending.process) !== 'dead') fail('STATE_PENDING');
    state.pending = null;
    state.pending_consultation_id = null;
    state.gate_status = gate(state);
  } else {
    if (state.pending !== null) fail('STATE_PENDING');
    if (payload.action === 'continue') {
      if (state.gate_status !== 'needs_human' || state.correction_count !== 3 || state.correction !== null
        || state.human_continuation !== null) fail('STATE_GATE_BLOCKED');
      fresh(location, state);
      state.human_continuation = event.event_id;
      state.gate_status = 'needs_evidence';
    } else if (payload.action === 'revise-scope') {
      if (state.correction !== null) fail('STATE_PENDING');
      fresh(location, state);
      const additions = payload.authorized_paths.filter((path) => !state.scope.authorized_paths.includes(path));
      if (additions.length === 0 || state.scope.authorized_paths.length + additions.length > 32) fail('STATE_GATE_BLOCKED');
      const selected = new Set(state.current_baseline.map((record) => record.path));
      const additionalRecords = captureBaseline(location.projectRoot, additions.filter((path) => !selected.has(path)));
      if (selected.size + additionalRecords.length > 32) fail('STATE_GATE_BLOCKED');
      fresh(location, state);
      state.scope = {
        authorized_paths: [...state.scope.authorized_paths, ...additions], rationale: payload.rationale,
        added_baseline: [...state.scope.added_baseline, ...additionalRecords].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      };
      state.current_baseline = [...state.current_baseline, ...additionalRecords].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      state.scope_revision = increment(state.scope_revision);
      state.evidence_revision = increment(state.evidence_revision);
      state.gate_status = gate(state);
    } else if (payload.action === 'abandon') {
      state.gate_status = 'completed';
    }
  }
  state.human_decisions.push({ ...event, ...payload, revision: state.task_revision + 1,
    episode_id: state.unresolved_episode_id, consumed_by: null });
}
function complete(state, location) {
  if (state.pending !== null || state.correction !== null || state.unresolved_episode_id !== null
    || state.gate_status !== 'open' || state.outcome?.result !== 'resolved'
    || state.last_terminal?.status !== 'ADVICE_READY' || state.outcome.consultation_id !== state.last_consultation_id
    || state.outcome.evidence_revision !== state.evidence_revision
    || state.outcome.result_digest !== state.last_terminal.result_digest
    || state.disposition?.action !== 'accept' || state.disposition.consultation_id !== state.last_consultation_id) fail('STATE_GATE_BLOCKED');
  fresh(location, state);
  if (state.outcome.baseline_digest !== hash(state.current_baseline)) fail('STALE_EVIDENCE_REVISION');
  state.gate_status = 'completed';
}
function observeHuman(request, context) {
  if (request.operation !== 'human-decision') return null;
  if (typeof context.observeHumanDecision !== 'function') fail('HUMAN_EVENT_REQUIRED');
  try {
    const event = context.observeHumanDecision(request.payload);
    keys(event, ['event_id', 'source']); text(event.event_id); text(event.source);
    return { event_id: event.event_id, source: event.source };
  } catch { fail('HUMAN_EVENT_REQUIRED'); }
}

// Replay/CAS inspection precedes host interaction; the mutation rechecks under
// lock after observation. Never hold a filesystem lock while asking a person.
function preflightHumanDecision(input, context = {}) {
  const request = parseStateRequest(input);
  if (request.operation !== 'human-decision') fail('STATE_INVALID');
  const location = stateLocation(context, request.task_run_id);
  return transactState(location, {}, (current) => {
    checkState(current, location, request.task_run_id);
    const entry = current.operation_ledger.find((item) => item.operation_id.toLowerCase() === request.operation_id.toLowerCase());
    if (entry) {
      if (entry.operation !== request.operation || entry.digest !== hash(request)) fail('STATE_CONFLICT');
      return { state: null, result: response(request, current) };
    }
    if (current.task_revision !== request.expected_revision) fail('STALE_STATE_REVISION');
    if (current.gate_status === 'completed') fail('STATE_GATE_BLOCKED');
    const recoversPending = request.payload.action === 'recover-pending';
    ledgerSpace(current, current.pending === null || recoversPending ? 1 : 2);
    if (current.human_decisions.length >= MAX_HUMAN_DECISIONS) fail('STATE_GATE_BLOCKED');
    if (recoversPending) {
      if (current.pending === null) fail('STATE_GATE_BLOCKED');
      if (current.pending.process !== null && processStatus(current.pending.process) !== 'dead') fail('STATE_PENDING');
    } else {
      if (current.pending !== null) fail('STATE_PENDING');
      if (request.payload.action === 'continue') {
        if (current.gate_status !== 'needs_human' || current.correction_count !== 3
          || current.correction !== null || current.human_continuation !== null) fail('STATE_GATE_BLOCKED');
      } else if (request.payload.action === 'revise-scope') {
        if (current.correction !== null) fail('STATE_PENDING');
      }
    }
    return { state: null, result: null };
  });
}
function executeStateRequest(input, context = {}) {
  const request = parseStateRequest(input);
  if (request.operation === 'human-decision') {
    const replay = preflightHumanDecision(request, context);
    if (replay !== null) return replay;
  }
  const location = stateLocation(context, request.task_run_id);
  // Host observation may involve interaction; it must occur before taking the short lock.
  const humanEvent = observeHuman(request, context);
  const requestDigest = hash(request);
  const transactionResult = transactState(location, { create: request.operation === 'init' }, (current) => {
    if (current !== null) checkState(current, location, request.task_run_id);
    if (request.operation === 'get') {
      checkState(current, location, request.task_run_id);
      const pendingProcess = current.pending === null ? null
        : current.pending.process === null ? 'never-started' : processStatus(current.pending.process);
      return { state: null, result: response(request, current, { pending_process_status: pendingProcess }) };
    }
    const entry = current?.operation_ledger.find((item) => item.operation_id.toLowerCase() === request.operation_id.toLowerCase());
    if (entry) {
      if (entry.operation !== request.operation || entry.digest !== requestDigest) fail('STATE_CONFLICT');
      return { state: null, result: response(request, current, replayResult(request, current, entry)) };
    }
    let state;
    let result = {};
    if (request.operation === 'init') {
      if (current !== null) fail('STATE_CONFLICT');
      state = initialize(request, location);
    } else {
      checkState(current, location, request.task_run_id);
      if (current.task_revision !== request.expected_revision) fail('STALE_STATE_REVISION');
      if (current.gate_status === 'completed') fail('STATE_GATE_BLOCKED');
      // A pending consultation reserves one ledger slot for its required attachment.
      const recoversPending = request.operation === 'human-decision' && request.payload.action === 'recover-pending';
      ledgerSpace(current, current.pending === null || recoversPending ? 1 : 2);
      state = clone(current);
      if (request.operation === 'checkpoint') result = reserve(state, request.payload, location);
      else if (request.operation === 'disposition') disposition(state, request.payload, location);
      else if (request.operation === 'outcome') outcome(state, request.payload, location);
      else if (request.operation === 'human-decision') humanDecision(state, request.payload, location, humanEvent);
      else if (request.operation === 'complete') complete(state, location);
      state.task_revision = increment(current.task_revision);
    }
    record(state, request, requestDigest, result);
    validateTaskStateV1(state);
    return { state, result: response(request, state, result) };
  });
  if (request.operation === 'outcome') {
    let outcomeAuditStatus = 'disabled';
    const stateSource = transactionResult?.state || transactionResult;
    try {
      const environment = context.environment || process.env;
      let policy = context.policy;
      if (!policy) {
        try {
          const loaded = loadGlobalPolicy(environment?.HOME);
          policy = loaded?.policy ?? loaded;
        } catch {}
      }
      const outcomeRecord = {
        schema_version: 1,
        consultation_id: request.payload.consultation_id,
        task_run_id: request.task_run_id,
        project_id: location.projectId,
        disposition: {
          action: stateSource?.disposition?.action || 'accept',
          rationale: stateSource?.disposition?.rationale || 'Accepted without concerns.'
        },
        evidence_revision: stateSource?.evidence_revision ?? request.expected_revision,
        actual_changed_paths: request.payload.actual_changed_paths || [],
        validation: request.payload.validation,
        outcome: request.payload.result,
        correction_number: stateSource?.outcome?.correction_number || 1,
        recorded_at: stateSource?.outcome?.recorded_at || Date.now()
      };
      if (policy?.history) {
        try {
          recordHistoryOutcome(context, outcomeRecord, policy);
          outcomeAuditStatus = 'recorded';
        } catch {
          outcomeAuditStatus = 'degraded';
        }
      }
    } catch {
      outcomeAuditStatus = 'degraded';
    }
    return deepFreeze({
      ...transactionResult,
      audit_status: outcomeAuditStatus
    });
  }
  return transactionResult;
}
function claimCheckpoint(input, context = {}) {
  const checkpoint = validateCheckpointV2(clone(input));
  const location = stateLocation(context, checkpoint.task_run_id);
  return transactState(location, {}, (current) => {
    checkState(current, location, checkpoint.task_run_id);
    const pending = current.pending;
    if (pending === null) fail('STATE_GATE_BLOCKED');
    if (pending.process !== null) fail('STATE_PENDING');
    if (pending.checkpoint_digest !== computeCheckpointDigestV2(checkpoint) || !equal(pending.checkpoint, checkpoint)) fail('STATE_CONFLICT');
    matchCheckpoint(current, checkpoint, location, true);
    const state = clone(current);
    state.pending.process = processIdentity();
    if (state.pending.process.start === null) fail('STATE_IO_FAILED');
    state.task_revision = increment(current.task_revision);
    validateTaskStateV1(state);
    return { state, result: deepFreeze({ consultationId: pending.consultation_id, checkpoint: state.pending.checkpoint }) };
  });
}
function attachControllerResult(claim, input, context = {}) {
  keys(claim, ['consultationId', 'checkpoint']); uuid(claim.consultationId);
  const checkpoint = validateCheckpointV2(clone(claim.checkpoint));
  const envelope = validateEnvelopeV2(clone(input), { checkpoint, expected_build_identity: ADVISOR_BUILD_IDENTITY });
  if (envelope.correlation_id !== claim.consultationId) fail('STATE_CONFLICT');
  const envelopeDigest = hash(envelope);
  const location = stateLocation(context, checkpoint.task_run_id);
  return transactState(location, {}, (current) => {
    checkState(current, location, checkpoint.task_run_id);
    const entry = current.operation_ledger.find((item) => item.operation_id.toLowerCase() === claim.consultationId.toLowerCase());
    if (entry) {
      if (entry.operation !== 'attach' || entry.digest !== envelopeDigest) fail('STATE_CONFLICT');
      return { state: null, result: current };
    }
    const pending = current.pending;
    if (pending === null || pending.consultation_id !== claim.consultationId
      || pending.checkpoint_digest !== envelope.checkpoint_digest || !equal(pending.checkpoint, checkpoint)) fail('STATE_CONFLICT');
    if (pending.process === null || !equal(pending.process, processIdentity())) fail('STATE_PENDING');
    fresh(location, current);
    ledgerSpace(current);
    const state = clone(current);
    state.last_consultation_id = claim.consultationId;
    state.last_terminal = {
      consultation_id: claim.consultationId, status: envelope.status,
      checkpoint_id: checkpoint.checkpoint_id, checkpoint_digest: envelope.checkpoint_digest,
      task_revision: checkpoint.task_revision, evidence_revision: checkpoint.evidence_revision, scope_revision: state.scope_revision,
      result_digest: envelope.status === 'ADVICE_READY' ? hash(envelope.result) : null,
      envelope_digest: envelopeDigest, receipt: envelope.receipt,
      has_concerns: envelope.status === 'ADVICE_READY'
        && (envelope.result.must_fix.length > 0 || envelope.result.unresolved_questions.length > 0),
      validation_commands: [...new Set(checkpoint.evidence.validation_results.map((validation) => validation.command))],
      intended_changed_paths: checkpoint.proposal.intended_changed_paths
    };
    state.pending = null;
    state.pending_consultation_id = null;
    state.gate_status = gate(state);
    state.task_revision = increment(current.task_revision);
    state.operation_ledger.push({ operation_id: claim.consultationId, operation: 'attach', digest: envelopeDigest,
      revision: state.task_revision, consultation_id: claim.consultationId, action_id: null,
      episode_id: null, outcome_result: null, validation_command: null,
      checkpoint_digest: state.last_terminal.checkpoint_digest, result_digest: state.last_terminal.result_digest });
    validateTaskStateV1(state);
    return { state, result: state };
  });
}

module.exports = { executeStateRequest, claimCheckpoint, attachControllerResult, preflightHumanDecision };
