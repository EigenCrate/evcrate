'use strict';

const { randomUUID } = require('node:crypto');
const { createRoutingError, serializeRoutingError } = require('./errors.cjs');
const { RESULT_KEYS, ADVISOR_BUILD_IDENTITY, checkpointDigest } = require('./checkpoint-contract.cjs');
const {
  CONTROLLER_PROTOCOL_V2,
  CONTROLLER_VERSION_V2,
  validateEnvelopeV2,
  validateReceiptV2
} = require('./contracts-v2.cjs');
const CONTROLLER_PROTOCOL = 'evcrate-advisor-controller';
const CONTROLLER_VERSION = 1;
const RECEIPT_KEYS = Object.freeze(['backend', 'model', 'effort', 'controller_version', 'adapter_version', 'elapsed_ms']);
const SUCCESS_KEYS = Object.freeze(['protocol', 'version', 'correlation_id', 'status', 'receipt', 'result']);
const FAILURE_KEYS = Object.freeze(['protocol', 'version', 'correlation_id', 'status', 'receipt', 'error']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function fail() { throw createRoutingError('PROCESS_FAILED'); }
function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) fail();
}
function text(value, max = 256) {
  if (typeof value !== 'string' || !value || CONTROL.test(value) || Buffer.byteLength(value, 'utf8') > max) fail();
  return value;
}
function optionalText(value, max = 256) { return value === null ? null : text(value, max); }
function receipt(value = {}) {
  const result = {
    backend: value.backend ?? null,
    model: value.model ?? null,
    effort: value.effort ?? null,
    controller_version: CONTROLLER_VERSION,
    adapter_version: value.adapter_version ?? null,
    elapsed_ms: value.elapsed_ms
  };
  optionalText(result.backend, 32); optionalText(result.model, 256); optionalText(result.effort, 64);
  optionalText(result.adapter_version, 128);
  if (!Number.isSafeInteger(result.elapsed_ms) || result.elapsed_ms < 0) fail();
  exactKeys(result, RECEIPT_KEYS);
  return Object.freeze(result);
}
function correlation(value) {
  if (value === undefined) value = randomUUID();
  if (typeof value !== 'string' || !UUID.test(value)) fail();
  return value;
}
function validateResult(value) {
  exactKeys(value, RESULT_KEYS);
  if (value.protocol !== 'evcrate-advisor-result' || value.version !== 1 || value.status !== 'ADVICE_READY') fail();
  if (typeof value.checkpoint !== 'string' || typeof value.recommendation !== 'string') fail();
  return value;
}
function receiptV2(value = {}) {
  let buildIdentity = ADVISOR_BUILD_IDENTITY;
  if (value.build_identity !== undefined && value.build_identity !== null) {
    if (value.build_identity !== ADVISOR_BUILD_IDENTITY) {
      fail();
    }
    buildIdentity = value.build_identity;
  }
  const res = {
    backend: value.backend ?? null,
    model: value.model ?? null,
    effort: value.effort ?? null,
    controller_version: CONTROLLER_VERSION_V2,
    adapter_version: value.adapter_version ?? null,
    build_identity: buildIdentity,
    elapsed_ms: value.elapsed_ms ?? 0
  };
  return validateReceiptV2(res);
}
function buildSuccessEnvelopeV2({
  correlation_id,
  correlationId,
  checkpoint,
  task_run_id,
  checkpoint_id,
  task_revision,
  evidence_revision,
  checkpoint_digest,
  receipt: value,
  attempts,
  result,
  audit_status = 'disabled',
  cleanup_outcome
} = {}) {
  if (checkpoint) {
    if (task_run_id !== undefined && task_run_id !== checkpoint.task_run_id) fail();
    if (checkpoint_id !== undefined && checkpoint_id !== checkpoint.checkpoint_id) fail();
    if (task_revision !== undefined && task_revision !== checkpoint.task_revision) fail();
    if (evidence_revision !== undefined && evidence_revision !== checkpoint.evidence_revision) fail();
    const expectedDigest = checkpointDigest(checkpoint);
    if (checkpoint_digest !== undefined && checkpoint_digest !== expectedDigest) fail();
    checkpoint_digest = expectedDigest;
    if (result && result.checkpoint !== checkpoint.checkpoint) fail();
  }
  if (attempts && Array.isArray(attempts)) {
    const successAttempt = attempts.find((a) => a.terminal_classification === 'success');
    if (successAttempt && value) {
      if (value.backend && successAttempt.route.backend !== value.backend) fail();
      if (value.model && successAttempt.route.model !== value.model) fail();
    }
  }
  const envelope = {
    protocol: CONTROLLER_PROTOCOL_V2,
    version: CONTROLLER_VERSION_V2,
    correlation_id: correlation(correlation_id ?? correlationId),
    task_run_id: task_run_id ?? checkpoint?.task_run_id,
    checkpoint_id: checkpoint_id ?? checkpoint?.checkpoint_id,
    task_revision: task_revision ?? checkpoint?.task_revision,
    evidence_revision: evidence_revision ?? checkpoint?.evidence_revision,
    checkpoint_digest: checkpoint_digest ?? checkpoint?.checkpoint_digest,
    status: 'ADVICE_READY',
    receipt: receiptV2(value),
    attempts: attempts ? [...attempts] : [],
    result,
    audit_status
  };
  if (cleanup_outcome !== undefined) {
    Object.defineProperty(envelope, 'cleanup_outcome', {
      value: cleanup_outcome,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  return validateEnvelopeV2(envelope, { checkpoint });
}

function buildFailureEnvelopeV2({
  correlation_id,
  correlationId,
  checkpoint,
  task_run_id,
  checkpoint_id,
  task_revision,
  evidence_revision,
  checkpoint_digest,
  receipt: value,
  attempts,
  error,
  audit_status = 'disabled',
  cleanup_outcome
} = {}) {
  if (checkpoint) {
    task_run_id = checkpoint.task_run_id;
    checkpoint_id = checkpoint.checkpoint_id;
    task_revision = checkpoint.task_revision;
    evidence_revision = checkpoint.evidence_revision;
    checkpoint_digest = checkpointDigest(checkpoint);
  }
  const envelope = {
    protocol: CONTROLLER_PROTOCOL_V2,
    version: CONTROLLER_VERSION_V2,
    correlation_id: correlation(correlation_id ?? correlationId),
    task_run_id: task_run_id ?? '00000000-0000-0000-0000-000000000000',
    checkpoint_id: checkpoint_id ?? 'unknown',
    task_revision: task_revision ?? 0,
    evidence_revision: evidence_revision ?? 0,
    checkpoint_digest: checkpoint_digest ?? '0'.repeat(64),
    status: 'FAILED',
    receipt: receiptV2(value),
    attempts: attempts ? [...attempts] : [],
    error: serializeRoutingError(error),
    audit_status
  };
  if (cleanup_outcome !== undefined) {
    Object.defineProperty(envelope, 'cleanup_outcome', {
      value: cleanup_outcome,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  return validateEnvelopeV2(envelope);
}

function buildSuccessEnvelope(options = {}) {
  if (options.result?.version === 2 || options.checkpoint?.version === 2) {
    return buildSuccessEnvelopeV2(options);
  }
  const { correlation_id, correlationId, receipt: value, result, cleanup_outcome } = options;
  const envelope = { protocol: CONTROLLER_PROTOCOL, version: CONTROLLER_VERSION,
    correlation_id: correlation(correlation_id ?? correlationId), status: 'ADVICE_READY',
    receipt: receipt(value), result: validateResult(result) };
  exactKeys(envelope, SUCCESS_KEYS);
  if (cleanup_outcome !== undefined) {
    Object.defineProperty(envelope, 'cleanup_outcome', {
      value: cleanup_outcome,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  return Object.freeze(envelope);
}
function buildFailureEnvelope(options = {}) {
  if (options.checkpoint?.version === 2) {
    return buildFailureEnvelopeV2(options);
  }
  const { correlation_id, correlationId, receipt: value, error, cleanup_outcome } = options;
  const envelope = { protocol: CONTROLLER_PROTOCOL, version: CONTROLLER_VERSION,
    correlation_id: correlation(correlation_id ?? correlationId), status: 'FAILED', receipt: receipt(value),
    error: serializeRoutingError(error) };
  exactKeys(envelope, FAILURE_KEYS);
  if (cleanup_outcome !== undefined) {
    Object.defineProperty(envelope, 'cleanup_outcome', {
      value: cleanup_outcome,
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  return Object.freeze(envelope);
}
function validateEnvelope(value) {
  if (value && value.version === 2) {
    return validateEnvelopeV2(value);
  }
  exactKeys(value, value?.status === 'ADVICE_READY' ? SUCCESS_KEYS : FAILURE_KEYS);
  if (value.protocol !== CONTROLLER_PROTOCOL || value.version !== CONTROLLER_VERSION
    || !UUID.test(value.correlation_id) || !Object.isFrozen(value) || !Object.isFrozen(value.receipt)) fail();
  receipt(value.receipt);
  if (value.status === 'ADVICE_READY') validateResult(value.result);
  else if (value.status !== 'FAILED') fail();
  return value;
}

module.exports = {
  CONTROLLER_PROTOCOL,
  CONTROLLER_VERSION,
  CONTROLLER_PROTOCOL_V2,
  CONTROLLER_VERSION_V2,
  FAILURE_KEYS,
  RECEIPT_KEYS,
  SUCCESS_KEYS,
  buildFailureEnvelope,
  buildSuccessEnvelope,
  buildFailureEnvelopeV2,
  buildSuccessEnvelopeV2,
  validateEnvelope,
  validateEnvelopeV2
};
