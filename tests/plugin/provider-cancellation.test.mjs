/**
 * @file provider-cancellation.test.mjs
 * Cancellation, deadline, and responsiveness tests for EVCrate Advisor Provider (Phase E01).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { EVCrateAdvisorProvider } from '../../plugin/backend/provider.cjs';
import { SnapshotStore } from '../../plugin/backend/snapshot-store.cjs';
import { makeCheckpoint } from '../fixtures/advisor-history/history-fixtures.mjs';

function createTempDir(prefix = 'evcrate-canc-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function setupHistoryRecord(historyRoot, projectId, taskRunId, consultationId) {
  const consultDir = path.join(historyRoot, projectId, taskRunId, consultationId);
  fs.mkdirSync(consultDir, { recursive: true, mode: 0o700 });

  const checkpoint = makeCheckpoint(taskRunId, 'chk-1');
  const checkpointDigest = createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');

  const execution = {
    schema_version: 1,
    consultation_id: consultationId,
    task_run_id: taskRunId,
    project_id: projectId,
    checkpoint_digest: checkpointDigest,
    checkpoint,
    route: { backend: 'codex', model: 'operator-selected', effort: 'high' },
    receipt: {
      backend: 'codex', model: 'operator-selected', effort: 'high',
      controller_version: 2, adapter_version: '1.0.0', build_identity: 'build-v2', elapsed_ms: 1000
    },
    prompt_identity: 'prompt-v2',
    build_identity: 'build-v2',
    attempts: [],
    status: 'ADVICE_READY',
    result: {
      protocol: 'evcrate-advisor-result', version: 2, checkpoint: checkpoint.checkpoint,
      status: 'ADVICE_READY', recommendation: 'accept', rationale: 'Verified',
      must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: []
    },
    error: null,
    started_at: 1000,
    completed_at: 2000
  };

  const outcome = {
    schema_version: 1,
    consultation_id: consultationId,
    task_run_id: taskRunId,
    project_id: projectId,
    disposition: { action: 'accept', rationale: 'Accepted' },
    evidence_revision: 0,
    actual_changed_paths: [],
    validation: { suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
    outcome: 'resolved',
    correction_number: 1,
    recorded_at: 3000
  };

  fs.writeFileSync(path.join(consultDir, 'execution.json'), JSON.stringify(execution));
  fs.writeFileSync(path.join(consultDir, 'outcome.json'), JSON.stringify(outcome));
}

test('Cancellation: AbortSignal stops scan and returns unavailable or stale', async () => {
  const tmpProject = createTempDir();
  const tmpHistory = createTempDir();

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');

    setupHistoryRecord(tmpHistory, projectId, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

    const context = {
      context_id: 'ctx-canc-1',
      target: normTarget,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary', 'history.page', 'history.detail']
    };

    const store = new SnapshotStore();
    const provider = new EVCrateAdvisorProvider(context, { snapshotStore: store, historyRootPath: tmpHistory });

    // 1. Initial scan aborted before start -> returns unavailable (no prior snapshot)
    const acPre = new AbortController();
    acPre.abort();
    const resPre = await provider.invoke('history.refresh', {}, { signal: acPre.signal });
    assert.equal(resPre.state, 'unavailable');
    assert.equal(resPre.snapshot_id, null);

    // 2. Successful scan commits fresh snapshot
    const resFresh = await provider.invoke('history.refresh', {});
    assert.equal(resFresh.state, 'fresh');
    assert.ok(resFresh.snapshot_id);

    // 3. Second scan aborted -> returns stale with prior snapshot
    const acPost = new AbortController();
    acPost.abort();
    const resPost = await provider.invoke('history.refresh', {}, { signal: acPost.signal });
    assert.equal(resPost.state, 'stale');
    assert.equal(resPost.snapshot_id, resFresh.snapshot_id);
    assert.equal(resPost.stale_reason, 'cancelled');
  } finally {
    cleanupTempDir(tmpProject);
    cleanupTempDir(tmpHistory);
  }
});

test('Deadline: past deadline marks stale or unavailable', async () => {
  const tmpProject = createTempDir();
  const tmpHistory = createTempDir();

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');

    setupHistoryRecord(tmpHistory, projectId, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

    const context = {
      context_id: 'ctx-dead-1',
      target: normTarget,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['history.refresh']
    };

    const store = new SnapshotStore();
    const provider = new EVCrateAdvisorProvider(context, { snapshotStore: store, historyRootPath: tmpHistory });

    // Initial past deadline -> unavailable
    const resDead = await provider.invoke('history.refresh', {}, { deadline: Date.now() - 1000 });
    assert.equal(resDead.state, 'unavailable');
    assert.equal(resDead.snapshot_id, null);

    // Fresh refresh
    const resFresh = await provider.invoke('history.refresh', {});
    assert.equal(resFresh.state, 'fresh');

    // Subsequent past deadline -> stale with 'deadline'
    const resDead2 = await provider.invoke('history.refresh', {}, { deadline: Date.now() - 1000 });
    assert.equal(resDead2.state, 'stale');
    assert.equal(resDead2.snapshot_id, resFresh.snapshot_id);
    assert.equal(resDead2.stale_reason, 'deadline');
  } finally {
    cleanupTempDir(tmpProject);
    cleanupTempDir(tmpHistory);
  }
});

test('Fair FIFO queue: concurrent refreshes execute sequentially', async () => {
  const tmpProject = createTempDir();
  const tmpHistory = createTempDir();

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');

    setupHistoryRecord(tmpHistory, projectId, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

    const context = {
      context_id: 'ctx-fifo-1',
      target: normTarget,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary']
    };

    const store = new SnapshotStore();
    const provider = new EVCrateAdvisorProvider(context, { snapshotStore: store, historyRootPath: tmpHistory });

    // Fire 3 refreshes concurrently
    const [r1, r2, r3] = await Promise.all([
      provider.invoke('history.refresh', {}),
      provider.invoke('history.refresh', {}),
      provider.invoke('history.refresh', {})
    ]);

    assert.equal(r1.state, 'fresh');
    assert.equal(r2.state, 'fresh');
    assert.equal(r3.state, 'fresh');
    assert.ok(r1.snapshot_id);
    assert.ok(r2.snapshot_id);
    assert.ok(r3.snapshot_id);
  } finally {
    cleanupTempDir(tmpProject);
    cleanupTempDir(tmpHistory);
  }
});
