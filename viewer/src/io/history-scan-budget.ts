export const MAX_EXECUTION_BYTES = 128 * 1024;
export const MAX_OUTCOME_BYTES = 64 * 1024;
export const MAX_POLICY_BYTES = 16 * 1024;
export const MAX_ROOT_ENTRIES = 256;
export const MAX_TASKS_PER_PROJECT = 256;
export const MAX_CONSULTATIONS_PER_TASK = 256;
export const MAX_TOTAL_CONSULTATIONS = 65536;
export const MAX_ENUMERATED_ENTRIES = 200000;
export const MAX_DIRECT_FILE_BYTES = 256 * 1024 * 1024;
export const CONCURRENT_READS = 4;
export const MAX_RETAINED_DIAGNOSTICS = 4096;
export const YIELD_CADENCE_RECORDS = 64;

export type ScanDiagnosticCode =
  | 'SELECTION_INVALID'
  | 'ROOT_UNREADABLE'
  | 'PROJECT_UNREADABLE'
  | 'TASK_UNREADABLE'
  | 'CONSULTATION_UNREADABLE'
  | 'UNEXPECTED_ENTRY'
  | 'COUNT_LIMIT'
  | 'SELECTION_BYTE_LIMIT'
  | 'READ_CANCELLED'
  | 'CONCURRENT_MODIFICATION'
  | 'MISSING_DURING_SCAN'
  | 'EXECUTION_MISSING'
  | 'EXECUTION_OVERSIZED'
  | 'EXECUTION_INVALID_JSON'
  | 'EXECUTION_UNSUPPORTED_VERSION'
  | 'EXECUTION_INVALID'
  | 'EXECUTION_IDENTITY_MISMATCH'
  | 'OUTCOME_OVERSIZED'
  | 'OUTCOME_INVALID_JSON'
  | 'OUTCOME_UNSUPPORTED_VERSION'
  | 'OUTCOME_INVALID'
  | 'OUTCOME_IDENTITY_MISMATCH'
  | 'DUPLICATE_IDENTITY';

export interface ScanDiagnostic {
  readonly code: ScanDiagnosticCode;
  readonly relative_path: string | null;
  readonly project_id: string | null;
  readonly task_run_id: string | null;
  readonly consultation_id: string | null;
  readonly bytes: number | null;
  readonly observed_schema_version: number | null;
}

const cmp = (a: string | null, b: string | null): number => {
  const sa = a ?? '', sb = b ?? '';
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

export class HistoryScanBudget {
  enumeratedEntries = 0;
  discoveredBytes = 0;
  bytesRead = 0;
  consultationsDiscovered = 0;
  projectsDiscovered = 0;
  tasksDiscovered = 0;
  limitHit = false;
  suppressedDiagnostics = 0;
  private readonly _diagnostics: ScanDiagnostic[] = [];

  recordEntry(path?: string): boolean {
    this.enumeratedEntries += 1;
    if (this.enumeratedEntries > MAX_ENUMERATED_ENTRIES) {
      if (!this.limitHit) {
        this.limitHit = true;
        this.addDiagnostic({
          code: 'COUNT_LIMIT',
          relative_path: path ?? null,
          project_id: null,
          task_run_id: null,
          consultation_id: null,
          bytes: null,
          observed_schema_version: null
        });
      }
      return false;
    }
    return true;
  }

  recordDiscoveredBytes(bytes: number, path?: string): boolean {
    this.discoveredBytes += bytes;
    if (this.discoveredBytes > MAX_DIRECT_FILE_BYTES) {
      if (!this.limitHit) {
        this.limitHit = true;
        this.addDiagnostic({
          code: 'SELECTION_BYTE_LIMIT',
          relative_path: path ?? null,
          project_id: null,
          task_run_id: null,
          consultation_id: null,
          bytes: this.discoveredBytes,
          observed_schema_version: null
        });
      }
      return false;
    }
    return true;
  }

  recordConsultation(path?: string): boolean {
    this.consultationsDiscovered += 1;
    if (this.consultationsDiscovered > MAX_TOTAL_CONSULTATIONS) {
      if (!this.limitHit) {
        this.limitHit = true;
        this.addDiagnostic({
          code: 'COUNT_LIMIT',
          relative_path: path ?? null,
          project_id: null,
          task_run_id: null,
          consultation_id: null,
          bytes: null,
          observed_schema_version: null
        });
      }
      return false;
    }
    return true;
  }

  recordBytesRead(bytes: number): void {
    this.bytesRead += bytes;
  }

  addDiagnostic(diag: ScanDiagnostic): void {
    if (this._diagnostics.length < MAX_RETAINED_DIAGNOSTICS) {
      this._diagnostics.push(Object.freeze({ ...diag }));
    } else {
      this.suppressedDiagnostics += 1;
    }
  }

  get diagnostics(): readonly ScanDiagnostic[] {
    return [...this._diagnostics].sort((a, b) =>
      cmp(a.relative_path, b.relative_path) || cmp(a.code, b.code)
    );
  }
}
