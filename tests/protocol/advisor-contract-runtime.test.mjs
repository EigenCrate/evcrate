import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  validateRouteTarget,
  validateWaitPolicy,
  validateHistoryPolicy,
  validateLegacyPolicy,
  validatePolicyV2,
  inspectPolicy,
  validateValidationResult,
  validateCheckpointV2,
  validateResultBodyV2,
  validateResultV2,
  validateReceiptV2,
  validateAttemptOutcome,
  validateEnvelopeV2,
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  AdvisorContractError,
  utf8Bytes,
  deepFreeze,
  CANDIDATE_BACKENDS,
  ADVISOR_BACKENDS,
  DECISION_KINDS,
  ATTEMPT_SLOTS,
  ATTEMPT_PHASES,
  TERMINAL_CLASSIFICATIONS,
  CLEANUP_OUTCOMES,
  AUDIT_STATUSES,
  OUTCOME_RESULTS,
  EXECUTION_STATUSES
} from '../../dist/protocol/advisor-contract-runtime.js';

const validFixtures = JSON.parse(readFileSync(
  new URL('../fixtures/advisor-contracts/valid-contracts.json', import.meta.url),
  'utf8'
));

const invalidFixtures = JSON.parse(readFileSync(
  new URL('../fixtures/advisor-contracts/invalid-contracts.json', import.meta.url),
  'utf8'
));

function computeDigest(checkpoint) {
  return createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');
}

test('runtime module contains no node:* imports in compiled distribution', () => {
  const code = readFileSync(
    new URL('../../dist/protocol/advisor-contract-runtime.js', import.meta.url),
    'utf8'
  );
  assert.equal(/(?:from\s+['"]node:|require\(['"]node:)/u.test(code), false);
  assert.equal(/(?:process\.env|process\.cwd|process\.exit)/u.test(code), false);
});

test('canonical constants and enums match contract specifications', () => {
  assert.deepEqual(CANDIDATE_BACKENDS, ['claude', 'codex', 'antigravity', 'pi', 'omp']);
  assert.deepEqual(ADVISOR_BACKENDS, CANDIDATE_BACKENDS);
  assert.deepEqual(DECISION_KINDS, ['direction', 'review', 'stuck', 'decision', 'reconcile']);
  assert.deepEqual(ATTEMPT_SLOTS, ['primary', 'backup']);
  assert.deepEqual(ATTEMPT_PHASES, ['preflight', 'model']);
  assert.deepEqual(TERMINAL_CLASSIFICATIONS, ['success', 'transient', 'fatal', 'cancelled', 'skipped']);
  assert.deepEqual(CLEANUP_OUTCOMES, ['confirmed', 'unconfirmed', 'not_needed']);
  assert.deepEqual(AUDIT_STATUSES, ['recorded', 'degraded', 'disabled']);
  assert.deepEqual(OUTCOME_RESULTS, ['resolved', 'unresolved', 'regressed', 'unknown']);
  assert.deepEqual(EXECUTION_STATUSES, ['started', 'ADVICE_READY', 'FAILED']);
});

test('valid fixtures pass all validators and return deep-frozen objects preserving keys', () => {
  const legPol = validateLegacyPolicy(validFixtures.policy_v1);
  assert.equal(Object.isFrozen(legPol), true);
  assert.equal(Object.isFrozen(legPol.advisor), true);

  const polV2 = validatePolicyV2(validFixtures.policy_v2);
  assert.equal(Object.isFrozen(polV2), true);
  assert.equal(Object.isFrozen(polV2.advisor.primary), true);

  const inspV2 = inspectPolicy(validFixtures.policy_v2);
  assert.equal(inspV2.legacy, false);
  assert.equal(inspV2.migrationRequired, false);

  const inspV1 = inspectPolicy(validFixtures.policy_v1);
  assert.equal(inspV1.legacy, true);
  assert.equal(inspV1.migrationRequired, true);

  const cp = validateCheckpointV2(validFixtures.checkpoint_v2);
  assert.equal(Object.isFrozen(cp), true);
  assert.deepEqual(Object.keys(cp), Object.keys(validFixtures.checkpoint_v2));

  const rb = validateResultBodyV2(validFixtures.result_body_v2);
  assert.equal(Object.isFrozen(rb), true);

  const res = validateResultV2(validFixtures.result_v2);
  assert.equal(Object.isFrozen(res), true);

  const rc = validateReceiptV2(validFixtures.receipt_v2);
  assert.equal(Object.isFrozen(rc), true);

  const att = validateAttemptOutcome(validFixtures.attempt_outcome);
  assert.equal(Object.isFrozen(att), true);

  const envReady = validateEnvelopeV2(validFixtures.envelope_ready);
  assert.equal(Object.isFrozen(envReady), true);
  assert.equal(envReady.status, 'ADVICE_READY');

  const envFailed = validateEnvelopeV2(validFixtures.envelope_failed);
  assert.equal(Object.isFrozen(envFailed), true);
  assert.equal(envFailed.status, 'FAILED');

  const exStarted = validateHistoryExecutionV1(validFixtures.execution_started, computeDigest);
  assert.equal(Object.isFrozen(exStarted), true);
  assert.equal(exStarted.status, 'started');

  const exReady = validateHistoryExecutionV1(validFixtures.execution_ready, computeDigest);
  assert.equal(Object.isFrozen(exReady), true);
  assert.equal(exReady.status, 'ADVICE_READY');

  const exFailed = validateHistoryExecutionV1(validFixtures.execution_failed, computeDigest);
  assert.equal(Object.isFrozen(exFailed), true);
  assert.equal(exFailed.status, 'FAILED');

  const out = validateHistoryOutcomeV1(validFixtures.outcome_v1);
  assert.equal(Object.isFrozen(out), true);
  assert.equal(out.outcome, 'resolved');
});

test('invalid fixtures throw AdvisorContractError with exact neutral code and pointer path', () => {
  const validators = {
    validateCheckpointV2,
    validatePolicyV2,
    validateHistoryExecutionV1
  };

  for (const [name, testCase] of Object.entries(invalidFixtures)) {
    const fn = validators[testCase.validator];
    assert.ok(fn, `Validator ${testCase.validator} must exist for test ${name}`);

    let thrown = null;
    try {
      if (testCase.useDigest) {
        fn(testCase.data, computeDigest);
      } else {
        fn(testCase.data);
      }
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown instanceof AdvisorContractError, `${name} must throw AdvisorContractError, got ${thrown}`);
    assert.equal(thrown.issue.code, testCase.expectedCode, `${name} expected code ${testCase.expectedCode}, got ${thrown.issue.code}`);
    assert.equal(thrown.issue.path, testCase.expectedPath, `${name} expected path ${testCase.expectedPath}, got ${thrown.issue.path}`);
    assert.equal(thrown.message.includes(testCase.expectedCode), true);
    // Ensure no raw input echo in error message
    assert.equal(thrown.message.includes('not-an-object'), false);
    assert.equal(thrown.message.includes('invalid_kind_value'), false);
  }
});

test('utf8Bytes correctly measures multi-byte characters', () => {
  assert.equal(utf8Bytes('abc'), 3);
  assert.equal(utf8Bytes('hé'), 3);
  assert.equal(utf8Bytes('€'), 3);
  assert.equal(utf8Bytes('😀'), 4);
});
