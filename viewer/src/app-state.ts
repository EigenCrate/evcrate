import type { HistorySnapshot } from './io/history-reader.js';
import type { PolicyReaderResult } from './io/policy-reader.js';
import type { EvaluationReaderResult } from './io/evaluation-reader.js';
import type {
  HistoryMetricScanV1,
  HistoryMetricFiltersV1,
  NormalizedHistoryRecordV1
} from '../../src/protocol/advisor-metrics.js';
import type { HashView } from './hash-view.js';

export type ViewerStatus = 'idle' | 'selecting' | 'scanning' | 'fresh' | 'stale' | 'unsupported';

export interface UiHistoryFilters extends HistoryMetricFiltersV1 {
  readonly project_id: string | null;
  readonly task_run_id: string | null;
}

export interface AppState {
  readonly status: ViewerStatus;
  readonly activeView: HashView;
  readonly generation: number;
  readonly snapshot: HistorySnapshot | null;
  readonly scan: HistoryMetricScanV1 | null;
  readonly staleReason: string | null;
  readonly unsupportedReason: string | null;
  readonly historySourceLabel: string | null;
  readonly policyResult: PolicyReaderResult | null;
  readonly evaluationResults: readonly EvaluationReaderResult[];
  readonly filters: UiHistoryFilters;
  readonly selectedConsultationId: string | null;
  readonly revealCandidates: boolean;
}

export type AppAction =
  | { type: 'CAPABILITY_UNSUPPORTED'; reason: string }
  | { type: 'SELECT_START' }
  | { type: 'SCAN_START'; generation: number; label: string }
  | { type: 'SCAN_PROGRESS'; generation: number }
  | { type: 'SCAN_COMMIT'; generation: number; commit: 'replace' | 'retain-stale'; snapshot?: HistorySnapshot; scan: HistoryMetricScanV1 }
  | { type: 'SCAN_STALE'; generation: number; reason: string }
  | { type: 'SCAN_CANCEL'; generation: number }
  | { type: 'SET_FILTERS'; filters: Partial<UiHistoryFilters> }
  | { type: 'SET_VIEW'; view: HashView }
  | { type: 'SELECT_CONSULTATION'; consultationId: string | null }
  | { type: 'SET_POLICY'; result: PolicyReaderResult }
  | { type: 'SET_EVALUATIONS'; results: readonly EvaluationReaderResult[] }
  | { type: 'REVEAL_CANDIDATES'; reveal: boolean };

export const INITIAL_FILTERS: UiHistoryFilters = Object.freeze({
  project_id: null,
  task_run_id: null,
  statuses: null,
  outcome_states: null,
  outcome_results: null,
  backends: null,
  models: null,
  efforts: null,
  prompt_identities: null,
  build_identities: null,
  started_at_from: null,
  started_at_to: null
});

export const INITIAL_STATE: AppState = Object.freeze({
  status: 'idle',
  activeView: 'overview',
  generation: 0,
  snapshot: null,
  scan: null,
  staleReason: null,
  unsupportedReason: null,
  historySourceLabel: null,
  policyResult: null,
  evaluationResults: Object.freeze([]),
  filters: INITIAL_FILTERS,
  selectedConsultationId: null,
  revealCandidates: false
});

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
    case 'SCAN_STALE': {
      if (action.generation !== state.generation) return state;
      return { ...state, status: state.snapshot ? 'stale' : 'idle', staleReason: action.reason };
    }
    case 'SCAN_CANCEL': {
      if (action.generation !== state.generation) return state;
      return { ...state, status: state.snapshot ? 'stale' : 'idle', staleReason: 'Scan cancelled by user' };
    }
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.filters } };
    case 'SET_VIEW':
      return { ...state, activeView: action.view };
    case 'SELECT_CONSULTATION':
      return { ...state, selectedConsultationId: action.consultationId };
    case 'SET_POLICY':
      return { ...state, policyResult: action.result };
    case 'SET_EVALUATIONS':
      return { ...state, evaluationResults: action.results };
    case 'REVEAL_CANDIDATES':
      return { ...state, revealCandidates: action.reveal };
    default:
      return state;
  }
}

export function selectFilteredRecords(state: AppState): readonly NormalizedHistoryRecordV1[] {
  if (!state.snapshot) return [];
  const { records } = state.snapshot;
  const { filters } = state;
  return records.filter((r) => {
    if (filters.project_id && r.project_id !== filters.project_id) return false;
    if (filters.task_run_id && r.task_run_id !== filters.task_run_id) return false;
    if (filters.statuses && !filters.statuses.includes(r.status)) return false;
    if (filters.outcome_states && !filters.outcome_states.includes(r.outcome_state)) return false;
    if (filters.outcome_results && (!r.outcome_result || !filters.outcome_results.includes(r.outcome_result))) return false;
    if (filters.backends && !filters.backends.includes(r.route.backend)) return false;
    if (filters.models && !filters.models.includes(r.route.model)) return false;
    if (filters.efforts && !filters.efforts.includes(r.route.effort)) return false;
    if (filters.prompt_identities && !filters.prompt_identities.includes(r.prompt_identity)) return false;
    if (filters.build_identities && !filters.build_identities.includes(r.build_identity)) return false;
    if (filters.started_at_from !== null && r.started_at < filters.started_at_from) return false;
    if (filters.started_at_to !== null && r.started_at > filters.started_at_to) return false;
    return true;
  });
}

export function selectSelectedRecord(state: AppState): NormalizedHistoryRecordV1 | null {
  if (!state.snapshot || !state.selectedConsultationId) return null;
  return state.snapshot.records.find((r) => r.consultation_id === state.selectedConsultationId) ?? null;
}

export function formatRatioPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Unavailable';
  return `${(value * 100).toFixed(1)}%`;
}
