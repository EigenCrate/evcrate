/**
 * @file provider.test.mjs
 * Unit and contract tests for EVCrate Advisor Provider operations (Phase E01).
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

function createTempDir(prefix = 'evcrate-prov-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('EVCrateAdvisorProvider: initialization, context binding and path verification', () => {
  const tmpDir = createTempDir();
  try {
    const normTarget = path.normalize(tmpDir);
    const expectedIdentity = createHash('sha256').update(normTarget, 'utf8').digest('hex');

    const validContext = {
      context_id: 'ctx-001',
      target: normTarget,
      history_identity: expectedIdentity,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary', 'history.page', 'history.detail']
    };

    const provider = new EVCrateAdvisorProvider(validContext);
    assert.ok(provider);
    assert.equal(provider.getContext().contextId, 'ctx-001');
    assert.equal(provider.getContext().target, normTarget);
    assert.equal(provider.getContext().historyIdentity, expectedIdentity);

    // Mismatched history identity throws SOURCE_INVALID
    assert.throws(() => {
      new EVCrateAdvisorProvider({
        ...validContext,
        history_identity: 'f'.repeat(64)
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'SOURCE_NOT_CONFIGURED');

    // Missing target directory throws SOURCE_MISSING
    assert.throws(() => {
      new EVCrateAdvisorProvider({
        ...validContext,
        target: path.join(tmpDir, 'does-not-exist'),
        history_identity: createHash('sha256').update(path.join(tmpDir, 'does-not-exist'), 'utf8').digest('hex')
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'SOURCE_MISSING');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('EVCrateAdvisorProvider: history.refresh, summary, page, and detail operations', async () => {
  const tmpProject = createTempDir('evcrate-proj-');
  const tmpHistory = createTempDir('evcrate-hist-');

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');

    // Setup history record in tmpHistory
    const taskRunId = '00000000-0000-4000-8000-000000000001';
    const consultationId = '00000000-0000-4000-8000-000000000002';
    const consultDir = path.join(tmpHistory, projectId, taskRunId, consultationId);
    fs.mkdirSync(consultDir, { recursive: true, mode: 0o700 });

    const checkpoint = makeCheckpoint(taskRunId, 'chk-1');
    const checkpointDigest = createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');

    const route = { backend: 'codex', model: 'operator-selected', effort: 'high' };
    const receipt = {
      backend: 'codex',
      model: 'operator-selected',
      effort: 'high',
      controller_version: 2,
      adapter_version: '1.0.0',
      build_identity: 'build-v2',
      elapsed_ms: 1000
    };
    const result = {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: checkpoint.checkpoint,
      status: 'ADVICE_READY',
      recommendation: 'accept',
      rationale: 'Verified',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: [],
      unresolved_questions: []
    };
    const execution = {
      schema_version: 1,
      consultation_id: consultationId,
      task_run_id: taskRunId,
      project_id: projectId,
      checkpoint_digest: checkpointDigest,
      checkpoint,
      route,
      receipt,
      prompt_identity: 'prompt-v2',
      build_identity: 'build-v2',
      attempts: [],
      status: 'ADVICE_READY',
      result,
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

    const context = {
      context_id: 'ctx-001',
      target: normTarget,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary', 'history.page', 'history.detail']
    };

    const store = new SnapshotStore();
    const provider = new EVCrateAdvisorProvider(context, { snapshotStore: store, historyRootPath: tmpHistory });

    // 1. Refresh
    const refreshRes = await provider.invoke('history.refresh', {});
    assert.equal(refreshRes.state, 'fresh');
    assert.ok(refreshRes.snapshot_id);
    assert.equal(refreshRes.scan.accepted_records, 1);
    assert.equal(refreshRes.scan.status, 'complete');

    const snapshotId = refreshRes.snapshot_id;

    // 2. Summary
    const summaryRes = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { task_run_id: null, filters: {} }
    });
    assert.equal(summaryRes.state, 'fresh');
    assert.equal(summaryRes.snapshot_id, snapshotId);
    assert.equal(summaryRes.metrics.metric_definition_version, 1);
    assert.equal(summaryRes.metrics.counts.consultations, 1);
    assert.equal(summaryRes.metrics.metrics.delivery.value, 1);

    // 3. Page
    const pageRes = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(pageRes.state, 'fresh');
    assert.equal(pageRes.snapshot_id, snapshotId);
    assert.equal(pageRes.entries.length, 1);
    const row = pageRes.entries[0];
    assert.equal(row.task_run_id, taskRunId);
    assert.equal(row.consultation_id, consultationId);
    assert.equal(row.status, 'ADVICE_READY');
    assert.equal(row.outcome_state, 'valid');
    assert.equal(row.outcome_result, 'resolved');
    assert.equal(pageRes.next_cursor, null);

    // 4. Detail
    const detailRes = await provider.invoke('history.detail', {
      snapshot_id: snapshotId,
      record_ref: row.record_ref
    });
    assert.equal(detailRes.status, 'ready');
    assert.equal(detailRes.snapshot_id, snapshotId);
    assert.equal(detailRes.record_ref, row.record_ref);
    assert.ok(detailRes.execution);
    assert.equal(detailRes.execution.status, 'ADVICE_READY');
    assert.ok(detailRes.outcome);
    assert.equal(detailRes.outcome.outcome, 'resolved');

    // Forbidden operation check
    assert.rejects(async () => {
      await provider.invoke('policy.readCurrent', {});
    }, (err) => err.name === 'ProviderError' && err.code === 'FORBIDDEN');
  } finally {
    cleanupTempDir(tmpProject);
    cleanupTempDir(tmpHistory);
  }
});

test('EVCrateAdvisorProvider: current policy and bound evaluations', async () => {
  const tmpProject = createTempDir('evcrate-proj-');
  const tmpPolicyFile = path.join(tmpProject, 'advisor-routing.json');
  const tmpEvalFile = path.join(tmpProject, 'eval-doc.json');

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');

    const validPolicy = {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'operator-selected', effort: 'high' },
        backup: { backend: 'omp', model: 'operator-selected', effort: 'high' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
      history: { retention_days: 30, max_bytes: 104857600 }
    };
    fs.writeFileSync(tmpPolicyFile, JSON.stringify(validPolicy));

    const validMixed = JSON.parse(fs.readFileSync(new URL('../fixtures/advisor-evaluations/valid-mixed.json', import.meta.url), 'utf8'));
    fs.writeFileSync(tmpEvalFile, JSON.stringify(validMixed));

    const context = {
      context_id: 'ctx-002',
      target: normTarget,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['policy.readCurrent', 'evaluations.list', 'evaluations.read', 'evaluations.compare'],
      policy_descriptor: { path: tmpPolicyFile },
      evaluation_descriptors: [
        { evaluation_ref: 'eval-001', path: tmpEvalFile, expected_revision: null }
      ]
    };

    const provider = new EVCrateAdvisorProvider(context);

    // 1. Current policy
    const policyRes = await provider.invoke('policy.readCurrent', {});
    assert.equal(policyRes.status, 'ready');
    assert.equal(policyRes.scope, 'account');
    assert.equal(policyRes.temporal, 'current');
    assert.ok(policyRes.revision);
    assert.ok(policyRes.policy);
    assert.equal(policyRes.policy.version, 2);

    // 2. Evaluations list
    const evalListRes = await provider.invoke('evaluations.list', { cursor: null, limit: 10 });
    assert.equal(evalListRes.status, 'ready');
    assert.equal(evalListRes.items.length, 1);
    assert.equal(evalListRes.items[0].evaluation_ref, 'eval-001');
    assert.equal(evalListRes.items[0].case_count, 2);

    // 3. Evaluations read
    const evalReadRes = await provider.invoke('evaluations.read', {
      evaluation_ref: 'eval-001',
      expected_revision: evalListRes.items[0].source_revision
    });
    assert.equal(evalReadRes.status, 'ready');
    assert.equal(evalReadRes.descriptor.evaluation_ref, 'eval-001');
    assert.equal(evalReadRes.document.evaluation_id, validMixed.evaluation_id);

    // 4. Evaluations compare
    const evalCompareRes = await provider.invoke('evaluations.compare', {
      items: [{ evaluation_ref: 'eval-001', expected_revision: evalListRes.items[0].source_revision }],
      cursor: null,
      limit: 10
    });
    assert.equal(evalCompareRes.status, 'ready');
    assert.equal(evalCompareRes.groups.length, 2);
    assert.ok(evalCompareRes.source_revisions.length === 1);
  } finally {
    cleanupTempDir(tmpProject);
  }
});
