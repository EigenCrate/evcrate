"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBrowserSha256 = computeBrowserSha256;
exports.computeBrowserCheckpointDigest = computeBrowserCheckpointDigest;
const advisor_contract_runtime_js_1 = require("../../../src/protocol/advisor-contract-runtime.js");
const encoder = new TextEncoder();
async function computeBrowserSha256(data) {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('Web Crypto API (crypto.subtle) is unavailable');
    }
    const hashBuffer = await subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function computeBrowserCheckpointDigest(checkpoint) {
    const validated = (0, advisor_contract_runtime_js_1.validateCheckpointV2)(checkpoint);
    const canonical = JSON.stringify(validated);
    return computeBrowserSha256(canonical);
}
