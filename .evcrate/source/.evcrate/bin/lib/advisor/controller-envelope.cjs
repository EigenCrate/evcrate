'use strict';

const { randomUUID } = require('node:crypto');
const { createRoutingError, serializeRoutingError } = require('./errors.cjs');
const { RESULT_KEYS } = require('./checkpoint-contract.cjs');

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
function buildSuccessEnvelope({ correlation_id, correlationId, receipt: value, result } = {}) {
  const envelope = { protocol: CONTROLLER_PROTOCOL, version: CONTROLLER_VERSION,
    correlation_id: correlation(correlation_id ?? correlationId), status: 'ADVICE_READY',
    receipt: receipt(value), result: validateResult(result) };
  exactKeys(envelope, SUCCESS_KEYS);
  return Object.freeze(envelope);
}
function buildFailureEnvelope({ correlation_id, correlationId, receipt: value, error } = {}) {
  const envelope = { protocol: CONTROLLER_PROTOCOL, version: CONTROLLER_VERSION,
    correlation_id: correlation(correlation_id ?? correlationId), status: 'FAILED', receipt: receipt(value),
    error: serializeRoutingError(error) };
  exactKeys(envelope, FAILURE_KEYS);
  return Object.freeze(envelope);
}
function validateEnvelope(value) {
  exactKeys(value, value?.status === 'ADVICE_READY' ? SUCCESS_KEYS : FAILURE_KEYS);
  if (value.protocol !== CONTROLLER_PROTOCOL || value.version !== CONTROLLER_VERSION
    || !UUID.test(value.correlation_id) || !Object.isFrozen(value) || !Object.isFrozen(value.receipt)) fail();
  receipt(value.receipt);
  if (value.status === 'ADVICE_READY') validateResult(value.result);
  else if (value.status !== 'FAILED') fail();
  return value;
}

module.exports = { CONTROLLER_PROTOCOL, CONTROLLER_VERSION, FAILURE_KEYS, RECEIPT_KEYS,
  SUCCESS_KEYS, buildFailureEnvelope, buildSuccessEnvelope, validateEnvelope };
