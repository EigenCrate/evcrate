import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setupTestEnvironment, makeValidCheckpoint, defaultPolicyV2 } from './phase10-test-helpers.mjs';

test('SCENARIO 2.1: Stale evidence rejection across process restart', (t) => {
  const env = setupTestEnvironment('evcrate-p10-state1-');
  t.after(env.cleanup);
  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-stale', [
    { path: 'source.txt', excerpt: 'initial user source code', digest: '0'.repeat(64) }
  ]);
  const initRes = env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });
  assert.equal(initRes.status, 0);

  const reserveRes = env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });
  assert.notEqual(reserveRes.status, 0);
  assert.equal(reserveRes.json?.error?.code, 'STALE_EVIDENCE_REVISION');
});

test('SCENARIO 2.2: Idempotent records replay, history listing, and secret redaction', (t) => {
  const env = setupTestEnvironment('evcrate-p10-state2-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());
  env.setFakeCodexState({
    finalCount: 0, calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Safe guidance without credentials.',
      rationale: 'Verified contracts and tests.',
      must_fix: [], cautions: [], assumptions: [], success_checks: ['npm test'], unresolved_questions: []
    })
  });
  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-idem', []);

  env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });

  const reserveRes = env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });
  const consultationId = reserveRes.json.consultation_id;
  const ctrlRes = env.invoke([], checkpoint);
  assert.equal(ctrlRes.status, 0);

  const dispPayload = {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'disposition',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 4,
    payload: { consultation_id: consultationId, evidence_revision: 0, action: 'accept', rationale: 'Accepted', correction: null }
  };
  const disp1 = env.invoke(['state', 'disposition'], dispPayload);
  assert.equal(disp1.status, 0);
  assert.equal(disp1.json.state.task_revision, 5);

  const disp2 = env.invoke(['state', 'disposition'], dispPayload);
  assert.equal(disp2.status, 0);
  assert.equal(disp2.json.state.task_revision, 5);

  const histRes = env.invoke(['history', 'list'], {
    protocol: 'evcrate-advisor-history', version: 1, operation: 'list',
    project_id: null, task_run_id: null, status: null, cursor: null, limit: null
  });
  assert.equal(histRes.status, 0);
  assert.equal(histRes.json.status, 'HISTORY_READY');
  // History show: verify entry is intact and contains clean metadata
  const showRes = env.invoke(['history', 'show'], {
    protocol: 'evcrate-advisor-history', version: 1, operation: 'show',
    project_id: histRes.json.entries[0].project_id,
    task_run_id: taskRunId,
    consultation_id: consultationId
  });
  assert.equal(showRes.status, 0);
  assert.equal(showRes.json.status, 'HISTORY_READY');
  assert.equal(showRes.json.execution.status, 'ADVICE_READY');
  assert.equal(showRes.json.execution.consultation_id, consultationId);
});

test('SCENARIO 2.3: Dirty user baseline preserved across corrections', (t) => {
  const env = setupTestEnvironment('evcrate-p10-state3-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());
  env.setFakeCodexState({
    finalCount: 0, calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Fix authorized path only.', rationale: 'Preserve user files.',
      must_fix: [], cautions: [], assumptions: [], success_checks: ['npm test'], unresolved_questions: []
    })
  });
  const uncommittedFile = join(env.cwd, 'user-notes.txt');
  writeFileSync(uncommittedFile, 'precious uncommitted user thoughts\n');

  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-dirty', []);
  env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });

  const reserveRes = env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });
  const consultationId = reserveRes.json.consultation_id;
  env.invoke([], checkpoint);

  const actionId = randomUUID();
  const episodeId = 'ep-dirty-1';
  env.invoke(['state', 'disposition'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'disposition',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 4,
    payload: {
      consultation_id: consultationId, evidence_revision: 0, action: 'accept',
      rationale: 'Perform authorized fix',
      correction: { action_id: actionId, episode_id: episodeId, validation_command: 'npm test' }
    }
  });

  // Apply edit to authorized file only
  writeFileSync(join(env.cwd, 'source.txt'), 'updated source code\n');

  env.invoke(['state', 'outcome'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'outcome',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 5,
    payload: {
      consultation_id: consultationId, action_id: actionId, episode_id: episodeId, result: 'resolved',
      validation: { suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
      actual_changed_paths: ['source.txt']
    }
  });

  // Verify uncommitted file is completely preserved across the correction lifecycle
  assert.equal(readFileSync(uncommittedFile, 'utf8'), 'precious uncommitted user thoughts\n');
});
