'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const CLI = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/evcrate-advisor');
const LIB = path.join(path.dirname(CLI), 'lib/advisor');
const { runManagedCheckpoint } = require(path.join(LIB, 'managed-checkpoint.cjs'));
const { observeTerminalDecision } = require(path.join(LIB, 'state-human.cjs'));

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-state-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  for (const directory of [home, cwd, bin, path.join(home, '.evcrate')]) fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'original user work\n');
  fs.writeFileSync(path.join(home, 'sentinel'), 'preserve');
  fs.symlinkSync(path.join(__dirname, 'fixtures/fake-codex.cjs'), path.join(bin, 'codex'));
  const policy = { version: 2, advisor: {
    primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
  }, wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
  history: { retention_days: 30, max_bytes: 104857600 } };
  fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), JSON.stringify(policy), { mode: 0o600 });
  const providerState = path.join(home, '.evcrate/fake-codex-state.json');
  fs.writeFileSync(providerState, JSON.stringify({ finalCount: 0, calls: [], returnJson: JSON.stringify({
    recommendation: 'Apply the bounded correction.', rationale: 'Relevant evidence is sufficient.',
    must_fix: [], cautions: [], assumptions: [], success_checks: ['Run relevant validation.'], unresolved_questions: []
  }) }), { mode: 0o600 });
  const environment = { ...process.env, HOME: home, TMPDIR: root, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  delete environment.EVCRATE_ADVISOR_ACTIVE;
  delete environment.EVCRATE_ADVISOR_DEPTH;
  const taskRunId = randomUUID();
  const task = { goal: 'Correct selected source', non_goals: ['Unrelated changes'], authorized_paths: ['source.txt'],
    scope_rationale: 'Selected source owns the defect.', invariants: ['Preserve user work'], success_criteria: ['Relevant validation passes'] };
  function invoke(args, input) {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env: environment,
      input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, '');
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    return { exit: result.status, value: JSON.parse(lines[0]) };
  }
  function operation(operation, expected_revision, payload, operation_id = randomUUID()) {
    return invoke(['state', operation], { protocol: 'evcrate-advisor-state', version: 1, operation,
      task_run_id: taskRunId, operation_id: operation === 'get' ? null : operation_id,
      expected_revision, payload });
  }
  function checkpoint(revision = 1, evidenceRevision = 0) {
    return { protocol: 'evcrate-advisor-checkpoint', version: 2, task_run_id: taskRunId,
      checkpoint_id: `checkpoint-${revision}`, phase_id: 'phase-06', task_revision: revision, evidence_revision: evidenceRevision,
      checkpoint: 'review:phase-06', kind: 'review', question: 'Is the selected correction safe?', task,
      proposal: { next_action: 'Correct source', rationale: 'Fix root cause', intended_changed_paths: ['source.txt'] },
      evidence: { summary: 'Actual selected source', files: [{ path: 'source.txt', excerpt: 'original user work',
        digest: createHash('sha256').update(fs.readFileSync(path.join(cwd, 'source.txt'))).digest('hex') }],
      validation_results: [{ suite: 'selected', command: 'node --check source.txt', status: 'passed', passed: 1, failed: 0, details: null }], artifacts: [] },
      prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null } };
  }
  function reserve() {
    const initialized = operation('init', 0, { phase_id: 'phase-06', task, baseline_paths: ['source.txt'] });
    assert.equal(initialized.value.status, 'STATE_READY', JSON.stringify(initialized));
    const request = checkpoint(initialized.value.state.task_revision, initialized.value.state.evidence_revision);
    const reserved = operation('checkpoint', initialized.value.state.task_revision, { checkpoint: request });
    assert.equal(reserved.value.status, 'STATE_READY', JSON.stringify(reserved));
    return request;
  }
  return { home, cwd, environment, invoke, operation, checkpoint, reserve, task,
    provider: () => JSON.parse(fs.readFileSync(providerState, 'utf8')) };
}

test('state CLI reserves once, persists terminal linkage before advice, and never repeats inference on replay', (t) => {
  const f = setup(t);
  const request = f.reserve();
  const first = f.invoke([], request);
  assert.equal(first.exit, 0, JSON.stringify(first));
  assert.equal(first.value.status, 'ADVICE_READY');
  const resumed = f.operation('get', null, {});
  assert.equal(resumed.value.status, 'STATE_READY');
  assert.equal(resumed.value.state.pending_consultation_id, null);
  assert.equal(resumed.value.state.last_consultation_id, first.value.correlation_id);
  const duplicate = f.invoke([], request);
  assert.equal(duplicate.exit, 1);
  assert.equal(duplicate.value.status, 'FAILED');
  assert.equal(f.provider().finalCount, 1);
  assert.equal(fs.readFileSync(path.join(f.home, 'sentinel'), 'utf8'), 'preserve');
});

test('missing required state and relevant edits prevent any provider process', (t) => {
  const f = setup(t);
  const missing = f.invoke([], f.checkpoint());
  assert.equal(missing.exit, 1);
  assert.equal(missing.value.error.code, 'STATE_NOT_FOUND');
  const request = f.reserve();
  fs.writeFileSync(path.join(f.cwd, 'source.txt'), 'changed evidence\n');
  const stale = f.invoke([], request);
  assert.equal(stale.exit, 1);
  assert.equal(stale.value.error.code, 'STALE_EVIDENCE_REVISION');
  assert.equal(f.provider().calls.length, 0);
});

test('terminal required-state write failure suppresses advice without retrying inference', async (t) => {
  const f = setup(t);
  const request = f.reserve();
  const projectId = createHash('sha256').update(fs.realpathSync(f.cwd)).digest('hex');
  const stateDirectory = path.join(f.home, '.evcrate/advisor-state', projectId, request.task_run_id);
  const result = await runManagedCheckpoint(JSON.stringify(request), {
    cwd: f.cwd, environment: f.environment,
    onAttempt() { fs.chmodSync(stateDirectory, 0o500); }
  });
  fs.chmodSync(stateDirectory, 0o700);
  assert.equal(result.status, 'FAILED');
  assert.equal(f.provider().finalCount, 1);
  const current = f.operation('get', null, {});
  assert.notEqual(current.value.state.pending_consultation_id, null);
  assert.equal(f.invoke([], request).exit, 1);
  assert.equal(f.provider().finalCount, 1);
});

test('piped human decision JSON is not a human authorization event', (t) => {
  const f = setup(t);
  const init = f.operation('init', 0, { phase_id: 'phase-06', task: f.checkpoint().task, baseline_paths: ['source.txt'] });
  assert.equal(init.value.status, 'STATE_READY');
  const current = f.operation('get', null, {});
  const decision = f.operation('human-decision', current.value.state.task_revision,
    { action: 'abandon', rationale: 'A model cannot authorize itself.', authorized_paths: [] });
  assert.equal(decision.exit, 1);
  assert.equal(decision.value.error.code, 'HUMAN_EVENT_REQUIRED');
  assert.equal(f.operation('get', null, {}).value.state.task_revision, current.value.state.task_revision);
  assert.equal(f.provider().calls.length, 0);
});

test('actual CLI completes concern-free review with no correction and no invented file change', (t) => {
  const f = setup(t);
  const checkpoint = f.reserve();
  const advice = f.invoke([], checkpoint);
  assert.equal(advice.value.status, 'ADVICE_READY');
  let current = f.operation('get', null, {}).value.state;
  const accepted = f.operation('disposition', current.task_revision, {
    consultation_id: advice.value.correlation_id, evidence_revision: current.evidence_revision,
    action: 'accept', rationale: 'No change is required.', correction: null
  });
  assert.equal(accepted.value.status, 'STATE_READY');
  const result = f.operation('outcome', accepted.value.state.task_revision, {
    consultation_id: advice.value.correlation_id, action_id: null, episode_id: null, result: 'resolved',
    validation: { suite: 'selected', command: 'node --check source.txt', status: 'passed', passed: 1, failed: 0, details: null },
    actual_changed_paths: []
  });
  assert.equal(result.value.status, 'STATE_READY', JSON.stringify(result));
  const completed = f.operation('complete', result.value.state.task_revision, {});
  assert.equal(completed.value.state.gate_status, 'completed');
  assert.equal(completed.value.state.correction_count, 0);
  assert.equal(fs.readFileSync(path.join(f.cwd, 'source.txt'), 'utf8'), 'original user work\n');
});

test('state checkpoint rejects string array evidence.files with REQUEST_INVALID without mutating state', (t) => {
  const f = setup(t);
  const initialized = f.operation('init', 0, { phase_id: 'phase-06', task: f.task, baseline_paths: ['source.txt'] });
  assert.equal(initialized.value.status, 'STATE_READY');
  const badCheckpoint = {
    ...f.checkpoint(1, 0),
    evidence: {
      ...f.checkpoint(1, 0).evidence,
      files: ['source.txt']
    }
  };
  const result = f.operation('checkpoint', 1, { checkpoint: badCheckpoint });
  assert.equal(result.exit, 1);
  assert.equal(result.value.status, 'FAILED');
  assert.equal(result.value.error.code, 'REQUEST_INVALID');
  assert.equal(result.value.error.category, 'request');
  assert.match(result.value.error.action, /evidence\.files requires objects with \{ path, excerpt, digest \}/);
  const current = f.operation('get', null, {});
  assert.equal(current.value.state.task_revision, 1);
  assert.equal(current.value.state.pending, null);
});

test('terminal human observer propagates cancellation instead of human-event-required', async () => {
  const request = { task_run_id: randomUUID(), expected_revision: 1, payload: { action: 'continue' } };
  await assert.rejects(() => observeTerminalDecision(request, AbortSignal.abort()), (err) => err.code === 'CANCELLED');
});
