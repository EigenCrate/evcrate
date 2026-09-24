'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const test = require('node:test');

const LIB = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const {
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  parseHistoryRequest,
  sanitizeTextForDisplay,
  sanitizeObjectForDisplay
} = require(path.join(LIB, 'history-contract.cjs'));
const { computeCheckpointDigestV2 } = require(path.join(LIB, 'contracts-v2.cjs'));

const { ADVISOR_BUILD_IDENTITY } = require(path.join(LIB, 'checkpoint-contract.cjs'));
const { createRoutingError, serializeRoutingError } = require(path.join(LIB, 'errors.cjs'));

const {
  recordStartedExecution,
  recordTerminalExecution,
  recordOutcome,
  updateStartedAttempts,
  listHistory,
  getHistoryEntry,
  exportHistory,
  getHistoryMetrics,
  pruneHistory,
  calculateTotalHistoryBytes,
  withHistoryLock,
  sanitizeSafeProjectName,
  ensureProjectMetadata
} = require(path.join(LIB, 'history-store.cjs'));

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
        digest: createHash('sha256').update('console.log("hello");').digest('hex')
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

function setupFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-hist-store-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(project, { mode: 0o700 });
  fs.writeFileSync(path.join(project, 'source.txt'), 'console.log("hello");\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const projectId = createHash('sha256').update(project).digest('hex');
  const context = { cwd: project, environment: { ...process.env, HOME: home } };

  return { root, home, project, projectId, context };
}

test('history contract validates execution records correctly', () => {
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

  const validStarted = {
    schema_version: 1,
    consultation_id: consultationId,
    task_run_id: taskRunId,
    project_id: 'a'.repeat(64),
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

  const frozen = validateHistoryExecutionV1(validStarted);
  assert.equal(frozen.status, 'started');
  assert(Object.isFrozen(frozen));

  // Invalid schema version
  assert.throws(() => validateHistoryExecutionV1({ ...validStarted, schema_version: 2 }), (err) => err.code === 'AUDIT_DEGRADED');

  // Started with non-null result or error
  assert.throws(() => validateHistoryExecutionV1({ ...validStarted, result: {} }), (err) => err.code === 'AUDIT_DEGRADED');
  assert.throws(() => validateHistoryExecutionV1({ ...validStarted, error: {} }), (err) => err.code === 'AUDIT_DEGRADED');

  // Valid ADVICE_READY
  const validReady = {
    ...validStarted,
    status: 'ADVICE_READY',
    receipt: {
      backend: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'high',
      controller_version: 2,
      adapter_version: '0.150.1',
      elapsed_ms: 1000,
      build_identity: ADVISOR_BUILD_IDENTITY
    },
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:phase-07',
      status: 'ADVICE_READY',
      recommendation: 'Proceed.',
      rationale: 'Evidence verified.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['Run tests.'],
      unresolved_questions: []
    },
    completed_at: 2000
  };
  assert.equal(validateHistoryExecutionV1(validReady).status, 'ADVICE_READY');

  // Completed before started
  assert.throws(() => validateHistoryExecutionV1({ ...validReady, completed_at: 500 }), (err) => err.code === 'AUDIT_DEGRADED');
});

test('history contract validates outcome records correctly', () => {
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const validOutcome = {
    schema_version: 1,
    consultation_id: consultationId,
    task_run_id: taskRunId,
    project_id: 'a'.repeat(64),
    disposition: { action: 'accept', rationale: 'Accepted counsel.' },
    evidence_revision: 2,
    actual_changed_paths: ['source.txt'],
    validation: {
      suite: 'test',
      command: 'npm test',
      status: 'passed',
      passed: 1,
      failed: 0,
      details: null
    },
    outcome: 'resolved',
    correction_number: 1,
    recorded_at: 1500
  };

  const frozen = validateHistoryOutcomeV1(validOutcome);
  assert.equal(frozen.outcome, 'resolved');

  // Invalid correction number
  assert.throws(() => validateHistoryOutcomeV1({ ...validOutcome, correction_number: 0 }), (err) => err.code === 'AUDIT_DEGRADED');
  assert.throws(() => validateHistoryOutcomeV1({ ...validOutcome, correction_number: 4 }), (err) => err.code === 'AUDIT_DEGRADED');

  // Invalid outcome enum
  assert.throws(() => validateHistoryOutcomeV1({ ...validOutcome, outcome: 'passed' }), (err) => err.code === 'AUDIT_DEGRADED');
});

test('recordStartedExecution creates isolated private directory and file', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

  const execution = {
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

  const res = recordStartedExecution(f.context, execution);
  assert.equal(res.status, 'recorded');

  const execPath = path.join(f.home, '.evcrate', 'advisor-history', f.projectId, taskRunId, consultationId, 'execution.json');
  assert(fs.existsSync(execPath));
  assert.equal(fs.statSync(execPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(execPath)).mode & 0o777, 0o700);

  // Cannot record started twice
  assert.throws(() => recordStartedExecution(f.context, execution), (err) => err.code === 'AUDIT_DEGRADED');
});

test('updateStartedAttempts persists attempt snapshot to started record', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

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

  const attempt = {
    attempt_id: randomUUID(),
    slot: 'primary',
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    phase: 'model',
    model_started: true,
    elapsed_ms: 500,
    terminal_classification: 'transient',
    retry_delay_ms: 10000,
    cleanup_outcome: 'confirmed'
  };

  const updated = updateStartedAttempts(f.context, {
    projectId: f.projectId,
    taskRunId,
    consultationId
  }, [attempt]);
  assert.equal(updated.status, 'recorded');

  const entry = getHistoryEntry(f.context, {
    projectId: f.projectId,
    taskRunId,
    consultationId
  });
  assert.equal(entry.execution.attempts.length, 1);
  assert.equal(entry.execution.attempts[0].attempt_id, attempt.attempt_id);
});

test('recordTerminalExecution CAS prevents rewrite races and enforces immutability', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

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
    status: 'ADVICE_READY',
    receipt: {
      backend: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'high',
      controller_version: 2,
      adapter_version: '0.150.1',
      elapsed_ms: 1000,
      build_identity: ADVISOR_BUILD_IDENTITY
    },
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:phase-07',
      status: 'ADVICE_READY',
      recommendation: 'Proceed.',
      rationale: 'Clean verification.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['Pass tests.'],
      unresolved_questions: []
    },
    completed_at: 2000
  };

  const res = recordTerminalExecution(f.context, terminal);
  assert.equal(res.status, 'recorded');

  // Once terminal, execution cannot be rewritten
  assert.throws(() => recordTerminalExecution(f.context, terminal), (err) => err.code === 'AUDIT_DEGRADED');
});

test('recordOutcome records idempotently and links to consultation', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

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
    status: 'ADVICE_READY',
    receipt: {
      backend: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'high',
      controller_version: 2,
      adapter_version: '0.150.1',
      elapsed_ms: 1000,
      build_identity: ADVISOR_BUILD_IDENTITY
    },
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:phase-07',
      status: 'ADVICE_READY',
      recommendation: 'Done.',
      rationale: 'Verified.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: [],
      unresolved_questions: []
    },
    completed_at: 2000
  };
  recordTerminalExecution(f.context, terminal);

  const outcome = {
    schema_version: 1,
    consultation_id: consultationId,
    task_run_id: taskRunId,
    project_id: f.projectId,
    disposition: { action: 'accept', rationale: 'Approved changes.' },
    evidence_revision: 3,
    actual_changed_paths: ['source.txt'],
    validation: {
      suite: 'test',
      command: 'npm run test',
      status: 'passed',
      passed: 1,
      failed: 0,
      details: null
    },
    outcome: 'resolved',
    correction_number: 1,
    recorded_at: 2500
  };

  const res1 = recordOutcome(f.context, outcome);
  assert.equal(res1.status, 'recorded');

  // Idempotent repeat
  const res2 = recordOutcome(f.context, outcome);
  assert.equal(res2.status, 'recorded');

  // Conflicting repeat fails
  assert.throws(() => recordOutcome(f.context, { ...outcome, outcome: 'unresolved' }), (err) => err.code === 'AUDIT_DEGRADED');
});

test('history query: listHistory and exportHistory enforce project scope and support preview', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const c1 = randomUUID();

  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

  const exec1 = {
    schema_version: 1,
    consultation_id: c1,
    task_run_id: taskRunId,
    project_id: f.projectId,
    checkpoint_digest: digest,
    checkpoint,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: {
      backend: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'high',
      controller_version: 2,
      adapter_version: '0.150.1',
      elapsed_ms: 1000,
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
      recommendation: 'Advice 1.',
      rationale: 'Valid.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: [],
      unresolved_questions: []
    },
    error: null,
    started_at: 1000,
    completed_at: 1500
  };
  recordStartedExecution(f.context, { ...exec1, status: 'started', result: null, receipt: null, completed_at: null });
  recordTerminalExecution(f.context, exec1);

  // List defaults strictly to current project
  const list = listHistory(f.context);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].consultation_id, c1);
  assert.equal(list.scope, f.projectId);

  // Export with dry_run: true preview
  const exportDest = path.join(f.root, 'export-preview.json');
  const preview = exportHistory(f.context, { destination: exportDest, dry_run: true });
  assert.equal(preview.dry_run, true);
  assert.equal(preview.exported_count, 1);
  assert.equal(preview.scope, f.projectId);
  assert.equal(fs.existsSync(exportDest), false); // File was NOT created in dry-run!

  // Apply export
  const applied = exportHistory(f.context, { destination: exportDest, dry_run: false });
  assert.equal(applied.dry_run, false);
  assert.equal(applied.exported_count, 1);
  assert.equal(fs.existsSync(exportDest), true); // File created!
});

test('pruneHistory respects retention and protects active records under lock', (t) => {
  const f = setupFixture(t);
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
    started_at: 100, // Very old, but ACTIVE
    completed_at: null
  });

  const chkExpired = makeCheckpoint(taskRunId);
  const digestExpired = computeCheckpointDigestV2(chkExpired);

  // Expired terminal record
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
    status: 'FAILED',
    result: null,
    error: serializeRoutingError(createRoutingError('PROCESS_FAILED')),
    started_at: 200,
    completed_at: 300
  });

  // Dry run prune with retention_days: 1
  const dry = pruneHistory(f.context, {}, { dry_run: true, retention_days: 1 });
  assert.equal(dry.eligible_count, 1);
  assert.equal(dry.pruned_count, 0);
  assert.equal(dry.active_count, 1); // Active record protected!

  // Apply prune
  const apply = pruneHistory(f.context, {}, { dry_run: false, retention_days: 1 });
  assert.equal(apply.pruned_count, 1);
  assert.equal(apply.active_count, 1);

  // Verify only active record remains
  const remaining = listHistory(f.context);
  assert.equal(remaining.entries.length, 1);
  assert.equal(remaining.entries[0].consultation_id, cActive);
});

test('cross-project isolation: default list and export never disclose foreign project records', (t) => {
  const f = setupFixture(t);

  // Setup Project A record
  const taskA = randomUUID();
  const consA = randomUUID();
  const chkA = makeCheckpoint(taskA);
  const digestA = computeCheckpointDigestV2(chkA);
  recordStartedExecution(f.context, {
    schema_version: 1,
    consultation_id: consA,
    task_run_id: taskA,
    project_id: f.projectId,
    checkpoint_digest: digestA,
    checkpoint: chkA,
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
  });

  // Setup Project B
  const projectB = path.join(f.root, 'project-b');
  fs.mkdirSync(projectB, { mode: 0o700 });
  fs.writeFileSync(path.join(projectB, 'source.txt'), 'console.log("hello");\n');
  const projectBId = createHash('sha256').update(projectB).digest('hex');
  const contextB = { cwd: projectB, environment: f.context.environment };
  const taskB = randomUUID();
  const consB = randomUUID();
  const chkB = makeCheckpoint(taskB);
  const digestB = computeCheckpointDigestV2(chkB);

  recordStartedExecution(contextB, {
    schema_version: 1,
    consultation_id: consB,
    task_run_id: taskB,
    project_id: projectBId,
    checkpoint_digest: digestB,
    checkpoint: chkB,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: null,
    prompt_identity: 'canonical-mentor-brief-v2',
    build_identity: ADVISOR_BUILD_IDENTITY,
    attempts: [],
    status: 'started',
    result: null,
    error: null,
    started_at: 2000,
    completed_at: null
  });

  // Query from Project A context: must ONLY see Project A
  const listA = listHistory(f.context);
  assert.equal(listA.entries.length, 1);
  assert.equal(listA.entries[0].consultation_id, consA);
  assert.equal(listA.scope, f.projectId);

  // Export from Project A context: must ONLY export Project A
  const expA = path.join(f.root, 'export-a.json');
  const exportResA = exportHistory(f.context, { destination: expA, dry_run: false });
  assert.equal(exportResA.exported_count, 1);
  const dataA = JSON.parse(fs.readFileSync(expA, 'utf8'));
  assert.equal(dataA.length, 1);
  assert.equal(dataA[0].execution.consultation_id, consA);
});

test('exportHistory exports full match set without 100-record truncation', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const totalRecords = 105;

  for (let i = 0; i < totalRecords; i++) {
    const consId = randomUUID();
    const chk = makeCheckpoint(taskRunId);
    const digest = computeCheckpointDigestV2(chk);
    recordStartedExecution(f.context, {
      schema_version: 1,
      consultation_id: consId,
      task_run_id: taskRunId,
      project_id: f.projectId,
      checkpoint_digest: digest,
      checkpoint: chk,
      route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      receipt: null,
      prompt_identity: 'canonical-mentor-brief-v2',
      build_identity: ADVISOR_BUILD_IDENTITY,
      attempts: [],
      status: 'started',
      result: null,
      error: null,
      started_at: 1000 + i,
      completed_at: null
    });
  }

  const exportDest = path.join(f.root, 'export-over-100.json');
  const res = exportHistory(f.context, { destination: exportDest, dry_run: false });
  assert.equal(res.exported_count, totalRecords);
  const fileData = JSON.parse(fs.readFileSync(exportDest, 'utf8'));
  assert.equal(fileData.length, totalRecords);
});

test('withHistoryLock serializes concurrent mutations and protects CAS settlement', (t) => {
  const f = setupFixture(t);
  let lockAcquiredInside = false;

  withHistoryLock(f.context, (root) => {
    // While lock is held, another acquisition must fail
    assert.throws(() => withHistoryLock(f.context, () => {}), (err) => err.code === 'AUDIT_DEGRADED');
    lockAcquiredInside = true;
  });
  assert.equal(lockAcquiredInside, true);

  // After release, acquisition succeeds again
  let secondAcquired = false;
  withHistoryLock(f.context, () => {
    secondAcquired = true;
  });
  assert.equal(secondAcquired, true);
});

test('getHistoryMetrics: unlocked read collects metrics and scopes to task_run_id', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const c1 = randomUUID();
  const checkpoint = makeCheckpoint(taskRunId);
  const digest = computeCheckpointDigestV2(checkpoint);

  const exec1 = {
    schema_version: 1, consultation_id: c1, task_run_id: taskRunId, project_id: f.projectId,
    checkpoint_digest: digest, checkpoint,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2, adapter_version: '0.150.1', elapsed_ms: 1000, build_identity: ADVISOR_BUILD_IDENTITY },
    prompt_identity: 'canonical-mentor-brief-v2', build_identity: ADVISOR_BUILD_IDENTITY,
    attempts: [{ attempt_id: 'att-1', slot: 'primary', route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' }, phase: 'model', model_started: true, elapsed_ms: 1000, terminal_classification: 'success', retry_delay_ms: null, cleanup_outcome: 'confirmed' }],
    status: 'ADVICE_READY',
    result: { protocol: 'evcrate-advisor-result', version: 2, checkpoint: 'review:phase-07', status: 'ADVICE_READY', recommendation: 'Proceed.', rationale: 'Verified.', must_fix: [], cautions: [], assumptions: [], success_checks: ['Run tests.'], unresolved_questions: [] },
    error: null, started_at: 1000, completed_at: 2000
  };
  recordStartedExecution(f.context, { ...exec1, status: 'started', result: null, receipt: null, completed_at: null });
  recordTerminalExecution(f.context, exec1);

  // Verify metrics can be read without lock and returns exact shape
  const metrics = getHistoryMetrics(f.context, { project_id: null, task_run_id: null, filters: null });
  assert.equal(metrics.protocol, 'evcrate-advisor-history');
  assert.equal(metrics.version, 1);
  assert.equal(metrics.operation, 'metrics');
  assert.equal(metrics.status, 'HISTORY_READY');
  assert.equal(metrics.counts.consultations, 1);
  assert.equal(metrics.counts.terminal, 1);
  assert.equal(metrics.counts.statuses.ADVICE_READY, 1);
  assert.equal(metrics.metrics.delivery.value, 1);
  assert.equal(metrics.metrics.delivery.numerator, 1);
  assert.equal(metrics.metrics.delivery.denominator, 1);
  assert.equal(metrics.metrics.outcome_coverage.value, 0); // outcome is missing
  assert.equal(metrics.missingness.missing_outcome, 1);
  assert.equal(metrics.completeness.is_complete, true);

  // Scoped to matching taskRunId
  const scoped = getHistoryMetrics(f.context, { project_id: f.projectId, task_run_id: taskRunId, filters: null });
  assert.equal(scoped.counts.consultations, 1);

  // Scoped to non-matching taskRunId returns 0
  const emptyScoped = getHistoryMetrics(f.context, { project_id: null, task_run_id: randomUUID(), filters: null });
  assert.equal(emptyScoped.counts.consultations, 0);
});

test('getHistoryMetrics: collector captures diagnostics for invalid execution and outcome files', (t) => {
  const f = setupFixture(t);
  const t1 = randomUUID();
  const cValid = randomUUID();
  const cBadExec = randomUUID();
  const cp = makeCheckpoint(t1);
  const digest = computeCheckpointDigestV2(cp);

  // Valid record
  const execValid = {
    schema_version: 1, consultation_id: cValid, task_run_id: t1, project_id: f.projectId,
    checkpoint_digest: digest, checkpoint: cp,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2, adapter_version: '0.150.1', elapsed_ms: 1000, build_identity: ADVISOR_BUILD_IDENTITY },
    prompt_identity: 'canonical-mentor-brief-v2', build_identity: ADVISOR_BUILD_IDENTITY,
    attempts: [{ attempt_id: 'att-1', slot: 'primary', route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' }, phase: 'model', model_started: true, elapsed_ms: 1000, terminal_classification: 'success', retry_delay_ms: null, cleanup_outcome: 'confirmed' }],
    status: 'ADVICE_READY',
    result: { protocol: 'evcrate-advisor-result', version: 2, checkpoint: 'review:phase-07', status: 'ADVICE_READY', recommendation: 'Proceed.', rationale: 'Verified.', must_fix: [], cautions: [], assumptions: [], success_checks: ['Run tests.'], unresolved_questions: [] },
    error: null, started_at: 1000, completed_at: 2000
  };
  recordStartedExecution(f.context, { ...execValid, status: 'started', result: null, receipt: null, completed_at: null });
  recordTerminalExecution(f.context, execValid);

  // Add an invalid outcome file directly to cValid directory with literal "null"
  const cValidDir = path.join(f.home, '.evcrate/advisor-history', f.projectId, t1, cValid);
  fs.writeFileSync(path.join(cValidDir, 'outcome.json'), 'null', { mode: 0o600 });

  // Add a bad execution record
  recordStartedExecution(f.context, { ...execValid, consultation_id: cBadExec, status: 'started', result: null, receipt: null, completed_at: null });
  const cBadExecDir = path.join(f.home, '.evcrate/advisor-history', f.projectId, t1, cBadExec);
  fs.writeFileSync(path.join(cBadExecDir, 'execution.json'), '{ invalid_json', { mode: 0o600 });

  const metrics = getHistoryMetrics(f.context, { project_id: null, task_run_id: null, filters: null });
  assert.equal(metrics.scan.status, 'complete_with_errors');
  assert.equal(metrics.scan.accepted_records, 1); // Only cValid accepted
  assert.equal(metrics.scan.invalid_records, 1); // cBadExec invalid
  assert.equal(metrics.missingness.invalid_execution, 1);
  assert.equal(metrics.missingness.invalid_outcome, 1);

  // Check that diagnostics contain both codes
  const diagCodes = metrics.scan.diagnostics.map((d) => d.code);
  assert.equal(diagCodes.includes('EXECUTION_INVALID_JSON'), true);
  assert.equal(diagCodes.includes('OUTCOME_INVALID'), true);
  assert.equal(metrics.limitations.includes('INVALID_RECORDS_EXCLUDED'), true);
});
test('sanitizeSafeProjectName enforces length, character, and path safety invariants', () => {
  assert.equal(sanitizeSafeProjectName('/home/user/my-cool-service'), 'my-cool-service');
  assert.equal(sanitizeSafeProjectName('evcrate'), 'evcrate');
  assert.equal(sanitizeSafeProjectName('App (v2) - Service_Core'), 'App (v2) - Service_Core');
  assert.equal(sanitizeSafeProjectName(''), null);
  assert.equal(sanitizeSafeProjectName('a'.repeat(65)), null);
  assert.equal(sanitizeSafeProjectName('my~project'), null);
  assert.equal(sanitizeSafeProjectName('home'), null);
  assert.equal(sanitizeSafeProjectName('USERPROFILE'), null);
  assert.equal(sanitizeSafeProjectName('bad\x00name'), null);
  assert.equal(sanitizeSafeProjectName('bad\\escape'), null);
  assert.equal(sanitizeSafeProjectName('/'), null);
});

test('recordStartedExecution records project-metadata.json with safe project name', (t) => {
  const f = setupFixture(t);
  const taskRunId = randomUUID();
  const consultationId = randomUUID();
  const cp = makeCheckpoint(taskRunId);
  const digest = createHash('sha256').update(JSON.stringify(cp)).digest('hex');

  const exec = {
    schema_version: 1,
    consultation_id: consultationId,
    task_run_id: taskRunId,
    project_id: f.projectId,
    checkpoint_digest: digest,
    checkpoint: cp,
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

  const res = recordStartedExecution(f.context, exec);
  assert.equal(res.status, 'recorded');

  const metaPath = path.join(f.home, '.evcrate', 'advisor-history', f.projectId, 'project-metadata.json');
  assert.ok(fs.existsSync(metaPath), 'project-metadata.json should be created');

  const content = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  assert.equal(content.version, 1);
  assert.ok(content.projects[f.projectId]);
  assert.equal(content.projects[f.projectId].name, path.basename(f.project));
  assert.ok(typeof content.projects[f.projectId].updated_at === 'number');

  // Verify second started call does not overwrite metadata
  const originalUpdatedAt = content.projects[f.projectId].updated_at;
  const c2 = randomUUID();
  recordStartedExecution(f.context, { ...exec, consultation_id: c2 });
  const content2 = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  assert.equal(content2.projects[f.projectId].updated_at, originalUpdatedAt);
});
