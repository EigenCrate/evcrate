import type {
  HistoryMetricScanV1,
  HistoryMetricFiltersV1,
  HistoryMetricScopeV1,
  NormalizedHistoryRecordV1,
  HistoryMetricResultV1
} from '../../src/protocol/advisor-metrics.js';
import type {
  HistoryRowV1,
  EvaluationDescriptorV1,
  HistorySummaryResultV1,
  HistorySummaryResultV2,
  HistoryPageResultV1,
  PolicyReadCurrentResultV1,
  EvaluationsListResultV1,
  EvaluationsCompareReadyResultV1,
  HistoryExecutionV1,
  HistoryOutcomeV1,
  EvaluationDocumentV1,
  ProjectInventoryV2,
  ProjectInventoryItemV2
} from '../../src/protocol/advisor-plugin-data-api.ts';
import type { HashView } from './hash-view.js';

export interface PolicyReaderResult {
  readonly status: 'POLICY_READY' | 'POLICY_MIGRATION_REQUIRED' | 'POLICY_SELECTION_CANCELLED' | 'POLICY_READ_ERROR';
  readonly policy?: unknown;
  readonly migrationRequired?: boolean;
}

export interface EvaluationReaderResult {
  readonly status: 'EVALUATION_READY' | 'EVALUATION_SELECTION_CANCELLED' | 'EVALUATION_READ_ERROR' | 'EVALUATION_READ_FAILED';
  readonly document?: EvaluationDocumentV1;
  readonly fileName?: string;
  readonly bytes?: number;
  readonly issueCode?: string;
  readonly issuePath?: string;
  readonly error?: string;
}

export interface HistorySnapshot {
  readonly generation: number;
  readonly scope: HistoryMetricScopeV1;
  readonly records: readonly NormalizedHistoryRecordV1[];
  readonly metricsResult: HistoryMetricResultV1;
  readonly scannedAt: number;
  readonly stale: boolean;
}

export type ViewerStatus = 'idle' | 'selecting' | 'scanning' | 'fresh' | 'stale' | 'unsupported' | 'revoked';
export type DetailStatus = 'idle' | 'loading' | 'ready' | 'changed' | 'missing' | 'error';

export interface UiHistoryFilters extends HistoryMetricFiltersV1 {
  readonly project_id: string | null;
  readonly task_run_id: string | null;
}

export interface HistoryDetailState {
  readonly status: DetailStatus;
  readonly recordRef: string | null;
  readonly consultationId: string | null;
  readonly detailRevision: string | null;
  readonly execution: HistoryExecutionV1 | null;
  readonly outcome: HistoryOutcomeV1 | null;
  readonly observedRevision: string | null;
  readonly error: string | null;
}

export interface EvaluationDetailState {
  readonly status: DetailStatus;
  readonly evaluationRef: string | null;
  readonly descriptor: EvaluationDescriptorV1 | null;
  readonly document: EvaluationDocumentV1 | null;
  readonly observedRevision: string | null;
  readonly error: string | null;
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
  readonly providerKind: 'standalone' | 'dam-hopper';
  readonly capabilities: readonly string[];
  readonly frameSession: string | null;
  readonly activationGeneration: number;
  readonly isAvailable: boolean;
  readonly snapshotId: string | null;
  readonly historySummary: HistorySummaryResultV1 | HistorySummaryResultV2 | null;
  readonly historyPage: HistoryPageResultV1 | null;
  readonly historyPageCursor: string | null;
  readonly historyPageEntries: readonly HistoryRowV1[];
  readonly historyDetail: HistoryDetailState;
  readonly currentPolicy: PolicyReadCurrentResultV1 | null;
  readonly evaluationsList: EvaluationsListResultV1 | null;
  readonly selectedEvaluation: EvaluationDetailState;
  readonly evaluationsComparison: EvaluationsCompareReadyResultV1 | null;
  readonly inventory: ProjectInventoryV2 | null;
}

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

export const INITIAL_DETAIL_STATE: HistoryDetailState = Object.freeze({
  status: 'idle',
  recordRef: null,
  consultationId: null,
  detailRevision: null,
  execution: null,
  outcome: null,
  observedRevision: null,
  error: null
});

export const INITIAL_EVALUATION_DETAIL_STATE: EvaluationDetailState = Object.freeze({
  status: 'idle',
  evaluationRef: null,
  descriptor: null,
  document: null,
  observedRevision: null,
  error: null
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
  revealCandidates: false,
  providerKind: 'standalone',
  capabilities: Object.freeze([]),
  frameSession: null,
  activationGeneration: 0,
  isAvailable: true,
  snapshotId: null,
  historySummary: null,
  historyPage: null,
  historyPageCursor: null,
  historyPageEntries: Object.freeze([]),
  historyDetail: INITIAL_DETAIL_STATE,
  currentPolicy: null,
  evaluationsList: null,
  selectedEvaluation: INITIAL_EVALUATION_DETAIL_STATE,
  evaluationsComparison: null,
  inventory: null
});
