import type { DiscoveredConsultation } from './history-traversal.js';
import { HistoryScanBudget } from './history-scan-budget.js';
import { type NormalizedHistoryRecordV1 } from '../../../src/protocol/advisor-metrics.js';
export declare function readConsultationRecord(cand: DiscoveredConsultation, budget: HistoryScanBudget, signal?: AbortSignal): Promise<NormalizedHistoryRecordV1 | null>;
export declare function readConsultationRecordsBounded(candidates: readonly DiscoveredConsultation[], budget: HistoryScanBudget, signal?: AbortSignal): Promise<NormalizedHistoryRecordV1[]>;
