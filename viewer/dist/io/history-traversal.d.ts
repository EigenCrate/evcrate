import type { FileSystemDirectoryHandle, FileSystemFileHandle } from './file-system-access.d.ts';
import { HistoryScanBudget } from './history-scan-budget.js';
import type { HistoryMetricScopeV1 } from '../../../src/protocol/advisor-metrics.js';
export interface DiscoveredConsultation {
    readonly project_id: string;
    readonly task_run_id: string;
    readonly consultation_id: string;
    readonly relative_path: string;
    readonly consultation_dir_handle: FileSystemDirectoryHandle;
    readonly execution_file_handle: FileSystemFileHandle | null;
    readonly outcome_file_handle: FileSystemFileHandle | null;
}
export interface TraversalResult {
    readonly scope: HistoryMetricScopeV1;
    readonly candidates: readonly DiscoveredConsultation[];
    readonly limit_hit: boolean;
}
export declare function traverseHistoryDirectory(rootHandle: FileSystemDirectoryHandle, budget: HistoryScanBudget, signal?: AbortSignal): Promise<TraversalResult>;
