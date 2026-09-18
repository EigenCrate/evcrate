"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryReader = void 0;
exports.selectHistoryDirectory = selectHistoryDirectory;
exports.verifyDirectoryPermission = verifyDirectoryPermission;
const history_scan_budget_js_1 = require("./history-scan-budget.js");
const history_traversal_js_1 = require("./history-traversal.js");
const history_record_reader_js_1 = require("./history-record-reader.js");
const advisor_metrics_js_1 = require("../../../src/protocol/advisor-metrics.js");
async function selectHistoryDirectory() {
    if (typeof globalThis.showDirectoryPicker !== 'function')
        return null;
    try {
        return await globalThis.showDirectoryPicker({ id: 'evcrate-history', mode: 'read' });
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AbortError')
            return null;
        throw err;
    }
}
async function verifyDirectoryPermission(handle, request = false) {
    try {
        const status = await handle.queryPermission({ mode: 'read' });
        if (status === 'granted')
            return true;
        if (request && typeof handle.requestPermission === 'function') {
            const req = await handle.requestPermission({ mode: 'read' });
            return req === 'granted';
        }
        return false;
    }
    catch {
        return false;
    }
}
class HistoryReader {
    _latestGeneration = 0;
    _activeController = null;
    get latestGeneration() {
        return this._latestGeneration;
    }
    cancelActiveScan() {
        this._activeController?.abort();
        this._activeController = null;
    }
    async scan(rootHandle, priorSnapshot) {
        this.cancelActiveScan();
        const generation = ++this._latestGeneration;
        const controller = new AbortController();
        this._activeController = controller;
        const { signal } = controller;
        const budget = new history_scan_budget_js_1.HistoryScanBudget();
        const hasPerm = await verifyDirectoryPermission(rootHandle, false);
        if (!hasPerm) {
            budget.addDiagnostic({ code: 'ROOT_UNREADABLE', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
            return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
        }
        const { scope, candidates, limit_hit } = await (0, history_traversal_js_1.traverseHistoryDirectory)(rootHandle, budget, signal);
        if (signal.aborted || this._latestGeneration !== generation) {
            budget.addDiagnostic({ code: 'READ_CANCELLED', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
            return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
        }
        if (limit_hit) {
            return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
        }
        const records = await (0, history_record_reader_js_1.readConsultationRecordsBounded)(candidates, budget, signal);
        if (signal.aborted || this._latestGeneration !== generation) {
            budget.addDiagnostic({ code: 'READ_CANCELLED', relative_path: null, project_id: null, task_run_id: null, consultation_id: null, bytes: null, observed_schema_version: null });
            return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
        }
        if (budget.limitHit) {
            return this._buildRetainStale(generation, rootHandle, budget, priorSnapshot);
        }
        const isCompleteWithErrors = budget.diagnostics.length > 0;
        const scanStatus = budget.limitHit ? 'incomplete' : isCompleteWithErrors ? 'complete_with_errors' : 'complete';
        const scanResult = (0, advisor_metrics_js_1.calculateHistoryMetrics)({
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
        const snapshot = Object.freeze({
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
    _buildRetainStale(generation, rootHandle, budget, prior, overrideScan) {
        const scan = overrideScan ?? {
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
        const snapshot = prior
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
exports.HistoryReader = HistoryReader;
