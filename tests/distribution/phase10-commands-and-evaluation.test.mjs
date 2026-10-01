import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import {
  TARGET_MENTORING_CAPABILITIES,
  renderMentoringCapabilities,
  CANONICAL_MENTORING,
  MENTORING_START,
  MENTORING_END
} from '../../dist/index.js';
import { loadEvaluationCorpus, runCorpusEvaluation, evaluateCaseResponse } from '../fixtures/mentoring-evaluation/evaluator.mjs';
import { setupTestEnvironment, defaultPolicyV2 } from './phase10-test-helpers.mjs';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');

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

test('SCENARIO 3.2: CLI no-change close accepts cautions only and rejects must-fix or unresolved counsel', (t) => {
  const scenarios = [
    {
      name: 'cautions-only',
      counsel: {
        recommendation: 'Proceed without additional edits.',
        must_fix: [], cautions: ['Retain the captured review report.'], unresolved_questions: []
      },
      closes: true
    },
    {
      name: 'must-fix',
      counsel: {
        recommendation: 'A correction is still required.',
        must_fix: ['Change the reviewed implementation.'], cautions: [], unresolved_questions: []
      },
      closes: false
    },
    {
      name: 'unresolved-question',
      counsel: {
        recommendation: 'Do not close until the question is answered.',
        must_fix: [], cautions: [], unresolved_questions: ['Which compatibility target is required?']
      },
      closes: false
    }
  ];

  for (const scenario of scenarios) {
    const env = setupTestEnvironment(`evcrate-p10-${scenario.name}-`);
    t.after(env.cleanup);
    env.writePolicy(defaultPolicyV2());
    mkdirSync(join(env.cwd, 'evidence'), { recursive: true });
    const sourcePath = 'evidence/no-change.mjs';
    const reportPath = 'evidence/terminal-report.json';
    const command = `node ${sourcePath}`;
    writeFileSync(join(env.cwd, sourcePath), "process.stdout.write('no-change validation passed\\n');\n");
    const runNode = () => spawnSync(process.execPath, [sourcePath], {
      cwd: env.cwd, env: env.env, encoding: 'utf8', timeout: 10000
    });
    const firstRun = runNode();
    assert.equal(firstRun.status, 0, firstRun.stderr);
    assert.equal(firstRun.stdout, 'no-change validation passed\n');
    const validation = {
      suite: 'node-output', command, status: 'passed', passed: 1, failed: 0,
      details: firstRun.stdout.trim()
    };
    writeFileSync(join(env.cwd, reportPath), `${JSON.stringify(validation)}\n`);

    const digest = (path) => createHash('sha256').update(readFileSync(join(env.cwd, path))).digest('hex');
    const taskRunId = randomUUID();
    const task = {
      goal: `Advice-mode no-change case: ${scenario.name}`,
      non_goals: [], authorized_paths: [],
      scope_rationale: 'This scenario permits no implementation edits.',
      invariants: ['Do not invent changed paths.'],
      success_criteria: ['The real Node validation command passes.']
    };
    const request = (operation, expectedRevision, payload = {}) => ({
      protocol: 'evcrate-advisor-state', version: 1, operation, task_run_id: taskRunId,
      operation_id: operation === 'get' ? null : randomUUID(),
      expected_revision: operation === 'get' ? null : expectedRevision,
      payload
    });
    const stateCall = (operation, expectedRevision, payload = {}) => {
      const result = env.invoke(['state', operation], request(operation, expectedRevision, payload));
      assert.equal(result.status, 0, `${operation}: ${result.stdout} ${result.stderr}`);
      return result.json;
    };
    env.setFakeCodexState({
      finalCount: 0, calls: [],
      returnJson: JSON.stringify({
        ...scenario.counsel,
        rationale: `Fixture-backed counsel for ${scenario.name}.`,
        assumptions: [], success_checks: [command]
      })
    });
    const baselinePaths = [sourcePath, reportPath].sort();
    const initialized = stateCall('init', 0, {
      phase_id: 'phase-10-no-change', task, baseline_paths: baselinePaths
    }).state;
    assert.deepEqual(initialized.initial_baseline.map(({ path }) => path), baselinePaths);
    const files = baselinePaths.map((path) => {
      const excerpt = readFileSync(join(env.cwd, path), 'utf8').trim();
      return { path, excerpt, digest: digest(path) };
    });
    const checkpoint = {
      protocol: 'evcrate-advisor-checkpoint', version: 2,
      task_run_id: taskRunId, checkpoint_id: `no-change-${scenario.name}`,
      phase_id: 'phase-10-no-change', task_revision: initialized.task_revision,
      evidence_revision: initialized.evidence_revision, checkpoint: `review:no-change-${scenario.name}`,
      kind: 'review', question: 'Can this advice be accepted without edits?',
      task, proposal: { next_action: 'Close only if advice permits no-change.', rationale: 'No writable paths are authorized.', intended_changed_paths: [] },
      evidence: {
        summary: 'Source output and terminal report were created before baseline capture.',
        files, validation_results: [validation], artifacts: []
      },
      prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
    };
    const reservation = stateCall('checkpoint', initialized.task_revision, { checkpoint });
    const advice = env.invoke([], checkpoint);
    assert.equal(advice.status, 0, `${advice.stdout} ${advice.stderr}`);
    assert.equal(advice.json.status, 'ADVICE_READY');
    let active = stateCall('get').state;
    assert.equal(active.last_terminal.has_concerns, !scenario.closes);
    const disposition = {
      consultation_id: reservation.consultation_id,
      evidence_revision: active.evidence_revision,
      action: 'accept',
      rationale: 'Accept counsel but do not invent implementation changes.',
      correction: null
    };
    active = stateCall('disposition', active.task_revision, disposition).state;

    const finalRun = runNode();
    assert.equal(finalRun.status, 0, finalRun.stderr);
    assert.equal(finalRun.stdout, 'no-change validation passed\n');
    const outcome = env.invoke(['state', 'outcome'], request('outcome', active.task_revision, {
      consultation_id: reservation.consultation_id, action_id: null, episode_id: null,
      result: 'resolved',
      validation: { ...validation, details: finalRun.stdout.trim() },
      actual_changed_paths: []
    }));
    if (scenario.closes) {
      assert.equal(outcome.status, 0, `${outcome.stdout} ${outcome.stderr}`);
      active = outcome.json.state;
      assert.equal(active.gate_status, 'open');
      assert.deepEqual(active.outcome.actual_changed_paths, []);
      const complete = stateCall('complete', active.task_revision);
      assert.equal(complete.state.gate_status, 'completed');
    } else {
      assert.notEqual(outcome.status, 0, `${scenario.name} must not close as a no-change outcome`);
      assert.equal(outcome.json.error.code, 'STATE_GATE_BLOCKED');
      active = stateCall('get').state;
      assert.notEqual(active.gate_status, 'open');
      const complete = env.invoke(['state', 'complete'], request('complete', active.task_revision));
      assert.notEqual(complete.status, 0, `${scenario.name} must keep completion blocked`);
      assert.equal(complete.json.error.code, 'STATE_GATE_BLOCKED');
    }
  }
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
