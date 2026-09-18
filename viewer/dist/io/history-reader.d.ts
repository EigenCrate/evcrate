import type { FileSystemDirectoryHandle, FileSystemHandle } from './file-system-access.d.ts';
import { type HistoryMetricResultV1, type HistoryMetricScanV1, type HistoryMetricScopeV1, type NormalizedHistoryRecordV1 } from '../../../src/protocol/advisor-metrics.js';
export interface HistorySnapshot {
    readonly generation: number;
    readonly rootHandle: FileSystemDirectoryHandle;
    readonly scope: HistoryMetricScopeV1;
    readonly records: readonly NormalizedHistoryRecordV1[];
    readonly metricsResult: HistoryMetricResultV1;
    readonly scannedAt: number;
    readonly stale: boolean;
}
export interface ScanExecutionResult {
    readonly generation: number;
    readonly commit: 'replace' | 'retain-stale';
    readonly snapshot?: HistorySnapshot;
    readonly scan: HistoryMetricScanV1;
}
export declare function selectHistoryDirectory(): Promise<FileSystemDirectoryHandle | null>;
export declare function verifyDirectoryPermission(handle: FileSystemHandle, request?: boolean): Promise<boolean>;
export declare class HistoryReader {
    private _latestGeneration;
    private _activeController;
    get latestGeneration(): number;
    cancelActiveScan(): void;
    scan(rootHandle: FileSystemDirectoryHandle, priorSnapshot?: HistorySnapshot | null): Promise<ScanExecutionResult>;
    private _buildRetainStale;
}
