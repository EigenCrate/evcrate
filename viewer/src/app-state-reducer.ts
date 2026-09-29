import type { AppState, BoundSourceStatus } from './app-state-types.ts';
import type { AppAction } from './app-actions.ts';
import {
  INITIAL_DETAIL_STATE,
  INITIAL_EVALUATION_DETAIL_STATE,
  INITIAL_BOUND_POLICY_STATE,
  INITIAL_BOUND_EVALUATIONS_STATE,
  INITIAL_BOUND_COMPARISON_STATE
} from './app-state-types.ts';

function matchesContext(state: AppState, epoch?: number, session?: string | null): boolean {
  if (state.status === 'revoked' || state.status === 'unsupported' || !state.isAvailable) return false;
  if (epoch !== undefined && epoch !== state.contextEpoch) return false;
  if (session !== undefined && session !== null && state.frameSession !== null && session !== state.frameSession) return false;
  return true;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'CAPABILITY_UNSUPPORTED':
      return { ...state, status: 'unsupported', unsupportedReason: action.reason };
    case 'SELECT_START':
      return { ...state, status: state.status === 'idle' ? 'selecting' : state.status };
    case 'SCAN_START':
      return { ...state, status: 'scanning', generation: action.generation, historySourceLabel: action.label, staleReason: null };
    case 'SCAN_PROGRESS':
      return action.generation === state.generation ? state : state;
    case 'SCAN_COMMIT': {
      if (action.generation !== state.generation) return state;
      if (action.commit === 'replace' && action.snapshot) {
        return { ...state, status: 'fresh', snapshot: action.snapshot, scan: action.scan, staleReason: null };
      }
      return { ...state, status: state.snapshot ? 'stale' : 'idle', scan: action.scan, staleReason: 'Scan incomplete; retained prior data' };
    }
    case 'SCAN_STALE':
      return action.generation === state.generation ? { ...state, status: state.snapshot ? 'stale' : 'idle', staleReason: action.reason } : state;
    case 'SCAN_CANCEL':
      return action.generation === state.generation ? { ...state, status: state.snapshot ? 'stale' : 'idle', staleReason: 'Scan cancelled by user' } : state;
    case 'SET_ACTIVITY_SCOPE': {
      if (action.scope === state.activityScope) return state;
      return {
        ...state,
        activityScope: action.scope,
        historyQueryRevision: state.historyQueryRevision + 1,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([]),
        historyPage: null,
        historySummary: null,
        selectedConsultationId: null,
        historyDetail: INITIAL_DETAIL_STATE
      };
    }
    case 'SET_WORKSPACE_CONTEXT': {
      return {
        ...state,
        workspaceContext: action.context
      };
    }
    case 'WORKSPACE_PROJECT_CHANGED': {
      const isAll = state.activityScope === 'all';
      return {
        ...state,
        workspaceContext: action.workspaceContext,
        ...(isAll ? {} : {
          historyQueryRevision: state.historyQueryRevision + 1,
          historyPageCursor: null,
          historyPageEntries: Object.freeze([]),
          historyPage: null,
          historySummary: null,
          selectedConsultationId: null,
          historyDetail: INITIAL_DETAIL_STATE
        })
      };
    }
    case 'SET_FILTERS': {
      return {
        ...state,
        filters: { ...state.filters, ...action.filters },
        historyQueryRevision: state.historyQueryRevision + 1,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([]),
        historyPage: null,
        historySummary: null,
        selectedConsultationId: null,
        historyDetail: INITIAL_DETAIL_STATE
      };
    }
    case 'SET_VIEW':
      return { ...state, activeView: action.view };
    case 'SELECT_CONSULTATION': {
      if (action.consultationId === null) return { ...state, selectedConsultationId: null, historyDetail: INITIAL_DETAIL_STATE };
      return {
        ...state,
        selectedConsultationId: action.consultationId,
        historyDetail: state.historyDetail.consultationId === action.consultationId
          ? state.historyDetail
          : { ...INITIAL_DETAIL_STATE, consultationId: action.consultationId, recordRef: action.recordRef ?? null }
      };
    }
    case 'SET_POLICY':
      return { ...state, policyResult: action.result };
    case 'SET_EVALUATIONS':
      return { ...state, evaluationResults: action.results };
    case 'REVEAL_CANDIDATES':
      return { ...state, revealCandidates: action.reveal };
    case 'PROVIDER_READY':
      return {
        ...state,
        providerKind: action.providerKind,
        historySourceLabel: action.label,
        capabilities: action.capabilities,
        frameSession: action.frameSession,
        activationGeneration: action.activationGeneration,
        generation: action.activationGeneration,
        isAvailable: true,
        staleReason: null,
        unsupportedReason: null,
        workspaceContext: action.workspaceContext !== undefined ? action.workspaceContext : state.workspaceContext
      };
    case 'CONTEXT_CHANGED': {
      const nextEpoch = state.contextEpoch + 1;
      return {
        ...state,
        historySourceLabel: action.label,
        capabilities: action.capabilities,
        frameSession: action.frameSession,
        activationGeneration: action.activationGeneration,
        generation: action.activationGeneration,
        contextEpoch: nextEpoch,
        isAvailable: true,
        status: 'idle',
        snapshot: null,
        snapshotId: null,
        scan: null,
        observedAt: null,
        staleReason: null,
        unsupportedReason: null,
        selectedConsultationId: null,
        historySummary: null,
        historyPage: null,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([]),
        historyDetail: INITIAL_DETAIL_STATE,
        policyResult: null,
        currentPolicy: null,
        policyState: INITIAL_BOUND_POLICY_STATE,
        evaluationResults: Object.freeze([]),
        evaluationsList: null,
        evaluationsState: INITIAL_BOUND_EVALUATIONS_STATE,
        selectedEvaluation: INITIAL_EVALUATION_DETAIL_STATE,
        evaluationsComparison: null,
        comparisonState: INITIAL_BOUND_COMPARISON_STATE,
        inventory: null,
        revealCandidates: false,
        workspaceContext: action.workspaceContext ?? null
      };
    }
    case 'CONTEXT_REVOKED': {
      const nextEpoch = state.contextEpoch + 1;
      return {
        ...state,
        status: 'revoked',
        staleReason: action.reason,
        contextEpoch: nextEpoch,
        snapshot: null,
        snapshotId: null,
        scan: null,
        observedAt: null,
        historySourceLabel: null,
        selectedConsultationId: null,
        historySummary: null,
        historyPage: null,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([]),
        historyDetail: INITIAL_DETAIL_STATE,
        policyResult: null,
        currentPolicy: null,
        policyState: INITIAL_BOUND_POLICY_STATE,
        evaluationResults: Object.freeze([]),
        evaluationsList: null,
        evaluationsState: INITIAL_BOUND_EVALUATIONS_STATE,
        selectedEvaluation: INITIAL_EVALUATION_DETAIL_STATE,
        evaluationsComparison: null,
        comparisonState: INITIAL_BOUND_COMPARISON_STATE,
        inventory: null,
        revealCandidates: false,
        workspaceContext: null
      };
    }
    case 'DISCONNECTED': {
      const nextEpoch = state.contextEpoch + 1;
      return {
        ...state,
        status: 'idle',
        isAvailable: false,
        staleReason: action.reason ?? 'Provider disconnected',
        contextEpoch: nextEpoch,
        snapshot: null,
        snapshotId: null,
        scan: null,
        observedAt: null,
        historySourceLabel: null,
        selectedConsultationId: null,
        historySummary: null,
        historyPage: null,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([]),
        historyDetail: INITIAL_DETAIL_STATE,
        policyResult: null,
        currentPolicy: null,
        policyState: INITIAL_BOUND_POLICY_STATE,
        evaluationResults: Object.freeze([]),
        evaluationsList: null,
        evaluationsState: INITIAL_BOUND_EVALUATIONS_STATE,
        selectedEvaluation: INITIAL_EVALUATION_DETAIL_STATE,
        evaluationsComparison: null,
        comparisonState: INITIAL_BOUND_COMPARISON_STATE,
        inventory: null,
        revealCandidates: false,
        workspaceContext: null
      };
    }
    case 'INCOMPATIBLE': {
      const nextEpoch = state.contextEpoch + 1;
      return {
        ...state,
        status: 'unsupported',
        unsupportedReason: action.reason,
        contextEpoch: nextEpoch,
        snapshot: null,
        snapshotId: null,
        scan: null,
        observedAt: null,
        historySourceLabel: null,
        selectedConsultationId: null,
        historySummary: null,
        historyPage: null,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([]),
        historyDetail: INITIAL_DETAIL_STATE,
        policyResult: null,
        currentPolicy: null,
        policyState: INITIAL_BOUND_POLICY_STATE,
        evaluationResults: Object.freeze([]),
        evaluationsList: null,
        evaluationsState: INITIAL_BOUND_EVALUATIONS_STATE,
        selectedEvaluation: INITIAL_EVALUATION_DETAIL_STATE,
        evaluationsComparison: null,
        comparisonState: INITIAL_BOUND_COMPARISON_STATE,
        inventory: null,
        revealCandidates: false,
        workspaceContext: null
      };
    }
    case 'AVAILABILITY_CHANGED':
      return { ...state, isAvailable: action.available, capabilities: action.capabilities };
    case 'HISTORY_REFRESH_START': {
      if (state.status === 'revoked' || !state.isAvailable) return state;
      return {
        ...state,
        status: 'scanning',
        generation: action.generation,
        historyQueryRevision: state.historyQueryRevision + 1,
        staleReason: null,
        selectedConsultationId: null,
        historyDetail: INITIAL_DETAIL_STATE,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([]),
        historyPage: null,
        historySummary: null
      };
    }
    case 'HISTORY_REFRESH_COMMIT': {
      if (!matchesContext(state, action.contextEpoch, action.frameSession)) return state;
      if (action.generation !== undefined && action.generation !== state.generation && action.generation !== state.activationGeneration) return state;
      const res = action.result;
      const snapshot = action.snapshot ?? state.snapshot;
      const inventory = ('inventory' in res && res.inventory) ? res.inventory : state.inventory;
      const isIncomplete = Boolean(res.scan && res.scan.status === 'incomplete');
      if (res.state === 'fresh') {
        return {
          ...state,
          status: 'fresh',
          snapshot,
          snapshotId: res.snapshot_id,
          scan: res.scan,
          inventory,
          observedAt: action.observedAt ?? res.observed_at ?? Date.now(),
          staleReason: isIncomplete ? 'Incomplete snapshot; scan bounded' : null,
          selectedConsultationId: null,
          historyDetail: INITIAL_DETAIL_STATE
        };
      }
      if (res.state === 'stale') {
        const hasPrior = snapshot !== null || state.snapshotId !== null;
        return {
          ...state,
          status: hasPrior ? 'stale' : 'idle',
          snapshot,
          snapshotId: res.snapshot_id ?? state.snapshotId,
          scan: res.scan,
          inventory,
          observedAt: state.observedAt ?? res.observed_at ?? null,
          staleReason: res.stale_reason ? `Stale: ${res.stale_reason}` : (isIncomplete ? 'Incomplete snapshot; scan interrupted' : 'Scan incomplete; retained prior data'),
          selectedConsultationId: null,
          historyDetail: INITIAL_DETAIL_STATE
        };
      }
      return {
        ...state,
        status: 'idle',
        snapshot: null,
        snapshotId: null,
        scan: res.scan,
        inventory: null,
        observedAt: null,
        staleReason: 'History source unavailable',
        selectedConsultationId: null,
        historyDetail: INITIAL_DETAIL_STATE
      };
    }
    case 'HISTORY_QUERY_PAIR_COMMIT': {
      if (!matchesContext(state, action.contextEpoch, action.frameSession)) return state;
      if (action.queryRevision !== undefined && action.queryRevision !== state.historyQueryRevision) return state;
      const inv = ('inventory' in action.summary && action.summary.inventory) ? action.summary.inventory : state.inventory;
      return {
        ...state,
        historySummary: action.summary,
        historyPage: action.page,
        historyPageCursor: action.page.next_cursor,
        historyPageEntries: action.page.entries,
        scan: action.summary.metrics.scan,
        inventory: inv
      };
    }
    case 'HISTORY_QUERY_ERROR': {
      if (!matchesContext(state, action.contextEpoch, action.frameSession)) return state;
      if (action.queryRevision !== undefined && action.queryRevision !== state.historyQueryRevision) return state;
      return {
        ...state,
        historySummary: null,
        historyPage: null,
        historyPageCursor: null,
        historyPageEntries: Object.freeze([])
      };
    }
    case 'HISTORY_SUMMARY_COMMIT': {
      if (!matchesContext(state, action.contextEpoch, action.frameSession)) return state;
      if (action.queryRevision !== undefined && action.queryRevision !== state.historyQueryRevision) return state;
      const inv = ('inventory' in action.summary && action.summary.inventory) ? action.summary.inventory : state.inventory;
      return { ...state, historySummary: action.summary, scan: action.summary.metrics.scan, inventory: inv };
    }
    case 'HISTORY_PAGE_COMMIT': {
      if (!matchesContext(state, action.contextEpoch, action.frameSession)) return state;
      if (action.queryRevision !== undefined && action.queryRevision !== state.historyQueryRevision) return state;
      return { ...state, historyPage: action.page, historyPageCursor: action.page.next_cursor, historyPageEntries: action.page.entries };
    }
    case 'HISTORY_DETAIL_START': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return { ...state, historyDetail: { ...INITIAL_DETAIL_STATE, status: 'loading', recordRef: action.recordRef, consultationId: action.consultationId } };
    }
    case 'HISTORY_DETAIL_COMMIT': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      if (action.consultationId === null || state.historyDetail.consultationId !== action.consultationId) return state;
      const res = action.result;
      if (res.status === 'ready') {
        return {
          ...state,
          historyDetail: {
            status: 'ready', recordRef: res.record_ref, consultationId: action.consultationId ?? res.execution.consultation_id,
            detailRevision: res.detail_revision, execution: res.execution, outcome: res.outcome, observedRevision: null, error: null
          }
        };
      }
      return {
        ...state,
        historyDetail: {
          status: res.status, recordRef: res.record_ref, consultationId: action.consultationId,
          detailRevision: null, execution: null, outcome: null, observedRevision: res.observed_revision, error: null
        }
      };
    }
    case 'HISTORY_DETAIL_ERROR': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      if (action.consultationId === null || state.historyDetail.consultationId !== action.consultationId) return state;
      return { ...state, historyDetail: { ...INITIAL_DETAIL_STATE, status: 'error', recordRef: action.recordRef, consultationId: action.consultationId, error: action.error } };
    }
    case 'POLICY_START': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        policyState: { status: 'loading', policy: null, error: null }
      };
    }
    case 'POLICY_COMMIT': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      const status: BoundSourceStatus = action.policy.status === 'ready' ? 'ready'
        : action.policy.status === 'not_configured' ? 'not_configured'
        : 'error';
      return {
        ...state,
        currentPolicy: action.policy,
        policyState: { status, policy: action.policy, error: null }
      };
    }
    case 'POLICY_ERROR': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        policyState: { status: action.status ?? 'error', policy: null, error: action.error }
      };
    }
    case 'EVALUATIONS_LIST_START': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        evaluationsState: { status: 'loading', list: null, error: null }
      };
    }
    case 'EVALUATIONS_LIST_COMMIT': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      const status: BoundSourceStatus = action.list.status === 'ready' ? 'ready'
        : action.list.status === 'not_configured' ? 'not_configured'
        : 'error';
      return {
        ...state,
        evaluationsList: action.list,
        evaluationsState: { status, list: action.list, error: null }
      };
    }
    case 'EVALUATIONS_LIST_ERROR': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        evaluationsState: { status: action.status ?? 'error', list: null, error: action.error }
      };
    }
    case 'EVALUATION_READ_START': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return { ...state, selectedEvaluation: { ...INITIAL_EVALUATION_DETAIL_STATE, status: 'loading', evaluationRef: action.evaluationRef } };
    }
    case 'EVALUATION_READ_COMMIT': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      const res = action.result;
      if (res.status === 'ready') {
        return {
          ...state,
          selectedEvaluation: {
            status: 'ready', evaluationRef: res.descriptor.evaluation_ref, descriptor: res.descriptor,
            document: res.document, observedRevision: null, error: null
          }
        };
      }
      return {
        ...state,
        selectedEvaluation: {
          status: res.status, evaluationRef: res.evaluation_ref, descriptor: null,
          document: null, observedRevision: res.observed_revision, error: null
        }
      };
    }
    case 'EVALUATION_READ_ERROR': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        selectedEvaluation: {
          ...INITIAL_EVALUATION_DETAIL_STATE,
          status: 'error',
          evaluationRef: action.evaluationRef,
          error: action.error
        }
      };
    }
    case 'EVALUATIONS_COMPARE_START': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        comparisonState: { status: 'loading', comparison: null, cursor: null, error: null }
      };
    }
    case 'EVALUATIONS_COMPARE_COMMIT': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        evaluationsComparison: action.comparison,
        comparisonState: { status: 'ready', comparison: action.comparison, cursor: action.cursor ?? null, error: null }
      };
    }
    case 'EVALUATIONS_COMPARE_ERROR': {
      if (!matchesContext(state, action.contextEpoch)) return state;
      return {
        ...state,
        comparisonState: { status: 'error', comparison: null, cursor: null, error: action.error }
      };
    }
    default:
      return state;
  }
}
