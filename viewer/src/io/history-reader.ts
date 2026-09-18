import type { FileSystemDirectoryHandle, FileSystemHandle } from './file-system-access.d.ts';
import { HistoryScanBudget } from './history-scan-budget.js';
import { traverseHistoryDirectory } from './history-traversal.js';
import { readConsultationRecordsBounded } from './history-record-reader.js';
import {
  calculateHistoryMetrics,
  type HistoryMetricResultV1,
  type HistoryMetricScanV1,
  type HistoryMetricScopeV1,
  type NormalizedHistoryRecordV1
} from '../../../src/protocol/advisor-metrics.js';

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

export async function selectHistoryDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof globalThis.showDirectoryPicker !== 'function') return null;
  try {
    return await globalThis.showDirectoryPicker({ id: 'evcrate-history', mode: 'read' });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function verifyDirectoryPermission(handle: FileSystemHandle, request = false): Promise<boolean> {
  try {
    const status = await handle.queryPermission({ mode: 'read' });
    if (status === 'granted') return true;
    if (request && typeof handle.requestPermission === 'function') {
      const req = await handle.requestPermission({ mode: 'read' });
      return req === 'granted';
    }
    return false;
  } catch {
    return false;
  }
}

export class HistoryReader {
  private _latestGeneration = 0;
  private _activeController: AbortController | null = null;

  get latestGeneration(): number {
    return this._latestGeneration;
  }

  cancelActiveScan(): void {
    this._activeController?.abort();
    this._activeController = null;
  }

  async scan(
    rootHandle: FileSystemDirectoryHandle,
    priorSnapshot?: HistorySnapshot | null
  ): Promise<ScanExecutionResult> {
    this.cancelActiveScan();
    const generation = ++this._latestGeneration;
    const controller = new AbortController();
    this._activeController = controller;
    const { signal } = controller;

    const budget = new HistoryScanBudget();
    const hasPerm = await verifyDirectoryPermission(rootHandle, false);
    if (!hasPerm) {
      budget.addDiagnostic({ code: 'ROOT_UNREADABLE', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
      return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
    }

    const { scope, candidates, limit_hit } = await traverseHistoryDirectory(rootHandle, budget, signal);
    if (signal.aborted || this._latestGeneration !== generation) {
      budget.addDiagnostic({ code: 'READ_CANCELLED', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
      return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
    }
    const hasTraversalFailure = budget.diagnostics.some(
      (d) => d.code === 'ROOT_UNREADABLE' || (scope.kind === 'project' && d.code === 'PROJECT_UNREADABLE')
    );
    if (limit_hit || hasTraversalFailure) {
      return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
    }

    const records = await readConsultationRecordsBounded(candidates, budget, signal);
    if (signal.aborted || this._latestGeneration !== generation) {
      budget.addDiagnostic({ code: 'READ_CANCELLED', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
      return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
    }
    if (budget.limitHit) {
      return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
    }

    const isCompleteWithErrors = budget.diagnostics.length > 0;
    const scanStatus = (budget.limitHit || hasTraversalFailure) ? 'incomplete' : isCompleteWithErrors ? 'complete_with_errors' : 'complete';

    const scanResult = calculateHistoryMetrics({
      records,
      scope,
      generated_at: Date.now(),
      scan: {
        status: scanStatus,
        projects_discovered: budget.projectsDiscovered,
        tasks_discovered: budget.tasksDiscovered,
        consultations_discovered: budget.consultationsDiscovered,
        bytes_discovered: budget.discoveredBytes,
        bytes_read: budget.bytesRead,
        diagnostics: budget.diagnostics,
        suppressed_diagnostics: budget.suppressedDiagnostics,
        limit_hit: budget.limitHit
      }
    });

    if (scanStatus === 'incomplete') {
      return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot, scanResult.scan);
    }

    const snapshot: HistorySnapshot = Object.freeze({
      generation,
      rootHandle,
      scope,
      records: Object.freeze(records),
      metricsResult: scanResult,
      scannedAt: Date.now(),
      stale: false
    });

    return {
      generation,
      commit: 'replace',
      snapshot,
      scan: scanResult.scan
    };
  }

  private _buildRetainStale(
    generation: number,
    rootHandle: FileSystemDirectoryHandle,
    budget: HistoryScanBudget,
    prior?: HistorySnapshot | null,
    overrideScan?: HistoryMetricScanV1
  ): ScanExecutionResult {
    const scan: HistoryMetricScanV1 = overrideScan ?? {
      status: 'incomplete',
      projects_discovered: budget.projectsDiscovered,
      tasks_discovered: budget.tasksDiscovered,
      consultations_discovered: budget.consultationsDiscovered,
      accepted_records: 0,
      invalid_records: 0,
      bytes_discovered: budget.discoveredBytes,
      bytes_read: budget.bytesRead,
      diagnostics: budget.diagnostics,
      suppressed_diagnostics: budget.suppressedDiagnostics,
      limit_hit: budget.limitHit
    };

    const snapshot: HistorySnapshot | undefined = prior
      ? Object.freeze({ ...prior, stale: true })
      : undefined;

    return {
      generation,
      commit: 'retain-stale',
      snapshot,
      scan
    };
  }
}
