'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const CLI = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/evcrate-advisor');
const LIB = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const { computeCheckpointDigestV2 } = require(path.join(LIB, 'contracts-v2.cjs'));
const { ADVISOR_BUILD_IDENTITY } = require(path.join(LIB, 'checkpoint-contract.cjs'));
const { recordStartedExecution, recordTerminalExecution } = require(path.join(LIB, 'history-store.cjs'));

function makeCheckpoint(taskRunId, pathName = 'source.txt') {
  return {
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
      authorized_paths: [pathName],
      scope_rationale: 'History files',
      invariants: [],
      success_criteria: ['Unit tests pass']
    },
    proposal: {
      next_action: 'Run verification',
      rationale: 'Verify behavior',
      intended_changed_paths: [pathName]
    },
    evidence: {
      summary: 'Evidence excerpt',
      files: [{
        path: pathName,
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
}

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-hist-cli-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const d of [home, project, bin, path.join(home, '.evcrate')]) {
    fs.mkdirSync(d, { mode: 0o700 });
  }
  fs.writeFileSync(path.join(project, 'source.txt'), 'console.log("hello");\n');

  const policy = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
  fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), JSON.stringify(policy), { mode: 0o600 });

  const environment = {
    ...process.env,
    HOME: home,
    TMPDIR: root,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`
  };
  delete environment.EVCRATE_ADVISOR_ACTIVE;
  delete environment.EVCRATE_ADVISOR_DEPTH;

  const projectId = createHash('sha256').update(project).digest('hex');
  const context = { cwd: project, environment };

  function invoke(operation, payload) {
    const input = JSON.stringify({
      protocol: 'evcrate-advisor-history',
      version: 1,
      operation,
      ...payload
    });
    const result = spawnSync(process.execPath, [CLI, 'history', operation], {
      cwd: project,
      env: environment,
      input,
      encoding: 'utf8',
      timeout: 15000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, '');
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    return { exit: result.status, value: JSON.parse(lines[0]) };
  }

  return { root, home, project, projectId, context, invoke };
}

test('history CLI list returns empty list when no history exists', (t) => {
  const f = setup(t);
  const res = f.invoke('list', {
    project_id: null,
    task_run_id: null,
    status: null,
    cursor: null,
    limit: null
  });

  assert.equal(res.exit, 0);
  assert.equal(res.value.status, 'HISTORY_READY');
  assert.deepEqual(res.value.entries, []);
  assert.equal(res.value.next_cursor, null);
});

test('history CLI list, show, and export work end-to-end through process execution', (t) => {
  const f = setup(t);
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

  // Populate history
  const started = {
    schema_version: 1,
    consultation_id: consultationId,
    task_run_id: taskRunId,
    project_id: f.projectId,
    checkpoint_digest: digest,
    checkpoint,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: null,
    prompt_identity: 'canonical-mentor-brief-v2',
    build_identity: ADVISOR_BUILD_IDENTITY,
    attempts: [],
    status: 'started',
    result: null,
    error: null,
    started_at: 1000,
    completed_at: null
  };
  recordStartedExecution(f.context, started);

  const terminal = {
    ...started,
    receipt: {
      backend: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'high',
      controller_version: 2,
      adapter_version: '0.150.1',
      elapsed_ms: 1000,
      build_identity: ADVISOR_BUILD_IDENTITY
    },
    status: 'ADVICE_READY',
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:phase-07',
      status: 'ADVICE_READY',
      recommendation: 'Apply fix',
      rationale: 'Evidence clear.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['Pass tests.'],
      unresolved_questions: []
    },
    error: null,
    completed_at: 2000
  };
  recordTerminalExecution(f.context, terminal);

  // 1. List
  const listRes = f.invoke('list', {
    project_id: f.projectId,
    task_run_id: null,
    status: 'ADVICE_READY',
    cursor: null,
    limit: 10
  });
  assert.equal(listRes.exit, 0);
  assert.equal(listRes.value.status, 'HISTORY_READY');
  assert.equal(listRes.value.entries.length, 1);
  assert.equal(listRes.value.entries[0].consultation_id, consultationId);

  // 2. Show
  const showRes = f.invoke('show', {
    project_id: f.projectId,
    task_run_id: taskRunId,
    consultation_id: consultationId
  });
  assert.equal(showRes.exit, 0);
  assert.equal(showRes.value.status, 'HISTORY_READY');
  assert.equal(showRes.value.execution.status, 'ADVICE_READY');
  assert.equal(showRes.value.execution.result.recommendation, 'Apply fix');

  // 3. Export preview (dry_run: true)
  const exportTarget = path.join(f.root, 'cli-export.json');
  const prevRes = f.invoke('export', {
    destination: exportTarget,
    project_id: f.projectId,
    task_run_id: null,
    consultation_id: null,
    dry_run: true
  });
  assert.equal(prevRes.exit, 0);
  assert.equal(prevRes.value.status, 'HISTORY_READY');
  assert.equal(prevRes.value.dry_run, true);
  assert.equal(prevRes.value.exported_count, 1);
  assert.equal(fs.existsSync(exportTarget), false); // Not created in dry_run!

  // 4. Export apply (dry_run: false)
  const expRes = f.invoke('export', {
    destination: exportTarget,
    project_id: f.projectId,
    task_run_id: null,
    consultation_id: null,
    dry_run: false
  });
  assert.equal(expRes.exit, 0);
  assert.equal(expRes.value.status, 'HISTORY_READY');
  assert.equal(expRes.value.dry_run, false);
  assert.equal(expRes.value.exported_count, 1);
  assert(fs.existsSync(exportTarget));
  const expData = JSON.parse(fs.readFileSync(exportTarget, 'utf8'));
  assert.equal(expData.length, 1);
  assert.equal(expData[0].execution.consultation_id, consultationId);
});

test('history CLI prune supports dry-run preview and apply modes', (t) => {
  const f = setup(t);
  const taskRunId = randomUUID();
  const cActive = randomUUID();
  const cExpired = randomUUID();

  const chkActive = makeCheckpoint(taskRunId);
  const digestActive = computeCheckpointDigestV2(chkActive);

  // Active record
  recordStartedExecution(f.context, {
    schema_version: 1,
    consultation_id: cActive,
    task_run_id: taskRunId,
    project_id: f.projectId,
    checkpoint_digest: digestActive,
    checkpoint: chkActive,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: null,
    prompt_identity: 'canonical-mentor-brief-v2',
    build_identity: ADVISOR_BUILD_IDENTITY,
    attempts: [],
    status: 'started',
    result: null,
    error: null,
    started_at: 100,
    completed_at: null
  });

  const chkExpired = makeCheckpoint(taskRunId);
  const digestExpired = computeCheckpointDigestV2(chkExpired);

  // Expired record
  recordStartedExecution(f.context, {
    schema_version: 1,
    consultation_id: cExpired,
    task_run_id: taskRunId,
    project_id: f.projectId,
    checkpoint_digest: digestExpired,
    checkpoint: chkExpired,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: null,
    prompt_identity: 'canonical-mentor-brief-v2',
    build_identity: ADVISOR_BUILD_IDENTITY,
    attempts: [],
    status: 'started',
    result: null,
    error: null,
    started_at: 200,
    completed_at: null
  });
  recordTerminalExecution(f.context, {
    schema_version: 1,
    consultation_id: cExpired,
    task_run_id: taskRunId,
    project_id: f.projectId,
    checkpoint_digest: digestExpired,
    checkpoint: chkExpired,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: {
      backend: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'high',
      controller_version: 2,
      adapter_version: '0.150.1',
      elapsed_ms: 100,
      build_identity: ADVISOR_BUILD_IDENTITY
    },
    prompt_identity: 'canonical-mentor-brief-v2',
    build_identity: ADVISOR_BUILD_IDENTITY,
    attempts: [],
    status: 'ADVICE_READY',
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:phase-07',
      status: 'ADVICE_READY',
      recommendation: 'Done.',
      rationale: 'Ok.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: [],
      unresolved_questions: []
    },
    error: null,
    started_at: 200,
    completed_at: 300
  });

  // Dry run
  const dryRes = f.invoke('prune', {
    dry_run: true,
    retention_days: 1,
    max_bytes: null
  });
  assert.equal(dryRes.exit, 0);
  assert.equal(dryRes.value.dry_run, true);
  assert.equal(dryRes.value.eligible_count, 1);
  assert.equal(dryRes.value.pruned_count, 0);
  assert.equal(dryRes.value.active_count, 1);

  // Apply
  const applyRes = f.invoke('prune', {
    dry_run: false,
    retention_days: 1,
    max_bytes: null
  });
  assert.equal(applyRes.exit, 0);
  assert.equal(applyRes.value.dry_run, false);
  assert.equal(applyRes.value.pruned_count, 1);
  assert.equal(applyRes.value.active_count, 1);

  // List confirms only active record remains
  const listRes = f.invoke('list', {
    project_id: null,
    task_run_id: null,
    status: null,
    cursor: null,
    limit: null
  });
  assert.equal(listRes.value.entries.length, 1);
  assert.equal(listRes.value.entries[0].consultation_id, cActive);
});

test('history CLI rejects malformed requests with exit 1 and failure envelope', (t) => {
  const f = setup(t);

  // Unknown operation
  const resBadOp = spawnSync(process.execPath, [CLI, 'history', 'unknown_op'], {
    cwd: f.project,
    env: f.context.environment,
    input: '{}',
    encoding: 'utf8'
  });
  assert.equal(resBadOp.status, 1);
  const envBadOp = JSON.parse(resBadOp.stdout.trim());
  assert.equal(envBadOp.status, 'FAILED');

  // Oversized input (> 64 KiB)
  const oversized = 'x'.repeat(65 * 1024);
  const resOver = spawnSync(process.execPath, [CLI, 'history', 'list'], {
    cwd: f.project,
    env: f.context.environment,
    input: oversized,
    encoding: 'utf8'
  });
  assert.equal(resOver.status, 1);
  const envOver = JSON.parse(resOver.stdout.trim());
  assert.equal(envOver.status, 'FAILED');
  assert.equal(envOver.error.code, 'REQUEST_INVALID');
});
