'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const LIB = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const ACTIVATION_MODULE = path.join(LIB, 'activation.cjs');
const CLI_PATH = path.resolve(LIB, '../../evcrate-advice-mode');

function createContext(overrides = {}) {
  return { project_root: process.cwd(), command: 'code', work_target: 'plans/test/plan.md',
    plan_path: 'plans/test/plan.md', phase_path: 'plans/test/phase-01.md', phase_id: 'phase-01', ...overrides };
}
function createRun(overrides = {}) {
  return { task_run_id: '00000000-0000-4000-8000-000000000001', project_id: 'a'.repeat(64),
    task_revision: 1, scope_revision: 0, evidence_revision: 0, ...overrides };
}
function createRequest(overrides = {}) {
  return { protocol: 'evcrate-advice-mode', version: 1, raw_arguments: '', context: createContext(), handoff: null, ...overrides };
}
function createPreRunHandoff(overrides = {}) {
  return { kind: 'pre-run', context: createContext(overrides), run: null };
}
function createSameRunHandoff(runOverrides = {}, contextOverrides = {}) {
  return { kind: 'same-run', context: createContext(contextOverrides), run: createRun(runOverrides) };
}
function createIsolatedFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-activation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(project, { mode: 0o700 });
  return { root, home, project, taskRunId: randomUUID(), context: { cwd: project, environment: { HOME: home } } };
}
function operate(f, operation, revision, payload, extra = {}) {
  const { executeStateRequest } = require(path.join(LIB, 'task-state.cjs'));
  return executeStateRequest({ protocol: 'evcrate-advisor-state', version: 1, operation,
    task_run_id: f.taskRunId, operation_id: operation === 'get' ? null : randomUUID(),
    expected_revision: revision, payload }, { ...f.context, ...extra }).state;
}
function initializeStateFixture(f) {
  const state = operate(f, 'init', 0, { phase_id: 'phase-01', task: {
    goal: 'Activation isolated test task', non_goals: [], authorized_paths: [],
    scope_rationale: 'Activation regression fixture', invariants: [], success_criteria: []
  }, baseline_paths: [] });
  const { stateLocation } = require(path.join(LIB, 'state-io.cjs'));
  f.stateFile = path.join(stateLocation(f.context, f.taskRunId).taskDirectory, 'state.json');
  return state;
}
function abandonStateFixture(f, state) {
  return operate(f, 'human-decision', state.task_revision,
    { action: 'abandon', rationale: 'Isolated abandonment fixture', authorized_paths: [] },
    { observeHumanDecision: () => ({ event_id: randomUUID(), source: 'test-host-observed-user' }) });
}
function reserveStateFixture(f, state) {
  const checkpoint = { protocol: 'evcrate-advisor-checkpoint', version: 2, task_run_id: f.taskRunId,
    checkpoint_id: randomUUID(), phase_id: state.phase_id, task_revision: state.task_revision,
    evidence_revision: state.evidence_revision, checkpoint: 'review:activation-fixture', kind: 'review',
    question: 'Is the isolated fixture ready?', task: state.task,
    proposal: { next_action: 'Inspect the fixture', rationale: 'Test continuation', intended_changed_paths: [] },
    evidence: { summary: 'Isolated fixture', files: [], artifacts: [], validation_results: [fixtureValidation()] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null } };
  return operate(f, 'checkpoint', state.task_revision, { checkpoint });
}
function fixtureValidation() {
  return { suite: 'fixture', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: null };
}
function completeStateFixture(f, state) {
  const { claimCheckpoint, attachControllerResult } = require(path.join(LIB, 'task-state.cjs'));
  const { buildSuccessEnvelope } = require(path.join(LIB, 'controller-envelope.cjs'));
  const pending = reserveStateFixture(f, state);
  const claim = claimCheckpoint(pending.pending.checkpoint, f.context);
  // Controlled counsel exercises the real state machine, not a native provider.
  const envelope = buildSuccessEnvelope({ correlation_id: claim.consultationId, checkpoint: claim.checkpoint,
    receipt: { backend: 'codex', model: 'test-model', effort: 'high', adapter_version: 'test', elapsed_ms: 1 },
    attempts: [{ attempt_id: randomUUID(), slot: 'primary', route: { backend: 'codex', model: 'test-model', effort: 'high' },
      phase: 'model', model_started: true, elapsed_ms: 1, terminal_classification: 'success', retry_delay_ms: null, cleanup_outcome: 'confirmed' }],
    cleanup_outcome: 'confirmed', result: { protocol: 'evcrate-advisor-result', version: 2,
      checkpoint: claim.checkpoint.checkpoint, status: 'ADVICE_READY', recommendation: 'Accept the fixture.',
      rationale: 'The isolated state is ready.', must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: [] } });
  let latest = attachControllerResult(claim, envelope, f.context);
  latest = operate(f, 'disposition', latest.task_revision, { consultation_id: claim.consultationId,
    evidence_revision: latest.evidence_revision, action: 'accept', rationale: 'Accept fixture counsel', correction: null });
  latest = operate(f, 'outcome', latest.task_revision, { consultation_id: claim.consultationId,
    action_id: null, episode_id: null, result: 'resolved', validation: fixtureValidation(), actual_changed_paths: [] });
  return operate(f, 'complete', latest.task_revision, {});
}
function spawnCli(input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...(options.args || [])], {
      cwd: options.cwd || process.cwd(), env: options.env || process.env,
      stdio: options.ipc ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Activation fixture timed out')); }, 15000);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.stdin.on('error', (error) => { if (error.code !== 'EPIPE') reject(error); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      try {
        const output = Buffer.concat(stdout).toString('utf8');
        assert.equal(Buffer.concat(stderr).toString('utf8'), '');
        assert.equal(signal, null);
        assert.equal(output.split('\n').length, 2);
        resolve({ status, stdout: output });
      } catch (error) { reject(error); }
    });
    if (input !== undefined && input !== null) child.stdin.write(input);
    if (!options.keepStdinOpen) child.stdin.end();
    if (options.onSpawn) child.once('spawn', () => options.onSpawn(child));
  });
}

module.exports = { ACTIVATION_MODULE, CLI_PATH, createContext, createRun, createRequest,
  createPreRunHandoff, createSameRunHandoff, createIsolatedFixture, initializeStateFixture,
  abandonStateFixture, reserveStateFixture, completeStateFixture, spawnCli };
