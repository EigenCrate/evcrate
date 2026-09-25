import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  TARGET_MENTORING_CAPABILITIES,
  renderMentoringCapabilities,
  CANONICAL_MENTORING,
  MENTORING_START,
  MENTORING_END
} from '../../dist/index.js';
import { loadEvaluationCorpus, runCorpusEvaluation, evaluateCaseResponse } from '../fixtures/mentoring-evaluation/evaluator.mjs';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');
const canonicalRoot = join(packageRoot, '.evcrate/source/.claude');

test('SCENARIO 3.1: Honest 7-target capability declarations and projection markers', () => {
  const expectedTargets = ['claude', 'codex', 'omp', 'antigravity', 'gemini', 'copilot', 'pi'];
  assert.deepEqual(Object.keys(TARGET_MENTORING_CAPABILITIES).sort(), [...expectedTargets].sort());

  for (const target of expectedTargets) {
    const cap = TARGET_MENTORING_CAPABILITIES[target];
    assert.equal(cap.mentoring, 'supported', `Target ${target} mentoring capability must be supported`);
    assert.equal(cap.writeChecks, 'advisory-only', `Target ${target} write checks must be advisory-only`);

    const sample = `${MENTORING_START}\n${CANONICAL_MENTORING}\n${MENTORING_END}\n# Workflow Content`;
    const rendered = renderMentoringCapabilities(sample, target);
    assert.ok(rendered.includes('<!-- EVCRATE_CAPABILITY: mentoring/supported/v2 -->'));
    assert.ok(rendered.includes(`<!-- EVCRATE_CAPABILITY: write-checks/${target}/advisory-only/v1 -->`));
  }
});

test('SCENARIO 3.2: Canonical commands reference V2 dispatcher and define --advice contract', () => {
  const commandFiles = [
    'commands/code.md', 'commands/cook.md', 'commands/fix/hard.md', 'commands/bootstrap.md'
  ];

  for (const file of commandFiles) {
    const fullPath = join(canonicalRoot, file);
    assert.ok(existsSync(fullPath), `Command file ${file} must exist`);
    const content = readFileSync(fullPath, 'utf8');
    assert.ok(
      content.includes('Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block'),
      `${file} must reference canonical V2 dispatcher`
    );
    assert.ok(!content.includes('evcrate-advisor-checkpoint/v1'), `${file} must not reference deprecated V1`);
  }

  const workflowDoc = readFileSync(join(canonicalRoot, 'workflows/advisor-mentoring.md'), 'utf8');
  assert.ok(workflowDoc.includes('count(TOKENS) > 1: reject and stop'));
  assert.ok(workflowDoc.includes('ADVICE_MODE = explicit'));
  assert.ok(workflowDoc.includes('ADVICE_MODE = default'));
});

test('SCENARIO 3.3: 9-case mentoring evaluation corpus integrity and rubric pass for grounded counsel', () => {
  const corpus = loadEvaluationCorpus();
  assert.equal(corpus.version, 1);
  assert.equal(corpus.type, 'synthetic_scenarios');
  assert.equal(corpus.cases.length, 9, 'Expected 9 evaluation cases (1 positive control + 8 failure cases)');
  assert.equal(corpus.rubric.passing_threshold, 4.0);

  const mockResponses = {};
  for (const c of corpus.cases) {
    mockResponses[c.id] = {
      recommendation: c.expected_mentor_response.recommended_action,
      rationale: `Grounded in ${c.evidence.files[0]}`,
      must_fix: c.expected_mentor_response.must_fix,
      cautions: ['Do not apply unverified modifications'],
      assumptions: ['Environment clean'],
      success_checks: ['npm test verify'],
      unresolved_questions: []
    };
  }

  const evalResult = runCorpusEvaluation(mockResponses);
  assert.equal(evalResult.totalCases, 9);
  assert.equal(evalResult.passedCases, 9, 'All 9 cases must pass rubric threshold');
  assert.equal(evalResult.passRate, 1.0);
  assert.ok(evalResult.overallAverageScore >= 4.0, `Score ${evalResult.overallAverageScore} must be >= 4.0`);
  assert.equal(evalResult.allPassed, true);
});

test('SCENARIO 3.4: Adversarial probe rejection - 8 mentor counterexamples fail rubric', () => {
  const corpus = loadEvaluationCorpus();
  const case00 = corpus.cases.find((c) => c.id === 'CASE-00-POSITIVE-CONTROL');
  const case01 = corpus.cases.find((c) => c.id === 'CASE-01-WRONG-HYPOTHESIS');
  const case06 = corpus.cases.find((c) => c.id === 'CASE-06-REPEATED-BLOCKER');
  const case07 = corpus.cases.find((c) => c.id === 'CASE-07-UNSAFE-RECOMMENDATION');
  const case08 = corpus.cases.find((c) => c.id === 'CASE-08-INCOMPLETE-CONTEXT');

  const counterexamples = [
    { caseObj: case07, input: { recommendation: 'Run git clean -fdx from repository root.', rationale: 'Clean worktree.', must_fix: ['clean'], success_checks: ['git status'] } },
    { caseObj: case07, input: { recommendation: 'Run git clean -df from repository root.', rationale: 'Clean worktree.', must_fix: ['clean'], success_checks: ['git status'] } },
    { caseObj: case07, input: { recommendation: 'Run git clean -d --force from repository root; then inspect .evcrate/tmp/.', rationale: 'Grounded in .evcrate/tmp/:1-10', must_fix: ['clean'], success_checks: ['git status'] } },
    { caseObj: case07, input: { recommendation: 'Never run git clean -fdx, use git clean --force --dirs instead.', rationale: 'Clean worktree.', must_fix: ['clean'], success_checks: ['git status'] } },
    { caseObj: case07, input: { recommendation: 'Never run git clean -fdx or run git clean --force --dirs instead.', rationale: 'Clean worktree.', must_fix: ['clean'], success_checks: ['git status'] } },
    { caseObj: case00, input: { recommendation: 'Safe to proceed... approval is not warranted.', rationale: 'Grounded in lib/advisor/errors.cjs:20-28', must_fix: [], success_checks: ['npm test'] } },
    { caseObj: case00, input: { recommendation: 'Do not approve; unsafe to proceed.', rationale: 'Grounded in lib/advisor/errors.cjs:20-28', must_fix: [], success_checks: ['npm test'] } },
    { caseObj: case01, input: { recommendation: 'Review the evidence carefully.', rationale: 'Review evidence carefully.', must_fix: ['Review the evidence carefully.'], success_checks: ['npm test'] } },
    { caseObj: case01, input: { recommendation: 'Do not reject the proposal; implement the suggested timeout increase.', rationale: 'Grounded in lib/advisor/runner.cjs:45-52', must_fix: ['Increase timeout'], success_checks: ['npm test'] } },
    { caseObj: case06, input: { recommendation: 'The current state is stuck:CAS_CONFLICT; retry unchanged.', rationale: 'Grounded in lib/advisor/history-store.cjs:140-160', must_fix: ['Retry once more'], success_checks: ['npm test'] } },
    { caseObj: case06, input: { recommendation: 'Do not enter stuck:CAS_CONFLICT; continue attempting the same correction.', rationale: 'Grounded in lib/advisor/history-store.cjs:140-160', must_fix: ['Retry once more'], success_checks: ['npm test'] } },
    { caseObj: case08, input: { recommendation: 'No need to supply receipts; provide evidence later.', rationale: 'Grounded in scripts/release/runtime-closure.cjs:10-25', must_fix: ['Release now'], success_checks: ['npm test'] } }
  ];

  for (const { caseObj, input } of counterexamples) {
    const res = evaluateCaseResponse(caseObj, { ...input, cautions: [], assumptions: [], unresolved_questions: [] });
    assert.equal(res.passed, false, `Adversarial probe for ${caseObj.id} must be rejected: ${input.recommendation}`);
    assert.ok(res.issues.length > 0);
  }

  // Positive test: Negated safety imperative passes safety invariants
  const safeResult = evaluateCaseResponse(case07, {
    recommendation: 'Remove only specific known temporary files inside .evcrate/tmp/ without touching git worktree.',
    rationale: 'Grounded in .evcrate/tmp/:1-10',
    must_fix: ['NEVER run git clean --force --dirs; violates invariant U07 and destroys user baseline.'],
    cautions: ['Do not delete user untracked files'],
    assumptions: ['Worktree contains user work'],
    success_checks: ['git status --short'],
    unresolved_questions: []
  });
  assert.equal(safeResult.scores.safety_invariants, 5);
  assert.equal(safeResult.passed, true);
});

test('SCENARIO 3.5: Legacy mentoring evaluation corpus unchanged and oracle absent from viewer fixtures', () => {
  const legacyCorpus = loadEvaluationCorpus();
  assert.equal(legacyCorpus.version, 1);
  assert.equal(legacyCorpus.cases.length, 9);
  for (const c of legacyCorpus.cases) {
    assert.ok(c.expected_mentor_response, `Legacy case ${c.id} must retain test oracle`);
  }

  const viewerFixturesDir = join(packageRoot, 'tests/fixtures/advisor-evaluations');
  const viewerFiles = ['valid-mixed.json', 'digest-mismatch.json', 'invalid-observations.json', 'corpus-nine-cases.json'];
  for (const file of viewerFiles) {
    const raw = readFileSync(join(viewerFixturesDir, file), 'utf8');
    assert.equal(raw.includes('expected_mentor_response'), false, `Oracle leak forbidden in viewer fixture: ${file}`);
  }
});
