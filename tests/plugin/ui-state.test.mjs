/**
 * @file ui-state.test.mjs
 * State machine and selector tests for provider-neutral Advisor UI (Phase E03).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appReducer,
  INITIAL_STATE,
  INITIAL_DETAIL_STATE,
  selectFilteredRecords,
  selectSelectedRow,
  extractDomainQuery,
  formatProjectName
} from '../../viewer/src/app-state.ts';

test('app-state: PROVIDER_READY initializes provider metadata', () => {
  const next = appReducer(INITIAL_STATE, {
    type: 'PROVIDER_READY',
    providerKind: 'dam-hopper',
    label: 'Target Project',
    capabilities: ['history.refresh', 'history.summary', 'history.page', 'history.detail'],
    frameSession: 'session-xyz',
    activationGeneration: 3
  });
  assert.equal(next.providerKind, 'dam-hopper');
  assert.equal(next.historySourceLabel, 'Target Project');
  assert.equal(next.frameSession, 'session-xyz');
  assert.equal(next.activationGeneration, 3);
  assert.equal(next.isAvailable, true);
});

test('app-state: CONTEXT_CHANGED clears stale data, cursors, detail, and selection', () => {
  const loadedState = {
    ...INITIAL_STATE,
    status: 'fresh',
    generation: 1,
    activationGeneration: 1,
    frameSession: 'session-1',
    snapshotId: 'snap-1',
    historyPageEntries: [{ consultation_id: 'c-1', project_id: 'p-1' }],
    selectedConsultationId: 'c-1',
    historyDetail: { status: 'ready', consultationId: 'c-1', recordRef: 'c-1' }
  };

  const next = appReducer(loadedState, {
    type: 'CONTEXT_CHANGED',
    label: 'Switched Project',
    capabilities: ['history.refresh'],
    frameSession: 'session-2',
    activationGeneration: 2
  });

  assert.equal(next.status, 'idle');
  assert.equal(next.historySourceLabel, 'Switched Project');
  assert.equal(next.frameSession, 'session-2');
  assert.equal(next.activationGeneration, 2);
  assert.equal(next.snapshotId, null);
  assert.equal(next.historyPageEntries.length, 0);
  assert.equal(next.selectedConsultationId, null);
  assert.equal(next.historyDetail.status, 'idle');
  assert.equal(next.staleReason, null);
});

test('app-state: CONTEXT_REVOKED sets revoked status and clears prior data', () => {
  const loadedState = { ...INITIAL_STATE, status: 'fresh', snapshotId: 'snap-1', selectedConsultationId: 'c-1' };
  const next = appReducer(loadedState, { type: 'CONTEXT_REVOKED', reason: 'Token expired' });
  assert.equal(next.status, 'revoked');
  assert.equal(next.staleReason, 'Token expired');
  assert.equal(next.snapshotId, null);
  assert.equal(next.selectedConsultationId, null);
});

test('app-state: HISTORY_REFRESH_COMMIT handles fresh, stale, and unavailable', () => {
  const scanning = { ...INITIAL_STATE, status: 'scanning', generation: 2, frameSession: 's-1' };

  // Fresh
  const fresh = appReducer(scanning, {
    type: 'HISTORY_REFRESH_COMMIT', generation: 2, frameSession: 's-1',
    result: { state: 'fresh', snapshot_id: 'snap-fresh', observed_at: Date.now(), scan: { status: 'complete', accepted_records: 10, invalid_records: 0 }, stale_reason: null }
  });
  assert.equal(fresh.status, 'fresh');
  assert.equal(fresh.snapshotId, 'snap-fresh');

  // Stale retaining prior
  const stale = appReducer(fresh, {
    type: 'HISTORY_REFRESH_COMMIT', generation: 2, frameSession: 's-1',
    result: { state: 'stale', snapshot_id: 'snap-fresh', observed_at: Date.now(), scan: { status: 'incomplete', accepted_records: 8, invalid_records: 0 }, stale_reason: 'Scan deadline exceeded' }
  });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.snapshotId, 'snap-fresh');
  assert.ok(stale.staleReason.includes('Scan deadline exceeded'));

  // Unavailable
  const unavail = appReducer(fresh, {
    type: 'HISTORY_REFRESH_COMMIT', generation: 2, frameSession: 's-1',
    result: { state: 'unavailable', snapshot_id: null, observed_at: Date.now(), scan: { status: 'incomplete' }, stale_reason: null }
  });
  assert.equal(unavail.status, 'idle');
  assert.equal(unavail.snapshotId, null);
  assert.equal(unavail.staleReason, 'History source unavailable');
});

test('app-state: discards late refresh responses from mismatched generations', () => {
  const current = { ...INITIAL_STATE, status: 'scanning', generation: 5, frameSession: 's-5' };

  // Late generation 4
  const ignoredGen = appReducer(current, {
    type: 'HISTORY_REFRESH_COMMIT', generation: 4, frameSession: 's-5',
    result: { state: 'fresh', snapshot_id: 'snap-old' }
  });
  assert.equal(ignoredGen, current, 'Must discard message from old generation');

  // Mismatched session
  const ignoredSess = appReducer(current, {
    type: 'HISTORY_REFRESH_COMMIT', generation: 5, frameSession: 's-other',
    result: { state: 'fresh', snapshot_id: 'snap-wrong' }
  });
  assert.equal(ignoredSess, current, 'Must discard message from wrong frame session');
});

test('app-state: handles HISTORY_DETAIL states (loading, ready, changed, missing)', () => {
  const idle = { ...INITIAL_STATE, snapshotId: 'snap-1' };
  const loading = appReducer(idle, { type: 'HISTORY_DETAIL_START', recordRef: 'ref-1', consultationId: 'c-1' });
  assert.equal(loading.historyDetail.status, 'loading');

  // Ready
  const ready = appReducer(loading, {
    type: 'HISTORY_DETAIL_COMMIT', consultationId: 'c-1',
    result: { status: 'ready', snapshot_id: 'snap-1', record_ref: 'ref-1', detail_revision: 'rev-1', execution: { consultation_id: 'c-1', status: 'ADVICE_READY' }, outcome: { outcome: 'resolved' } }
  });
  assert.equal(ready.historyDetail.status, 'ready');
  assert.equal(ready.historyDetail.execution.status, 'ADVICE_READY');

  // Changed
  const changed = appReducer(loading, {
    type: 'HISTORY_DETAIL_COMMIT', consultationId: 'c-1',
    result: { status: 'changed', snapshot_id: 'snap-1', record_ref: 'ref-1', observed_revision: 'rev-2' }
  });
  assert.equal(changed.historyDetail.status, 'changed');
  assert.equal(changed.historyDetail.observedRevision, 'rev-2');

  // Missing
  const missing = appReducer(loading, {
    type: 'HISTORY_DETAIL_COMMIT', consultationId: 'c-1',
    result: { status: 'missing', snapshot_id: 'snap-1', record_ref: 'ref-1', observed_revision: null }
  });
  assert.equal(missing.historyDetail.status, 'missing');
});

test('app-state: ignores late History detail results after selection or context changes', () => {
  const selectedA = appReducer(INITIAL_STATE, { type: 'SELECT_CONSULTATION', consultationId: 'c-1', recordRef: 'ref-1' });
  const loadingA = appReducer(selectedA, { type: 'HISTORY_DETAIL_START', recordRef: 'ref-1', consultationId: 'c-1' });
  const selectedB = appReducer(loadingA, { type: 'SELECT_CONSULTATION', consultationId: 'c-2', recordRef: 'ref-2' });
  const loadingB = appReducer(selectedB, { type: 'HISTORY_DETAIL_START', recordRef: 'ref-2', consultationId: 'c-2' });
  const lateMissing = appReducer(loadingB, {
    type: 'HISTORY_DETAIL_COMMIT',
    consultationId: 'c-1',
    result: { status: 'missing', snapshot_id: 'snap-1', record_ref: 'ref-1', observed_revision: null }
  });
  assert.equal(lateMissing, loadingB);

  const lateError = appReducer(loadingB, {
    type: 'HISTORY_DETAIL_ERROR',
    recordRef: 'ref-1',
    consultationId: 'c-1',
    error: 'late failure'
  });
  assert.equal(lateError, loadingB);
  assert.equal(lateError.historyDetail.status, 'loading');
  assert.equal(lateError.historyDetail.consultationId, 'c-2');

  const changedContext = appReducer(loadingB, {
    type: 'CONTEXT_CHANGED',
    label: 'Other Workspace',
    capabilities: ['history.detail'],
    frameSession: 'session-2',
    activationGeneration: 2
  });
  const lateAfterContextChange = appReducer(changedContext, {
    type: 'HISTORY_DETAIL_COMMIT',
    consultationId: 'c-2',
    result: { status: 'missing', snapshot_id: 'snap-1', record_ref: 'ref-2', observed_revision: null }
  });
  assert.equal(lateAfterContextChange, changedContext);
});

test('app-state selectors: selectSelectedRow finds remote page entry', () => {
  const state = {
    ...INITIAL_STATE,
    selectedConsultationId: 'c-remote-2',
    historyPageEntries: [
      { consultation_id: 'c-remote-1', status: 'started' },
      { consultation_id: 'c-remote-2', status: 'ADVICE_READY' }
    ]
  };
  const found = selectSelectedRow(state);
  assert.ok(found);
  assert.equal(found.consultation_id, 'c-remote-2');
});

test('app-state: inventory threaded from HISTORY_REFRESH_COMMIT and HISTORY_SUMMARY_COMMIT', () => {
  const inventoryFixture = {
    total_projects: 2,
    unfiltered_total_records: 5,
    entries: [
      { project_id: 'a'.repeat(64), label: 'Project Alpha', count: 3 },
      { project_id: 'b'.repeat(64), label: null, count: 2 }
    ]
  };

  const refreshed = appReducer(INITIAL_STATE, {
    type: 'HISTORY_REFRESH_COMMIT',
    generation: 0,
    result: {
      state: 'fresh',
      snapshot_id: 'snap-1',
      observed_at: Date.now(),
      scan: { status: 'complete', accepted_records: 5, invalid_records: 0 },
      stale_reason: null,
      inventory: inventoryFixture
    }
  });
  assert.deepEqual(refreshed.inventory, inventoryFixture);

  const updatedInventory = {
    total_projects: 2,
    unfiltered_total_records: 5,
    entries: [
      { project_id: 'a'.repeat(64), label: 'Project Alpha Updated', count: 3 },
      { project_id: 'b'.repeat(64), label: null, count: 2 }
    ]
  };

  const summarized = appReducer(refreshed, {
    type: 'HISTORY_SUMMARY_COMMIT',
    generation: 0,
    summary: {
      state: 'fresh',
      snapshot_id: 'snap-1',
      metrics: {
        metric_definition_version: 1,
        scan: { status: 'complete', accepted_records: 5, invalid_records: 0 },
        counts: { projects: 2, tasks: 2, consultations: 5, terminal_statuses: {}, outcome_results: {} },
        metrics: { delivery: {}, outcome_coverage: {}, known_outcome_resolution: {}, resolution: {}, backup_use: {}, retry_use: {}, latency: {} },
        missingness: {},
        completeness: {},
        limitations: [],
        scope: { kind: 'history-root', project_ids: ['a'.repeat(64), 'b'.repeat(64)], selected_project_id: null },
        filters: {}
      },
      inventory: updatedInventory
    }
  });
  assert.deepEqual(summarized.inventory, updatedInventory);
});

test('app-state: SET_FILTERS project_id change resets selected consultation, detail, and cached rows', () => {
  const activeState = {
    ...INITIAL_STATE,
    filters: { ...INITIAL_STATE.filters, project_id: 'a'.repeat(64) },
    selectedConsultationId: 'c-alpha-1',
    historyDetail: {
      status: 'ready',
      recordRef: 'ref-1',
      consultationId: 'c-alpha-1',
      detailRevision: '1',
      execution: { consultation_id: 'c-alpha-1', project_id: 'a'.repeat(64) },
      outcome: null,
      observedRevision: null,
      error: null
    },
    historyPageCursor: 'cursor-1',
    historyPageEntries: [{ consultation_id: 'c-alpha-1', project_id: 'a'.repeat(64) }],
    historyPage: { entries: [{ consultation_id: 'c-alpha-1', project_id: 'a'.repeat(64) }], next_cursor: 'cursor-next' }
  };

  // Switching project to Project B clears detail, selection, cursor, and cached rows
  const switchedToB = appReducer(activeState, {
    type: 'SET_FILTERS',
    filters: { project_id: 'b'.repeat(64) }
  });
  assert.equal(switchedToB.filters.project_id, 'b'.repeat(64));
  assert.equal(switchedToB.selectedConsultationId, null);
  assert.deepEqual(switchedToB.historyDetail, INITIAL_DETAIL_STATE);
  assert.equal(switchedToB.historyPageCursor, null);
  assert.equal(switchedToB.historyPage, null);
  assert.equal(switchedToB.historyPageEntries.length, 0);

  // Switching back to All Projects (null) also resets selection and cached rows
  const activeB = {
    ...switchedToB,
    selectedConsultationId: 'c-beta-1',
    historyDetail: { status: 'ready', consultationId: 'c-beta-1', recordRef: 'ref-b' },
    historyPageEntries: [{ consultation_id: 'c-beta-1', project_id: 'b'.repeat(64) }]
  };
  const switchedToAll = appReducer(activeB, {
    type: 'SET_FILTERS',
    filters: { project_id: null }
  });
  assert.equal(switchedToAll.filters.project_id, null);
  assert.equal(switchedToAll.selectedConsultationId, null);
  assert.deepEqual(switchedToAll.historyDetail, INITIAL_DETAIL_STATE);
  assert.equal(switchedToAll.historyPageEntries.length, 0);

  // Non-project filter change (e.g. status) does NOT clear selection or detail
  const retainedDetail = appReducer(activeState, {
    type: 'SET_FILTERS',
    filters: { statuses: ['ADVICE_READY'] }
  });
  assert.equal(retainedDetail.selectedConsultationId, 'c-alpha-1');
  assert.equal(retainedDetail.historyDetail.status, 'ready');
  assert.equal(retainedDetail.historyPageCursor, null); // cursor still resets
});

test('app-state selectors: extractDomainQuery preserves project_id and task_run_id', () => {
  const filters = {
    ...INITIAL_STATE.filters,
    project_id: 'a'.repeat(64),
    task_run_id: '00000000-0000-4000-8000-000000000001',
    statuses: ['ADVICE_READY']
  };
  const query = extractDomainQuery(filters);
  assert.equal(query.project_id, 'a'.repeat(64));
  assert.equal(query.task_run_id, '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(query.filters.statuses, ['ADVICE_READY']);
});

test('app-state selectors: formatProjectName handles labels and truncated ID fallbacks', () => {
  const longId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  assert.equal(formatProjectName(longId, 'My Cool Project'), 'My Cool Project');
  assert.equal(formatProjectName(longId, null), '12345678…');
  assert.equal(formatProjectName(longId, ''), '12345678…');
  assert.equal(formatProjectName(longId, '   '), '12345678…');
  assert.equal(formatProjectName('short', null), 'short');
});

test('app-state selectors: selectFilteredRecords respects project_id filter in snapshot mode', () => {
  const state = {
    ...INITIAL_STATE,
    filters: { ...INITIAL_STATE.filters, project_id: 'a'.repeat(64) },
    snapshot: {
      generation: 1,
      records: [
        { consultation_id: 'c-1', project_id: 'a'.repeat(64), status: 'ADVICE_READY', outcome_state: 'valid' },
        { consultation_id: 'c-2', project_id: 'b'.repeat(64), status: 'ADVICE_READY', outcome_state: 'valid' }
      ]
    }
  };
  const filtered = selectFilteredRecords(state);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].consultation_id, 'c-1');
});
