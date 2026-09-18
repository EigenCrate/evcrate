"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readConsultationRecord = readConsultationRecord;
exports.readConsultationRecordsBounded = readConsultationRecordsBounded;
const history_scan_budget_js_1 = require("./history-scan-budget.js");
const browser_digest_js_1 = require("./browser-digest.js");
const advisor_contract_runtime_js_1 = require("../../../src/protocol/advisor-contract-runtime.js");
const advisor_metrics_js_1 = require("../../../src/protocol/advisor-metrics.js");
const json_js_1 = require("../../../src/protocol/json.js");
const decoder = new TextDecoder('utf-8', { fatal: true });
async function readFileBytes(file, maxBytes, relPath, cand, budget, oversizedCode) {
    if (file.size > maxBytes) {
        budget.addDiagnostic({ code: oversizedCode, relative_path: relPath, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: file.size, observed_schema_version: null });
        return null;
    }
    const buf = await file.arrayBuffer();
    budget.recordBytesRead(buf.byteLength);
    if (buf.byteLength > maxBytes) {
        budget.addDiagnostic({ code: oversizedCode, relative_path: relPath, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: buf.byteLength, observed_schema_version: null });
        return null;
    }
    return buf;
}
async function readConsultationRecord(cand, budget, signal) {
    if (signal?.aborted || !cand.execution_file_handle)
        return null;
    const execRel = `${cand.relative_path}/execution.json`;
    let execFile;
    try {
        execFile = await cand.execution_file_handle.getFile();
    }
    catch (err) {
        const isNotFound = err instanceof Error && (err.name === 'NotFoundError' || err.message.includes('not found'));
        budget.addDiagnostic({ code: isNotFound ? 'MISSING_DURING_SCAN' : 'CONCURRENT_MODIFICATION', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: null, observed_schema_version: null });
        return null;
    }
    const execBuf = await readFileBytes(execFile, history_scan_budget_js_1.MAX_EXECUTION_BYTES, execRel, cand, budget, 'EXECUTION_OVERSIZED');
    if (!execBuf)
        return null;
    let execJson;
    try {
        execJson = JSON.parse(decoder.decode(execBuf));
    }
    catch {
        budget.addDiagnostic({ code: 'EXECUTION_INVALID_JSON', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: null });
        return null;
    }
    const execObj = (0, json_js_1.isPlainObject)(execJson) ? execJson : null;
    if (!execObj || execObj['schema_version'] !== 1) {
        const observed = typeof execObj?.['schema_version'] === 'number' ? execObj['schema_version'] : null;
        budget.addDiagnostic({ code: 'EXECUTION_UNSUPPORTED_VERSION', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: observed });
        return null;
    }
    let validatedExec;
    try {
        validatedExec = (0, advisor_contract_runtime_js_1.validateHistoryExecutionV1)(execJson);
    }
    catch {
        budget.addDiagnostic({ code: 'EXECUTION_INVALID', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: 1 });
        return null;
    }
    const computedDigest = await (0, browser_digest_js_1.computeBrowserCheckpointDigest)(validatedExec.checkpoint);
    if (computedDigest.toLowerCase() !== validatedExec.checkpoint_digest.toLowerCase()) {
        budget.addDiagnostic({ code: 'EXECUTION_INVALID', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: 1 });
        return null;
    }
    if (cand.project_id !== validatedExec.project_id.toLowerCase() ||
        cand.task_run_id !== validatedExec.task_run_id.toLowerCase() ||
        cand.consultation_id !== validatedExec.consultation_id.toLowerCase() ||
        validatedExec.checkpoint.task_run_id.toLowerCase() !== validatedExec.task_run_id.toLowerCase()) {
        budget.addDiagnostic({ code: 'EXECUTION_IDENTITY_MISMATCH', relative_path: execRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: execBuf.byteLength, observed_schema_version: 1 });
        return null;
    }
    let outcomePayload = null;
    if (cand.outcome_file_handle) {
        const outRel = `${cand.relative_path}/outcome.json`;
        try {
            const outFile = await cand.outcome_file_handle.getFile();
            const outBuf = await readFileBytes(outFile, history_scan_budget_js_1.MAX_OUTCOME_BYTES, outRel, cand, budget, 'OUTCOME_OVERSIZED');
            if (!outBuf) {
                outcomePayload = { invalid: true };
            }
            else {
                let outJson;
                try {
                    outJson = JSON.parse(decoder.decode(outBuf));
                }
                catch {
                    budget.addDiagnostic({ code: 'OUTCOME_INVALID_JSON', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: null });
                    outcomePayload = { invalid: true };
                }
                if (outcomePayload === null) {
                    const outObj = (0, json_js_1.isPlainObject)(outJson) ? outJson : null;
                    if (!outObj || outObj['schema_version'] !== 1) {
                        const observed = typeof outObj?.['schema_version'] === 'number' ? outObj['schema_version'] : null;
                        budget.addDiagnostic({ code: 'OUTCOME_UNSUPPORTED_VERSION', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: observed });
                        outcomePayload = { invalid: true };
                    }
                    else {
                        try {
                            const valOut = (0, advisor_contract_runtime_js_1.validateHistoryOutcomeV1)(outJson);
                            if (cand.project_id !== valOut.project_id.toLowerCase() ||
                                cand.task_run_id !== valOut.task_run_id.toLowerCase() ||
                                cand.consultation_id !== valOut.consultation_id.toLowerCase()) {
                                budget.addDiagnostic({ code: 'OUTCOME_IDENTITY_MISMATCH', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: 1 });
                                outcomePayload = { invalid: true };
                            }
                            else {
                                outcomePayload = valOut;
                            }
                        }
                        catch {
                            budget.addDiagnostic({ code: 'OUTCOME_INVALID', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: outBuf.byteLength, observed_schema_version: 1 });
                            outcomePayload = { invalid: true };
                        }
                    }
                }
            }
        }
        catch {
            budget.addDiagnostic({ code: 'CONCURRENT_MODIFICATION', relative_path: outRel, project_id: cand.project_id, task_run_id: cand.task_run_id, consultation_id: cand.consultation_id, bytes: null, observed_schema_version: null });
            outcomePayload = { invalid: true };
        }
    }
    return (0, advisor_metrics_js_1.normalizeHistoryRecord)(validatedExec, outcomePayload, { kind: 'browser', relative_path: cand.relative_path });
}
async function readConsultationRecordsBounded(candidates, budget, signal) {
    const records = [];
    let nextIdx = 0;
    let processed = 0;
    async function worker() {
        while (nextIdx < candidates.length) {
            if (signal?.aborted || budget.limitHit)
                break;
            const idx = nextIdx++;
            const rec = await readConsultationRecord(candidates[idx], budget, signal);
            if (rec)
                records.push(rec);
            processed += 1;
            if (processed % history_scan_budget_js_1.YIELD_CADENCE_RECORDS === 0) {
                const { promise, resolve } = Promise.withResolvers();
                setTimeout(resolve, 0);
                await promise;
            }
        }
    }
    const workers = Array.from({ length: Math.min(history_scan_budget_js_1.CONCURRENT_READS, candidates.length) }, () => worker());
    await Promise.all(workers);
    return records;
}
