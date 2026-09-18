import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appReducer,
  INITIAL_STATE
} from '../../viewer/src/app-state.ts';

test('app-state: INITIAL_STATE defaults to idle and overview view', () => {
  assert.equal(INITIAL_STATE.status, 'idle');
  assert.equal(INITIAL_STATE.activeView, 'overview');
  assert.equal(INITIAL_STATE.generation, 0);
  assert.equal(INITIAL_STATE.snapshot, null);
  assert.equal(INITIAL_STATE.scan, null);
  assert.equal(INITIAL_STATE.staleReason, null);
  assert.equal(INITIAL_STATE.selectedConsultationId, null);
  assert.equal(INITIAL_STATE.revealCandidates, false);
});

test('app-state: handles CAPABILITY_UNSUPPORTED', () => {
  const next = appReducer(INITIAL_STATE, {
    type: 'CAPABILITY_UNSUPPORTED',
    reason: 'File System Access API missing'
  });
  assert.equal(next.status, 'unsupported');
  assert.equal(next.unsupportedReason, 'File System Access API missing');
});

test('app-state: handles SELECT_START and SCAN_START', () => {
  const selecting = appReducer(INITIAL_STATE, { type: 'SELECT_START' });
  assert.equal(selecting.status, 'selecting');

  const scanning = appReducer(selecting, {
    type: 'SCAN_START',
    generation: 1,
    label: 'my-history-dir'
  });
  assert.equal(scanning.status, 'scanning');
  assert.equal(scanning.generation, 1);
  assert.equal(scanning.historySourceLabel, 'my-history-dir');
});

test('app-state: SCAN_COMMIT with replace updates to fresh snapshot', () => {
  const scanning = { ...INITIAL_STATE, status: 'scanning', generation: 2 };
  const mockSnapshot = {
    generation: 2,
    rootHandle: {},
    scope: { kind: 'project', project_ids: ['p1'], selected_project_id: 'p1' },
    records: [],
    metricsResult: {},
    scannedAt: Date.now(),
    stale: false
  };
  const mockScan = {
    status: 'complete',
    projects_discovered: 1,
    tasks_discovered: 1,
    consultations_discovered: 1,
    accepted_records: 1,
    invalid_records: 0,
    bytes_discovered: 100,
    bytes_read: 100,
    diagnostics: [],
    suppressed_diagnostics: 0,
    limit_hit: false
  };

  const fresh = appReducer(scanning, {
    type: 'SCAN_COMMIT',
    generation: 2,
    commit: 'replace',
    snapshot: mockSnapshot,
    scan: mockScan
  });

  assert.equal(fresh.status, 'fresh');
  assert.equal(fresh.snapshot, mockSnapshot);
  assert.equal(fresh.scan, mockScan);
  assert.equal(fresh.staleReason, null);
});

test('app-state: SCAN_COMMIT with retain-stale retains prior snapshot and marks stale', () => {
  const priorSnapshot = {
    generation: 1,
    rootHandle: {},
    scope: { kind: 'project', project_ids: ['p1'], selected_project_id: 'p1' },
    records: [],
    metricsResult: {},
    scannedAt: 1000,
    stale: false
  };
  const stateWithPrior = {
    ...INITIAL_STATE,
    status: 'scanning',
    generation: 2,
    snapshot: priorSnapshot
  };

  const stale = appReducer(stateWithPrior, {
    type: 'SCAN_COMMIT',
    generation: 2,
    commit: 'retain-stale',
    scan: {
      status: 'incomplete',
      projects_discovered: 1,
      tasks_discovered: 0,
      consultations_discovered: 0,
      accepted_records: 0,
      invalid_records: 0,
      bytes_discovered: 0,
      bytes_read: 0,
      diagnostics: [],
      suppressed_diagnostics: 0,
      limit_hit: true
    }
  });

  assert.equal(stale.status, 'stale');
  assert.equal(stale.snapshot, priorSnapshot);
  assert.notEqual(stale.staleReason, null);
});

test('app-state: rejects stale generation actions', () => {
  const current = { ...INITIAL_STATE, status: 'scanning', generation: 5 };

  const staleCommit = appReducer(current, {
    type: 'SCAN_COMMIT',
    generation: 4,
    commit: 'replace',
    scan: { status: 'complete', diagnostics: [] }
  });
  assert.equal(staleCommit, current);

  const staleStale = appReducer(current, {
    type: 'SCAN_STALE',
    generation: 4,
    reason: 'old reason'
  });
  assert.equal(staleStale, current);

  const staleCancel = appReducer(current, {
    type: 'SCAN_CANCEL',
    generation: 4
  });
  assert.equal(staleCancel, current);
});

test('app-state: handles view, filters, selection, and reveal toggles', () => {
  let s = appReducer(INITIAL_STATE, { type: 'SET_VIEW', view: 'evaluations' });
  assert.equal(s.activeView, 'evaluations');

  s = appReducer(s, { type: 'SET_FILTERS', filters: { statuses: ['ADVICE_READY'] } });
  assert.deepEqual(s.filters.statuses, ['ADVICE_READY']);

  s = appReducer(s, { type: 'SELECT_CONSULTATION', consultationId: 'c-123' });
  assert.equal(s.selectedConsultationId, 'c-123');

  s = appReducer(s, { type: 'REVEAL_CANDIDATES', reveal: true });
  assert.equal(s.revealCandidates, true);
});
