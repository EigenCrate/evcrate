'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const envelope = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/controller-envelope.cjs'));
const { createRoutingError } = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/errors.cjs'));
const { normalizeResult } = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/checkpoint-contract.cjs'));

const CHECKPOINT = Object.freeze({
  protocol: 'evcrate-advisor-checkpoint', version: 1, checkpoint: 'review:fixture',
  question: 'Should this change ship?', kind: 'review', task_or_phase: 'fixture',
  evidence: { terminal: 'none', files: [] }, changed_paths: [], prior_counsel: 'none', owner_disposition: 'none'
});

test('result normalization rejects common credential forms before envelope serialization', () => {
  for (const recommendation of ['Bearer secret-value', 'sk-proj-0123456789abcdef']) {
    assert.throws(
      () => normalizeResult({ recommendation }, { checkpoint: CHECKPOINT }),
      { code: 'PROTOCOL_INVALID' },
    );
  }
});

const RESULT = Object.freeze({
  protocol: 'evcrate-advisor-result', version: 1, checkpoint: 'review:fixture', status: 'ADVICE_READY',
  recommendation: 'Use the smallest safe change.', must_fix: [], cautions: [], assumptions: [],
  success_checks: [], unresolved_questions: []
});
const ID = '123e4567-e89b-12d3-a456-426614174000';

test('success envelope has the exact frozen controller shape', () => {
  const value = envelope.buildSuccessEnvelope({
    correlation_id: ID,
    receipt: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', adapter_version: '0.150.1', elapsed_ms: 7 },
    result: RESULT,
  });
  assert.deepEqual(Object.keys(value), ['protocol', 'version', 'correlation_id', 'status', 'receipt', 'result']);
  assert.deepEqual(Object.keys(value.receipt), ['backend', 'model', 'effort', 'controller_version', 'adapter_version', 'elapsed_ms']);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.receipt), true);
  assert.equal(envelope.validateEnvelope(value), value);
});

test('failure envelope serializes only the typed actionable error', () => {
  const value = envelope.buildFailureEnvelope({
    correlation_id: ID,
    receipt: { elapsed_ms: 2 },
    error: createRoutingError('ROUTE_SCHEMA_MIGRATION_REQUIRED'),
  });
  assert.deepEqual(Object.keys(value), ['protocol', 'version', 'correlation_id', 'status', 'receipt', 'error']);
  assert.deepEqual(value.error, {
    code: 'ROUTE_SCHEMA_MIGRATION_REQUIRED',
    category: 'config',
    action: 'Replace version 1 hosts with one version 1 advisor object containing backend, model, effort, and timeout_ms.',
    message: 'Global advisor policy requires migration from host routes',
  });
  assert.equal(Object.isFrozen(value.error), true);
  assert.equal(Object.isFrozen(value), true);
});
