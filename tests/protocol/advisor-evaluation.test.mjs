import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  validateEvaluationDocument, validateEvaluationDocumentAsync,
  aggregateEvaluationGroups, computeComparisonKey, computeProvenanceGroupKey,
  AdvisorContractError
} from '../../dist/index.js';
import { validateHistoryExecutionV1 } from '../../dist/protocol/advisor-contract-runtime.js';

const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');
const fixDir = path.resolve('tests/fixtures/advisor-evaluations');
const validMixed = JSON.parse(fs.readFileSync(path.join(fixDir, 'valid-mixed.json'), 'utf8'));
const digestMismatch = JSON.parse(fs.readFileSync(path.join(fixDir, 'digest-mismatch.json'), 'utf8'));
const invalidObs = JSON.parse(fs.readFileSync(path.join(fixDir, 'invalid-observations.json'), 'utf8'));
const corpusNine = JSON.parse(fs.readFileSync(path.join(fixDir, 'corpus-nine-cases.json'), 'utf8'));

test('advisor-evaluation: validates valid-mixed.json with all response & score states', () => {
  const doc = validateEvaluationDocument(validMixed, { digestFn: sha256 });
  assert.equal(doc.protocol, 'evcrate-advisor-counsel-evaluation');
  assert.equal(doc.version, 1);
  assert.equal(doc.candidates.length, 2);
  assert.equal(doc.cases.length, 2);

  // Case 1, Cand 0: ADVICE_READY, human full score
  const c1o0 = doc.cases[0].observations[0];
  assert.equal(c1o0.response.status, 'ADVICE_READY');
  assert.equal(c1o0.score.provenance, 'human');
  assert.equal(c1o0.score.average_score, 4.4);
  assert.equal(c1o0.score.passed, true);

  // Case 1, Cand 1: ADVICE_READY, human partial score (1 null dim)
  const c1o1 = doc.cases[0].observations[1];
  assert.equal(c1o1.response.status, 'ADVICE_READY');
  assert.equal(c1o1.score.provenance, 'human');
  assert.equal(c1o1.score.average_score, null);
  assert.equal(c1o1.score.passed, null);

  // Case 2, Cand 0: FAILED, unscored
  const c2o0 = doc.cases[1].observations[0];
  assert.equal(c2o0.response.status, 'FAILED');
  assert.equal(c2o0.response.error.code, 'MODEL_TIMEOUT');
  assert.equal(c2o0.score, null);

  // Case 2, Cand 1: MISSING, automated full score
  const c2o1 = doc.cases[1].observations[1];
  assert.equal(c2o1.response.status, 'MISSING');
  assert.equal(c2o1.score.provenance, 'automated');
  assert.equal(c2o1.score.average_score, 1.0);
  assert.equal(c2o1.score.passed, false);
});

test('advisor-evaluation: async validator works with async digest function', async () => {
  const doc = await validateEvaluationDocumentAsync(validMixed, { digestFn: async (s) => sha256(s) });
  assert.equal(doc.evaluation_id, validMixed.evaluation_id);
});

test('advisor-evaluation: corpus-nine-cases fixture contains all 9 cases and zero oracle leaks', () => {
  const rawText = fs.readFileSync(path.join(fixDir, 'corpus-nine-cases.json'), 'utf8');
  assert.equal(rawText.includes('expected_mentor_response'), false, 'Oracle leak forbidden');

  const doc = validateEvaluationDocument(corpusNine, { digestFn: sha256 });
  assert.equal(doc.cases.length, 9);
  const caseIds = doc.cases.map(c => c.case_id);
  assert.ok(caseIds.includes('CASE-00-POSITIVE-CONTROL'));
  assert.ok(caseIds.includes('CASE-08-INCOMPLETE-CONTEXT'));
});

test('advisor-evaluation: rejects digest mismatch on rubric and case input', () => {
  assert.throws(
    () => validateEvaluationDocument(digestMismatch, { digestFn: sha256 }),
    (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_DIGEST_MISMATCH' && err.issue.path === '/rubric_digest'
  );

  const badInputDigest = JSON.parse(JSON.stringify(validMixed));
  badInputDigest.cases[0].input_digest = 'b'.repeat(64);
  assert.throws(
    () => validateEvaluationDocument(badInputDigest, { digestFn: sha256 }),
    (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_DIGEST_MISMATCH' && err.issue.path === '/cases/0/input_digest'
  );
});

test('advisor-evaluation: rejects invalid observation matrices', () => {
  assert.throws(() => validateEvaluationDocument(invalidObs), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_DUPLICATE_IDENTITY');

  const missingCand = JSON.parse(JSON.stringify(validMixed));
  missingCand.cases[0].observations.pop();
  assert.throws(() => validateEvaluationDocument(missingCand), (err) => err instanceof AdvisorContractError);

  const unknownCand = JSON.parse(JSON.stringify(validMixed));
  unknownCand.cases[0].observations[0].candidate_id = 'cand-unknown';
  assert.throws(() => validateEvaluationDocument(unknownCand), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_VALUE_INVALID');
});

test('advisor-evaluation: enforces score invariants and calculation rules', () => {
  const badAvg = JSON.parse(JSON.stringify(validMixed));
  badAvg.cases[0].observations[0].score.average_score = 4.99;
  assert.throws(() => validateEvaluationDocument(badAvg), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_VALUE_INVALID');

  const badPassed = JSON.parse(JSON.stringify(validMixed));
  badPassed.cases[0].observations[0].score.passed = false;
  assert.throws(() => validateEvaluationDocument(badPassed), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_VALUE_INVALID');

  const partialWithAvg = JSON.parse(JSON.stringify(validMixed));
  partialWithAvg.cases[0].observations[1].score.average_score = 4.0;
  assert.throws(() => validateEvaluationDocument(partialWithAvg), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_VALUE_INVALID');
});

test('advisor-evaluation: enforces strict schema bounds and unique identities', () => {
  const badProto = JSON.parse(JSON.stringify(validMixed));
  badProto.protocol = 'wrong-protocol';
  assert.throws(() => validateEvaluationDocument(badProto), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_VERSION_UNSUPPORTED');

  const badRunId = JSON.parse(JSON.stringify(validMixed));
  badRunId.run_id = 'not-a-uuid';
  assert.throws(() => validateEvaluationDocument(badRunId), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_VALUE_INVALID');

  const dupCand = JSON.parse(JSON.stringify(validMixed));
  dupCand.candidates[1].candidate_id = dupCand.candidates[0].candidate_id;
  assert.throws(() => validateEvaluationDocument(dupCand), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_DUPLICATE_IDENTITY');

  const dupCase = JSON.parse(JSON.stringify(validMixed));
  dupCase.cases[1].case_id = dupCase.cases[0].case_id;
  assert.throws(() => validateEvaluationDocument(dupCase), (err) => err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_DUPLICATE_IDENTITY');
});

test('advisor-evaluation: comparison grouping separates provenance and respects digest boundaries', () => {
  const groups = aggregateEvaluationGroups([validMixed]);
  assert.equal(groups.length, 2, '2 cases with distinct input digests form 2 groups');

  const g1 = groups[0];
  assert.equal(g1.key, computeComparisonKey(validMixed.rubric_digest, validMixed.cases[0].input_digest));
  assert.equal(g1.human_scores.length, 2);
  assert.equal(g1.automated_scores.length, 0);

  const g2 = groups[1];
  assert.equal(g2.human_scores.length, 0);
  assert.equal(g2.automated_scores.length, 1);
  assert.equal(g2.automated_scores[0].candidate_id, 'cand-omp-high');
  assert.equal(g2.automated_scores[0].average_score, 1.0);
  assert.equal(g2.automated_scores[0].pass_rate, 0.0);

  assert.equal(
    computeProvenanceGroupKey(validMixed.rubric_digest, validMixed.cases[0].input_digest, 'human'),
    `${validMixed.rubric_digest}:${validMixed.cases[0].input_digest}:human`
  );
});

test('advisor-evaluation: evaluation records are strictly rejected by history validation', () => {
  assert.throws(() => validateHistoryExecutionV1(validMixed), (err) => err instanceof AdvisorContractError);
});
