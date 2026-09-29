/**
 * @file workspace-panel-fixtures.test.mjs
 * Verification suite for Workspace Advisor panel fixtures and unmapped dirty-history contracts (Phase 00).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { EVCrateAdvisorProvider } from '../../plugin/backend/provider.cjs';
import { WorkerContextTable } from '../../plugin/backend/context-table.cjs';
import { WorkerRequestTable } from '../../plugin/backend/request-table.cjs';
import { WorkerDispatcher } from '../../plugin/backend/dispatcher.cjs';
import { createRequire } from 'node:module';
const pluginRequire = createRequire(new URL('../../plugin/package.json', import.meta.url));
const { RUNNER_PROTOCOL_VERSION } = pluginRequire('@dam-hopper/plugin-sdk');
import {
  populateWorkspacePanelFixtureRoot,
  ID_PROJECT_A,
  LABEL_PROJECT_A,
  ID_WORKTREE_A,
  ID_PROJECT_B,
  LABEL_PROJECT_B,
  ID_PROJECT_U,
  EXPECTED_METRICS,
  FIXTURE_TASK_A1,
  FIXTURE_CONSULT_A1_1,
  FIXTURE_TASK_A_WT1,
  FIXTURE_CONSULT_A_WT1_1,
  FIXTURE_TASK_U1,
  FIXTURE_CONSULT_U1_1
} from '../fixtures/advisor-history/workspace-panel-fixtures.mjs';

function createTempDir(prefix = 'evcrate-fixture-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('Phase 00 fixtures: root scan, unmapped project U discovery, and diagnostics', async () => {
  const tmpRoot = createTempDir('evcrate-ph00-root-');
  try {
    populateWorkspacePanelFixtureRoot(tmpRoot);

    const normRoot = path.normalize(tmpRoot);
    const rootIdentity = createHash('sha256').update(normRoot, 'utf8').digest('hex');

    const context = {
      context_id: 'ctx-ph00-root',
      scope_kind: 'history-root',
      target: normRoot,
      history_identity: rootIdentity,
      binding_revision: 1,
      allowed_operations: [
        'history.refresh',
        'history.summary',
        'history.page',
        'history.detail'
      ]
    };

    const provider = new EVCrateAdvisorProvider(context, { historyRootPath: tmpRoot });
    const refreshRes = await provider.invoke('history.refresh', {});

    // 1. Verify scan metrics
    assert.equal(refreshRes.state, 'fresh');
    assert.equal(refreshRes.scan.projects_discovered, EXPECTED_METRICS.total_projects_discovered); // 6
    assert.equal(refreshRes.scan.accepted_records, EXPECTED_METRICS.total_accepted_records); // 7
    assert.equal(refreshRes.scan.invalid_records, EXPECTED_METRICS.total_invalid_records); // 2

    // 2. Verify diagnostics for malformed and mismatched records
    assert.equal(refreshRes.scan.diagnostics.length, 2);
    const diagCodes = refreshRes.scan.diagnostics.map((d) => d.code).sort();
    assert.deepEqual(diagCodes, ['EXECUTION_ID_MISMATCH', 'EXECUTION_INVALID_JSON']);

    const snapshotId = refreshRes.snapshot_id;

    // 3. Verify "All" summary (query.project_id: null)
    const allSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} }
    });

    assert.equal(allSummary.metrics.counts.consultations, 7);
    assert.equal(allSummary.inventory.total_projects, 6);
    assert.equal(allSummary.inventory.entries.filter((e) => e.count > 0).length, 4);
    assert.equal(allSummary.inventory.unfiltered_total_records, 7);

    // Verify inventory entries and labels
    const invMap = new Map(allSummary.inventory.entries.map((e) => [e.project_id, e]));
    assert.equal(invMap.get(ID_PROJECT_A)?.count, 3);
    assert.equal(invMap.get(ID_PROJECT_A)?.label, LABEL_PROJECT_A);

    assert.equal(invMap.get(ID_WORKTREE_A)?.count, 1);
    assert.equal(invMap.get(ID_WORKTREE_A)?.label, null); // Worktree has no metadata label

    assert.equal(invMap.get(ID_PROJECT_B)?.count, 2);
    assert.equal(invMap.get(ID_PROJECT_B)?.label, LABEL_PROJECT_B);

    assert.equal(invMap.get(ID_PROJECT_U)?.count, 1);
    assert.equal(invMap.get(ID_PROJECT_U)?.label, null); // Unmapped Project U discovered and accepted!

    // 4. Verify filtered summary for Project A
    const aSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: ID_PROJECT_A, task_run_id: null, filters: {} }
    });
    assert.equal(aSummary.metrics.counts.consultations, 3);

    // 5. Verify filtered summary for Worktree A (distinct from main Project A)
    const wtSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: ID_WORKTREE_A, task_run_id: null, filters: {} }
    });
    assert.equal(wtSummary.metrics.counts.consultations, 1);

    // 6. Verify filtered summary for Project B
    const bSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: ID_PROJECT_B, task_run_id: null, filters: {} }
    });
    assert.equal(bSummary.metrics.counts.consultations, 2);

    // 7. Verify filtered summary for Unmapped Project U
    const uSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: ID_PROJECT_U, task_run_id: null, filters: {} }
    });
    assert.equal(uSummary.metrics.counts.consultations, 1);
    // 8. Verify pagination across All vs Project A vs Project U
    const allPage = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(allPage.entries.length, 7);

    const aPage = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: ID_PROJECT_A, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(aPage.entries.length, 3);

    const uPage = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: ID_PROJECT_U, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(uPage.entries.length, 1);
    assert.equal(uPage.entries[0].project_id, ID_PROJECT_U);

    // 9. Verify detail fetch for unmapped record
    const uDetail = await provider.invoke('history.detail', {
      snapshot_id: snapshotId,
      record_ref: uPage.entries[0].record_ref
    });
    assert.equal(uDetail.status, 'ready');
    assert.equal(uDetail.execution.project_id, ID_PROJECT_U);
    assert.equal(uDetail.outcome.outcome, 'resolved');

    // 10. Verify detail fetch for worktree record
    const wtPage = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: ID_WORKTREE_A, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(wtPage.entries.length, 1);

    const wtDetail = await provider.invoke('history.detail', {
      snapshot_id: snapshotId,
      record_ref: wtPage.entries[0].record_ref
    });
    assert.equal(wtDetail.status, 'ready');
    assert.equal(wtDetail.execution.project_id, ID_WORKTREE_A);
  } finally {
    cleanupTempDir(tmpRoot);
  }
});

test('Phase 02 Step 1 & 2: Root All/A/worktree/U fixture proof with Phase 01 actual context descriptor', async () => {
  const tmpRoot = createTempDir('evcrate-ph02-root-');
  const tmpProjectA = createTempDir('evcrate-ph02-proj-a-');
  const tmpWtA = path.join(tmpProjectA, 'worktrees', 'wt-fix');
  fs.mkdirSync(tmpWtA, { recursive: true });

  try {
    const normA = path.normalize(tmpProjectA);
    const idA = createHash('sha256').update(normA, 'utf8').digest('hex');
    const normWtA = path.normalize(tmpWtA);
    const idWtA = createHash('sha256').update(normWtA, 'utf8').digest('hex');

    populateWorkspacePanelFixtureRoot(tmpRoot, {
      idProjectA: idA,
      idWorktreeA: idWtA
    });

    const normRoot = path.normalize(tmpRoot);
    const rootIdentity = createHash('sha256').update(normRoot, 'utf8').digest('hex');

    // Open context using Phase 01 actual descriptor:
    // - Selected project target: real project A directory
    // - contextScope: 'history-root'
    // - allowedOperations: history read operations
    const contextTable = new WorkerContextTable({ historyRootPath: tmpRoot });
    const openResult = contextTable.openContext({
      actorSubject: 'actor-owner',
      installationId: 'evcrate.advisor',
      configuredProjectTarget: normA,
      allowedOperations: [
        'history.refresh',
        'history.summary',
        'history.page',
        'history.detail'
      ],
      allowCurrentAccountPolicy: false,
      apiConnectionEpoch: 1,
      activationGeneration: 1,
      bindingRevision: 1,
      grantRevision: 1,
      scope: {
        kind: 'history-root',
        rootIdentity: rootIdentity
      }
    });

    assert.ok(openResult.contextId);
    const entry = contextTable.contexts.get(openResult.contextId);
    const provider = entry.provider;

    // 1. Refresh once
    const refreshRes = await provider.invoke('history.refresh', {});
    assert.equal(refreshRes.state, 'fresh');
    assert.equal(refreshRes.scan.projects_discovered, 6);
    assert.equal(refreshRes.scan.accepted_records, 7);
    assert.equal(refreshRes.scan.invalid_records, 2);
    assert.deepEqual(refreshRes.scan.diagnostics.map((d) => d.code).sort(), ['EXECUTION_ID_MISMATCH', 'EXECUTION_INVALID_JSON']);

    const snapshotId = refreshRes.snapshot_id;

    // 2. Summary for "All" (project_id: null)
    const allSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} }
    });
    assert.equal(allSummary.metrics.counts.consultations, 7);
    assert.equal(allSummary.inventory.total_projects, 6);
    assert.equal(allSummary.inventory.entries.filter((e) => e.count > 0).length, 4);
    assert.equal(allSummary.inventory.unfiltered_total_records, 7);

    const invMap = new Map(allSummary.inventory.entries.map((e) => [e.project_id, e]));
    assert.equal(invMap.get(idA)?.count, 3);
    assert.equal(invMap.get(idA)?.label, LABEL_PROJECT_A);
    assert.equal(invMap.get(idWtA)?.count, 1);
    assert.equal(invMap.get(idWtA)?.label, null);
    assert.equal(invMap.get(ID_PROJECT_B)?.count, 2);
    assert.equal(invMap.get(ID_PROJECT_B)?.label, LABEL_PROJECT_B);
    assert.equal(invMap.get(ID_PROJECT_U)?.count, 1);
    assert.equal(invMap.get(ID_PROJECT_U)?.label, null); // Unmapped Project U accepted with null label

    // 3. Summary filtered to Project A
    const aSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: idA, task_run_id: null, filters: {} }
    });
    assert.equal(aSummary.metrics.counts.consultations, 3);

    // 4. Summary filtered to Worktree A
    const wtSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: idWtA, task_run_id: null, filters: {} }
    });
    assert.equal(wtSummary.metrics.counts.consultations, 1);

    // 5. Page All
    const allPage = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(allPage.entries.length, 7);

    // 6. Page Project A
    const aPage = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: idA, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(aPage.entries.length, 3);

    // 7. Detail for unmapped record U
    const uPage = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: ID_PROJECT_U, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(uPage.entries.length, 1);
    const uDetail = await provider.invoke('history.detail', {
      snapshot_id: snapshotId,
      record_ref: uPage.entries[0].record_ref
    });
    assert.equal(uDetail.status, 'ready');
    assert.equal(uDetail.execution.project_id, ID_PROJECT_U);
    assert.equal(uDetail.outcome.outcome, 'resolved');
  } finally {
    cleanupTempDir(tmpRoot);
    cleanupTempDir(tmpProjectA);
  }
});

test('Phase 02 Step 3: Project-bound A context isolation, null query non-widening, and query HMAC binding', async () => {
  const tmpRoot = createTempDir('evcrate-ph02-pbound-root-');
  const tmpProjectA = createTempDir('evcrate-ph02-pbound-a-');
  const tmpProjectB = createTempDir('evcrate-ph02-pbound-b-');

  try {
    const normA = path.normalize(tmpProjectA);
    const idA = createHash('sha256').update(normA, 'utf8').digest('hex');
    const normB = path.normalize(tmpProjectB);
    const idB = createHash('sha256').update(normB, 'utf8').digest('hex');

    populateWorkspacePanelFixtureRoot(tmpRoot, {
      idProjectA: idA,
      idProjectB: idB
    });

    // Open project-bound context for Project A
    const contextTable = new WorkerContextTable({ historyRootPath: tmpRoot });
    const openResult = contextTable.openContext({
      actorSubject: 'actor-owner',
      installationId: 'evcrate.advisor',
      configuredProjectTarget: normA,
      allowedOperations: [
        'history.refresh',
        'history.summary',
        'history.page',
        'history.detail'
      ],
      allowCurrentAccountPolicy: false,
      apiConnectionEpoch: 1,
      activationGeneration: 1,
      bindingRevision: 1,
      grantRevision: 1,
      scope: {
        kind: 'project'
      }
    });

    const entry = contextTable.contexts.get(openResult.contextId);
    const provider = entry.provider;

    // 1. Refresh in project context: scans ONLY project A
    const refreshRes = await provider.invoke('history.refresh', {});
    assert.equal(refreshRes.state, 'fresh');
    assert.equal(refreshRes.scan.projects_discovered, 1);
    assert.equal(refreshRes.scan.accepted_records, 3);
    assert.equal(refreshRes.scan.invalid_records, 0);

    const snapshotId = refreshRes.snapshot_id;

    // 2. Summary with query.project_id: null MUST NOT widen: returns only Project A
    const nullSummary = await provider.invoke('history.summary', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} }
    });
    assert.equal(nullSummary.metrics.counts.consultations, 3);
    assert.equal(nullSummary.metrics.scope.kind, 'project');
    assert.equal(nullSummary.metrics.scope.selected_project_id, idA);
    assert.deepEqual(nullSummary.metrics.scope.project_ids, [idA]);

    // 3. Summary with query.project_id: idB MUST be rejected
    await assert.rejects(async () => {
      await provider.invoke('history.summary', {
        snapshot_id: snapshotId,
        query: { project_id: idB, task_run_id: null, filters: {} }
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 4. Summary with query.project_id: ID_PROJECT_U MUST be rejected
    await assert.rejects(async () => {
      await provider.invoke('history.summary', {
        snapshot_id: snapshotId,
        query: { project_id: ID_PROJECT_U, task_run_id: null, filters: {} }
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 5. Page with query.project_id: null returns only Project A's 3 entries
    const pageNull = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 10
    });
    assert.equal(pageNull.entries.length, 3);
    for (const e of pageNull.entries) {
      assert.equal(e.project_id, idA);
    }

    // 6. Page with query.project_id: idB MUST be rejected
    await assert.rejects(async () => {
      await provider.invoke('history.page', {
        snapshot_id: snapshotId,
        query: { project_id: idB, task_run_id: null, filters: {} },
        sort: 'started_at_desc',
        cursor: null,
        limit: 10
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 7. Cursor HMAC / query binding:
    // Obtain cursor with limit 1
    const paged1 = await provider.invoke('history.page', {
      snapshot_id: snapshotId,
      query: { project_id: null, task_run_id: null, filters: {} },
      sort: 'started_at_desc',
      cursor: null,
      limit: 1
    });
    assert.equal(paged1.entries.length, 1);
    assert.ok(paged1.next_cursor);

    // Replaying cursor for query { project_id: idA } must reject with query hash mismatch
    await assert.rejects(async () => {
      await provider.invoke('history.page', {
        snapshot_id: snapshotId,
        query: { project_id: idA, task_run_id: null, filters: {} },
        sort: 'started_at_desc',
        cursor: paged1.next_cursor,
        limit: 1
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'INVALID_INPUT');

    // 8. Detail fetch for Project A record succeeds
    const detailRes = await provider.invoke('history.detail', {
      snapshot_id: snapshotId,
      record_ref: pageNull.entries[0].record_ref
    });
    assert.equal(detailRes.status, 'ready');
    assert.equal(detailRes.execution.project_id, idA);
    assert.equal(detailRes.outcome.outcome, 'resolved');
  } finally {
    cleanupTempDir(tmpRoot);
    cleanupTempDir(tmpProjectA);
    cleanupTempDir(tmpProjectB);
  }
});

test('Phase 02 Step 4: Bounded scan, cancellation, deadline, and diagnostic invariants', async () => {
  const tmpRoot = createTempDir('evcrate-ph02-scan-');
  try {
    populateWorkspacePanelFixtureRoot(tmpRoot);
    const normRoot = path.normalize(tmpRoot);
    const rootIdentity = createHash('sha256').update(normRoot, 'utf8').digest('hex');

    const context = {
      context_id: 'ctx-ph02-scan',
      scope_kind: 'history-root',
      target: normRoot,
      history_identity: rootIdentity,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary']
    };

    const provider = new EVCrateAdvisorProvider(context, { historyRootPath: tmpRoot });

    // 1. Scan cancellation
    const ac = new AbortController();
    ac.abort();
    const cancelRes = await provider.invoke('history.refresh', {}, { signal: ac.signal });
    assert.equal(cancelRes.state, 'unavailable');
    assert.equal(cancelRes.scan.status, 'incomplete');
    assert.equal(cancelRes.scan.accepted_records, 0);

    // 2. Scan deadline exceeded
    const deadRes = await provider.invoke('history.refresh', {}, { deadline: Date.now() - 1000 });
    assert.equal(deadRes.state, 'unavailable');
    assert.equal(deadRes.scan.status, 'incomplete');

    // 3. Normal scan diagnostic accounting
    const normalRes = await provider.invoke('history.refresh', {});
    assert.equal(normalRes.state, 'fresh');
    assert.equal(normalRes.scan.accepted_records, 7);
    assert.equal(normalRes.scan.invalid_records, 2);
    assert.equal(normalRes.scan.diagnostics.length, 2);

    // Unmapped Project U and Worktree A are NOT invalid
    const codes = normalRes.scan.diagnostics.map((d) => d.code).sort();
    assert.deepEqual(codes, ['EXECUTION_ID_MISMATCH', 'EXECUTION_INVALID_JSON']);
  } finally {
    cleanupTempDir(tmpRoot);
  }
});

test('Phase 02 Step 6: Selected-target context with policy/evaluation-only permissions and absent history root', async () => {
  const tmpProject = createTempDir('evcrate-ph02-policy-proj-');
  const tmpPolicyFile = path.join(tmpProject, 'advisor-routing.json');
  const tmpEvalFile = path.join(tmpProject, 'eval-profile.json');

  try {
    const normProject = path.normalize(tmpProject);
    const projectId = createHash('sha256').update(normProject, 'utf8').digest('hex');

    const validPolicy = {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'operator-selected', effort: 'high' },
        backup: { backend: 'omp', model: 'operator-selected', effort: 'high' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
      history: { retention_days: 30, max_bytes: 104857600 }
    };
    fs.writeFileSync(tmpPolicyFile, JSON.stringify(validPolicy, null, 2), 'utf8');

    const validMixed = JSON.parse(
      fs.readFileSync(new URL('../fixtures/advisor-evaluations/valid-mixed.json', import.meta.url), 'utf8')
    );
    fs.writeFileSync(tmpEvalFile, JSON.stringify(validMixed, null, 2), 'utf8');

    // Context table with an absent history root
    const contextTable = new WorkerContextTable({
      historyRootPath: '/nonexistent/advisor/history/root'
    });

    // Open selected-target context with only policy and evaluations operations
    const openResult = contextTable.openContext({
      actorSubject: 'actor-owner',
      installationId: 'evcrate.advisor',
      configuredProjectTarget: normProject,
      allowedOperations: [
        'policy.readCurrent',
        'evaluations.list',
        'evaluations.read',
        'evaluations.compare'
      ],
      allowCurrentAccountPolicy: true,
      apiConnectionEpoch: 1,
      activationGeneration: 1,
      bindingRevision: 1,
      grantRevision: 1,
      scope: {
        kind: 'project'
      },
      policy_descriptor: { path: tmpPolicyFile },
      evaluation_descriptors: [{
        evaluation_ref: 'eval-profile-1',
        path: tmpEvalFile,
        expected_revision: null
      }]
    });

    assert.ok(openResult.contextId);
    const entry = contextTable.contexts.get(openResult.contextId);
    const provider = entry.provider;

    // 1. policy.readCurrent works from configured profile source
    const polRes = await provider.invoke('policy.readCurrent', {});
    assert.equal(polRes.status, 'ready');
    assert.equal(polRes.policy.version, 2);
    assert.equal(polRes.policy.advisor.primary.backend, 'codex');

    // 2. evaluations.list works from configured profile source
    const listRes = await provider.invoke('evaluations.list', { cursor: null, limit: 10 });
    assert.equal(listRes.status, 'ready');
    assert.equal(listRes.items.length, 1);
    assert.equal(listRes.items[0].evaluation_ref, 'eval-profile-1');
    // 3. evaluations.read works
    const readRes = await provider.invoke('evaluations.read', {
      evaluation_ref: 'eval-profile-1',
      expected_revision: listRes.items[0].source_revision
    });
    assert.equal(readRes.status, 'ready');
    assert.ok(readRes.document);
    assert.equal(readRes.document.evaluation_id, validMixed.evaluation_id);

    // 4. history operations throw FORBIDDEN
    await assert.rejects(async () => {
      await provider.invoke('history.refresh', {});
    }, (err) => err.name === 'ProviderError' && err.code === 'FORBIDDEN');

    await assert.rejects(async () => {
      await provider.invoke('history.summary', {
        snapshot_id: 'any-snapshot',
        query: { project_id: null }
      });
    }, (err) => err.name === 'ProviderError' && err.code === 'FORBIDDEN');
  } finally {
    cleanupTempDir(tmpProject);
  }
});

test('Phase 02 Step 8: Full framed worker dispatch over WorkerDispatcher with Phase 01 descriptor', async () => {
  const tmpRoot = createTempDir('evcrate-ph02-disp-root-');
  const tmpProjectA = createTempDir('evcrate-ph02-disp-a-');
  const tmpProjectB = createTempDir('evcrate-ph02-disp-b-');

  try {
    const normA = path.normalize(tmpProjectA);
    const idA = createHash('sha256').update(normA, 'utf8').digest('hex');
    const normB = path.normalize(tmpProjectB);
    const idB = createHash('sha256').update(normB, 'utf8').digest('hex');

    populateWorkspacePanelFixtureRoot(tmpRoot, {
      idProjectA: idA,
      idProjectB: idB
    });

    const normRoot = path.normalize(tmpRoot);
    const rootIdentity = createHash('sha256').update(normRoot, 'utf8').digest('hex');

    const contextTable = new WorkerContextTable({ historyRootPath: tmpRoot });
    const requestTable = new WorkerRequestTable();
    const dispatcher = new WorkerDispatcher({ contextTable, requestTable });

    // Handshake
    const helloRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'h1',
      method: 'runner.hello',
      params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
    });
    assert.equal(helloRes.error, undefined);

    // 1. Open root context with Phase 01 descriptor
    const openRootRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'open-root',
      method: 'context.open',
      params: {
        actorSubject: 'actor-owner',
        installationId: 'evcrate.advisor',
        configuredProjectTarget: normA,
        allowedOperations: ['history.refresh', 'history.summary', 'history.page', 'history.detail'],
        allowCurrentAccountPolicy: false,
        apiConnectionEpoch: 1,
        activationGeneration: 1,
        bindingRevision: 1,
        grantRevision: 1,
        scope: {
          kind: 'history-root',
          rootIdentity: rootIdentity
        }
      }
    });
    assert.equal(openRootRes.error, undefined);
    const rootContextId = openRootRes.result.contextId;

    // Invoke refresh in root context
    const rootRefreshMsg = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-root-ref',
      method: 'plugin.invoke',
      params: {
        contextId: rootContextId,
        operation: 'history.refresh',
        payload: {}
      }
    });
    assert.equal(rootRefreshMsg.error, undefined);
    assert.equal(rootRefreshMsg.result.result.scan.accepted_records, 7);
    const rootSnapshotId = rootRefreshMsg.result.result.snapshot_id;

    // Invoke summary with project_id: null in root context (returns all 7)
    const rootSummaryMsg = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-root-sum',
      method: 'plugin.invoke',
      params: {
        contextId: rootContextId,
        operation: 'history.summary',
        payload: {
          snapshot_id: rootSnapshotId,
          query: { project_id: null, task_run_id: null, filters: {} }
        }
      }
    });
    assert.equal(rootSummaryMsg.error, undefined);
    assert.equal(rootSummaryMsg.result.result.metrics.counts.consultations, 7);
    // 2. Open project-bound context for Project A with Phase 01 descriptor
    const openProjRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'open-proj',
      method: 'context.open',
      params: {
        actorSubject: 'actor-owner',
        installationId: 'evcrate.advisor',
        configuredProjectTarget: normA,
        allowedOperations: ['history.refresh', 'history.summary', 'history.page', 'history.detail'],
        allowCurrentAccountPolicy: false,
        apiConnectionEpoch: 1,
        activationGeneration: 1,
        bindingRevision: 1,
        grantRevision: 1,
        scope: {
          kind: 'project'
        }
      }
    });
    assert.equal(openProjRes.error, undefined);
    const projContextId = openProjRes.result.contextId;

    // Invoke refresh in project context (scans only project A: 3 records)
    const projRefreshMsg = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-proj-ref',
      method: 'plugin.invoke',
      params: {
        contextId: projContextId,
        operation: 'history.refresh',
        payload: {}
      }
    });
    assert.equal(projRefreshMsg.error, undefined);
    assert.equal(projRefreshMsg.result.result.scan.accepted_records, 3);
    const projSnapshotId = projRefreshMsg.result.result.snapshot_id;

    // Invoke summary with project_id: null in project context (cannot widen: exactly 3)
    const projSummaryMsg = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-proj-sum-null',
      method: 'plugin.invoke',
      params: {
        contextId: projContextId,
        operation: 'history.summary',
        payload: {
          snapshot_id: projSnapshotId,
          query: { project_id: null, task_run_id: null, filters: {} }
        }
      }
    });
    assert.equal(projSummaryMsg.error, undefined);
    assert.equal(projSummaryMsg.result.result.metrics.counts.consultations, 3);
    assert.equal(projSummaryMsg.result.result.metrics.scope.kind, 'project');
    // Invoke summary with project_id: idB in project context (rejected)
    const badSummaryMsg = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-proj-sum-b',
      method: 'plugin.invoke',
      params: {
        contextId: projContextId,
        operation: 'history.summary',
        payload: {
          snapshot_id: projSnapshotId,
          query: { project_id: idB, task_run_id: null, filters: {} }
        }
      }
    });
    assert.ok(badSummaryMsg.error);
    assert.equal(badSummaryMsg.error.code, 'INVALID_INPUT');
  } finally {
    cleanupTempDir(tmpRoot);
    cleanupTempDir(tmpProjectA);
    cleanupTempDir(tmpProjectB);
  }
});
