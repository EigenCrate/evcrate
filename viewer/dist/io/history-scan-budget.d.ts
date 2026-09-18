export declare const MAX_EXECUTION_BYTES: number;
export declare const MAX_OUTCOME_BYTES: number;
export declare const MAX_POLICY_BYTES: number;
export declare const MAX_ROOT_ENTRIES = 256;
export declare const MAX_TASKS_PER_PROJECT = 256;
export declare const MAX_CONSULTATIONS_PER_TASK = 256;
export declare const MAX_TOTAL_CONSULTATIONS = 65536;
export declare const MAX_ENUMERATED_ENTRIES = 200000;
export declare const MAX_DIRECT_FILE_BYTES: number;
export declare const CONCURRENT_READS = 4;
export declare const MAX_RETAINED_DIAGNOSTICS = 4096;
export declare const YIELD_CADENCE_RECORDS = 64;
export type ScanDiagnosticCode = 'SELECTION_INVALID' | 'ROOT_UNREADABLE' | 'PROJECT_UNREADABLE' | 'TASK_UNREADABLE' | 'CONSULTATION_UNREADABLE' | 'UNEXPECTED_ENTRY' | 'COUNT_LIMIT' | 'SELECTION_BYTE_LIMIT' | 'READ_CANCELLED' | 'CONCURRENT_MODIFICATION' | 'MISSING_DURING_SCAN' | 'EXECUTION_MISSING' | 'EXECUTION_OVERSIZED' | 'EXECUTION_INVALID_JSON' | 'EXECUTION_UNSUPPORTED_VERSION' | 'EXECUTION_INVALID' | 'EXECUTION_IDENTITY_MISMATCH' | 'OUTCOME_OVERSIZED' | 'OUTCOME_INVALID_JSON' | 'OUTCOME_UNSUPPORTED_VERSION' | 'OUTCOME_INVALID' | 'OUTCOME_IDENTITY_MISMATCH' | 'DUPLICATE_IDENTITY';
export interface ScanDiagnostic {
    readonly code: ScanDiagnosticCode;
    readonly relative_path: string | null;
    readonly project_id: string | null;
    readonly task_run_id: string | null;
    readonly consultation_id: string | null;
    readonly bytes: number | null;
    readonly observed_schema_version: number | null;
}
export declare class HistoryScanBudget {
    enumeratedEntries: number;
    discoveredBytes: number;
    bytesRead: number;
    consultationsDiscovered: number;
    projectsDiscovered: number;
    tasksDiscovered: number;
    limitHit: boolean;
    suppressedDiagnostics: number;
    private readonly _diagnostics;
    recordEntry(path?: string): boolean;
    recordDiscoveredBytes(bytes: number, path?: string): boolean;
    recordConsultation(path?: string): boolean;
    recordBytesRead(bytes: number): void;
    addDiagnostic(diag: ScanDiagnostic): void;
    get diagnostics(): readonly ScanDiagnostic[];
}
