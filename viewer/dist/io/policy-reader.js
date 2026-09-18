"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectAndReadPolicyFile = selectAndReadPolicyFile;
exports.readPolicyFileHandle = readPolicyFileHandle;
const history_scan_budget_js_1 = require("./history-scan-budget.js");
const advisor_contract_runtime_js_1 = require("../../../src/protocol/advisor-contract-runtime.js");
const decoder = new TextDecoder('utf-8', { fatal: true });
async function selectAndReadPolicyFile() {
    if (typeof globalThis.showOpenFilePicker !== 'function') {
        return { status: 'POLICY_SELECTION_CANCELLED' };
    }
    let handles;
    try {
        handles = await globalThis.showOpenFilePicker({
            multiple: false,
            types: [
                {
                    description: 'EVCrate Advisor Policy',
                    accept: { 'application/json': ['.json'] }
                }
            ]
        });
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            return { status: 'POLICY_SELECTION_CANCELLED' };
        }
        return { status: 'POLICY_SELECTION_CANCELLED' };
    }
    const handle = handles[0];
    if (!handle)
        return { status: 'POLICY_SELECTION_CANCELLED' };
    return readPolicyFileHandle(handle);
}
async function readPolicyFileHandle(handle) {
    const fileName = handle.name;
    try {
        const perm = await handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
            const requested = typeof handle.requestPermission === 'function' ? await handle.requestPermission({ mode: 'read' }) : perm;
            if (requested !== 'granted') {
                return { status: 'POLICY_PERMISSION_DENIED', fileName };
            }
        }
    }
    catch {
        return { status: 'POLICY_PERMISSION_DENIED', fileName };
    }
    let file;
    try {
        file = await handle.getFile();
    }
    catch {
        return { status: 'POLICY_READ_FAILED', fileName };
    }
    if (file.size > history_scan_budget_js_1.MAX_POLICY_BYTES) {
        return { status: 'POLICY_OVERSIZED', fileName, bytes: file.size };
    }
    let buf;
    try {
        buf = await file.arrayBuffer();
    }
    catch {
        return { status: 'POLICY_READ_FAILED', fileName };
    }
    if (buf.byteLength > history_scan_budget_js_1.MAX_POLICY_BYTES) {
        return { status: 'POLICY_OVERSIZED', fileName, bytes: buf.byteLength };
    }
    let text;
    try {
        text = decoder.decode(buf);
    }
    catch {
        return { status: 'POLICY_INVALID_JSON', fileName, bytes: buf.byteLength };
    }
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        return { status: 'POLICY_INVALID_JSON', fileName, bytes: buf.byteLength };
    }
    try {
        const inspected = (0, advisor_contract_runtime_js_1.inspectPolicy)(json);
        if (inspected.legacy || inspected.migrationRequired) {
            return {
                status: 'POLICY_MIGRATION_REQUIRED',
                policy: inspected.policy,
                legacy: true,
                migrationRequired: true,
                fileName,
                bytes: buf.byteLength
            };
        }
        return {
            status: 'POLICY_READY',
            policy: inspected.policy,
            legacy: false,
            migrationRequired: false,
            fileName,
            bytes: buf.byteLength
        };
    }
    catch (err) {
        if (err instanceof advisor_contract_runtime_js_1.AdvisorContractError && err.issue.code === 'CONTRACT_VERSION_UNSUPPORTED') {
            return { status: 'POLICY_UNSUPPORTED_VERSION', fileName, bytes: buf.byteLength };
        }
        return { status: 'POLICY_INVALID', fileName, bytes: buf.byteLength };
    }
}
