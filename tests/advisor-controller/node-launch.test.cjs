'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const {
  setFakeCodexConcernFreeResponse,
  getFakeCodexState
} = require('./fixtures/provider-fixture.cjs');

const {
  PACKAGE_ROOT,
  getPublicationApis,
  createUnicodeTestEnvironment,
  invokeController
} = require('./fixtures/node-launch-helpers.cjs');

// ---------------------------------------------------------------------------
// 1. ISOLATED PUBLICATION INTO PRIVATE-HOME WITH UNICODE AND SPACES
// ---------------------------------------------------------------------------
test('N02–N04, N07: Private-HOME publication into path with spaces and Unicode preserves policy and installs controller closure', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishDryRun, publishApply } = await getPublicationApis();

  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });

  const preview = publishDryRun(context);
  assert.equal(preview.phases[0].bindingOrder[0], '.evcrate/bin');

  const applied = publishApply(context);
  assert.ok(applied.phases.length > 0);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');
  const controllerLib = path.join(fixture.home, '.evcrate', 'bin', 'lib', 'advisor', 'controller.cjs');
  const policyFile = path.join(fixture.home, '.evcrate', 'advisor-routing.json');

  assert.equal(fs.existsSync(controller), true, 'Installed controller must exist under HOME/.evcrate/bin');
  assert.equal(fs.existsSync(controllerLib), true, 'Installed controller library must exist');
  assert.equal(fs.existsSync(policyFile), true, 'Routing policy must be preserved');

  // Verify that neither project directory was polluted with controller binaries
  assert.equal(fs.existsSync(path.join(fixture.projectA, 'evcrate-advisor')), false, 'Project A must not contain controller');
  assert.equal(fs.existsSync(path.join(fixture.projectA, '.evcrate', 'bin')), false, 'Project A must not contain .evcrate/bin');
  assert.equal(fs.existsSync(path.join(fixture.projectB, 'evcrate-advisor')), false, 'Project B must not contain controller');
  assert.equal(fs.existsSync(path.join(fixture.projectB, '.evcrate', 'bin')), false, 'Project B must not contain .evcrate/bin');
});

// ---------------------------------------------------------------------------
// 2. COMPLETE ISOLATED V2 CONSULTATION LIFECYCLE VIA NODE
// ---------------------------------------------------------------------------
test('N02, N08: Complete isolated V2 lifecycle via Node on installed controller', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishApply } = await getPublicationApis();
  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });
  publishApply(context);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');
  setFakeCodexConcernFreeResponse(fixture.home);

  const taskRunId = randomUUID();
  const task = {
    goal: 'Verify Linux launch on installed controller',
    non_goals: ['Modifying user workspace'],
    authorized_paths: ['source.txt'],
    scope_rationale: 'Linux real-launch qualification',
    invariants: ['Preserve user data'],
    success_criteria: ['Verification passes']
  };

  // Step 1: Init state (rev 0 -> 1)
  const initRes = invokeController(controller, ['state', 'init'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 0,
    payload: { phase_id: 'phase-03', task, baseline_paths: ['source.txt'] }
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(initRes.exit, 0, `init failed: ${initRes.stderr}`);
  assert.equal(initRes.value.status, 'STATE_READY');
  assert.equal(initRes.value.state.task_revision, 1);
  assert.equal(initRes.value.state.phase_id, 'phase-03');

  // Step 2: Reserve checkpoint (rev 1 -> 2)
  const sourceDigest = createHash('sha256').update(fs.readFileSync(path.join(fixture.projectA, 'source.txt'))).digest('hex');
  const checkpoint = {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: taskRunId,
    checkpoint_id: 'chk-01',
    phase_id: 'phase-03',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:phase-03',
    kind: 'review',
    question: 'Is Linux launch verification complete and safe?',
    task,
    proposal: { next_action: 'Proceed', rationale: 'Ready', intended_changed_paths: ['source.txt'] },
    evidence: {
      summary: 'Source verified',
      files: [{
        path: 'source.txt',
        excerpt: 'initial user source code',
        digest: sourceDigest
      }],
      validation_results: [{ suite: 'runtime', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: null }],
      artifacts: []
    },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };

  const reserveRes = invokeController(controller, ['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'checkpoint',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 1,
    payload: { checkpoint }
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(reserveRes.exit, 0, `checkpoint failed: ${reserveRes.stderr}`);
  assert.equal(reserveRes.value.status, 'STATE_READY');
  assert.equal(reserveRes.value.state.task_revision, 2);

  // Step 3: Run inference via stdin (advances state rev 2 -> 4)
  const adviceRes = invokeController(controller, [], checkpoint, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(adviceRes.exit, 0, `inference failed: ${adviceRes.stderr}`);
  assert.equal(adviceRes.value.status, 'ADVICE_READY');
  assert.ok(adviceRes.value.correlation_id);
  assert.ok(adviceRes.value.result, 'Response must contain result object');
  assert.ok(adviceRes.value.result.recommendation, 'Result must contain recommendation');

  // Verify fake provider captured prompt and was called once
  const fakeState = getFakeCodexState(fixture.home);
  assert.equal(fakeState.finalCount, 1, 'Fake provider must be launched exactly once');
  const finalCall = fakeState.calls.find((call) => call.final) || fakeState.calls.at(-1);
  assert.ok(finalCall, 'Must find final call');
  assert.ok(finalCall.args.includes('gpt-5.6-sol'));
  assert.ok(fakeState.lastStdin.includes('review:phase-03'));

  const correlationId = adviceRes.value.correlation_id;

  // Step 4: State get confirms current revision and consultation
  const getRes = invokeController(controller, ['state', 'get'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'get',
    task_run_id: taskRunId,
    operation_id: null,
    expected_revision: null,
    payload: {}
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(getRes.exit, 0);
  assert.equal(getRes.value.status, 'STATE_READY');
  assert.equal(getRes.value.state.task_revision, 4);
  assert.equal(getRes.value.state.last_consultation_id, correlationId);

  // Step 5: Disposition (rev 4 -> 5)
  const dispRes = invokeController(controller, ['state', 'disposition'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'disposition',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 4,
    payload: {
      consultation_id: correlationId,
      evidence_revision: 0,
      action: 'accept',
      rationale: 'Accepted without correction',
      correction: null
    }
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(dispRes.exit, 0);
  assert.equal(dispRes.value.status, 'STATE_READY');
  assert.equal(dispRes.value.state.task_revision, 5);

  // Step 6: Truthful outcome with real declared validation (rev 5 -> 6)
  const validationCheck = spawnSync(process.execPath, ['--version']);
  assert.equal(validationCheck.status, 0);

  const outcomeRes = invokeController(controller, ['state', 'outcome'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'outcome',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 5,
    payload: {
      consultation_id: correlationId,
      action_id: null,
      episode_id: null,
      result: 'resolved',
      validation: {
        suite: 'runtime',
        command: 'node --version',
        status: 'passed',
        passed: 1,
        failed: 0,
        details: null
      },
      actual_changed_paths: []
    }
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(outcomeRes.exit, 0);
  assert.equal(outcomeRes.value.status, 'STATE_READY');
  assert.equal(outcomeRes.value.state.task_revision, 6);

  // Step 7: Complete (rev 6 -> 7, gate_status completed)
  const completeRes = invokeController(controller, ['state', 'complete'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'complete',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 6,
    payload: {}
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(completeRes.exit, 0);
  assert.equal(completeRes.value.status, 'STATE_READY');
  assert.equal(completeRes.value.state.gate_status, 'completed');

  // Verify durable history record exists
  const projectHash = createHash('sha256').update(fixture.projectA).digest('hex');
  const historyDir = path.join(fixture.home, '.evcrate', 'advisor-history', projectHash, taskRunId, correlationId);
  assert.equal(fs.existsSync(historyDir), true, 'History consultation directory must exist');
  const historyRecord = path.join(historyDir, 'execution.json');
  assert.equal(fs.existsSync(historyRecord), true, 'Durable history execution record must exist');
});

// ---------------------------------------------------------------------------
// 3. HISTORY CLI OPERATIONS (LIST, SHOW, METRICS, EXPORT, PRUNE)
// ---------------------------------------------------------------------------
test('N11: History CLI operations execute cleanly against installed controller', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishApply } = await getPublicationApis();
  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });
  publishApply(context);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');
  setFakeCodexConcernFreeResponse(fixture.home);

  const taskRunId = randomUUID();
  const task = {
    goal: 'History CLI validation',
    non_goals: ['Modifying files'],
    authorized_paths: ['source.txt'],
    scope_rationale: 'History operations',
    invariants: ['Preserve records'],
    success_criteria: ['History passes']
  };
  const initRes = invokeController(controller, ['state', 'init'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 0,
    payload: { phase_id: 'phase-03', task, baseline_paths: ['source.txt'] }
  }, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(initRes.exit, 0, `state init failed: ${initRes.stderr}`);
  const fileDigest = createHash('sha256').update(fs.readFileSync(path.join(fixture.projectA, 'source.txt'))).digest('hex');
  const checkpoint = {
    protocol: 'evcrate-advisor-checkpoint', version: 2, task_run_id: taskRunId,
    checkpoint_id: 'chk-hist-01', phase_id: 'phase-03', task_revision: 1, evidence_revision: 0,
    checkpoint: 'review:phase-03', kind: 'review', question: 'Ready for history check?', task,
    proposal: { next_action: 'Proceed', rationale: 'History test', intended_changed_paths: ['source.txt'] },
    evidence: {
      summary: 'Verified',
      files: [{ path: 'source.txt', excerpt: 'initial user source code', digest: fileDigest }],
      validation_results: [{ suite: 'smoke', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: null }],
      artifacts: []
    },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };

  const reserveRes = invokeController(controller, ['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  }, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(reserveRes.exit, 0, `checkpoint failed: ${reserveRes.stderr}`);

  const adviceRes = invokeController(controller, [], checkpoint, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(adviceRes.value.status, 'ADVICE_READY', `Inference failed: ${JSON.stringify(adviceRes.value.error)}`);
  const consultationId = adviceRes.value.correlation_id;

  const projectId = createHash('sha256').update(fixture.projectA).digest('hex');

  // 1. History list
  const listRes = invokeController(controller, ['history', 'list'], {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'list',
    project_id: projectId,
    task_run_id: null,
    status: null,
    cursor: null,
    limit: null
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(listRes.exit, 0);
  assert.equal(listRes.value.status, 'HISTORY_READY');
  assert.ok(listRes.value.entries.length >= 1);
  assert.ok(listRes.value.entries.some((e) => e.consultation_id === consultationId));

  // 2. History show
  const showRes = invokeController(controller, ['history', 'show'], {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'show',
    consultation_id: consultationId,
    project_id: projectId,
    task_run_id: taskRunId
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(showRes.exit, 0);
  assert.equal(showRes.value.status, 'HISTORY_READY');
  assert.equal(showRes.value.execution.consultation_id, consultationId);

  // 3. History metrics
  const metricsRes = invokeController(controller, ['history', 'metrics'], {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'metrics',
    project_id: projectId,
    task_run_id: null,
    filters: null
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(metricsRes.exit, 0);
  assert.equal(metricsRes.value.status, 'HISTORY_READY');
  assert.equal(metricsRes.value.metric_definition_version, 1);
  assert.ok(metricsRes.value.counts.terminal >= 1);

  // 4. History export dry-run and apply
  const exportTarget = path.join(fixture.tmp, 'exported-history.json');
  const exportDryRes = invokeController(controller, ['history', 'export'], {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'export',
    destination: exportTarget,
    project_id: projectId,
    task_run_id: null,
    consultation_id: null,
    dry_run: true
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(exportDryRes.exit, 0);
  assert.equal(exportDryRes.value.status, 'HISTORY_READY');
  assert.ok(exportDryRes.value.exported_count >= 1);
  assert.equal(fs.existsSync(exportTarget), false, 'Dry-run export must not create destination file');

  const exportApplyRes = invokeController(controller, ['history', 'export'], {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'export',
    destination: exportTarget,
    project_id: projectId,
    task_run_id: null,
    consultation_id: null,
    dry_run: false
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(exportApplyRes.exit, 0);
  assert.equal(exportApplyRes.value.status, 'HISTORY_READY');
  assert.ok(exportApplyRes.value.exported_count >= 1);
  assert.equal(fs.existsSync(exportTarget), true, 'Applied export must create destination file');

  // 5. History prune dry-run
  const pruneDryRes = invokeController(controller, ['history', 'prune'], {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'prune',
    dry_run: true,
    retention_days: 365,
    max_bytes: null
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(pruneDryRes.exit, 0);
  assert.equal(pruneDryRes.value.status, 'HISTORY_READY');
  assert.equal(pruneDryRes.value.pruned_count, 0, 'Recent records should not be eligible under 365 days retention');
});

// ---------------------------------------------------------------------------
// 4. CROSS-PROJECT ISOLATION UNDER SAME UNICODE HOME
// ---------------------------------------------------------------------------
test('N03, N04, N07: Distinct projects maintain isolated state and history without cross-leakage', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishApply } = await getPublicationApis();
  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });
  publishApply(context);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');
  setFakeCodexConcernFreeResponse(fixture.home);

  const hashA = createHash('sha256').update(fixture.projectA).digest('hex');
  const hashB = createHash('sha256').update(fixture.projectB).digest('hex');
  assert.notEqual(hashA, hashB, 'Project hashes must be distinct');

  // Run consultation in Project A
  const taskRunId = randomUUID();
  const task = {
    goal: 'Project A goal',
    non_goals: [],
    authorized_paths: ['source.txt'],
    scope_rationale: 'Project A isolation',
    invariants: [],
    success_criteria: ['Passes']
  };
  const initRes = invokeController(controller, ['state', 'init'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 0,
    payload: { phase_id: 'phase-03', task, baseline_paths: ['source.txt'] }
  }, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(initRes.exit, 0, `state init failed: ${initRes.stderr}`);
  const fileDigest = createHash('sha256').update(fs.readFileSync(path.join(fixture.projectA, 'source.txt'))).digest('hex');
  const checkpoint = {
    protocol: 'evcrate-advisor-checkpoint', version: 2, task_run_id: taskRunId,
    checkpoint_id: 'chk-iso-01', phase_id: 'phase-03', task_revision: 1, evidence_revision: 0,
    checkpoint: 'review:phase-03', kind: 'review', question: 'Isolation check?', task,
    proposal: { next_action: 'Proceed', rationale: 'Check', intended_changed_paths: ['source.txt'] },
    evidence: {
      summary: 'Verified',
      files: [{ path: 'source.txt', excerpt: 'initial user source code', digest: fileDigest }],
      validation_results: [{ suite: 'smoke', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: null }],
      artifacts: []
    },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };

  const reserveRes = invokeController(controller, ['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  }, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(reserveRes.exit, 0, `checkpoint failed: ${reserveRes.stderr}`);

  const adviceRes = invokeController(controller, [], checkpoint, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(adviceRes.value.status, 'ADVICE_READY', `Inference failed: ${JSON.stringify(adviceRes.value.error)}`);

  // Verify Project B's history query returns no records
  const listB = invokeController(controller, ['history', 'list'], {
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'list',
    project_id: hashB,
    task_run_id: null,
    status: null,
    cursor: null,
    limit: null
  }, { cwd: fixture.projectB, env: fixture.env });

  assert.equal(listB.exit, 0);
  assert.equal(listB.value.status, 'HISTORY_READY');
  assert.deepEqual(listB.value.entries, [], 'Project B must see zero entries from Project A');

  // Verify Project B state directory does not exist or has no Project A files
  const statePathB = path.join(fixture.home, '.evcrate', 'state', 'projects', hashB);
  assert.equal(fs.existsSync(path.join(statePathB, 'tasks', taskRunId)), false, 'Project B state must not contain Project A tasks');
});

// ---------------------------------------------------------------------------
// 5. NON-EXECUTABLE CONTROLLER SCRIPT (0o644) VIA EXPLICIT NODE LAUNCH
// ---------------------------------------------------------------------------
test('N08: Non-executable controller script succeeds via explicit Node launch', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishApply } = await getPublicationApis();
  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });
  publishApply(context);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');

  // Remove execute bits from private installed advisor leaf
  fs.chmodSync(controller, 0o644);
  const mode = fs.statSync(controller).mode & 0o777;
  assert.equal(mode & 0o111, 0, 'Controller must have no execute bits');

  // Test state init via Node
  const taskRunId = randomUUID();
  const initRes = invokeController(controller, ['state', 'init'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 0,
    payload: {
      phase_id: 'phase-03',
      task: {
        goal: 'Non-executable test',
        non_goals: [],
        authorized_paths: ['source.txt'],
        scope_rationale: 'Verify chmod independence',
        invariants: [],
        success_criteria: ['Passes']
      },
      baseline_paths: ['source.txt']
    }
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(initRes.exit, 0, `state init with 0o644 failed: ${initRes.stderr}`);
  assert.equal(initRes.value.status, 'STATE_READY');
  assert.equal(initRes.value.state.task_revision, 1);

  // Test state get via Node
  const getRes = invokeController(controller, ['state', 'get'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'get',
    task_run_id: taskRunId,
    operation_id: null,
    expected_revision: null,
    payload: {}
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(getRes.exit, 0);
  assert.equal(getRes.value.status, 'STATE_READY');
  assert.equal(getRes.value.state.task_revision, 1);
});

// ---------------------------------------------------------------------------
// 6. DECOY SCRIPT AVOIDANCE
// ---------------------------------------------------------------------------
test('N05, N06: Missing installed controller never searches or executes project decoy', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  // Place a decoy executable in project directory
  const decoyPath = path.join(fixture.projectA, 'evcrate-advisor');
  fs.writeFileSync(decoyPath, '#!/bin/sh\necho DECOY_EXECUTED\nexit 0\n', { mode: 0o755 });

  // Missing controller path under HOME
  const missingController = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');

  const res = invokeController(missingController, ['state', 'get'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'get',
    task_run_id: randomUUID(),
    operation_id: null,
    expected_revision: null,
    payload: {}
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.notEqual(res.exit, 0, 'Execution of missing controller must fail');
  assert.equal(res.stdout.includes('DECOY_EXECUTED'), false, 'Decoy script in project must not be executed');
});

// ---------------------------------------------------------------------------
// 7. EXPLICIT EMPTY, RELATIVE, OR ABSENT HOME NEGATIVE CASES
// ---------------------------------------------------------------------------
test('N07: Explicit empty, relative, or absent HOME fails closed without fallback writes', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishApply } = await getPublicationApis();
  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });
  publishApply(context);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');
  const taskRunId = randomUUID();
  const initPayload = {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 0,
    payload: {
      phase_id: 'phase-03',
      task: { goal: 'Home test', non_goals: [], authorized_paths: ['source.txt'], scope_rationale: 'Home check', invariants: [], success_criteria: [] },
      baseline_paths: ['source.txt']
    }
  };

  // Case A: Empty HOME
  const emptyHomeEnv = { ...fixture.env, HOME: '', USERPROFILE: '' };
  const resEmpty = invokeController(controller, ['state', 'init'], initPayload, { cwd: fixture.projectA, env: emptyHomeEnv });
  assert.notEqual(resEmpty.exit, 0, 'Empty HOME must fail');

  // Case B: Relative HOME
  const relHomeEnv = { ...fixture.env, HOME: 'relative/home', USERPROFILE: 'relative/home' };
  const resRel = invokeController(controller, ['state', 'init'], initPayload, { cwd: fixture.projectA, env: relHomeEnv });
  assert.notEqual(resRel.exit, 0, 'Relative HOME must fail');

  // Case C: Unset HOME and USERPROFILE
  const absentHomeEnv = { ...fixture.env };
  delete absentHomeEnv.HOME;
  delete absentHomeEnv.USERPROFILE;
  const resAbsent = invokeController(controller, ['state', 'init'], initPayload, { cwd: fixture.projectA, env: absentHomeEnv });
  assert.notEqual(resAbsent.exit, 0, 'Absent HOME must fail');

  // Assert no fallback directory was created in project root
  assert.equal(fs.existsSync(path.join(fixture.projectA, '.evcrate')), false, 'Must not create .evcrate in project root on bad HOME');
});

// ---------------------------------------------------------------------------
// 8. LAUNCH FAILURES, MALFORMED/OVERSIZED INPUT, AND PROCESS ERRORS
// ---------------------------------------------------------------------------
test('N12, N13: Launch failures and malformed/oversized inputs fail closed', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishApply } = await getPublicationApis();
  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });
  publishApply(context);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');

  // 1. Unlaunchable Node executable
  const badNodeRes = spawnSync('/nonexistent/path/to/node', [controller], {
    cwd: fixture.projectA,
    env: fixture.env,
    input: '{}',
    encoding: 'utf8'
  });
  assert.notEqual(badNodeRes.status, 0);
  assert.ok(badNodeRes.error, 'Unlaunchable node should produce spawn error');

  // 2. Malformed JSON stdin on controller
  const malformedRes = invokeController(controller, [], '{not-json', { cwd: fixture.projectA, env: fixture.env });
  assert.equal(malformedRes.exit, 1);
  assert.ok(malformedRes.value);
  assert.equal(malformedRes.value.status, 'FAILED');

  // 3. Oversized stdin payload (> 32 KiB)
  const hugePayload = {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: randomUUID(),
    checkpoint_id: 'chk-huge',
    phase_id: 'phase-03',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:phase-03',
    kind: 'review',
    question: 'x'.repeat(40000), // > 32 KiB
    task: { goal: 'Huge', non_goals: [], authorized_paths: [], scope_rationale: '', invariants: [], success_criteria: [] },
    proposal: { next_action: '', rationale: '', intended_changed_paths: [] },
    evidence: { summary: '', files: [], validation_results: [], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };
  const hugeRes = invokeController(controller, [], hugePayload, { cwd: fixture.projectA, env: fixture.env });
  assert.equal(hugeRes.exit, 1);
  assert.ok(hugeRes.value);
  assert.equal(hugeRes.value.status, 'FAILED');
});

// ---------------------------------------------------------------------------
// 9. AUTOMATED NEGATIVE HUMAN-DECISION TEST (UNATTENDED / NO-TTY)
// ---------------------------------------------------------------------------
test('N15: Unattended human-decision request fails closed with HUMAN_EVENT_REQUIRED', async (t) => {
  const fixture = createUnicodeTestEnvironment();
  t.after(() => fixture.cleanup());

  const { resolveInvocationContext, publishApply } = await getPublicationApis();
  const context = resolveInvocationContext({
    packageRoot: PACKAGE_ROOT,
    cwd: PACKAGE_ROOT,
    home: fixture.home,
    targets: ['omp']
  });
  publishApply(context);

  const controller = path.join(fixture.home, '.evcrate', 'bin', 'evcrate-advisor');

  const taskRunId = randomUUID();
  invokeController(controller, ['state', 'init'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 0,
    payload: {
      phase_id: 'phase-03',
      task: { goal: 'Human decision test', non_goals: [], authorized_paths: ['source.txt'], scope_rationale: 'HD', invariants: [], success_criteria: [] },
      baseline_paths: ['source.txt']
    }
  }, { cwd: fixture.projectA, env: fixture.env });

  // Call human-decision without a controlling terminal
  const hdRes = invokeController(controller, ['state', 'human-decision'], {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'human-decision',
    task_run_id: taskRunId,
    operation_id: randomUUID(),
    expected_revision: 1,
    payload: {
      action: 'abandon',
      rationale: 'Unattended model authorization refusal',
      authorized_paths: []
    }
  }, { cwd: fixture.projectA, env: fixture.env });

  assert.equal(hdRes.exit, 1);
  assert.ok(hdRes.value);
  assert.equal(hdRes.value.status, 'FAILED');
  assert.equal(hdRes.value.error.code, 'HUMAN_EVENT_REQUIRED');
});
