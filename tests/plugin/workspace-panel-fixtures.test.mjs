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
