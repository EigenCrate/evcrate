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
function createTestExecution(projectId, taskRunId, consultationId, status = 'ADVICE_READY', startedAt = 1000) {
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
  const result = status === 'ADVICE_READY' ? {
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
  } : null;

  return {
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
    status,
    result,
    error: status === 'FAILED' ? 'Execution failed' : null,
    started_at: startedAt,
    completed_at: startedAt + 1000
  };
}
test('EVCrateAdvisorProvider: root scope multi-project scanning, inventory, labels and fallback', async () => {
  const tmpRoot = createTempDir('evcrate-root-hist-');
  try {
    const projA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const projB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const projC = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    const t1 = '00000000-0000-4000-8000-000000000001';
    const c1 = '00000000-0000-4000-8000-000000000011';
    const c2 = '00000000-0000-4000-8000-000000000012';
    const t2 = '00000000-0000-4000-8000-000000000002';
    const c3 = '00000000-0000-4000-8000-000000000021';
    const t3 = '00000000-0000-4000-8000-000000000003';
    const c4 = '00000000-0000-4000-8000-000000000031';

    // Proj A: 2 consultations, per-project metadata label: 'Project Alpha'
    const dirA1 = path.join(tmpRoot, projA, t1, c1);
    const dirA2 = path.join(tmpRoot, projA, t1, c2);
    fs.mkdirSync(dirA1, { recursive: true, mode: 0o700 });
    fs.mkdirSync(dirA2, { recursive: true, mode: 0o700 });

    const execA1 = createTestExecution(projA, t1, c1, 'ADVICE_READY', 1000);
    const execA2 = createTestExecution(projA, t1, c2, 'ADVICE_READY', 1500);
    fs.writeFileSync(path.join(dirA1, 'execution.json'), JSON.stringify(execA1));
    fs.writeFileSync(path.join(dirA2, 'execution.json'), JSON.stringify(execA2));

    const metaA = {
      version: 1,
      projects: { [projA]: { name: 'Project Alpha', updated_at: 1700000000 } }
    };
    fs.writeFileSync(path.join(tmpRoot, projA, 'project-metadata.json'), JSON.stringify(metaA));

    // Proj B: 1 consultation, label in root-level sidecar: 'Project Beta'
    const dirB = path.join(tmpRoot, projB, t2, c3);
    fs.mkdirSync(dirB, { recursive: true, mode: 0o700 });
    const cpB = makeCheckpoint(t2, 'b1');
    const execB = createTestExecution(projB, t2, c3, 'ADVICE_READY', 2000);
    fs.writeFileSync(path.join(dirB, 'execution.json'), JSON.stringify(execB));

    const rootMeta = {
      version: 1,
      projects: { [projB]: { name: 'Project Beta', updated_at: 1700000001 } }
    };
    fs.writeFileSync(path.join(tmpRoot, 'project-metadata.json'), JSON.stringify(rootMeta));

    // Proj C: 1 consultation, invalid metadata with control chars -> falls back to null
    const dirC = path.join(tmpRoot, projC, t3, c4);
    fs.mkdirSync(dirC, { recursive: true, mode: 0o700 });
    const cpC = makeCheckpoint(t3, 'c1');
    const execC = createTestExecution(projC, t3, c4, 'ADVICE_READY', 3000);
    fs.writeFileSync(path.join(dirC, 'execution.json'), JSON.stringify(execC));

    const metaC = {
      version: 1,
      projects: { [projC]: { name: 'Bad\x00Name', updated_at: 1700000002 } }
    };
    fs.writeFileSync(path.join(tmpRoot, projC, 'project-metadata.json'), JSON.stringify(metaC));

    // Open root scope context
    const rootNorm = path.normalize(tmpRoot);
    const rootId = createHash('sha256').update(rootNorm, 'utf8').digest('hex');
    const context = {
      context_id: 'ctx-root-1',
      scope_kind: 'history-root',
      target: rootNorm,
      history_identity: rootId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary', 'history.page', 'history.detail']
    };

    const store = new SnapshotStore();
    const provider = new EVCrateAdvisorProvider(context, { snapshotStore: store, historyRootPath: tmpRoot });

    // 1. Refresh in root scope
    const refreshRes = await provider.invoke('history.refresh', {});
    assert.equal(refreshRes.state, 'fresh');
    assert.equal(refreshRes.scan.projects_discovered, 3);
    assert.equal(refreshRes.scan.accepted_records, 4);
    assert.ok(refreshRes.inventory);
    assert.equal(refreshRes.inventory.total_projects, 3);
    assert.equal(refreshRes.inventory.unfiltered_total_records, 4);

    const invEntries = refreshRes.inventory.entries;
    assert.equal(invEntries.length, 3);
    assert.equal(invEntries[0].project_id, projA);
    assert.equal(invEntries[0].label, 'Project Alpha');
    assert.equal(invEntries[0].count, 2);

    assert.equal(invEntries[1].project_id, projB);
    assert.equal(invEntries[1].label, 'Project Beta');
    assert.equal(invEntries[1].count, 1);

    assert.equal(invEntries[2].project_id, projC);
    assert.equal(invEntries[2].label, null, 'Invalid metadata name should degrade to null label');
    assert.equal(invEntries[2].count, 1);

    const snapshotId = refreshRes.snapshot_id;

    // 2. Summary for All Projects (project_id: null)
    const summaryAll = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} }
    });
    assert.equal(summaryAll.state, 'fresh');
    assert.equal(summaryAll.metrics.counts.consultations, 4);
    assert.equal(summaryAll.metrics.scope.kind, 'history-root');
    assert.equal(summaryAll.metrics.scope.selected_project_id, null);
    assert.equal(summaryAll.inventory.total_projects, 3);

    // 3. Summary filtered to Project A
    const summaryA = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: projA, task_run_id: null, filters: {} }
    });
    assert.equal(summaryA.metrics.counts.consultations, 2);
    assert.equal(summaryA.metrics.scope.selected_project_id, projA);

    // 4. Page All Projects with pagination and sort tie-breaker
    const page1 = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 2
    });
    assert.equal(page1.entries.length, 2);
    assert.ok(page1.next_cursor);
    assert.equal(page1.entries[0].project_id, projC); // started_at: 3000
    assert.equal(page1.entries[1].project_id, projB); // started_at: 2000

    const page2 = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: page1.next_cursor,
      limit: 2
    });
    assert.equal(page2.entries.length, 2);
    assert.equal(page2.entries[0].project_id, projA); // started_at: 1500
    assert.equal(page2.entries[1].project_id, projA); // started_at: 1000
    assert.equal(page2.next_cursor, null);

    // 5. Cursor scope mismatch: using page1 cursor for Project A query must fail
    await assert.rejects(async () => {
      await provider.invoke('history.page', {
        snapshot_id: snapshotId,
        query: { project_id: projA, task_run_id: null, filters: {} },
        sort: 'started_at_desc',
        cursor: page1.next_cursor,
        limit: 2
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 6. Detail for entries across projects
    const detA = await provider.invoke('history.detail', {
      snapshot_id: snapshotId,
      record_ref: page2.entries[0].record_ref
    });
    assert.equal(detA.status, 'ready');
    assert.equal(detA.execution.project_id, projA);

    const detC = await provider.invoke('history.detail', {
      snapshot_id: snapshotId,
      record_ref: page1.entries[0].record_ref
    });
    assert.equal(detC.status, 'ready');
    assert.equal(detC.execution.project_id, projC);
  } finally {
    cleanupTempDir(tmpRoot);
  }
});

test('EVCrateAdvisorProvider: single project context cannot widen query to another project', async () => {
  const tmpProject = createTempDir('evcrate-single-proj-');
  const tmpHistory = createTempDir('evcrate-single-hist-');

  try {
    const normTarget = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normTarget, 'utf8').digest('hex');
    const otherProjectId = '1111111111111111111111111111111111111111111111111111111111111111';

    const context = {
      context_id: 'ctx-single-1',
      scope_kind: 'project',
      target: normTarget,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary', 'history.page']
    };

    const provider = new EVCrateAdvisorProvider(context, { historyRootPath: tmpHistory });
    const refreshRes = await provider.invoke('history.refresh', {});
    const snapshotId = refreshRes.snapshot_id;

    // Single project scope querying different project must be rejected
    await assert.rejects(async () => {
      await provider.invoke('history.summary', {
        snapshot_id: snapshotId,
        query: { project_id: otherProjectId, task_run_id: null, filters: {} }
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    await assert.rejects(async () => {
      await provider.invoke('history.page', {
        snapshot_id: snapshotId,
        query: { project_id: otherProjectId, task_run_id: null, filters: {} },
        sort: 'started_at_desc',
        cursor: null,
        limit: 10
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');
  } finally {
    cleanupTempDir(tmpProject);
    cleanupTempDir(tmpHistory);
  }
});

test('EVCrateAdvisorProvider: negative checks for symlink skipping and ID mismatch diagnostics', async () => {
  const tmpRoot = createTempDir('evcrate-neg-hist-');
  const tmpOutside = createTempDir('evcrate-outside-');

  try {
    const projGood = '1111111111111111111111111111111111111111111111111111111111111111';
    const projBadId = '2222222222222222222222222222222222222222222222222222222222222222';
    const projSym = '3333333333333333333333333333333333333333333333333333333333333333';

    const t1 = '00000000-0000-4000-8000-000000000001';
    const c1 = '00000000-0000-4000-8000-000000000002';

    // 1. Valid project
    const dirGood = path.join(tmpRoot, projGood, t1, c1);
    fs.mkdirSync(dirGood, { recursive: true, mode: 0o700 });
    const execGood = createTestExecution(projGood, t1, c1, 'ADVICE_READY', 1000);
    fs.writeFileSync(path.join(dirGood, 'execution.json'), JSON.stringify(execGood));

    // 2. Project with ID mismatch in execution.json
    const dirBad = path.join(tmpRoot, projBadId, t1, c1);
    fs.mkdirSync(dirBad, { recursive: true, mode: 0o700 });
    const execBad = createTestExecution(projGood, t1, c1, 'ADVICE_READY', 1000); // mismatch: file says projGood, enclosing dir is projBadId
    fs.writeFileSync(path.join(dirBad, 'execution.json'), JSON.stringify(execBad));

    // 3. Symlinked project directory
    const realSymDir = path.join(tmpOutside, 'sym-target');
    fs.mkdirSync(realSymDir, { recursive: true, mode: 0o700 });
    fs.symlinkSync(realSymDir, path.join(tmpRoot, projSym));

    const rootNorm = path.normalize(tmpRoot);
    const rootId = createHash('sha256').update(rootNorm, 'utf8').digest('hex');
    const context = {
      context_id: 'ctx-neg-1',
      scope_kind: 'history-root',
      target: rootNorm,
      history_identity: rootId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary']
    };

    const provider = new EVCrateAdvisorProvider(context, { historyRootPath: tmpRoot });
    const refreshRes = await provider.invoke('history.refresh', {});

    // Symlinked project must be skipped: only projGood and projBadId discovered
    assert.equal(refreshRes.scan.projects_discovered, 2);
    // projGood accepted (1), projBadId rejected (1 invalid)
    assert.equal(refreshRes.scan.accepted_records, 1);
    assert.equal(refreshRes.scan.invalid_records, 1);
    assert.equal(refreshRes.scan.diagnostics.length, 1);
    assert.equal(refreshRes.scan.diagnostics[0].code, 'EXECUTION_ID_MISMATCH');
  } finally {
    cleanupTempDir(tmpRoot);
    cleanupTempDir(tmpOutside);
  }
});
