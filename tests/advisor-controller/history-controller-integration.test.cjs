'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const test = require('node:test');

const FAKE_CODEX = path.resolve(__dirname, 'fixtures/fake-codex.cjs');
const ADVISOR_DIR = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const { runController } = require(path.join(ADVISOR_DIR, 'controller.cjs'));
const { runManagedCheckpoint } = require(path.join(ADVISOR_DIR, 'managed-checkpoint.cjs'));
const { executeStateRequest } = require(path.join(ADVISOR_DIR, 'task-state.cjs'));
const { createRoutingError } = require(path.join(ADVISOR_DIR, 'errors.cjs'));

function buildPolicy() {
  return JSON.stringify({
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  });
}

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-hist-integ-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const d of [home, project, bin, path.join(home, '.evcrate')]) {
    fs.mkdirSync(d, { mode: 0o700 });
  }

  try { fs.chmodSync(FAKE_CODEX, 0o755); } catch {}
  fs.symlinkSync(FAKE_CODEX, path.join(bin, 'codex'));
  fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), buildPolicy(), { mode: 0o600 });
  fs.writeFileSync(path.join(home, '.evcrate/fake-codex-mode'), 'success\n', { mode: 0o600 });
  fs.writeFileSync(path.join(project, 'source.txt'), 'console.log("hello");\n');

  const providerState = path.join(home, '.evcrate/fake-codex-state.json');
  fs.writeFileSync(providerState, JSON.stringify({
    finalCount: 0,
    calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Proceed with bounded implementation.',
      rationale: 'Evidence is verified.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['Run relevant unit test.'],
      unresolved_questions: []
    })
  }), { mode: 0o600 });

  const environment = {
    ...process.env,
    HOME: home,
    TMPDIR: root,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`
  };
  delete environment.EVCRATE_ADVISOR_ACTIVE;
  delete environment.EVCRATE_ADVISOR_DEPTH;

  const projectId = createHash('sha256').update(project).digest('hex');
  const taskRunId = randomUUID();
  const consultationId = randomUUID();

  const checkpoint = {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: taskRunId,
    checkpoint_id: 'check-01',
    phase_id: 'phase-07',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:phase-07',
    kind: 'review',
    question: 'Is the implementation complete?',
    task: {
      goal: 'Implement history tracking',
      non_goals: [],
      authorized_paths: ['source.txt'],
      scope_rationale: 'History files',
      invariants: [],
      success_criteria: ['Unit tests pass']
    },
    proposal: {
      next_action: 'Run verification',
      rationale: 'Verify behavior',
      intended_changed_paths: ['source.txt']
    },
    evidence: {
      summary: 'Evidence excerpt',
      files: [{
        path: 'source.txt',
        excerpt: 'console.log("hello");',
        digest: createHash('sha256').update('console.log("hello");\n').digest('hex')
      }],
      validation_results: [{
        suite: 'test',
        command: 'npm test',
        status: 'passed',
        passed: 1,
        failed: 0,
        details: null
      }],
      artifacts: []
    },
    prior: {
      prior_consultation_id: null,
      prior_counsel: null,
      prior_disposition: null,
      observed_outcome: null
    }
  };

  return { root, home, project, projectId, taskRunId, consultationId, checkpoint, environment };
}

test('successful consultation records history execution snapshot and sets audit_status = recorded', async (t) => {
  const f = setup(t);
  const envelope = await runController(JSON.stringify(f.checkpoint), {
    cwd: f.project,
    environment: f.environment,
    consultationId: f.consultationId
  });

  assert.equal(envelope.status, 'ADVICE_READY');
  assert.equal(envelope.audit_status, 'recorded');

  const execPath = path.join(
    f.home, '.evcrate', 'advisor-history', f.projectId, f.taskRunId, f.consultationId, 'execution.json'
  );
  assert(fs.existsSync(execPath));
  const record = JSON.parse(fs.readFileSync(execPath, 'utf8'));
  assert.equal(record.status, 'ADVICE_READY');
  assert.equal(record.consultation_id, f.consultationId);
  assert.equal(record.task_run_id, f.taskRunId);
  assert.equal(record.project_id, f.projectId);
  assert.equal(record.result.recommendation, 'Proceed with bounded implementation.');
});

test('failed consultation records terminal history snapshot and sets audit_status = recorded', async (t) => {
  const f = setup(t);
  fs.writeFileSync(path.join(f.home, '.evcrate/fake-codex-mode'), 'malformed\n', { mode: 0o600 });

  const envelope = await runController(JSON.stringify(f.checkpoint), {
    cwd: f.project,
    environment: f.environment,
    consultationId: f.consultationId
  });

  assert.equal(envelope.status, 'FAILED');
  assert.equal(envelope.audit_status, 'recorded');

  const execPath = path.join(
    f.home, '.evcrate', 'advisor-history', f.projectId, f.taskRunId, f.consultationId, 'execution.json'
  );
  assert(fs.existsSync(execPath));
  const record = JSON.parse(fs.readFileSync(execPath, 'utf8'));
  assert.equal(record.status, 'FAILED');
  assert.equal(record.error.code, 'PROTOCOL_INVALID');
});

test('degraded history store marks audit_status = degraded without failing inference or retrying', async (t) => {
  const f = setup(t);

  const failingRecordStarted = () => {
    throw createRoutingError('AUDIT_DEGRADED');
  };

  const envelope = await runController(JSON.stringify(f.checkpoint), {
    cwd: f.project,
    environment: f.environment,
    consultationId: f.consultationId,
    recordStartedExecution: failingRecordStarted
  });

  assert.equal(envelope.status, 'ADVICE_READY');
  assert.equal(envelope.audit_status, 'degraded');
  assert.equal(envelope.result.recommendation, 'Proceed with bounded implementation.');
  assert.equal(envelope.attempts.filter((a) => a.model_started).length, 1);
});

test('state outcome operation links and persists outcome.json in history directory', async (t) => {
  const f = setup(t);

  // 1. Initialize task state
  const initRes = executeStateRequest({
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: f.taskRunId,
    operation_id: randomUUID(),
    expected_revision: 0,
    payload: {
      phase_id: 'phase-07',
      task: f.checkpoint.task,
      baseline_paths: ['source.txt']
    }
  }, { cwd: f.project, environment: f.environment });
  assert.equal(initRes.status, 'STATE_READY');

  // 2. Reserve checkpoint
  const chkReq = {
    ...f.checkpoint,
    task_revision: initRes.state.task_revision,
    evidence_revision: initRes.state.evidence_revision
  };
  const chkRes = executeStateRequest({
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'checkpoint',
    task_run_id: f.taskRunId,
    operation_id: randomUUID(),
    expected_revision: initRes.state.task_revision,
    payload: { checkpoint: chkReq }
  }, { cwd: f.project, environment: f.environment });
  assert.equal(chkRes.status, 'STATE_READY');
  const consId = chkRes.consultation_id;

  // 3. Run managed checkpoint (executes controller, writes execution.json, attaches result)
  const envelope = await runManagedCheckpoint(JSON.stringify(chkReq), {
    cwd: f.project,
    environment: f.environment
  });
  assert.equal(envelope.status, 'ADVICE_READY');
  assert.equal(envelope.audit_status, 'recorded');

  // Get current state revision after attach
  const getRes = executeStateRequest({
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'get',
    task_run_id: f.taskRunId,
    operation_id: null,
    expected_revision: null,
    payload: {}
  }, { cwd: f.project, environment: f.environment });

  // 4. Record disposition
  const dispRes = executeStateRequest({
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'disposition',
    task_run_id: f.taskRunId,
    operation_id: randomUUID(),
    expected_revision: getRes.state.task_revision,
    payload: {
      consultation_id: consId,
      evidence_revision: getRes.state.evidence_revision,
      action: 'accept',
      rationale: 'Accepted advice without concerns.',
      correction: null
    }
  }, { cwd: f.project, environment: f.environment });
  assert.equal(dispRes.status, 'STATE_READY');

  // 5. Record outcome
  const outcomeRes = executeStateRequest({
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'outcome',
    task_run_id: f.taskRunId,
    operation_id: randomUUID(),
    expected_revision: dispRes.state.task_revision,
    payload: {
      consultation_id: consId,
      action_id: null,
      episode_id: null,
      result: 'resolved',
      validation: {
        suite: 'test',
        command: 'npm test',
        status: 'passed',
        passed: 1,
        failed: 0,
        details: null
      },
      actual_changed_paths: []
    }
  }, { cwd: f.project, environment: f.environment });

  assert.equal(outcomeRes.status, 'STATE_READY');

  // Verify outcome.json exists in history directory
  const outPath = path.join(
    f.home, '.evcrate', 'advisor-history', f.projectId, f.taskRunId, consId, 'outcome.json'
  );
  assert(fs.existsSync(outPath));
  const outData = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.equal(outData.outcome, 'resolved');
  assert.equal(outData.consultation_id, consId);
  assert.equal(outData.task_run_id, f.taskRunId);
});
