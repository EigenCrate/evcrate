/**
 * @file ui-state.test.mjs
 * State machine and selector tests for provider-neutral Advisor UI (Phase E03).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appReducer,
  INITIAL_STATE,
  selectFilteredRecords,
  selectSelectedRow
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
