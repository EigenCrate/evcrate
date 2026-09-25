'use strict';

/**
 * @file error-mapping.cjs
 * Maps provider and internal errors to D00-compliant PluginError instances,
 * and provides single-line sanitized operational logging to stderr.
 */

const { PluginError, PluginErrorCode } = require('@dam-hopper/plugin-sdk');

/**
 * Map of internal / provider error codes to D00 PluginErrorCode values.
 */
const CODE_MAPPING = Object.freeze({
  UNAUTHORIZED: PluginErrorCode.UNAUTHORIZED,
  FORBIDDEN: PluginErrorCode.FORBIDDEN,
  INCOMPATIBLE: PluginErrorCode.INCOMPATIBLE,
  RUNNER_UNAVAILABLE: PluginErrorCode.RUNNER_UNAVAILABLE,
  RUNTIME_UNAVAILABLE: PluginErrorCode.RUNTIME_UNAVAILABLE,
  SOURCE_NOT_CONFIGURED: PluginErrorCode.SOURCE_NOT_CONFIGURED,
  SOURCE_MISSING: PluginErrorCode.SOURCE_MISSING,
  PERMISSION_DENIED: PluginErrorCode.SOURCE_PERMISSION_DENIED,
  SOURCE_PERMISSION_DENIED: PluginErrorCode.SOURCE_PERMISSION_DENIED,
  INVALID_INPUT: PluginErrorCode.INVALID_INPUT,
  OVERLOADED: PluginErrorCode.OVERLOADED,
  DEADLINE_EXCEEDED: PluginErrorCode.DEADLINE_EXCEEDED,
  CANCELLED: PluginErrorCode.CANCELLED,
  CONTEXT_REVOKED: PluginErrorCode.CONTEXT_REVOKED,
  SNAPSHOT_EXPIRED: PluginErrorCode.SNAPSHOT_EXPIRED,
  DETAIL_CHANGED: PluginErrorCode.DETAIL_CHANGED_OR_MISSING,
  DETAIL_MISSING: PluginErrorCode.DETAIL_CHANGED_OR_MISSING,
  DETAIL_CHANGED_OR_MISSING: PluginErrorCode.DETAIL_CHANGED_OR_MISSING,
  WORKER_FAILED: PluginErrorCode.WORKER_FAILED
});

/**
 * Strips paths, usernames, home dirs, and secret patterns from text.
 *
 * @param {string} text
 * @returns {string}
 */
function sanitizeMessage(text) {
  if (typeof text !== 'string') return '';
  // Remove absolute POSIX/Windows paths
  let sanitized = text.replace(/(?:\/[a-zA-Z0-9._-]+)+/g, '[PATH]');
  sanitized = sanitized.replace(/[a-zA-Z]:\\[^\s]+/g, '[PATH]');
  // Remove token-like hex / base64 sequences (> 32 chars)
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{32,}\b/g, '[REDACTED_HEX]');
  return sanitized.trim();
}

/**
 * Sanitizes details dictionary to safe allowed keys only.
 *
 * @param {Record<string, unknown>|undefined} details
 * @returns {Record<string, unknown>|undefined}
 */
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return undefined;
  const safe = {};
  const allowedKeys = new Set([
    'operation',
    'record_ref',
    'evaluation_ref',
    'limit',
    'expected_revision',
    'observed_revision',
    'retryable',
    'safe_code',
    'counts'
  ]);

  for (const [key, val] of Object.entries(details)) {
    if (allowedKeys.has(key)) {
      if (typeof val === 'string') {
        safe[key] = sanitizeMessage(val);
      } else if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
        safe[key] = val;
      }
    }
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

/**
 * Maps any caught error or value to a valid D00 PluginError.
 *
 * @param {unknown} err
 * @param {string} [fallbackCode='WORKER_FAILED']
 * @returns {PluginError}
 */
function toSafePluginError(err, fallbackCode = PluginErrorCode.WORKER_FAILED) {
  if (err instanceof PluginError) {
    return err;
  }

  if (err && typeof err === 'object') {
    const rawCode = err.code || err.safeCode;
    const mappedCode = CODE_MAPPING[rawCode] || (PluginErrorCode[rawCode] ? rawCode : fallbackCode);
    const sanitizedMsg = sanitizeMessage(err.message || 'Worker operation failed');
    const safeDetails = sanitizeDetails(err.details);
    const isRetryable = Boolean(err.retryable || mappedCode === PluginErrorCode.OVERLOADED);

    return new PluginError(mappedCode, sanitizedMsg, safeDetails, isRetryable);
  }

  return new PluginError(
    fallbackCode,
    'Worker operation failed unexpectedly',
    undefined,
    false
  );
}

/**
 * Bounded single-line sanitized operational logger strictly to process.stderr.
 * STDOUT is strictly reserved for protocol frames.
 *
 * @param {object} event
 * @param {string} [event.correlationId]
 * @param {string} [event.requestId]
 * @param {string} [event.contextId]
 * @param {string} [event.operation]
 * @param {string} [event.safeCode]
 * @param {number} [event.durationMs]
 * @param {number|Record<string, number>} [event.counts]
 */
function logOperationalEvent(event) {
  try {
    const payload = {
      ts: Date.now(),
      corr: event.correlationId ? String(event.correlationId).slice(0, 64) : undefined,
      req: event.requestId ? String(event.requestId).slice(0, 64) : undefined,
      ctx: event.contextId ? String(event.contextId).slice(0, 64) : undefined,
      op: event.operation ? String(event.operation).slice(0, 64) : undefined,
      code: event.safeCode || 'OK',
      dur_ms: typeof event.durationMs === 'number' ? Math.round(event.durationMs) : undefined,
      counts: event.counts
    };

    const line = JSON.stringify(payload);
    // Enforce max 1024 chars per event line
    const truncated = line.length > 1024 ? line.slice(0, 1021) + '...}' : line;
    process.stderr.write(truncated + '\n');
  } catch {
    // Logging failure must never crash worker or write to stdout
  }
}

module.exports = {
  CODE_MAPPING,
  sanitizeMessage,
  sanitizeDetails,
  toSafePluginError,
  logOperationalEvent
};
