"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVALUATION_PROVENANCES = exports.EVALUATION_RESPONSE_STATUSES = exports.EVALUATION_RUBRIC_SCALE = exports.MAX_CASES = exports.MIN_CASES = exports.MAX_CANDIDATES = exports.MIN_CANDIDATES = exports.MAX_DIMENSIONS = exports.MIN_DIMENSIONS = exports.MAX_EVALUATION_LIST_ITEMS = exports.MAX_EVALUATION_SHORT_TEXT_BYTES = exports.MAX_EVALUATION_TEXT_BYTES = exports.MAX_EVALUATION_FILE_BYTES = exports.EVALUATION_VERSION_V1 = exports.EVALUATION_PROTOCOL_V1 = void 0;
exports.EVALUATION_PROTOCOL_V1 = 'evcrate-advisor-counsel-evaluation';
exports.EVALUATION_VERSION_V1 = 1;
exports.MAX_EVALUATION_FILE_BYTES = 8 * 1024 * 1024;
exports.MAX_EVALUATION_TEXT_BYTES = 4096;
exports.MAX_EVALUATION_SHORT_TEXT_BYTES = 256;
exports.MAX_EVALUATION_LIST_ITEMS = 32;
exports.MIN_DIMENSIONS = 1;
exports.MAX_DIMENSIONS = 16;
exports.MIN_CANDIDATES = 2;
exports.MAX_CANDIDATES = 16;
exports.MIN_CASES = 1;
exports.MAX_CASES = 256;
exports.EVALUATION_RUBRIC_SCALE = Object.freeze([1, 5]);
exports.EVALUATION_RESPONSE_STATUSES = Object.freeze(['ADVICE_READY', 'FAILED', 'MISSING']);
exports.EVALUATION_PROVENANCES = Object.freeze(['human', 'automated']);
__exportStar(require("./advisor-evaluation-validation.js"), exports);
__exportStar(require("./advisor-evaluation-comparison.js"), exports);
