import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_STATE,
  INITIAL_FILTERS,
  selectFilteredRecords,
  selectSelectedRecord
} from '../../viewer/src/app-state.ts';

const SAMPLE_RECORDS = [
  {
    project_id: 'proj-1',
    task_run_id: 'task-1',
    consultation_id: 'c-1',
    status: 'ADVICE_READY',
    checkpoint_digest: 'd1',
    route: { backend: 'codex', model: 'gpt-5', effort: 'high' },
    prompt_identity: 'p1',
    build_identity: 'b1',
    attempts: [],
    started_at: 1000,
    completed_at: 2000,
    receipt_elapsed_ms: 1000,
    error: null,
    outcome_state: 'valid',
    outcome_result: 'resolved',
    source: { kind: 'browser', relative_path: 'r1' }
  },
  {
    project_id: 'proj-1',
    task_run_id: 'task-2',
    consultation_id: 'c-2',
    status: 'FAILED',
    checkpoint_digest: 'd2',
    route: { backend: 'claude', model: 'claude-3', effort: 'medium' },
    prompt_identity: 'p2',
    build_identity: 'b2',
    attempts: [],
    started_at: 3000,
    completed_at: 3500,
    receipt_elapsed_ms: 500,
    error: { code: 'ERR', category: 'cat', action: 'act', message: 'msg' },
    outcome_state: 'missing',
    outcome_result: null,
    source: { kind: 'browser', relative_path: 'r2' }
  }
];

test('app-state selectors: selectFilteredRecords returns all when no filters active', () => {
  const state = { ...INITIAL_STATE, snapshot: { records: SAMPLE_RECORDS } };
  const all = selectFilteredRecords(state);
  assert.equal(all.length, 2);
});

test('app-state selectors: filters by status and outcome_result', () => {
  const state = { ...INITIAL_STATE, snapshot: { records: SAMPLE_RECORDS } };

  const ready = selectFilteredRecords({
    ...state,
    filters: { ...INITIAL_FILTERS, statuses: ['ADVICE_READY'] }
  });
  assert.equal(ready.length, 1);
  assert.equal(ready[0].consultation_id, 'c-1');

  const resolved = selectFilteredRecords({
    ...state,
    filters: { ...INITIAL_FILTERS, outcome_results: ['resolved'] }
  });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].consultation_id, 'c-1');
});

test('app-state selectors: filters by backend and model route', () => {
  const state = { ...INITIAL_STATE, snapshot: { records: SAMPLE_RECORDS } };

  const claude = selectFilteredRecords({
    ...state,
    filters: { ...INITIAL_FILTERS, backends: ['claude'] }
  });
  assert.equal(claude.length, 1);
  assert.equal(claude[0].consultation_id, 'c-2');

  const gpt5 = selectFilteredRecords({
    ...state,
    filters: { ...INITIAL_FILTERS, models: ['gpt-5'] }
  });
  assert.equal(gpt5.length, 1);
  assert.equal(gpt5[0].consultation_id, 'c-1');
});

test('app-state selectors: selectSelectedRecord finds matching consultation', () => {
  const state = {
    ...INITIAL_STATE,
    snapshot: { records: SAMPLE_RECORDS },
    selectedConsultationId: 'c-2'
  };
  const selected = selectSelectedRecord(state);
  assert.notEqual(selected, null);
  assert.equal(selected.consultation_id, 'c-2');

  const missing = selectSelectedRecord({
    ...state,
    selectedConsultationId: 'non-existent'
  });
  assert.equal(missing, null);
});
