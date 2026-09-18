"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryScanBudget = exports.YIELD_CADENCE_RECORDS = exports.MAX_RETAINED_DIAGNOSTICS = exports.CONCURRENT_READS = exports.MAX_DIRECT_FILE_BYTES = exports.MAX_ENUMERATED_ENTRIES = exports.MAX_TOTAL_CONSULTATIONS = exports.MAX_CONSULTATIONS_PER_TASK = exports.MAX_TASKS_PER_PROJECT = exports.MAX_ROOT_ENTRIES = exports.MAX_POLICY_BYTES = exports.MAX_OUTCOME_BYTES = exports.MAX_EXECUTION_BYTES = void 0;
exports.MAX_EXECUTION_BYTES = 128 * 1024;
exports.MAX_OUTCOME_BYTES = 64 * 1024;
exports.MAX_POLICY_BYTES = 16 * 1024;
exports.MAX_ROOT_ENTRIES = 256;
exports.MAX_TASKS_PER_PROJECT = 256;
exports.MAX_CONSULTATIONS_PER_TASK = 256;
exports.MAX_TOTAL_CONSULTATIONS = 65536;
exports.MAX_ENUMERATED_ENTRIES = 200000;
exports.MAX_DIRECT_FILE_BYTES = 256 * 1024 * 1024;
exports.CONCURRENT_READS = 4;
exports.MAX_RETAINED_DIAGNOSTICS = 4096;
exports.YIELD_CADENCE_RECORDS = 64;
const cmp = (a, b) => {
    const sa = a ?? '', sb = b ?? '';
    return sa < sb ? -1 : sa > sb ? 1 : 0;
};
class HistoryScanBudget {
    enumeratedEntries = 0;
    discoveredBytes = 0;
    bytesRead = 0;
    consultationsDiscovered = 0;
    projectsDiscovered = 0;
    tasksDiscovered = 0;
    limitHit = false;
    suppressedDiagnostics = 0;
    _diagnostics = [];
    recordEntry(path) {
        this.enumeratedEntries += 1;
        if (this.enumeratedEntries > exports.MAX_ENUMERATED_ENTRIES) {
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
    recordDiscoveredBytes(bytes, path) {
        this.discoveredBytes += bytes;
        if (this.discoveredBytes > exports.MAX_DIRECT_FILE_BYTES) {
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
    recordConsultation(path) {
        this.consultationsDiscovered += 1;
        if (this.consultationsDiscovered > exports.MAX_TOTAL_CONSULTATIONS) {
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
    recordBytesRead(bytes) {
        this.bytesRead += bytes;
    }
    addDiagnostic(diag) {
        if (this._diagnostics.length < exports.MAX_RETAINED_DIAGNOSTICS) {
            this._diagnostics.push(Object.freeze({ ...diag }));
        }
        else {
            this.suppressedDiagnostics += 1;
        }
    }
    get diagnostics() {
        return [...this._diagnostics].sort((a, b) => cmp(a.relative_path, b.relative_path) || cmp(a.code, b.code));
    }
}
exports.HistoryScanBudget = HistoryScanBudget;
