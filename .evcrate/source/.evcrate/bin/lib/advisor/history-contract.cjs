'use strict';

const path = require('node:path');
const { isUnsafeWindowsPath } = require('./windows-platform.cjs');
const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');
const {
  HISTORY_PROTOCOL_V1,
  HISTORY_VERSION_V1,
  MAX_EXECUTION_HISTORY_BYTES,
  MAX_OUTCOME_HISTORY_BYTES,
  EXECUTION_STATUSES,
  OUTCOME_RESULTS,
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  deepFreeze,
  SENSITIVE_PATTERN
} = require('./contracts-v2.cjs');
const { normalizeHistoryFilter } = require('./generated/advisor-metrics.js');

const HISTORY_OPERATIONS = Object.freeze(['list', 'show', 'export', 'prune', 'metrics']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ANSI_PATTERN = /\u001b\[[0-9;]*[a-zA-Z]/gu;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;

const REQUEST_KEYS = Object.freeze({
  list: ['protocol', 'version', 'operation', 'project_id', 'task_run_id', 'status', 'cursor', 'limit'],
  show: ['protocol', 'version', 'operation', 'project_id', 'task_run_id', 'consultation_id'],
  export: ['protocol', 'version', 'operation', 'destination', 'project_id', 'task_run_id', 'consultation_id', 'dry_run'],
  prune: ['protocol', 'version', 'operation', 'dry_run', 'retention_days', 'max_bytes'],
  metrics: ['protocol', 'version', 'operation', 'project_id', 'task_run_id', 'filters']
});

function fail(code = 'REQUEST_INVALID') {
  throw createRoutingError(code);
}

function assertPlainObject(value, code = 'REQUEST_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code);
  }
}

function assertKeys(value, expected, code = 'REQUEST_INVALID') {
  assertPlainObject(value, code);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) fail(code);
}

function sanitizeTextForDisplay(value) {
  if (typeof value !== 'string') return '';
  return value.replace(ANSI_PATTERN, '').replace(CONTROL_PATTERN, '');
}

function sanitizeObjectForDisplay(value, seen = new Set()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeTextForDisplay(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const arr = value.map((item) => sanitizeObjectForDisplay(item, seen));
    seen.delete(value);
    return arr;
  }
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = sanitizeObjectForDisplay(val, seen);
  }
  seen.delete(value);
  return result;
}

function parseHistoryRequest(input, expectedOperation) {
  let text;
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.byteLength > 64 * 1024) fail('REQUEST_INVALID');
    text = decodeUtf8(input, 'REQUEST_INVALID');
  } else if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > 64 * 1024) fail('REQUEST_INVALID');
    text = input;
  } else if (input && typeof input === 'object') {
    text = JSON.stringify(input);
  } else {
    fail('REQUEST_INVALID');
  }

  const parsed = parseJsonDocument(text, 'REQUEST_INVALID', 'REQUEST_INVALID');
  assertPlainObject(parsed, 'REQUEST_INVALID');

  if (parsed.protocol !== HISTORY_PROTOCOL_V1) fail('REQUEST_INVALID');
  if (parsed.version !== HISTORY_VERSION_V1) fail('REQUEST_INVALID');
  if (!HISTORY_OPERATIONS.includes(parsed.operation)) fail('REQUEST_INVALID');
  if (expectedOperation && parsed.operation !== expectedOperation) fail('REQUEST_INVALID');

  const expected = REQUEST_KEYS[parsed.operation];
  assertKeys(parsed, expected, 'REQUEST_INVALID');

  if (parsed.operation === 'list') {
    if (parsed.project_id !== null && (typeof parsed.project_id !== 'string' || !SHA256_PATTERN.test(parsed.project_id))) {
      fail('REQUEST_INVALID');
    }
    if (parsed.task_run_id !== null && (typeof parsed.task_run_id !== 'string' || !UUID_PATTERN.test(parsed.task_run_id))) {
      fail('REQUEST_INVALID');
    }
    if (parsed.status !== null && !EXECUTION_STATUSES.includes(parsed.status)) {
      fail('REQUEST_INVALID');
    }
    if (parsed.cursor !== null && (typeof parsed.cursor !== 'string' || parsed.cursor.length > 512)) {
      fail('REQUEST_INVALID');
    }
    if (parsed.limit !== null) {
      if (typeof parsed.limit !== 'number' || !Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 100) {
        fail('REQUEST_INVALID');
      }
    }
  } else if (parsed.operation === 'show') {
    if (parsed.project_id !== null && (typeof parsed.project_id !== 'string' || !SHA256_PATTERN.test(parsed.project_id))) {
      fail('REQUEST_INVALID');
    }
    if (typeof parsed.task_run_id !== 'string' || !UUID_PATTERN.test(parsed.task_run_id)) {
      fail('REQUEST_INVALID');
    }
    if (typeof parsed.consultation_id !== 'string' || !UUID_PATTERN.test(parsed.consultation_id)) {
      fail('REQUEST_INVALID');
    }
  } else if (parsed.operation === 'export') {
    if (typeof parsed.destination !== 'string' || !parsed.destination.trim()
      || parsed.destination.length > 1024
      || parsed.destination.includes('\0')) {
      fail('REQUEST_INVALID');
    }
    if (process.platform === 'win32') {
      if (isUnsafeWindowsPath(parsed.destination)) fail('REQUEST_INVALID');
      const parts = parsed.destination.split(path.sep);
      if (parts.some((p) => p === '.' || p === '..')) fail('REQUEST_INVALID');
    } else {
      if (!parsed.destination.startsWith('/') || parsed.destination.split('/').some((p) => p === '.' || p === '..')) {
        fail('REQUEST_INVALID');
      }
    }
    if (parsed.project_id !== null && (typeof parsed.project_id !== 'string' || !SHA256_PATTERN.test(parsed.project_id))) {
      fail('REQUEST_INVALID');
    }
    if (parsed.task_run_id !== null && (typeof parsed.task_run_id !== 'string' || !UUID_PATTERN.test(parsed.task_run_id))) {
      fail('REQUEST_INVALID');
    }
    if (parsed.consultation_id !== null && (typeof parsed.consultation_id !== 'string' || !UUID_PATTERN.test(parsed.consultation_id))) {
      fail('REQUEST_INVALID');
    }
    if (typeof parsed.dry_run !== 'boolean') {
      fail('REQUEST_INVALID');
    }
  } else if (parsed.operation === 'prune') {
    if (typeof parsed.dry_run !== 'boolean') fail('REQUEST_INVALID');
    if (parsed.retention_days !== null && (typeof parsed.retention_days !== 'number'
      || !Number.isSafeInteger(parsed.retention_days) || parsed.retention_days < 1 || parsed.retention_days > 365)) {
      fail('REQUEST_INVALID');
    }
    if (parsed.max_bytes !== null && (typeof parsed.max_bytes !== 'number'
      || !Number.isSafeInteger(parsed.max_bytes) || parsed.max_bytes < 1024 * 1024 || parsed.max_bytes > 1024 * 1024 * 1024)) {
      fail('REQUEST_INVALID');
    }
  } else if (parsed.operation === 'metrics') {
    if (parsed.project_id !== null && (typeof parsed.project_id !== 'string' || !SHA256_PATTERN.test(parsed.project_id))) {
      fail('REQUEST_INVALID');
    }
    if (parsed.task_run_id !== null && (typeof parsed.task_run_id !== 'string' || !UUID_PATTERN.test(parsed.task_run_id))) {
      fail('REQUEST_INVALID');
    }
    if (parsed.filters !== null) assertPlainObject(parsed.filters, 'REQUEST_INVALID');
    try {
      normalizeHistoryFilter(parsed.filters);
    } catch {
      fail('REQUEST_INVALID');
    }
  }

  return deepFreeze(parsed);
}
function scanRedactions(text) {
  if (typeof text !== 'string') return [];
  const matches = [];
  if (SENSITIVE_PATTERN.test(text)) {
    matches.push(SENSITIVE_PATTERN.source);
  }
  return matches;
}


module.exports = {
  HISTORY_PROTOCOL_V1,
  HISTORY_VERSION_V1,
  HISTORY_OPERATIONS,
  MAX_EXECUTION_HISTORY_BYTES,
  MAX_OUTCOME_HISTORY_BYTES,
  EXECUTION_STATUSES,
  OUTCOME_RESULTS,
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  parseHistoryRequest,
  sanitizeTextForDisplay,
  sanitizeObjectForDisplay,
  scanRedactions,
  deepFreeze
};
