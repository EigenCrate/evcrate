'use strict';

/**
 * @file provider-errors.cjs
 * Internal typed error taxonomy for EVCrate Advisor Provider (Phase E01).
 *
 * Maps internal filesystem, parser, validation, cancellation, and permission
 * conditions to stable wire error codes matching PLUGIN_ERROR_CODES.
 * Enforces safe diagnostics: omits HOME, absolute paths, raw file bytes, and stack traces.
 */

const PROVIDER_ERROR_CODES = Object.freeze([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INCOMPATIBLE',
  'RUNNER_UNAVAILABLE',
  'RUNTIME_UNAVAILABLE',
  'SOURCE_NOT_CONFIGURED',
  'SOURCE_MISSING',
  'PERMISSION_DENIED',
  'INVALID_INPUT',
  'OVERLOADED',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'WORKER_FAILED',
  'CONTEXT_REVOKED',
  'SNAPSHOT_EXPIRED',
  'DETAIL_CHANGED',
  'DETAIL_MISSING'
]);

class ProviderError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = undefined) {
    const safeMsg = message || `Provider operation failed with code: ${code}`;
    super(safeMsg);
    this.name = 'ProviderError';
    this.code = PROVIDER_ERROR_CODES.includes(code) ? code : 'WORKER_FAILED';
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      this.details = Object.freeze({ ...details });
    } else {
      this.details = null;
    }
  }
}

function createProviderError(code, message, details) {
  return new ProviderError(code, message, details);
}

function isProviderError(value) {
  return (
    value instanceof ProviderError ||
    (value instanceof Error && value.name === 'ProviderError' && typeof value.code === 'string')
  );
}

function invalidInput(message = 'Invalid input parameters', details) {
  return new ProviderError('INVALID_INPUT', message, details);
}

function forbidden(message = 'Operation not permitted by worker context', details) {
  return new ProviderError('FORBIDDEN', message, details);
}

function sourceNotConfigured(message = 'Source binding not configured', details) {
  return new ProviderError('SOURCE_NOT_CONFIGURED', message, details);
}

function sourceMissing(message = 'Target directory does not exist', details) {
  return new ProviderError('SOURCE_MISSING', message, details);
}

function permissionDenied(message = 'Target path failed owner-safe permission checks', details) {
  return new ProviderError('PERMISSION_DENIED', message, details);
}

function snapshotExpired(message = 'Snapshot has expired or been evicted', details) {
  return new ProviderError('SNAPSHOT_EXPIRED', message, details);
}

function deadlineExceeded(message = 'Operation deadline exceeded', details) {
  return new ProviderError('DEADLINE_EXCEEDED', message, details);
}

function cancelled(message = 'Operation was cancelled', details) {
  return new ProviderError('CANCELLED', message, details);
}

function overloaded(message = 'Worker queue or memory budget exceeded', details) {
  return new ProviderError('OVERLOADED', message, details);
}

function contextRevoked(message = 'Worker context has been revoked or invalidated', details) {
  return new ProviderError('CONTEXT_REVOKED', message, details);
}

module.exports = {
  PROVIDER_ERROR_CODES,
  ProviderError,
  createProviderError,
  isProviderError,
  invalidInput,
  forbidden,
  sourceNotConfigured,
  sourceMissing,
  permissionDenied,
  snapshotExpired,
  deadlineExceeded,
  cancelled,
  overloaded,
  contextRevoked
};
