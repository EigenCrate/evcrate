/**
 * @file provider-source-safety.test.mjs
 * Source safety, path identity, and race condition tests for EVCrate Advisor Provider (Phase E01).
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

function createTempDir(prefix = 'evcrate-safe-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function createValidExecution(projectId, taskRunId, consultationId) {
  const checkpoint = makeCheckpoint(taskRunId, 'chk-1');
  const checkpointDigest = createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');
  return {
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
}

function createValidOutcome(projectId, taskRunId, consultationId) {
  return {
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
}

test('Source safety: invalid paths, symlinks, and dot-segments rejected', () => {
  const tmpDir = createTempDir();
  try {
    const normTarget = path.normalize(tmpDir);
    const expectedIdentity = createHash('sha256').update(normTarget, 'utf8').digest('hex');

    // 1. Relative path rejected
    assert.throws(() => {
      new EVCrateAdvisorProvider({
        context_id: 'ctx-inv-1',
        target: 'relative/path',
        history_identity: expectedIdentity,
        allowed_operations: ['history.refresh']
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 2. Path with null byte rejected
    assert.throws(() => {
      new EVCrateAdvisorProvider({
        context_id: 'ctx-inv-2',
        target: `${normTarget}\0/extra`,
        history_identity: expectedIdentity,
        allowed_operations: ['history.refresh']
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 3. Path with dot segments rejected
    assert.throws(() => {
      new EVCrateAdvisorProvider({
        context_id: 'ctx-inv-3',
        target: `${normTarget}/./child`,
        history_identity: expectedIdentity,
        allowed_operations: ['history.refresh']
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 4. Symlink directory rejected
    const symlinkTarget = path.join(tmpDir, 'symlink-dir');
    const realDir = path.join(tmpDir, 'real-dir');
    fs.mkdirSync(realDir);
    fs.symlinkSync(realDir, symlinkTarget);
    assert.throws(() => {
      new EVCrateAdvisorProvider({
        context_id: 'ctx-inv-4',
        target: symlinkTarget,
        history_identity: createHash('sha256').update(symlinkTarget, 'utf8').digest('hex'),
        allowed_operations: ['history.refresh']
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'PERMISSION_DENIED');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('Detail races: detects deleted execution, modified files, outcome added/removed', async () => {
  const tmpProject = createTempDir();
  const tmpHistory = createTempDir();

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');
    const taskRunId = '00000000-0000-4000-8000-000000000001';
    const consultationId = '00000000-0000-4000-8000-000000000002';
    const consultDir = path.join(tmpHistory, projectId, taskRunId, consultationId);
    fs.mkdirSync(consultDir, { recursive: true, mode: 0o700 });

    const execPath = path.join(consultDir, 'execution.json');
    const outPath = path.join(consultDir, 'outcome.json');
    const execObj = createValidExecution(projectId, taskRunId, consultationId);
    const outObj = createValidOutcome(projectId, taskRunId, consultationId);

    fs.writeFileSync(execPath, JSON.stringify(execObj));
    fs.writeFileSync(outPath, JSON.stringify(outObj));

    const context = {
      context_id: 'ctx-race-1',
      target: normTarget,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.detail']
    };

    const store = new SnapshotStore();
    const provider = new EVCrateAdvisorProvider(context, { snapshotStore: store, historyRootPath: tmpHistory });

    const refreshRes = await provider.invoke('history.refresh', {});
    const recordRef = createHash('sha256').update(`${projectId}:${taskRunId}:${consultationId}`, 'utf8').digest('hex').slice(0, 32);

    // Initial detail -> ready
    const d1 = await provider.invoke('history.detail', { snapshot_id: refreshRes.snapshot_id, record_ref: recordRef });
    assert.equal(d1.status, 'ready');

    // Case A: File modified -> changed
    const modifiedExec = { ...execObj, prompt_identity: 'prompt-modified' };
    fs.writeFileSync(execPath, JSON.stringify(modifiedExec));
    const dChanged = await provider.invoke('history.detail', { snapshot_id: refreshRes.snapshot_id, record_ref: recordRef });
    assert.equal(dChanged.status, 'changed');

    // Restore original execution
    fs.writeFileSync(execPath, JSON.stringify(execObj));

    // Case B: Outcome deleted -> changed
    fs.unlinkSync(outPath);
    const dOutGone = await provider.invoke('history.detail', { snapshot_id: refreshRes.snapshot_id, record_ref: recordRef });
    assert.equal(dOutGone.status, 'changed');
    // Restore files
    fs.writeFileSync(execPath, JSON.stringify(execObj));
    // Case D: Consult with no outcome at refresh, then outcome added -> changed
    const consultDir2 = path.join(tmpHistory, projectId, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004');
    fs.mkdirSync(consultDir2, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(consultDir2, 'execution.json'), JSON.stringify(createValidExecution(projectId, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004')));
    const ref2 = await provider.invoke('history.refresh', {});
    const recordRef2 = createHash('sha256').update(`${projectId}:00000000-0000-4000-8000-000000000003:00000000-0000-4000-8000-000000000004`, 'utf8').digest('hex').slice(0, 32);
    // Before outcome added -> ready
    const dPreOutcome = await provider.invoke('history.detail', { snapshot_id: ref2.snapshot_id, record_ref: recordRef2 });
    assert.equal(dPreOutcome.status, 'ready');
    assert.equal(dPreOutcome.outcome, null);
    // Outcome added -> changed
    fs.writeFileSync(path.join(consultDir2, 'outcome.json'), JSON.stringify(createValidOutcome(projectId, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004')));
    const dPostOutcome = await provider.invoke('history.detail', { snapshot_id: ref2.snapshot_id, record_ref: recordRef2 });
    assert.equal(dPostOutcome.status, 'changed');

    // Case C: Execution deleted -> missing
    fs.unlinkSync(execPath);
    const dMissing = await provider.invoke('history.detail', { snapshot_id: refreshRes.snapshot_id, record_ref: recordRef });
    assert.equal(dMissing.status, 'missing');
  } finally {
    cleanupTempDir(tmpProject);
    cleanupTempDir(tmpHistory);
  }
});

test('Cross-context isolation: snapshots cannot be read across context IDs', async () => {
  const tmpProject = createTempDir();
  const tmpHistory = createTempDir();

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');
    const taskRunId = '00000000-0000-4000-8000-000000000001';
    const consultationId = '00000000-0000-4000-8000-000000000002';
    const consultDir = path.join(tmpHistory, projectId, taskRunId, consultationId);
    fs.mkdirSync(consultDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(consultDir, 'execution.json'), JSON.stringify(createValidExecution(projectId, taskRunId, consultationId)));

    const sharedStore = new SnapshotStore();

    const providerA = new EVCrateAdvisorProvider({
      context_id: 'ctx-A',
      target: normTarget,
      history_identity: projectId,
      allowed_operations: ['history.refresh', 'history.summary']
    }, { snapshotStore: sharedStore, historyRootPath: tmpHistory });

    const providerB = new EVCrateAdvisorProvider({
      context_id: 'ctx-B',
      target: normTarget,
      history_identity: projectId,
      allowed_operations: ['history.refresh', 'history.summary']
    }, { snapshotStore: sharedStore, historyRootPath: tmpHistory });

    const refA = await providerA.invoke('history.refresh', {});
    assert.equal(refA.state, 'fresh');

    // Provider B tries to query provider A's snapshot -> throws SNAPSHOT_EXPIRED
    await assert.rejects(async () => {
      await providerB.invoke('history.summary', {
        snapshot_id: refA.snapshot_id,
        query: { task_run_id: null, filters: {} }
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'SNAPSHOT_EXPIRED');
  } finally {
    cleanupTempDir(tmpProject);
    cleanupTempDir(tmpHistory);
  }
});
