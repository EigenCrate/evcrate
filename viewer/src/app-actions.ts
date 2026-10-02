import type {
  HistorySnapshot,
  PolicyReaderResult,
  EvaluationReaderResult,
  ActivityScope,
  BoundSourceStatus,
  UiHistoryFilters
} from './app-state-types.js';
import type { HistoryMetricScanV1 } from '../../src/protocol/advisor-metrics.js';
import type {
  HistoryRefreshResultV1,
  HistoryRefreshResultV2,
  HistorySummaryResultV1,
  HistorySummaryResultV2,
  HistoryPageResultV1,
  HistoryDetailResultV1,
  PolicyReadCurrentResultV1,
  EvaluationsListResultV1,
  EvaluationsReadResultV1,
  EvaluationsCompareReadyResultV1
} from '../../src/protocol/advisor-data-api.ts';
import type { HashView } from './hash-view.js';
import type { AdvisorWorkspaceContext, ProviderKind } from './providers/advisor-data-provider.js';
export type AppAction =
  | { type: 'CAPABILITY_UNSUPPORTED'; reason: string }
  | { type: 'SELECT_START' }
  | { type: 'SCAN_START'; generation: number; label: string }
  | { type: 'SCAN_PROGRESS'; generation: number }
  | { type: 'SCAN_COMMIT'; generation: number; commit: 'replace' | 'retain-stale'; snapshot?: HistorySnapshot; scan: HistoryMetricScanV1 }
  | { type: 'SCAN_STALE'; generation: number; reason: string }
  | { type: 'SCAN_CANCEL'; generation: number }
  | { type: 'SET_ACTIVITY_SCOPE'; scope: ActivityScope }
  | { type: 'SET_WORKSPACE_CONTEXT'; context: AdvisorWorkspaceContext | null }
  | { type: 'WORKSPACE_PROJECT_CHANGED'; workspaceContext: AdvisorWorkspaceContext }
  | { type: 'SET_FILTERS'; filters: Partial<UiHistoryFilters> }
  | { type: 'SET_VIEW'; view: HashView }
  | { type: 'SELECT_CONSULTATION'; consultationId: string | null; recordRef?: string; contextEpoch?: number }
  | { type: 'SET_POLICY'; result: PolicyReaderResult }
  | { type: 'SET_EVALUATIONS'; results: readonly EvaluationReaderResult[] }
  | { type: 'REVEAL_CANDIDATES'; reveal: boolean }
  | { type: 'PROVIDER_READY'; providerKind: ProviderKind; label: string; capabilities: readonly string[]; frameSession: string | null; activationGeneration: number; workspaceContext?: AdvisorWorkspaceContext | null; contextEpoch?: number }
  | { type: 'CONTEXT_CHANGED'; label: string; capabilities: readonly string[]; frameSession: string | null; activationGeneration: number; workspaceContext?: AdvisorWorkspaceContext | null; contextEpoch?: number }
  | { type: 'CONTEXT_REVOKED'; reason: string; contextEpoch?: number }
  | { type: 'DISCONNECTED'; reason?: string; contextEpoch?: number }
  | { type: 'INCOMPATIBLE'; reason: string; contextEpoch?: number }
  | { type: 'AVAILABILITY_CHANGED'; available: boolean; capabilities: readonly string[] }
  | { type: 'HISTORY_REFRESH_START'; generation: number; frameSession?: string | null; contextEpoch?: number }
  | { type: 'HISTORY_REFRESH_COMMIT'; generation: number; frameSession?: string | null; result: HistoryRefreshResultV1 | HistoryRefreshResultV2; snapshot?: HistorySnapshot; contextEpoch?: number; observedAt?: number }
  | { type: 'HISTORY_SUMMARY_COMMIT'; generation: number; frameSession?: string | null; summary: HistorySummaryResultV1 | HistorySummaryResultV2; queryRevision?: number; contextEpoch?: number }
  | { type: 'HISTORY_PAGE_COMMIT'; generation: number; frameSession?: string | null; page: HistoryPageResultV1; queryRevision?: number; contextEpoch?: number }
  | { type: 'HISTORY_QUERY_PAIR_COMMIT'; generation: number; frameSession?: string | null; summary: HistorySummaryResultV1 | HistorySummaryResultV2; page: HistoryPageResultV1; queryRevision?: number; contextEpoch?: number }
  | { type: 'HISTORY_QUERY_ERROR'; generation: number; frameSession?: string | null; error: string; queryRevision?: number; contextEpoch?: number }
  | { type: 'HISTORY_DETAIL_START'; recordRef: string; consultationId: string | null; contextEpoch?: number }
  | { type: 'HISTORY_DETAIL_COMMIT'; result: HistoryDetailResultV1; consultationId: string | null; contextEpoch?: number }
  | { type: 'HISTORY_DETAIL_ERROR'; recordRef: string; consultationId: string | null; error: string; contextEpoch?: number }
  | { type: 'POLICY_START'; contextEpoch?: number }
  | { type: 'POLICY_COMMIT'; policy: PolicyReadCurrentResultV1; contextEpoch?: number }
  | { type: 'POLICY_ERROR'; error: string; status?: BoundSourceStatus; contextEpoch?: number }
  | { type: 'EVALUATIONS_LIST_START'; contextEpoch?: number }
  | { type: 'EVALUATIONS_LIST_COMMIT'; list: EvaluationsListResultV1; contextEpoch?: number }
  | { type: 'EVALUATIONS_LIST_ERROR'; error: string; status?: BoundSourceStatus; contextEpoch?: number }
  | { type: 'EVALUATION_READ_START'; evaluationRef: string; contextEpoch?: number }
  | { type: 'EVALUATION_READ_COMMIT'; result: EvaluationsReadResultV1; contextEpoch?: number }
  | { type: 'EVALUATION_READ_ERROR'; evaluationRef: string; error: string; contextEpoch?: number }
  | { type: 'EVALUATIONS_COMPARE_START'; contextEpoch?: number }
  | { type: 'EVALUATIONS_COMPARE_COMMIT'; comparison: EvaluationsCompareReadyResultV1; cursor?: string | null; contextEpoch?: number }
  | { type: 'EVALUATIONS_COMPARE_ERROR'; error: string; contextEpoch?: number };
