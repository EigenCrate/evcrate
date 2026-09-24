import type { AppState } from './app-state-types.ts';
import type { AppAction } from './app-actions.ts';
import { INITIAL_DETAIL_STATE, INITIAL_EVALUATION_DETAIL_STATE } from './app-state-types.ts';

function matchesGen(state: AppState, gen?: number, session?: string | null): boolean {
  if (gen !== undefined && gen !== state.generation && gen !== state.activationGeneration) return false;
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
    case 'SET_FILTERS': {
      const projectChanged = action.filters.project_id !== undefined && action.filters.project_id !== state.filters.project_id;
      return {
        ...state,
        filters: { ...state.filters, ...action.filters },
        historyPageCursor: null,
        ...(projectChanged ? {
          selectedConsultationId: null,
          historyDetail: INITIAL_DETAIL_STATE,
          historyPageEntries: Object.freeze([]),
          historyPage: null
        } : {})
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
        ...state, providerKind: action.providerKind, historySourceLabel: action.label, capabilities: action.capabilities,
        frameSession: action.frameSession, activationGeneration: action.activationGeneration, generation: action.activationGeneration,
        isAvailable: true, staleReason: null, unsupportedReason: null
      };
    case 'CONTEXT_CHANGED':
      return {
        ...state, historySourceLabel: action.label, capabilities: action.capabilities, frameSession: action.frameSession,
        activationGeneration: action.activationGeneration, generation: action.activationGeneration, isAvailable: true,
        status: 'idle', snapshot: null, snapshotId: null, scan: null, staleReason: null, unsupportedReason: null, selectedConsultationId: null,
        historySummary: null, historyPage: null, historyPageCursor: null, historyPageEntries: Object.freeze([]),
        historyDetail: INITIAL_DETAIL_STATE, currentPolicy: null, evaluationsList: null, selectedEvaluation: INITIAL_EVALUATION_DETAIL_STATE, evaluationsComparison: null,
        inventory: null
      };
    case 'CONTEXT_REVOKED':
      return {
        ...state, status: 'revoked', staleReason: action.reason, snapshot: null, snapshotId: null, selectedConsultationId: null,
        historySummary: null, historyPage: null, historyPageCursor: null, historyPageEntries: Object.freeze([]),
        historyDetail: INITIAL_DETAIL_STATE, currentPolicy: null, evaluationsList: null, selectedEvaluation: INITIAL_EVALUATION_DETAIL_STATE, evaluationsComparison: null,
        inventory: null
      };
    case 'AVAILABILITY_CHANGED':
      return { ...state, isAvailable: action.available, capabilities: action.capabilities };
    case 'HISTORY_REFRESH_START':
      return { ...state, status: 'scanning', generation: action.generation, staleReason: null };
    case 'HISTORY_REFRESH_COMMIT': {
      if (!matchesGen(state, action.generation, action.frameSession)) return state;
      const res = action.result;
      const snapshot = action.snapshot ?? state.snapshot;
      const inventory = ('inventory' in res && res.inventory) ? res.inventory : state.inventory;
      if (res.state === 'fresh') return { ...state, status: 'fresh', snapshot, snapshotId: res.snapshot_id, scan: res.scan, inventory, staleReason: null };
      if (res.state === 'stale') {
        const hasPrior = snapshot !== null || state.snapshotId !== null;
        return {
          ...state, status: hasPrior ? 'stale' : 'idle', snapshot, snapshotId: res.snapshot_id ?? state.snapshotId,
          scan: res.scan, inventory, staleReason: res.stale_reason ? `Stale: ${res.stale_reason}` : 'Scan incomplete; retained prior data'
        };
      }
      return { ...state, status: 'idle', snapshot: null, snapshotId: null, scan: res.scan, inventory: null, staleReason: 'History source unavailable' };
    }
    case 'HISTORY_SUMMARY_COMMIT': {
      if (!matchesGen(state, action.generation, action.frameSession)) return state;
      const inv = ('inventory' in action.summary && action.summary.inventory) ? action.summary.inventory : state.inventory;
      return { ...state, historySummary: action.summary, scan: action.summary.metrics.scan, inventory: inv };
    }
    case 'HISTORY_PAGE_COMMIT':
      if (!matchesGen(state, action.generation, action.frameSession)) return state;
      return { ...state, historyPage: action.page, historyPageCursor: action.page.next_cursor, historyPageEntries: action.page.entries };
    case 'HISTORY_DETAIL_START':
      return { ...state, historyDetail: { ...INITIAL_DETAIL_STATE, status: 'loading', recordRef: action.recordRef, consultationId: action.consultationId } };
    case 'HISTORY_DETAIL_COMMIT': {
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
    case 'HISTORY_DETAIL_ERROR':
      if (action.consultationId === null || state.historyDetail.consultationId !== action.consultationId) return state;
      return { ...state, historyDetail: { ...INITIAL_DETAIL_STATE, status: 'error', recordRef: action.recordRef, consultationId: action.consultationId, error: action.error } };
    case 'POLICY_COMMIT':
      return { ...state, currentPolicy: action.policy };
    case 'EVALUATIONS_LIST_COMMIT':
      return { ...state, evaluationsList: action.list };
    case 'EVALUATION_READ_START':
      return { ...state, selectedEvaluation: { ...INITIAL_EVALUATION_DETAIL_STATE, status: 'loading', evaluationRef: action.evaluationRef } };
    case 'EVALUATION_READ_COMMIT': {
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
    case 'EVALUATIONS_COMPARE_COMMIT':
      return { ...state, evaluationsComparison: action.comparison };
    default:
      return state;
  }
}
