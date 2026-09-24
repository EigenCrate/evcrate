import type { HistorySnapshot, PolicyReaderResult, EvaluationReaderResult } from './app-state-types.js';
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
} from '../../src/protocol/advisor-plugin-data-api.ts';
import type { HashView } from './hash-view.js';
import type { UiHistoryFilters } from './app-state-types.js';

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
  | { type: 'SELECT_CONSULTATION'; consultationId: string | null; recordRef?: string }
  | { type: 'SET_POLICY'; result: PolicyReaderResult }
  | { type: 'SET_EVALUATIONS'; results: readonly EvaluationReaderResult[] }
  | { type: 'REVEAL_CANDIDATES'; reveal: boolean }
  | { type: 'PROVIDER_READY'; providerKind: 'standalone' | 'dam-hopper'; label: string; capabilities: readonly string[]; frameSession: string | null; activationGeneration: number }
  | { type: 'CONTEXT_CHANGED'; label: string; capabilities: readonly string[]; frameSession: string | null; activationGeneration: number }
  | { type: 'CONTEXT_REVOKED'; reason: string }
  | { type: 'AVAILABILITY_CHANGED'; available: boolean; capabilities: readonly string[] }
  | { type: 'HISTORY_REFRESH_START'; generation: number; frameSession?: string | null }
  | { type: 'HISTORY_REFRESH_COMMIT'; generation: number; frameSession?: string | null; result: HistoryRefreshResultV1 | HistoryRefreshResultV2; snapshot?: HistorySnapshot }
  | { type: 'HISTORY_SUMMARY_COMMIT'; generation: number; frameSession?: string | null; summary: HistorySummaryResultV1 | HistorySummaryResultV2 }
  | { type: 'HISTORY_PAGE_COMMIT'; generation: number; frameSession?: string | null; page: HistoryPageResultV1 }
  | { type: 'HISTORY_DETAIL_START'; recordRef: string; consultationId: string | null }
  | { type: 'HISTORY_DETAIL_COMMIT'; result: HistoryDetailResultV1; consultationId: string | null }
  | { type: 'HISTORY_DETAIL_ERROR'; recordRef: string; consultationId: string | null; error: string }
  | { type: 'POLICY_COMMIT'; policy: PolicyReadCurrentResultV1 }
  | { type: 'EVALUATIONS_LIST_COMMIT'; list: EvaluationsListResultV1 }
  | { type: 'EVALUATION_READ_START'; evaluationRef: string }
  | { type: 'EVALUATION_READ_COMMIT'; result: EvaluationsReadResultV1 }
  | { type: 'EVALUATIONS_COMPARE_COMMIT'; comparison: EvaluationsCompareReadyResultV1 };
