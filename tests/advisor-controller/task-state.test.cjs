'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const servicePath = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/task-state.cjs');
const { executeStateRequest, claimCheckpoint, attachControllerResult } = require(servicePath);
const { stateLocation } = require('../../.evcrate/source/.evcrate/bin/lib/advisor/state-io.cjs');
const { buildSuccessEnvelope, buildFailureEnvelope } = require('../../.evcrate/source/.evcrate/bin/lib/advisor/controller-envelope.cjs');
const { createRoutingError } = require('../../.evcrate/source/.evcrate/bin/lib/advisor/errors.cjs');
const { effectiveTask, MAX_OPERATIONS } = require('../../.evcrate/source/.evcrate/bin/lib/advisor/state-contract.cjs');

const COMMAND = 'node --test tests/relevant.test.cjs';
function validation(status = 'failed', command = COMMAND) {
  return { suite: 'relevant', command, status, passed: status === 'passed' ? 1 : 0,
    failed: status === 'failed' ? 1 : 0, details: null };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-task-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd, { mode: 0o700 }); fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(path.join(cwd, 'src'), { mode: 0o700 });
  fs.writeFileSync(path.join(cwd, 'src/app.cjs'), 'original user changes\n');
  fs.writeFileSync(path.join(cwd, 'unrelated.txt'), 'unrelated user work\n');
  const context = { cwd, environment: { HOME: home } };
  const taskRunId = randomUUID();
  const task = { goal: 'Repair the selected behavior', non_goals: ['Rewrite unrelated files'], authorized_paths: ['src/app.cjs'],
    scope_rationale: 'The defect belongs to the selected file.', invariants: ['Preserve existing user changes'], success_criteria: ['Relevant validation passes'] };
  let latest;
  function request(operation, payload = {}, overrides = {}) {
    return { protocol: 'evcrate-advisor-state', version: 1, operation, task_run_id: taskRunId,
      operation_id: operation === 'get' ? null : randomUUID(), expected_revision: operation === 'get' ? null : latest?.task_revision ?? 0,
      payload, ...overrides };
  }
  function send(operation, payload = {}, overrides = {}, hostContext = context) {
    const result = executeStateRequest(request(operation, payload, overrides), hostContext);
    latest = result.state;
    return result;
  }
  function refresh() { return send('get').state; }
  function checkpoint() {
    const state = refresh();
    const content = fs.readFileSync(path.join(cwd, 'src/app.cjs'), 'utf8');
    return { protocol: 'evcrate-advisor-checkpoint', version: 2, task_run_id: taskRunId,
      checkpoint_id: randomUUID(), phase_id: state.phase_id, task_revision: state.task_revision, evidence_revision: state.evidence_revision,
      checkpoint: 'repair:review', kind: 'stuck', question: 'Which correction resolves the selected defect?', task: effectiveTask(state),
      proposal: { next_action: 'Correct the selected behavior', rationale: 'The relevant validation identifies the defect.', intended_changed_paths: ['src/app.cjs'] },
      evidence: { summary: 'Selected validation currently fails.', files: [{ path: 'src/app.cjs', excerpt: content.trim(),
        digest: createHash('sha256').update(content).digest('hex') }], validation_results: [validation()], artifacts: [] },
      prior: { prior_consultation_id: state.last_consultation_id, prior_counsel: null, prior_disposition: null, observed_outcome: null } };
  }
  function envelope(claim, failed = false, concerns = true) {
    const attempt = { attempt_id: randomUUID(), slot: 'primary', route: { backend: 'codex', model: 'test-model', effort: 'high' },
      phase: 'model', model_started: true, elapsed_ms: 1, terminal_classification: failed ? 'cancelled' : 'success', retry_delay_ms: null, cleanup_outcome: 'confirmed' };
    const common = { correlation_id: claim.consultationId, checkpoint: claim.checkpoint,
      receipt: { backend: 'codex', model: 'test-model', effort: 'high', adapter_version: 'test', elapsed_ms: 1 },
      attempts: [attempt], cleanup_outcome: 'confirmed' };
    return failed ? buildFailureEnvelope({ ...common, error: createRoutingError('CANCELLED') })
      : buildSuccessEnvelope({ ...common, result: { protocol: 'evcrate-advisor-result', version: 2, checkpoint: claim.checkpoint.checkpoint,
        status: 'ADVICE_READY', recommendation: 'Correct the selected condition.', rationale: 'The selected evidence supports this correction.',
        must_fix: concerns ? ['Repair the observed defect'] : [], cautions: [], assumptions: [], success_checks: [COMMAND], unresolved_questions: [] } });
  }
  function consult(failed = false, concerns = true) {
    const reserved = send('checkpoint', { checkpoint: checkpoint() });
    const claim = claimCheckpoint(reserved.checkpoint, context);
    const terminal = envelope(claim, failed, concerns);
    latest = attachControllerResult(claim, terminal, context);
    return { reserved, claim, terminal };
  }
  function choose(episode = 'selected-defect') {
    refresh();
    const choice = { action_id: randomUUID(), episode_id: episode, validation_command: COMMAND };
    send('disposition', { consultation_id: latest.last_consultation_id, evidence_revision: latest.evidence_revision,
      action: 'accept', rationale: 'Apply the evidence-linked correction.', correction: choice });
    return choice;
  }
  function observedOutcome(choice, result = 'unresolved', overrides = {}) {
    refresh();
    return { consultation_id: latest.correction.consultation_id, action_id: choice.action_id, episode_id: choice.episode_id,
      result, validation: validation(result === 'resolved' ? 'passed' : result === 'unknown' ? 'skipped' : 'failed'), actual_changed_paths: ['src/app.cjs'], ...overrides };
  }
  function change(contents = `selected correction ${randomUUID()}\n`) { fs.writeFileSync(path.join(cwd, 'src/app.cjs'), contents); }
  function failCycle() {
    consult(); const choice = choose(); change();
    return send('outcome', observedOutcome(choice));
  }
  function human(action, authorizedPaths = [], eventId = randomUUID()) {
    refresh();
    return send('human-decision', { action, rationale: 'The user reviewed and chose this bounded action.', authorized_paths: authorizedPaths }, {},
      { ...context, observeHumanDecision: () => ({ event_id: eventId, source: 'test-host-observed-user' }) });
  }
  send('init', { phase_id: 'repair', task, baseline_paths: ['src/app.cjs'] });
  return { root, cwd, home, context, taskRunId, task, request, send, refresh, checkpoint, envelope, consult, choose, observedOutcome, change, failCycle, human };
}

test('CAS, matching replay and conflicting replay survive durable resume without repeat mutation', (t) => {
  const f = fixture(t);
  const initial = f.refresh();
  const request = f.request('checkpoint', { checkpoint: f.checkpoint() });
  const reserved = executeStateRequest(Buffer.from(JSON.stringify(request)), f.context);
  const replay = executeStateRequest(JSON.stringify(request), f.context);
  assert.equal(replay.consultation_id, reserved.consultation_id);
  assert.equal(replay.state.task_revision, reserved.state.task_revision);
  assert.deepEqual(replay.state.initial_baseline, initial.initial_baseline);
  assert.throws(() => executeStateRequest({ ...request, payload: { checkpoint: { ...request.payload.checkpoint, question: 'Different question?' } } }, f.context),
    { code: 'STATE_CONFLICT' });
  assert.throws(() => executeStateRequest({ ...request, operation_id: randomUUID() }, f.context), { code: 'STALE_STATE_REVISION' });
  f.refresh();
  assert.throws(() => f.send('checkpoint', { checkpoint: f.checkpoint() }), { code: 'STATE_PENDING' });
  const claim = claimCheckpoint(reserved.checkpoint, f.context);
  assert.throws(() => claimCheckpoint(reserved.checkpoint, f.context), { code: 'STATE_PENDING' });
  const terminal = f.envelope(claim);
  const attached = attachControllerResult(claim, terminal, f.context);
  assert.equal(attachControllerResult(claim, terminal, f.context).task_revision, attached.task_revision);
  const different = structuredClone(terminal);
  different.result.rationale = 'Conflicting terminal advice.';
  assert.throws(() => attachControllerResult(claim, different, f.context), { code: 'STATE_CONFLICT' });
  assert.equal(executeStateRequest(request, f.context).state.task_revision, attached.task_revision);
});

test('only reserved matching checkpoints can be claimed and attached', (t) => {
  const f = fixture(t);
  const checkpoint = f.checkpoint();
  assert.throws(() => claimCheckpoint(checkpoint, f.context), { code: 'STATE_GATE_BLOCKED' });
  const reserved = f.send('checkpoint', { checkpoint });
  assert.throws(() => claimCheckpoint({ ...checkpoint, question: 'Another question?' }, f.context), { code: 'STATE_CONFLICT' });
  const unclaimed = { consultationId: reserved.consultation_id, checkpoint };
  assert.throws(() => attachControllerResult(unclaimed, f.envelope(unclaimed), f.context), { code: 'STATE_PENDING' });
  const claim = claimCheckpoint(checkpoint, f.context);
  const wrongIdentity = structuredClone(f.envelope(claim));
  wrongIdentity.correlation_id = randomUUID();
  assert.throws(() => attachControllerResult(claim, wrongIdentity, f.context), { code: 'STATE_CONFLICT' });
  const wrongBuild = structuredClone(f.envelope(claim));
  wrongBuild.receipt.build_identity = 'different-controller-build';
  assert.throws(() => attachControllerResult(claim, wrongBuild, f.context), { code: 'PROCESS_FAILED' });
  assert.equal(f.refresh().pending_consultation_id, claim.consultationId);
});

test('relevant file and artifact freshness reject stale advice; unrelated edits do not', (t) => {
  const f = fixture(t);
  const checkpoint = f.checkpoint();
  checkpoint.evidence.artifacts = [{ id: 'selected-artifact', path: 'src/app.cjs', digest: 'f'.repeat(64), description: 'Selected content' }];
  assert.throws(() => f.send('checkpoint', { checkpoint }), { code: 'STALE_EVIDENCE_REVISION' });
  const reserved = f.send('checkpoint', { checkpoint: f.checkpoint() });
  fs.writeFileSync(path.join(f.cwd, 'unrelated.txt'), 'new unrelated user edits\n');
  const claim = claimCheckpoint(reserved.checkpoint, f.context);
  attachControllerResult(claim, f.envelope(claim), f.context);
  f.change('external relevant change\n');
  assert.throws(() => f.choose(), { code: 'STALE_EVIDENCE_REVISION' });
  assert.throws(() => f.send('checkpoint', { checkpoint: f.checkpoint() }), { code: 'STALE_EVIDENCE_REVISION' });
  assert.equal(fs.readFileSync(path.join(f.cwd, 'unrelated.txt'), 'utf8'), 'new unrelated user edits\n');
  assert.equal(f.refresh().correction_count, 0);
});

test('three completed failed corrections require one-use observed human continuation without counter reset', (t) => {
  const f = fixture(t);
  const original = f.refresh().initial_baseline;
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const state = f.failCycle().state;
    assert.equal(state.correction_count, cycle);
    assert.equal(state.unresolved_episode_id, 'selected-defect');
  }
  assert.equal(f.refresh().gate_status, 'needs_human');
  f.consult();
  assert.throws(() => f.choose(), { code: 'STATE_GATE_BLOCKED' });
  assert.throws(() => f.send('human-decision', { action: 'continue', rationale: 'The advisor approved continuation.', authorized_paths: [] }),
    { code: 'HUMAN_EVENT_REQUIRED' });
  const eventId = randomUUID();
  assert.equal(f.human('continue', [], eventId).state.correction_count, 3);
  const choice = f.choose();
  assert.equal(f.refresh().human_continuation, null);
  f.change();
  const failed = f.send('outcome', f.observedOutcome(choice)).state;
  assert.equal(failed.correction_count, 3);
  assert.equal(failed.gate_status, 'needs_human');
  assert.equal(failed.human_decisions.at(-1).consumed_by, choice.action_id);
  assert.deepEqual(failed.initial_baseline, original);
  assert.throws(() => f.human('continue', [], eventId), { code: 'STATE_CONFLICT' });
  f.consult();
  assert.throws(() => f.choose(), { code: 'STATE_GATE_BLOCKED' });
});

test('interrupted outcomes retain correction identity; matching and fresh-ID repeats cannot increment', (t) => {
  const f = fixture(t);
  f.consult(); const choice = f.choose(); f.change();
  const payload = f.observedOutcome(choice, 'unknown');
  const request = f.request('outcome', payload);
  const interrupted = executeStateRequest(request, f.context).state;
  assert.equal(interrupted.correction_count, 0);
  assert.equal(interrupted.correction.action_id, choice.action_id);
  assert.equal(executeStateRequest(request, f.context).state.task_revision, interrupted.task_revision);
  f.refresh();
  assert.equal(f.send('outcome', payload).state.correction_count, 0);
  assert.throws(() => f.send('complete'), { code: 'STATE_GATE_BLOCKED' });
  const terminalRequest = f.request('outcome', f.observedOutcome(choice));
  assert.equal(executeStateRequest(terminalRequest, f.context).state.correction_count, 1);
  assert.equal(executeStateRequest(terminalRequest, f.context).state.correction_count, 1);
  f.refresh();
  assert.throws(() => f.send('outcome', terminalRequest.payload), { code: 'STATE_CONFLICT' });
  assert.equal(f.refresh().correction_count, 1);
});

test('unrelated validation or inaccurate diff attribution cannot resolve an episode', (t) => {
  const f = fixture(t);
  f.failCycle();
  f.consult(); const choice = f.choose(); f.change();
  assert.throws(() => f.send('outcome', f.observedOutcome(choice, 'resolved', { validation: validation('passed', 'node --test tests/unrelated.test.cjs') })),
    { code: 'STATE_GATE_BLOCKED' });
  assert.throws(() => f.send('outcome', f.observedOutcome(choice, 'resolved', { actual_changed_paths: [] })), { code: 'STATE_GATE_BLOCKED' });
  assert.equal(f.refresh().correction_count, 1);
  assert.equal(f.refresh().unresolved_episode_id, choice.episode_id);
  // A passed validation cannot be counted as a failed correction. Partial
  // improvement remains unresolved when the relevant validation actually fails.
  assert.throws(() => f.send('outcome', f.observedOutcome(choice, 'unresolved', { validation: validation('passed') })),
    { code: 'STATE_INVALID' });
  assert.equal(f.refresh().correction_count, 1);
  const partial = f.send('outcome', f.observedOutcome(choice, 'unresolved')).state;
  assert.equal(partial.correction_count, 2);
  f.consult(); const next = f.choose(); f.change();
  const resolved = f.send('outcome', f.observedOutcome(next, 'resolved')).state;
  assert.equal(resolved.unresolved_episode_id, null);
  assert.equal(resolved.correction_count, 0);
  assert.equal(f.send('complete').state.gate_status, 'completed');
});

test('transport failure and reconsultation preserve unfinished corrections and failed-cycle counts', (t) => {
  const f = fixture(t);
  f.failCycle(); f.consult(); const choice = f.choose();
  f.consult(true);
  assert.equal(f.refresh().correction.action_id, choice.action_id);
  assert.equal(f.refresh().correction_count, 1);
  assert.equal(f.refresh().gate_status, 'needs_evidence');
  f.consult();
  assert.throws(() => f.choose(), { code: 'STATE_PENDING' });
  f.change();
  assert.equal(f.send('outcome', f.observedOutcome(choice)).state.correction_count, 2);
});

test('never-started and dead controller recovery is explicit; live controller cannot be recovered', (t) => {
  const f = fixture(t);
  f.failCycle();
  let reserved = f.send('checkpoint', { checkpoint: f.checkpoint() });
  assert.equal(f.send('get').pending_process_status, 'never-started');
  assert.equal(f.human('recover-pending').state.correction_count, 1);
  reserved = f.send('checkpoint', { checkpoint: f.checkpoint() });
  const claim = claimCheckpoint(reserved.checkpoint, f.context);
  assert.equal(f.send('get').pending_process_status, 'live');
  assert.throws(() => f.human('recover-pending'), { code: 'STATE_PENDING' });
  attachControllerResult(claim, f.envelope(claim), f.context);
  f.refresh();
  reserved = f.send('checkpoint', { checkpoint: f.checkpoint() });
  const child = spawnSync(process.execPath, ['-e',
    'const {claimCheckpoint}=require(process.argv[1]); claimCheckpoint(JSON.parse(process.argv[2]), JSON.parse(process.argv[3]));',
    servicePath, JSON.stringify(reserved.checkpoint), JSON.stringify(f.context)], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const pending = f.send('get');
  assert.equal(pending.pending_process_status, 'dead');
  assert.throws(() => claimCheckpoint(reserved.checkpoint, f.context), { code: 'STATE_PENDING' });
  const recovered = f.human('recover-pending').state;
  assert.equal(recovered.pending, null);
  assert.equal(recovered.correction_count, 1);
  assert.equal(recovered.unresolved_episode_id, 'selected-defect');
});

test('observed scope expansion preserves initial task and user baseline across resume', (t) => {
  const f = fixture(t);
  const initial = f.refresh();
  fs.writeFileSync(path.join(f.cwd, 'src/helper.cjs'), 'existing helper user edits\n');
  const checkpoint = f.checkpoint();
  checkpoint.task = { ...checkpoint.task, authorized_paths: ['src/app.cjs', 'src/helper.cjs'] };
  assert.throws(() => f.send('checkpoint', { checkpoint }), { code: 'STATE_CONFLICT' });
  const revised = f.human('revise-scope', ['src/helper.cjs']).state;
  assert.equal(revised.scope_revision, 1);
  assert.deepEqual(revised.task, initial.task);
  assert.deepEqual(revised.initial_baseline, initial.initial_baseline);
  assert.deepEqual(revised.scope.authorized_paths, ['src/app.cjs', 'src/helper.cjs']);
  assert.equal(revised.scope.added_baseline[0].digest, createHash('sha256').update('existing helper user edits\n').digest('hex'));
  const resumed = f.refresh();
  assert.deepEqual(resumed.scope, revised.scope);
  f.consult(); const choice = f.choose(); f.change();
  f.send('outcome', f.observedOutcome(choice, 'resolved'));
  fs.writeFileSync(path.join(f.cwd, 'src/helper.cjs'), 'unobserved relevant change\n');
  assert.throws(() => f.send('complete'), { code: 'STALE_EVIDENCE_REVISION' });
});

test('state corruption and unknown request keys never authorize work', (t) => {
  const f = fixture(t);
  assert.throws(() => executeStateRequest({ ...f.request('get'), approved: undefined }, f.context), { code: 'STATE_INVALID' });
  assert.throws(() => executeStateRequest('{"protocol":"evcrate-advisor-state","protocol":"evcrate-advisor-state"}', f.context), { code: 'STATE_INVALID' });
  f.failCycle();
  const location = stateLocation(f.context, f.taskRunId);
  const statePath = path.join(location.taskDirectory, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.correction_count = 0;
  fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  assert.throws(() => f.refresh(), { code: 'STATE_INVALID' });
  assert.equal(fs.readFileSync(path.join(f.cwd, 'unrelated.txt'), 'utf8'), 'unrelated user work\n');
});

test('project and task identity remain isolated and missing state cannot be recreated by get', (t) => {
  const f = fixture(t);
  const sibling = randomUUID();
  assert.throws(() => executeStateRequest(f.request('get', {}, { task_run_id: sibling }), f.context), { code: 'STATE_NOT_FOUND' });
  const otherProject = path.join(f.root, 'other-project');
  fs.mkdirSync(otherProject, { mode: 0o700 });
  assert.throws(() => executeStateRequest(f.request('get'), { ...f.context, cwd: otherProject }), { code: 'STATE_NOT_FOUND' });
  assert.equal(f.refresh().gate_status, 'open');
  assert.equal(f.refresh().task_run_id, f.taskRunId);
});

test('bounded operation ledger refuses new work rather than forgetting replay identities', (t) => {
  const f = fixture(t);
  f.consult();
  const payload = { consultation_id: f.refresh().last_consultation_id, evidence_revision: 0,
    action: 'need-evidence', rationale: 'More evidence is needed before a correction.', correction: null };
  const first = f.request('disposition', payload);
  executeStateRequest(first, f.context);
  while (f.refresh().operation_ledger.length < MAX_OPERATIONS) f.send('disposition', payload);
  assert.throws(() => f.send('disposition', payload), { code: 'STATE_GATE_BLOCKED' });
  const current = f.refresh();
  assert.equal(executeStateRequest(first, f.context).state.task_revision, current.task_revision);
  assert.equal(f.refresh().correction_count, 0);
});

test('ordinary no-correction outcomes complete and final review never requires invented edits', (t) => {
  const f = fixture(t);
  const original = f.refresh().initial_baseline;
  f.consult(false, false);
  let state = f.refresh();
  f.send('disposition', { consultation_id: state.last_consultation_id, evidence_revision: state.evidence_revision,
    action: 'accept', rationale: 'Review confirms no correction is needed.', correction: null });
  const payload = { consultation_id: state.last_consultation_id, action_id: null, episode_id: null,
    result: 'resolved', validation: validation('passed'), actual_changed_paths: [] };
  assert.throws(() => f.send('complete'), { code: 'STATE_GATE_BLOCKED' });
  assert.throws(() => f.send('outcome', { ...payload, validation: validation('passed', 'unrelated') }), { code: 'STATE_GATE_BLOCKED' });
  f.send('outcome', { ...payload, result: 'unknown', validation: validation('skipped') });
  assert.equal(f.refresh().correction_count, 0);
  f.send('outcome', payload);
  assert.throws(() => f.send('outcome', payload), { code: 'STATE_GATE_BLOCKED' });
  f.consult(false, false);
  state = f.refresh();
  assert.throws(() => f.send('complete'), { code: 'STATE_GATE_BLOCKED' });
  f.send('disposition', { consultation_id: state.last_consultation_id, evidence_revision: state.evidence_revision,
    action: 'accept', rationale: 'Final review needs no further changes.', correction: null });
  f.send('outcome', { ...payload, consultation_id: state.last_consultation_id });
  const completed = f.send('complete').state;
  assert.equal(completed.gate_status, 'completed');
  assert.equal(completed.correction_count, 0);
  assert.deepEqual(completed.initial_baseline, original);
});

test('pending consultation allows recovery when near ledger capacity', (t) => {
  const f = fixture(t);
  f.consult();
  const payload = { consultation_id: f.refresh().last_consultation_id, evidence_revision: 0,
    action: 'need-evidence', rationale: 'Wait for evidence.', correction: null };
  while (f.refresh().operation_ledger.length < MAX_OPERATIONS - 5) f.send('disposition', payload);
  assert.equal(f.refresh().operation_ledger.length, 59);
  f.send('checkpoint', { checkpoint: f.checkpoint() });
  assert.equal(f.refresh().operation_ledger.length, 60);
  const recovered = f.human('recover-pending').state;
  assert.equal(recovered.pending, null);
  assert.equal(recovered.operation_ledger.length, 61);
});

test('end-to-end ledger headroom allows full closure and rejects checkpoints with <5 slots', (t) => {
  const f = fixture(t);
  f.consult(false, false);
  const payload = { consultation_id: f.refresh().last_consultation_id, evidence_revision: 0,
    action: 'need-evidence', rationale: 'Wait for evidence.', correction: null };
  // Fill ledger up to MAX_OPERATIONS - 5 = 59 entries
  while (f.refresh().operation_ledger.length < MAX_OPERATIONS - 5) f.send('disposition', payload);
  assert.equal(f.refresh().operation_ledger.length, 59);
  // Checkpoint at 59 succeeds and can complete all 5 steps up to 64
  f.consult(false, false); // 59 -> 60 (checkpoint) -> 61 (attach)
  let s = f.refresh();
  assert.equal(s.operation_ledger.length, 61);
  f.send('disposition', { consultation_id: s.last_consultation_id, evidence_revision: s.evidence_revision,
    action: 'accept', rationale: 'Clean advice accepted.', correction: null }); // 62
  f.send('outcome', { consultation_id: s.last_consultation_id, action_id: null, episode_id: null,
    result: 'resolved', validation: validation('passed'), actual_changed_paths: [] }); // 63
  const completed = f.send('complete').state; // 64
  assert.equal(completed.gate_status, 'completed');
  assert.equal(completed.operation_ledger.length, 64);
  // In a new task with 60 entries, checkpoint requires 5 slots and must fail closed before inference
  const id = randomUUID();
  executeStateRequest(f.request('init', { phase_id: 'repair', task: f.task, baseline_paths: ['src/app.cjs'] },
    { task_run_id: id, expected_revision: 0 }), f.context);
  const get = () => executeStateRequest(f.request('get', {}, { task_run_id: id }), f.context).state;
  const send = (operation, p) => executeStateRequest(f.request(operation, p,
    { task_run_id: id, expected_revision: get().task_revision }), f.context);
  // Pad to 60 entries
  const sp = path.join(stateLocation(f.context, id).taskDirectory, 'state.json');
  const st = JSON.parse(fs.readFileSync(sp, 'utf8'));
  while (st.operation_ledger.length < 60) {
    st.operation_ledger.push({
      operation_id: randomUUID(), operation: 'complete', digest: createHash('sha256').update(randomUUID()).digest('hex'),
      revision: st.operation_ledger.length + 1, consultation_id: null, action_id: null, episode_id: null,
      outcome_result: null, validation_command: null, checkpoint_digest: null, result_digest: null
    });
    st.task_revision = st.operation_ledger.length;
  }
  st.gate_status = 'open';
  fs.writeFileSync(sp, JSON.stringify(st), { mode: 0o600 });
  assert.equal(get().operation_ledger.length, 60);
  const content = fs.readFileSync(path.join(f.cwd, 'src/app.cjs'), 'utf8');
  const cp = { protocol: 'evcrate-advisor-checkpoint', version: 2, task_run_id: id,
    checkpoint_id: randomUUID(), phase_id: 'repair', task_revision: 60, evidence_revision: 0,
    checkpoint: 'repair:review', kind: 'review', question: 'Will this fit?', task: f.task,
    proposal: { next_action: 'None', rationale: 'Check headroom', intended_changed_paths: ['src/app.cjs'] },
    evidence: { summary: 'Headroom test', files: [{ path: 'src/app.cjs', excerpt: content.trim(),
      digest: createHash('sha256').update(content).digest('hex') }], validation_results: [validation('passed')], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null } };
  assert.throws(() => send('checkpoint', { checkpoint: cp }), { code: 'STATE_GATE_BLOCKED' });
  assert.equal(get().pending, null);
});

test('preflight human decision rejects full ledger or ineligible action without observing', (t) => {
  const f = fixture(t);
  let observed = false;
  const observer = { ...f.context, observeHumanDecision: () => { observed = true; return { event_id: randomUUID(), source: 'test' }; } };
  // At open gate (not needs_human, count 0), continue is ineligible and must fail before observer
  assert.throws(() => executeStateRequest(f.request('human-decision', { action: 'continue', rationale: 'Not eligible.', authorized_paths: [] }), observer),
    { code: 'STATE_GATE_BLOCKED' });
  assert.equal(observed, false);
});

test('matching human decision replay never observes another event or requires a host callback', (t) => {
  const f = fixture(t);
  f.send('checkpoint', { checkpoint: f.checkpoint() });
  const request = f.request('human-decision', { action: 'recover-pending', rationale: 'Cancel never-started consultation.', authorized_paths: [] });
  let observations = 0;
  const host = { ...f.context, observeHumanDecision: () => {
    observations += 1;
    return { event_id: randomUUID(), source: 'test-observed-user' };
  } };
  const committed = executeStateRequest(request, host);
  assert.equal(executeStateRequest(request, host).state.task_revision, committed.state.task_revision);
  assert.equal(executeStateRequest(request, f.context).state.task_revision, committed.state.task_revision);
  assert.equal(observations, 1);
  assert.throws(() => executeStateRequest({ ...request, payload: { ...request.payload, rationale: 'Conflicting replay.' } }, host),
    { code: 'STATE_CONFLICT' });
  assert.equal(observations, 1);
});

test('unknown pending process identity cannot be recovered', (t) => {
  const f = fixture(t);
  const reserved = f.send('checkpoint', { checkpoint: f.checkpoint() });
  claimCheckpoint(reserved.checkpoint, f.context);
  const statePath = path.join(stateLocation(f.context, f.taskRunId).taskDirectory, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.pending.process.start = null;
  fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  assert.equal(f.send('get').pending_process_status, 'unknown');
  assert.throws(() => f.human('recover-pending'), { code: 'STATE_PENDING' });
  assert.notEqual(f.refresh().pending_consultation_id, null);
});

test('Git index-only correction changes are attributed even when selected bytes stay unchanged', (t) => {
  const f = fixture(t);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: f.cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-q');
  // Start a fresh task after establishing repository identity.
  const id = randomUUID();
  executeStateRequest(f.request('init', { phase_id: 'repair', task: f.task, baseline_paths: ['src/app.cjs'] },
    { task_run_id: id, expected_revision: 0 }), f.context);
  const get = () => executeStateRequest(f.request('get', {}, { task_run_id: id }), f.context).state;
  const send = (operation, payload) => executeStateRequest(f.request(operation, payload,
    { task_run_id: id, expected_revision: get().task_revision }), f.context);
  const initial = get();
  const content = fs.readFileSync(path.join(f.cwd, 'src/app.cjs'), 'utf8');
  const request = { protocol: 'evcrate-advisor-checkpoint', version: 2, task_run_id: id,
    checkpoint_id: randomUUID(), phase_id: 'repair', task_revision: initial.task_revision, evidence_revision: 0,
    checkpoint: 'review:index', kind: 'review', question: 'Review selected index correction.', task: f.task,
    proposal: { next_action: 'Stage selected source', rationale: 'Preserve source content', intended_changed_paths: ['src/app.cjs'] },
    evidence: { summary: 'Selected index status', files: [{ path: 'src/app.cjs', excerpt: content.trim(),
      digest: createHash('sha256').update(content).digest('hex') }], validation_results: [validation()], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null } };
  const reserved = send('checkpoint', { checkpoint: request });
  const claim = claimCheckpoint(reserved.checkpoint, f.context);
  attachControllerResult(claim, f.envelope(claim), f.context);
  const choice = { action_id: randomUUID(), episode_id: 'index-change', validation_command: COMMAND };
  send('disposition', { consultation_id: claim.consultationId, evidence_revision: 0,
    action: 'accept', rationale: 'Stage only selected source.', correction: choice });
  git('add', '--', 'src/app.cjs');
  const result = send('outcome', { consultation_id: claim.consultationId, action_id: choice.action_id,
    episode_id: choice.episode_id, result: 'resolved', validation: validation('passed'), actual_changed_paths: ['src/app.cjs'] });
  assert.equal(result.state.correction_count, 0);
  assert.deepEqual(result.state.outcome.actual_changed_paths, ['src/app.cjs']);
  assert.equal(fs.readFileSync(path.join(f.cwd, 'src/app.cjs'), 'utf8'), content);
});
