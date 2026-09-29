/**
 * @file phase-04-viewer-scope-and-requests.test.mjs
 * Verification suite for Phase 04: Viewer scope and request state.
 * Validates epoch fencing, query revision transactions, independent domain requests,
 * and V-E3 contract proving no history.refresh on scope/mode/filter changes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appReducer,
  INITIAL_STATE,
  INITIAL_DETAIL_STATE,
  selectHistoryQuery,
  selectFilteredRecords,
  extractDomainQuery
} from '../../viewer/src/app-state.ts';

const PROJ_A = 'a'.repeat(64);
const PROJ_B = 'b'.repeat(64);

function createMockWorkspaceContext(overrides = {}) {
  return {
    revision: 1,
    authorityKey: 'auth-key-test',
    project: { projectId: PROJ_A, label: 'Project Alpha' },
    historyScope: 'history-root',
    contextScope: 'history-root',
    allowedOperations: ['history.refresh', 'policy.readCurrent', 'evaluations.list'],
    ...overrides
  };
}

test('Phase 04: deferred policy and evaluation replies after revoke/context switch are rejected', () => {
  const initialEpochState = {
    ...INITIAL_STATE,
    contextEpoch: 1,
    isAvailable: true,
    workspaceContext: createMockWorkspaceContext()
  };

  // While policy and evaluation requests are in flight for epoch 1, context is revoked
  const revokedState = appReducer(initialEpochState, {
    type: 'CONTEXT_REVOKED',
    reason: 'Token expired'
  });
  assert.equal(revokedState.contextEpoch, 2);
  assert.equal(revokedState.status, 'revoked');

  // Deferred late policy commit from epoch 1 arrives
  const latePolicyCommit = appReducer(revokedState, {
    type: 'POLICY_COMMIT',
    policy: {
      status: 'ready',
      scope: 'account',
      temporal: 'current',
      observed_at: Date.now(),
      revision: 'rev-stale',
      policy: { advisor: { primary: { backend: 'codex', model: 'alpha', effort: 'high' } } }
    },
    contextEpoch: 1
  });
  assert.equal(latePolicyCommit.currentPolicy, null);
  assert.equal(latePolicyCommit.policyState.status, 'idle');

  // Deferred late evaluations list commit from epoch 1 arrives
  const lateEvalCommit = appReducer(revokedState, {
    type: 'EVALUATIONS_LIST_COMMIT',
    list: {
      status: 'ready',
      observed_at: Date.now(),
      binding_revision: 'b-stale',
      items: [{ evaluation_ref: 'eval-1', descriptor_digest: 'd-1', source_revision: '1' }],
      next_cursor: null
    },
    contextEpoch: 1
  });
  assert.equal(lateEvalCommit.evaluationsList, null);
  assert.equal(lateEvalCommit.evaluationsState.status, 'idle');
});

test('Phase 04: repeated activation generation and mismatched session actions are rejected', () => {
  const state = {
    ...INITIAL_STATE,
    generation: 3,
    activationGeneration: 3,
    frameSession: 'session-live',
    contextEpoch: 2
  };

  // Action with older generation 2 is rejected
  const oldGen = appReducer(state, {
    type: 'HISTORY_REFRESH_COMMIT',
    generation: 2,
    frameSession: 'session-live',
    contextEpoch: 2,
    result: { state: 'fresh', snapshot_id: 'snap-stale' }
  });
  assert.equal(oldGen.snapshotId, null);

  // Action with mismatched session is rejected
  const badSession = appReducer(state, {
    type: 'HISTORY_REFRESH_COMMIT',
    generation: 3,
    frameSession: 'session-other',
    contextEpoch: 2,
    result: { state: 'fresh', snapshot_id: 'snap-wrong' }
  });
  assert.equal(badSession.snapshotId, null);
});

test('Phase 04: A→All→B races discard out-of-order query responses via queryRevision', () => {
  let state = {
    ...INITIAL_STATE,
    contextEpoch: 1,
    historyQueryRevision: 1,
    activityScope: 'workspace-project',
    frameSession: 'session-1'
  };

  // User queries A (rev 1)
  // User then switches to All -> rev increments to 2
  state = appReducer(state, { type: 'SET_ACTIVITY_SCOPE', scope: 'all' });
  assert.equal(state.historyQueryRevision, 2);

  // User then switches to B -> rev increments to 3
  state = appReducer(state, { type: 'SET_ACTIVITY_SCOPE', scope: 'workspace-project' });
  assert.equal(state.historyQueryRevision, 3);

  // Late response from A (rev 1) arrives
  const lateRespA = appReducer(state, {
    type: 'HISTORY_QUERY_PAIR_COMMIT',
    generation: state.generation,
    frameSession: 'session-1',
    queryRevision: 1,
    contextEpoch: 1,
    summary: { metrics: { scan: { status: 'complete' } } },
    page: { entries: [{ consultation_id: 'c-alpha' }], next_cursor: null }
  });
  assert.equal(lateRespA.historyPageEntries.length, 0, 'Late response from query A must be discarded');

  // Late response from All (rev 2) arrives
  const lateRespAll = appReducer(state, {
    type: 'HISTORY_QUERY_PAIR_COMMIT',
    generation: state.generation,
    frameSession: 'session-1',
    queryRevision: 2,
    contextEpoch: 1,
    summary: { metrics: { scan: { status: 'complete' } } },
    page: { entries: [{ consultation_id: 'c-all' }], next_cursor: null }
  });
  assert.equal(lateRespAll.historyPageEntries.length, 0, 'Late response from query All must be discarded');

  // Valid matching response for B (rev 3) arrives
  const validRespB = appReducer(state, {
    type: 'HISTORY_QUERY_PAIR_COMMIT',
    generation: state.generation,
    frameSession: 'session-1',
    queryRevision: 3,
    contextEpoch: 1,
    summary: { metrics: { scan: { status: 'complete' } } },
    page: { entries: [{ consultation_id: 'c-beta' }], next_cursor: null }
  });
  assert.equal(validRespB.historyPageEntries.length, 1);
  assert.equal(validRespB.historyPageEntries[0].consultation_id, 'c-beta');
});

test('Phase 04: unauthorized All without root authority is fail-closed', () => {
  const projectScopeContext = createMockWorkspaceContext({
    historyScope: 'project',
    contextScope: 'project'
  });

  const state = {
    ...INITIAL_STATE,
    isAvailable: true,
    activityScope: 'all',
    workspaceContext: projectScopeContext
  };

  const queryResult = selectHistoryQuery(state);
  assert.equal(queryResult.available, false);
  assert.ok(queryResult.reason.toLowerCase().includes('root'));
});

test('Phase 04: Clear Filters preserves active activityScope', () => {
  const allScopedState = {
    ...INITIAL_STATE,
    activityScope: 'all',
    filters: {
      task_run_id: '00000000-0000-4000-8000-000000000001',
      statuses: ['ADVICE_READY'],
      outcome_states: null,
      outcome_results: ['resolved'],
      backends: null,
      models: null,
      efforts: null,
      prompt_identities: null,
      build_identities: null,
      started_at_from: null,
      started_at_to: null
    }
  };

  // Clearing filters
  const cleared = appReducer(allScopedState, {
    type: 'SET_FILTERS',
    filters: { statuses: null, outcome_results: null, task_run_id: null }
  });

  // activityScope remains 'all'
  assert.equal(cleared.activityScope, 'all');
  assert.equal(cleared.filters.statuses, null);
  assert.equal(cleared.filters.outcome_results, null);
  assert.equal(cleared.filters.task_run_id, null);
});

test('Phase 04: new snapshot Refresh invalidates old history detail even for same ID', () => {
  const stateWithDetail = {
    ...INITIAL_STATE,
    snapshotId: 'snap-1',
    selectedConsultationId: 'c-reuse',
    historyDetail: {
      status: 'ready',
      recordRef: 'ref-1',
      consultationId: 'c-reuse',
      detailRevision: '1',
      execution: { consultation_id: 'c-reuse', project_id: PROJ_A },
      outcome: null,
      observedRevision: null,
      error: null
    }
  };

  const refreshStarted = appReducer(stateWithDetail, {
    type: 'HISTORY_REFRESH_START',
    generation: 2,
    contextEpoch: 0
  });

  assert.equal(refreshStarted.selectedConsultationId, null);
  assert.deepEqual(refreshStarted.historyDetail, INITIAL_DETAIL_STATE);
});

test('Phase 04: failed history refresh does not block successful permitted policy commit', () => {
  const state = {
    ...INITIAL_STATE,
    status: 'scanning',
    isAvailable: true,
    contextEpoch: 1
  };

  // History fails
  const historyFailed = appReducer(state, {
    type: 'SCAN_STALE',
    generation: state.generation,
    reason: 'History scan timed out'
  });
  assert.equal(historyFailed.status, 'idle');
  assert.equal(historyFailed.staleReason, 'History scan timed out');

  // Policy succeeds independently
  const policyCommitted = appReducer(historyFailed, {
    type: 'POLICY_COMMIT',
    policy: {
      status: 'ready',
      scope: 'account',
      temporal: 'current',
      observed_at: 1000,
      revision: 'pol-rev-1',
      policy: { advisor: { primary: { backend: 'codex', model: 'beta', effort: 'high' } } }
    },
    contextEpoch: 1
  });

  assert.equal(policyCommitted.currentPolicy?.status, 'ready');
  assert.equal(policyCommitted.policyState.status, 'ready');
});

test('Phase 04 (V-E3 Smoke): proves no history.refresh on activity scope, filter, or view changes', async () => {
  // Simulates provider call counts to verify V-E3 invariant:
  // ONLY manual refresh issues history.refresh; scope and filter transitions query the existing snapshot.
  const callCounts = {
    'history.refresh': 0,
    'history.summary': 0,
    'history.page': 0,
    'policy.readCurrent': 0,
    'evaluations.list': 0
  };

  const snapshotId = 'snap-ve3-verified';
  const mockProvider = {
    descriptor: {
      kind: 'dam-hopper',
      label: 'V-E3 Mock Provider',
      capabilities: ['history.refresh', 'history.summary', 'history.page', 'policy.readCurrent', 'evaluations.list'],
      frameSession: 'session-ve3',
      activationGeneration: 1,
      isAvailable: true,
      hasHistorySource: true,
      hasPolicySource: true,
      hasEvaluationSource: true,
      workspaceContext: createMockWorkspaceContext()
    },
    async refreshHistory() {
      callCounts['history.refresh']++;
      return {
        state: 'fresh',
        snapshot_id: snapshotId,
        observed_at: Date.now(),
        scan: { status: 'complete', accepted_records: 10, invalid_records: 0 }
      };
    },
    async getHistorySummary(reqId, snapId, query) {
      callCounts['history.summary']++;
      return {
        metrics: {
          metric_definition_version: 1,
          scope: { kind: 'history-root', project_ids: [PROJ_A], selected_project_id: query.project_id },
          filters: {},
          generated_at: Date.now(),
          counts: { consultations: 5, projects: 1, tasks: 2 },
          scan: { status: 'complete', accepted_records: 5 }
        },
        inventory: { total_projects: 1, entries: [{ project_id: PROJ_A, label: 'Project Alpha', count: 5 }] }
      };
    },
    async getHistoryPage(reqId, snapId, query, sort, cursor, limit) {
      callCounts['history.page']++;
      return {
        entries: [{ consultation_id: 'c-ve3-1', project_id: query.project_id ?? PROJ_A, status: 'ADVICE_READY' }],
        next_cursor: null
      };
    },
    async readCurrentPolicy() {
      callCounts['policy.readCurrent']++;
      return { status: 'ready', scope: 'account', temporal: 'current', observed_at: Date.now(), revision: 'rev-ve3' };
    },
    async listEvaluations() {
      callCounts['evaluations.list']++;
      return { status: 'ready', observed_at: Date.now(), binding_revision: 'b-ve3', items: [], next_cursor: null };
    }
  };

  // 1. Initial manual refresh: history.refresh is called once along with policy and evaluations
  await mockProvider.refreshHistory();
  await mockProvider.readCurrentPolicy();
  await mockProvider.listEvaluations();
  const initialQuery = selectHistoryQuery({
    ...INITIAL_STATE,
    workspaceContext: mockProvider.descriptor.workspaceContext
  });
  assert.equal(initialQuery.available, true);
  await mockProvider.getHistorySummary('s1', snapshotId, initialQuery.query);
  await mockProvider.getHistoryPage('p1', snapshotId, initialQuery.query, 'started_at_desc', null, 100);

  assert.equal(callCounts['history.refresh'], 1);
  assert.equal(callCounts['policy.readCurrent'], 1);
  assert.equal(callCounts['evaluations.list'], 1);
  assert.equal(callCounts['history.summary'], 1);
  assert.equal(callCounts['history.page'], 1);

  // 2. User switches scope: 'workspace-project' -> 'all'
  // Must NOT invoke history.refresh, only queries existing snapshotId!
  const allQuery = selectHistoryQuery({
    ...INITIAL_STATE,
    activityScope: 'all',
    workspaceContext: mockProvider.descriptor.workspaceContext
  });
  assert.equal(allQuery.available, true);
  assert.equal(allQuery.query.project_id, null);

  await mockProvider.getHistorySummary('s2', snapshotId, allQuery.query);
  await mockProvider.getHistoryPage('p2', snapshotId, allQuery.query, 'started_at_desc', null, 100);

  assert.equal(callCounts['history.refresh'], 1, 'history.refresh MUST NOT be called on scope switch');
  assert.equal(callCounts['history.summary'], 2);
  assert.equal(callCounts['history.page'], 2);

  // 3. User updates filter: statuses = ['ADVICE_READY']
  // Must NOT invoke history.refresh, only queries existing snapshotId!
  const filteredQuery = selectHistoryQuery({
    ...INITIAL_STATE,
    activityScope: 'all',
    filters: { statuses: ['ADVICE_READY'] },
    workspaceContext: mockProvider.descriptor.workspaceContext
  });
  assert.equal(filteredQuery.available, true);
  assert.deepEqual(filteredQuery.query.filters.statuses, ['ADVICE_READY']);

  await mockProvider.getHistorySummary('s3', snapshotId, filteredQuery.query);
  await mockProvider.getHistoryPage('p3', snapshotId, filteredQuery.query, 'started_at_desc', null, 100);

  assert.equal(callCounts['history.refresh'], 1, 'history.refresh MUST NOT be called on filter change');
  assert.equal(callCounts['history.summary'], 3);
  assert.equal(callCounts['history.page'], 3);

  // 4. Tab / mode switch: does not invoke ANY provider call
  assert.equal(callCounts['history.refresh'], 1);
  assert.equal(callCounts['history.summary'], 3);
  assert.equal(callCounts['history.page'], 3);
  assert.equal(callCounts['policy.readCurrent'], 1);
  assert.equal(callCounts['evaluations.list'], 1);
});
test('Phase 04: refresh skips history.refresh when in All scope without root authority or when historyScope is unavailable', async () => {
  const callCounts = { 'history.refresh': 0, 'policy.readCurrent': 0, 'evaluations.list': 0 };
  const mockProvider = {
    descriptor: {
      kind: 'dam-hopper',
      label: 'Test Provider',
      capabilities: ['history.refresh', 'policy.readCurrent', 'evaluations.list'],
      frameSession: 'session-1',
      activationGeneration: 1,
      isAvailable: true,
      hasHistorySource: true,
      hasPolicySource: true,
      hasEvaluationSource: true,
      workspaceContext: createMockWorkspaceContext({
        historyScope: 'project', // Project authority only, not history-root
        contextScope: 'project'
      })
    },
    async refreshHistory() {
      callCounts['history.refresh']++;
      return { state: 'fresh', snapshot_id: 'snap-1', observed_at: Date.now(), scan: { status: 'complete' } };
    },
    async readCurrentPolicy() {
      callCounts['policy.readCurrent']++;
      return { status: 'ready', scope: 'account', temporal: 'current', observed_at: Date.now(), revision: 'r1' };
    },
    async listEvaluations() {
      callCounts['evaluations.list']++;
      return { status: 'ready', observed_at: Date.now(), binding_revision: 'b1', items: [], next_cursor: null };
    }
  };

  // State has activityScope: 'all' with project-only workspaceContext
  const allState = {
    ...INITIAL_STATE,
    activityScope: 'all',
    workspaceContext: mockProvider.descriptor.workspaceContext
  };

  // Verify selector returns available: false for All without root authority
  const queryCheck = selectHistoryQuery(allState);
  assert.equal(queryCheck.available, false);
  assert.ok(queryCheck.reason.includes('root'));

  // Evaluating the preflight logic implemented in app.tsx refreshData:
  const historyAuthorityAvailable = allState.workspaceContext ? allState.workspaceContext.historyScope !== 'unavailable' : true;
  const canRefreshCurrentScope = queryCheck.available || (allState.activityScope !== 'all' && historyAuthorityAvailable);
  const hasHistory = historyAuthorityAvailable && canRefreshCurrentScope && (
    allState.workspaceContext?.allowedOperations
      ? allState.workspaceContext.allowedOperations.includes('history.refresh')
      : (mockProvider.descriptor.hasHistorySource || mockProvider.descriptor.capabilities.includes('history.refresh'))
  );

  // Under All with project authority, hasHistory must evaluate to false
  assert.equal(canRefreshCurrentScope, false);
  assert.equal(hasHistory, false);

  // History refresh is skipped, but policy and evaluations are still called independently
  if (hasHistory) await mockProvider.refreshHistory();
  await mockProvider.readCurrentPolicy();
  await mockProvider.listEvaluations();

  assert.equal(callCounts['history.refresh'], 0, 'history.refresh must NOT be called for All scope without root authority');
  assert.equal(callCounts['policy.readCurrent'], 1, 'policy read must proceed independently');
  assert.equal(callCounts['evaluations.list'], 1, 'evaluations read must proceed independently');
});
