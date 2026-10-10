import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { setupTestEnvironment, defaultPolicyV2 } from '../distribution/phase10-test-helpers.mjs';
import {
  createProjectionBuildContext,
  createStagedRoot,
  getProjectionAdapter,
  loadTargetManifestRegistry,
  renderMentoringCapabilities,
  TARGET_MENTORING_CAPABILITIES,
  CANONICAL_MENTORING,
  MENTORING_START,
  MENTORING_END
} from '../../dist/index.js';

const repository = process.cwd();
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const canonicalRoot = join(repository, '.evcrate/source/.claude');
const CLI = join(repository, '.evcrate/source/.evcrate/bin/evcrate-advisor');
const FAKE_CODEX = join(repository, 'tests/advisor-controller/fixtures/fake-codex.cjs');


test('renderMentoringCapabilities rejects malformed or invalid inputs', () => {
  const isInvalid = (err) => err?.code === 'VALIDATION_INVALID';
  assert.throws(() => renderMentoringCapabilities('no markers here', 'codex'), isInvalid);
  assert.throws(() => renderMentoringCapabilities(`${MENTORING_START}\ninvalid\n${MENTORING_END}`, 'codex'), isInvalid);
  assert.throws(() => renderMentoringCapabilities(`${MENTORING_START}\n${CANONICAL_MENTORING}\n${MENTORING_END}`, 'unknown-target'), isInvalid);
  assert.throws(() => renderMentoringCapabilities(`${MENTORING_START}\n${CANONICAL_MENTORING}\n${MENTORING_END}\n${MENTORING_START}`, 'codex'), isInvalid);
});

test('caller lifecycle captures settled evidence, retains one run through finalization, and seals the delivered snapshot', (t) => {
  const env = setupTestEnvironment('evcrate-phase8-caller-lifecycle-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());

  for (const directory of ['src', 'contracts', 'reports', 'artifacts', 'scripts', 'docs']) {
    mkdirSync(join(env.cwd, directory), { recursive: true });
  }
  const taskRunId = randomUUID();
  const task = {
    goal: 'Implement and review the advice-mode change',
    non_goals: ['Modify the advisor controller'],
    authorized_paths: ['src/answer.mjs', 'docs/final.md', 'reports/final-report.json'],
    scope_rationale: 'Only implementation and planned final deliverables are writable.',
    invariants: ['Keep cited contracts and validation artifacts read-only.', 'Retain the active run across reviews.'],
    success_criteria: ['Node validation passes', 'Final selected outputs are recorded before completion']
  };
  const sourcePath = 'src/answer.mjs';
  const sourceCommand = `node ${sourcePath}`;
  const finalCommand = 'node scripts/verify-final.mjs';
  const readOnlyPaths = [
    'contracts/advice-contract.txt',
    'review-terminal.md',
    'scripts/verify-final.mjs',
    'artifacts/node-validation.json'
  ];

  writeFileSync(join(env.cwd, sourcePath), "process.stdout.write('initial implementation\\n');\n");
  writeFileSync(join(env.cwd, 'contracts/advice-contract.txt'), 'Only authorized paths may be changed.\\n');
  writeFileSync(join(env.cwd, 'scripts/verify-final.mjs'), [
    "import { readFileSync } from 'node:fs';",
    "import { execFileSync } from 'node:child_process';",
    "const expected = ['docs/final.md', 'reports/final-report.json', 'src/answer.mjs'];",
    "const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim().split('\\n').sort();",
    "if (JSON.stringify(staged) !== JSON.stringify(expected)) throw new Error('selected staged paths differ');",
    "if (readFileSync('docs/final.md', 'utf8') !== '# Final implementation\\n') throw new Error('final document differs');",
    "const report = JSON.parse(readFileSync('reports/final-report.json', 'utf8'));",
    "if (report.status !== 'finalization-settled' || report.controller_completion !== 'pending') throw new Error('report overstates completion');",
    "process.stdout.write('final snapshot verified\\n');"
  ].join('\n') + '\n');

  function executeNode(args) {
    const result = spawnSync(process.execPath, args, {
      cwd: env.cwd, env: env.env, encoding: 'utf8', timeout: 10000
    });
    assert.equal(result.error, undefined);
    return result;
  }
  function validation(suite, command, result) {
    const passed = result.status === 0;
    return {
      suite, command, status: passed ? 'passed' : 'failed',
      passed: passed ? 1 : 0, failed: passed ? 0 : 1,
      details: passed ? result.stdout.trim() || null : (result.stderr || result.stdout).trim().slice(0, 4096) || 'validation failed'
    };
  }
  const hashText = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
  const readEvidence = (path) => {
    const content = readFileSync(join(env.cwd, path), 'utf8');
    return { path, excerpt: content.trim(), digest: hashText(content) };
  };
  const makeCheckpoint = ({ taskRevision, evidenceRevision, checkpointId, name, kind = 'review', question, changedPaths, prior, validationResults }) => ({
    protocol: 'evcrate-advisor-checkpoint', version: 2,
    task_run_id: taskRunId, checkpoint_id: checkpointId, phase_id: 'advice-mode-lifecycle',
    task_revision: taskRevision, evidence_revision: evidenceRevision,
    checkpoint: name, kind, question, task,
    proposal: {
      next_action: 'Apply the bounded action selected from the advice.',
      rationale: 'The proposal follows the supplied evidence and remains within authorized paths.',
      intended_changed_paths: changedPaths
    },
    evidence: {
      summary: 'Implementation and terminal validation evidence are settled before the review reservation.',
      files: [sourcePath, 'review-terminal.md', 'contracts/advice-contract.txt', 'scripts/verify-final.mjs'].map(readEvidence),
      validation_results: validationResults,
      artifacts: [{
        id: 'node-source-validation',
        path: 'artifacts/node-validation.json',
        digest: hashText(readFileSync(join(env.cwd, 'artifacts/node-validation.json'), 'utf8')),
        description: 'Actual Node source command output recorded before capture.'
      }]
    },
    prior
  });
  const stateRequest = (operation, expectedRevision, payload = {}) => ({
    protocol: 'evcrate-advisor-state', version: 1, operation, task_run_id: taskRunId,
    operation_id: operation === 'get' ? null : randomUUID(),
    expected_revision: operation === 'get' ? null : expectedRevision,
    payload
  });
  const callState = (operation, expectedRevision, payload = {}) => {
    const result = env.invoke(['state', operation], stateRequest(operation, expectedRevision, payload));
    assert.equal(result.status, 0, `${operation}: ${result.stdout} ${result.stderr}`);
    return result.json;
  };

  // Fresh caller: perform implementation validation and write its terminal report before capturing any paths.
  const initialRun = executeNode([sourcePath]);
  assert.equal(initialRun.status, 0, initialRun.stderr);
  assert.equal(initialRun.stdout, 'initial implementation\n');
  const initialValidation = validation('node-output', sourceCommand, initialRun);
  writeFileSync(join(env.cwd, 'review-terminal.md'), `Terminal validation report\n${JSON.stringify(initialValidation)}\n`);
  writeFileSync(join(env.cwd, 'artifacts/node-validation.json'), `${JSON.stringify({
    command: sourceCommand, status: initialValidation.status, stdout: initialRun.stdout
  })}\n`);
  assert.equal(existsSync(join(env.cwd, 'review-terminal.md')), true);
  assert.equal(existsSync(join(env.cwd, 'artifacts/node-validation.json')), true);
  const baselinePaths = [...new Set([...task.authorized_paths, ...readOnlyPaths])].sort();

  assert.equal(new Set(baselinePaths).size, baselinePaths.length);
  assert.ok(task.authorized_paths.every((path) => baselinePaths.includes(path)));
  assert.ok(readOnlyPaths.every((path) => baselinePaths.includes(path)));
  const initialState = callState('init', 0, {
    phase_id: 'advice-mode-lifecycle', task, baseline_paths: baselinePaths
  }).state;
  assert.equal(initialState.task_run_id, taskRunId);
  assert.equal(initialState.task_revision, 1);
  assert.deepEqual(initialState.initial_baseline.map(({ path }) => path), baselinePaths);
  assert.ok(readOnlyPaths.every((path) => !initialState.scope.authorized_paths.includes(path)));
  assert.ok(readOnlyPaths.every((path) => initialState.initial_baseline.find((record) => record.path === path)?.status === 'file'));
  assert.equal(initialState.initial_baseline.find((record) => record.path === 'docs/final.md')?.status, 'missing');
  assert.equal(initialState.initial_baseline.find((record) => record.path === 'reports/final-report.json')?.status, 'missing');

  const firstCheckpoint = makeCheckpoint({
    taskRevision: initialState.task_revision, evidenceRevision: initialState.evidence_revision,
    checkpointId: 'initial-direction', name: 'direction:implementation', kind: 'direction',
    question: 'Does the settled implementation need a bounded correction?',
    changedPaths: [sourcePath],
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null },
    validationResults: [initialValidation]
  });
  const firstReservation = callState('checkpoint', initialState.task_revision, { checkpoint: firstCheckpoint });
  const firstConsultationId = firstReservation.consultation_id;
  assert.ok(firstConsultationId);
  env.setFakeCodexState({
    finalCount: 0, calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Replace the initial output with the corrected implementation.',
      rationale: 'The captured Node result identifies the bounded change.',
      must_fix: ['Change the implementation output.'], cautions: [], assumptions: [],
      success_checks: [sourceCommand], unresolved_questions: []
    })
  });
  const firstAdvice = env.invoke([], firstCheckpoint);
  assert.equal(firstAdvice.status, 0, `${firstAdvice.stdout} ${firstAdvice.stderr}`);
  assert.equal(firstAdvice.json.status, 'ADVICE_READY');
  const firstCounsel = firstAdvice.json.result;
  let active = callState('get').state;
  const firstDisposition = {
    consultation_id: firstConsultationId, evidence_revision: active.evidence_revision,
    action: 'accept', rationale: 'Apply the bounded implementation correction.',
    correction: { action_id: randomUUID(), episode_id: 'implementation-output', validation_command: sourceCommand }
  };
  active = callState('disposition', active.task_revision, firstDisposition).state;

  // Record disposition before changing the authorized implementation; validate the real Node output.
  writeFileSync(join(env.cwd, sourcePath), "process.stdout.write('corrected implementation\\n');\n");
  const correctedRun = executeNode([sourcePath]);
  assert.equal(correctedRun.status, 0, correctedRun.stderr);
  assert.equal(correctedRun.stdout, 'corrected implementation\n');
  const correctedValidation = validation('node-output', sourceCommand, correctedRun);
  const finalValidationPending = {
    suite: 'final-snapshot', command: finalCommand, status: 'skipped', passed: 0, failed: 0,
    details: 'Final documentation and report are pending before snapshot validation.'
  };
  const firstOutcome = {
    consultation_id: firstConsultationId, action_id: firstDisposition.correction.action_id,
    episode_id: firstDisposition.correction.episode_id, result: 'resolved',
    validation: correctedValidation, actual_changed_paths: [sourcePath]
  };
  active = callState('outcome', active.task_revision, firstOutcome).state;
  assert.equal(active.task_run_id, taskRunId);
  assert.equal(active.phase_id, 'advice-mode-lifecycle');
  assert.equal(active.evidence_revision, 1);
  assert.equal(active.outcome.correction_number, 1);
  assert.equal(active.correction_count, 0);
  assert.ok(active.operation_ledger.some((entry) =>
    entry.operation === 'outcome' && entry.consultation_id === firstConsultationId
      && entry.action_id === firstDisposition.correction.action_id));
  assert.equal(active.current_baseline.find((record) => record.path === sourcePath)?.digest, hashText(readFileSync(join(env.cwd, sourcePath), 'utf8')));

  const firstDispositionRecord = JSON.stringify(firstDisposition);
  const firstOutcomeRecord = JSON.stringify(firstOutcome);
  const secondPrior = {
    prior_consultation_id: firstConsultationId,
    prior_counsel: JSON.stringify(firstCounsel),
    prior_disposition: firstDispositionRecord,
    observed_outcome: firstOutcomeRecord
  };
  const secondCheckpoint = makeCheckpoint({
    taskRevision: active.task_revision, evidenceRevision: active.evidence_revision,
    checkpointId: 'finalization-review', name: 'review:finalization',
    question: 'Are the final documentation and report ready to be delivered?',
    changedPaths: ['docs/final.md', 'reports/final-report.json', sourcePath],
    prior: secondPrior, validationResults: [correctedValidation, finalValidationPending]
  });
  const secondReservation = callState('checkpoint', active.task_revision, { checkpoint: secondCheckpoint });
  const secondConsultationId = secondReservation.consultation_id;
  assert.notEqual(secondConsultationId, firstConsultationId);
  assert.equal(secondCheckpoint.task_run_id, firstCheckpoint.task_run_id);
  assert.equal(secondCheckpoint.phase_id, firstCheckpoint.phase_id);
  assert.equal(secondCheckpoint.task_revision, active.task_revision);
  assert.deepEqual(secondCheckpoint.prior, {
    prior_consultation_id: firstConsultationId,
    prior_counsel: JSON.stringify(firstCounsel),
    prior_disposition: firstDispositionRecord,
    observed_outcome: firstOutcomeRecord
  });
  const providerState = JSON.parse(readFileSync(join(env.home, '.evcrate/fake-codex-state.json'), 'utf8'));
  env.setFakeCodexState({
    ...providerState,
    returnJson: JSON.stringify({
      recommendation: 'Create and stage the final documentation and report before recording the final outcome.',
      rationale: 'The active run retains its prior advice and corrected implementation baseline.',
      must_fix: ['Deliver the planned documentation and final report.'], cautions: [], assumptions: [],
      success_checks: [finalCommand], unresolved_questions: []
    })
  });
  const secondAdvice = env.invoke([], secondCheckpoint);
  assert.equal(secondAdvice.status, 0, `${secondAdvice.stdout} ${secondAdvice.stderr}`);
  assert.equal(secondAdvice.json.status, 'ADVICE_READY');
  active = callState('get').state;
  assert.equal(active.task_run_id, taskRunId);
  assert.equal(active.project_id, initialState.project_id);
  assert.equal(active.phase_id, initialState.phase_id);
  assert.equal(active.last_consultation_id, secondConsultationId);
  const secondDisposition = {
    consultation_id: secondConsultationId, evidence_revision: active.evidence_revision,
    action: 'accept', rationale: 'Create and validate the planned final outputs.',
    correction: { action_id: randomUUID(), episode_id: 'final-deliverables', validation_command: finalCommand }
  };
  active = callState('disposition', active.task_revision, secondDisposition).state;

  // Final documentation, report, and their selected index identities settle before outcome/completion.
  const finalDocument = '# Final implementation\n';
  const finalReport = `${JSON.stringify({
    status: 'finalization-settled', controller_completion: 'pending',
    source_output: correctedRun.stdout.trim()
  })}\n`;
  writeFileSync(join(env.cwd, 'docs/final.md'), finalDocument);
  writeFileSync(join(env.cwd, 'reports/final-report.json'), finalReport);
  const stage = spawnSync('git', ['add', '--', sourcePath, 'docs/final.md', 'reports/final-report.json'], {
    cwd: env.cwd, env: env.env, encoding: 'utf8'
  });
  assert.equal(stage.status, 0, stage.stderr);
  const finalRun = executeNode(['scripts/verify-final.mjs']);
  assert.equal(finalRun.status, 0, finalRun.stderr);
  assert.equal(finalRun.stdout, 'final snapshot verified\n');
  const finalValidation = validation('final-snapshot', finalCommand, finalRun);
  const finalOutcome = {
    consultation_id: secondConsultationId, action_id: secondDisposition.correction.action_id,
    episode_id: secondDisposition.correction.episode_id, result: 'resolved',
    validation: finalValidation,
    actual_changed_paths: ['docs/final.md', 'reports/final-report.json', sourcePath]
  };
  active = callState('outcome', active.task_revision, finalOutcome).state;
  assert.equal(active.evidence_revision, 2);
  assert.deepEqual(active.outcome.actual_changed_paths, finalOutcome.actual_changed_paths);
  const initialGitIdentity = new Map(initialState.initial_baseline.map((record) => [record.path, record.git]));
  for (const path of finalOutcome.actual_changed_paths) {
    const record = active.current_baseline.find((item) => item.path === path);
    assert.equal(record?.status, 'file');
    assert.ok(record?.git?.identity, `${path} must have its selected index identity captured`);
    assert.notDeepEqual(record.git, initialGitIdentity.get(path), `${path} selected Git identity must advance`);
    assert.notEqual(record?.git?.status, '  ', `${path} index transition must be in the final baseline`);
  }
  assert.equal(active.current_baseline.find((record) => record.path === 'docs/final.md')?.digest, hashText(finalDocument));
  assert.equal(active.current_baseline.find((record) => record.path === 'reports/final-report.json')?.digest, hashText(finalReport));

  const deliveredReport = readFileSync(join(env.cwd, 'reports/final-report.json'), 'utf8');
  const complete = callState('complete', active.task_revision);
  assert.equal(complete.state.gate_status, 'completed');
  assert.equal(complete.state.task_run_id, taskRunId);
  assert.equal(complete.state.last_consultation_id, secondConsultationId);
  assert.equal(readFileSync(join(env.cwd, 'reports/final-report.json'), 'utf8'), deliveredReport);
});

test('state CLI executes real lifecycle Path A (bounded correction) with exact transitions 1 -> 2 -> 4 -> 5 -> 6 -> completed', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-phase8-path-a-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const home = join(root, 'home');
  const cwd = join(root, 'project');
  const bin = join(root, 'bin');
  for (const dir of [home, cwd, bin, join(home, '.evcrate'), join(cwd, '.evcrate')]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(join(cwd, 'source.txt'), 'initial user work\n');
  spawnSync('git', ['init'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  spawnSync('git', ['add', 'source.txt'], { cwd });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd });

  symlinkSync(FAKE_CODEX, join(bin, 'codex'));

  const policy = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
  writeFileSync(join(home, '.evcrate/advisor-routing.json'), JSON.stringify(policy), { mode: 0o600 });

  const providerState = join(home, '.evcrate/fake-codex-state.json');
  writeFileSync(providerState, JSON.stringify({
    finalCount: 0,
    calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Apply the bounded correction.',
      rationale: 'Relevant evidence is sufficient.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['Run npm test'],
      unresolved_questions: []
    })
  }), { mode: 0o600 });

  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: root, PATH: `${bin}${delimiter}${process.env.PATH}` };
  delete env.EVCRATE_ADVISOR_ACTIVE;
  delete env.EVCRATE_ADVISOR_DEPTH;

  const taskRunId = randomUUID();
  const task = {
    goal: 'Phase 08 Path A test',
    non_goals: ['Unrelated changes'],
    authorized_paths: ['source.txt'],
    scope_rationale: 'Owned task boundary',
    invariants: ['Preserve user work'],
    success_criteria: ['Validation passes']
  };

  function invoke(args, input) {
    const res = spawnSync(process.execPath, [CLI, ...args], {
      cwd, env, input: JSON.stringify(input), encoding: 'utf8', timeout: 15000
    });
    assert.equal(res.error, undefined);
    assert.equal(res.status, 0, `CLI ${args.join(' ')} failed: ${res.stdout} ${res.stderr}`);
    return JSON.parse(res.stdout.trim().split('\n')[0]);
  }

  // 1. init (revision 0 -> 1)
  const initRes = invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-08', task, baseline_paths: ['source.txt'] }
  });
  assert.equal(initRes.status, 'STATE_READY');
  assert.equal(initRes.state.task_revision, 1);

  // 2. checkpoint reservation (revision 1 -> 2)
  const checkpoint = {
    protocol: 'evcrate-advisor-checkpoint', version: 2,
    task_run_id: taskRunId, checkpoint_id: 'checkpoint-1', phase_id: 'phase-08',
    task_revision: 1, evidence_revision: 0,
    checkpoint: 'review:step-4', kind: 'review', question: 'Is this correction safe?',
    task,
    proposal: { next_action: 'Apply bounded fix', rationale: 'Fix verified by tests', intended_changed_paths: ['source.txt'] },
    evidence: {
      summary: 'Review and tests completed', files: [],
      validation_results: [{ suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null }],
      artifacts: []
    },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };

  const reserveRes = invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });
  assert.equal(reserveRes.status, 'STATE_READY');
  assert.equal(reserveRes.state.task_revision, 2);
  const consultationId = reserveRes.consultation_id;
  assert.ok(consultationId);

  // 3. run controller (claims: rev 3, attaches: rev 4)
  const controllerRes = invoke([], checkpoint);
  assert.equal(controllerRes.status, 'ADVICE_READY');
  assert.equal(controllerRes.correlation_id, consultationId);

  // 4. state get (verifies revision is 4)
  const getRes = invoke(['state', 'get'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'get',
    task_run_id: taskRunId, operation_id: null, expected_revision: null, payload: {}
  });
  assert.equal(getRes.status, 'STATE_READY');
  assert.equal(getRes.state.task_revision, 4);
  assert.equal(getRes.state.last_consultation_id, consultationId);

  // 5. disposition (revision 4 -> 5)
  const actionId = randomUUID();
  const episodeId = 'episode-1';
  const dispRes = invoke(['state', 'disposition'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'disposition',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 4,
    payload: {
      consultation_id: consultationId,
      evidence_revision: 0,
      action: 'accept',
      rationale: 'Accepted counsel to apply bounded fix.',
      correction: { action_id: actionId, episode_id: episodeId, validation_command: 'npm test' }
    }
  });
  assert.equal(dispRes.status, 'STATE_READY');
  assert.equal(dispRes.state.task_revision, 5);

  // 6. outcome (revision 5 -> 6)
  writeFileSync(join(cwd, 'source.txt'), 'modified content\n');
  const outcomeRes = invoke(['state', 'outcome'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'outcome',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 5,
    payload: {
      consultation_id: consultationId,
      action_id: actionId,
      episode_id: episodeId,
      result: 'resolved',
      validation: { suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
      actual_changed_paths: ['source.txt']
    }
  });
  assert.equal(outcomeRes.status, 'STATE_READY');
  assert.equal(outcomeRes.state.task_revision, 6);

  // 7. complete (revision 6 -> completed)
  const completeRes = invoke(['state', 'complete'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'complete',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 6,
    payload: {}
  });
  assert.equal(completeRes.status, 'STATE_READY');
  assert.equal(completeRes.state.gate_status, 'completed');
});

test('state CLI executes real lifecycle Path B (concern-free no-change outcome)', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-phase8-path-b-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const home = join(root, 'home');
  const cwd = join(root, 'project');
  const bin = join(root, 'bin');
  for (const dir of [home, cwd, bin, join(home, '.evcrate'), join(cwd, '.evcrate')]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(join(cwd, 'source.txt'), 'initial user work\n');
  spawnSync('git', ['init'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  spawnSync('git', ['add', 'source.txt'], { cwd });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd });

  symlinkSync(FAKE_CODEX, join(bin, 'codex'));

  const policy = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
  writeFileSync(join(home, '.evcrate/advisor-routing.json'), JSON.stringify(policy), { mode: 0o600 });

  const providerState = join(home, '.evcrate/fake-codex-state.json');
  writeFileSync(providerState, JSON.stringify({
    finalCount: 0,
    calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Proceed; direction is safe.',
      rationale: 'Existing approach adheres to contracts.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['Run npm test'],
      unresolved_questions: []
    })
  }), { mode: 0o600 });

  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: root, PATH: `${bin}${delimiter}${process.env.PATH}` };
  delete env.EVCRATE_ADVISOR_ACTIVE;
  delete env.EVCRATE_ADVISOR_DEPTH;

  const taskRunId = randomUUID();
  const task = {
    goal: 'Phase 08 Path B no-change test',
    non_goals: [],
    authorized_paths: ['source.txt'],
    scope_rationale: 'Direction check',
    invariants: ['Preserve user work'],
    success_criteria: ['Validation passes']
  };

  function invoke(args, input) {
    const res = spawnSync(process.execPath, [CLI, ...args], {
      cwd, env, input: JSON.stringify(input), encoding: 'utf8', timeout: 15000
    });
    assert.equal(res.status, 0, `CLI ${args.join(' ')} failed: ${res.stdout} ${res.stderr}`);
    return JSON.parse(res.stdout.trim().split('\n')[0]);
  }

  // 1. init (rev 0 -> 1)
  invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-08', task, baseline_paths: ['source.txt'] }
  });

  // 2. checkpoint (rev 1 -> 2)
  const checkpoint = {
    protocol: 'evcrate-advisor-checkpoint', version: 2,
    task_run_id: taskRunId, checkpoint_id: 'checkpoint-dir', phase_id: 'phase-08',
    task_revision: 1, evidence_revision: 0,
    checkpoint: 'direction:step-0', kind: 'direction', question: 'Is direction safe?',
    task, proposal: { next_action: 'Proceed', rationale: 'Contracts align', intended_changed_paths: ['source.txt'] },
    evidence: { summary: 'Baseline clean', files: [], validation_results: [{ suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null }], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };
  const reserveRes = invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });
  const consultationId = reserveRes.consultation_id;

  // 3. controller (rev 2 -> 4)
  const controllerRes = invoke([], checkpoint);
  assert.equal(controllerRes.status, 'ADVICE_READY');

  // 4. disposition: accept with no correction (rev 4 -> 5)
  const dispRes = invoke(['state', 'disposition'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'disposition',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 4,
    payload: {
      consultation_id: consultationId,
      evidence_revision: 0,
      action: 'accept',
      rationale: 'Direction verified; no code modifications needed.',
      correction: null
    }
  });
  assert.equal(dispRes.state.task_revision, 5);

  // 5. outcome: no changes made -> action_id: null, episode_id: null, actual_changed_paths: [] (rev 5 -> 6)
  const outcomeRes = invoke(['state', 'outcome'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'outcome',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 5,
    payload: {
      consultation_id: consultationId,
      action_id: null,
      episode_id: null,
      result: 'resolved',
      validation: { suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
      actual_changed_paths: []
    }
  });
  assert.equal(outcomeRes.state.task_revision, 6);

  // 6. complete (rev 6 -> completed)
  const completeRes = invoke(['state', 'complete'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'complete',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 6,
    payload: {}
  });
  assert.equal(completeRes.state.gate_status, 'completed');
});

test('state CLI tracks failed correction outcomes with exact 1-indexed ordinals 1, 2, 3 before entering needs_human', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-phase8-3cycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const home = join(root, 'home');
  const cwd = join(root, 'project');
  const bin = join(root, 'bin');
  for (const dir of [home, cwd, bin, join(home, '.evcrate'), join(cwd, '.evcrate')]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(join(cwd, 'source.txt'), 'initial content\n');
  spawnSync('git', ['init'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  spawnSync('git', ['add', 'source.txt'], { cwd });
  spawnSync('git', ['commit', '-m', 'init'], { cwd });

  symlinkSync(FAKE_CODEX, join(bin, 'codex'));

  const policy = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
  writeFileSync(join(home, '.evcrate/advisor-routing.json'), JSON.stringify(policy), { mode: 0o600 });

  const providerState = join(home, '.evcrate/fake-codex-state.json');
  writeFileSync(providerState, JSON.stringify({
    finalCount: 0,
    calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Try next remediation attempt.',
      rationale: 'Subtle defect.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['Run npm test'],
      unresolved_questions: []
    })
  }), { mode: 0o600 });

  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: root, PATH: `${bin}${delimiter}${process.env.PATH}` };
  delete env.EVCRATE_ADVISOR_ACTIVE;
  delete env.EVCRATE_ADVISOR_DEPTH;

  const taskRunId = randomUUID();
  const task = {
    goal: 'Test 3 failed cycles', non_goals: [], authorized_paths: ['source.txt'],
    scope_rationale: 'Fix defect', invariants: ['Preserve user baseline'], success_criteria: ['npm test passes']
  };

  function invoke(args, input) {
    const res = spawnSync(process.execPath, [CLI, ...args], {
      cwd, env, input: JSON.stringify(input), encoding: 'utf8', timeout: 15000
    });
    assert.equal(res.status, 0, `CLI ${args.join(' ')} failed: ${res.stdout} ${res.stderr}`);
    return JSON.parse(res.stdout.trim().split('\n')[0]);
  }

  // init (rev 1)
  let state = invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-08', task, baseline_paths: ['source.txt'] }
  }).state;
  assert.equal(state.task_revision, 1);

  const episodeId = 'episode-remediation-1';
  const observedOrdinals = [];

  // Run 3 failed correction cycles
  for (let cycle = 1; cycle <= 3; cycle++) {
    // Checkpoint
    const checkpoint = {
      protocol: 'evcrate-advisor-checkpoint', version: 2,
      task_run_id: taskRunId, checkpoint_id: `checkpoint-cycle-${cycle}`, phase_id: 'phase-08',
      task_revision: state.task_revision, evidence_revision: state.evidence_revision,
      checkpoint: `stuck:step-fail-${cycle}`, kind: 'stuck', question: `How to fix on attempt ${cycle}?`,
      task, proposal: { next_action: `Attempt ${cycle}`, rationale: 'Retry fix', intended_changed_paths: ['source.txt'] },
      evidence: {
        summary: `Cycle ${cycle} failure evidence`, files: [],
        validation_results: [{ suite: 'test', command: 'npm test', status: 'failed', passed: 0, failed: 1, details: 'failure' }],
        artifacts: []
      },
      prior: { prior_consultation_id: state.last_consultation_id, prior_counsel: null, prior_disposition: null, observed_outcome: null }
    };

    const reserveRes = invoke(['state', 'checkpoint'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
      task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
      payload: { checkpoint }
    });
    const consultationId = reserveRes.consultation_id;

    // Controller
    const controllerRes = invoke([], checkpoint);
    assert.equal(controllerRes.status, 'ADVICE_READY');

    // Fresh state after controller
    state = invoke(['state', 'get'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'get',
      task_run_id: taskRunId, operation_id: null, expected_revision: null, payload: {}
    }).state;

    // Disposition
    const actionId = randomUUID();
    const dispRes = invoke(['state', 'disposition'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'disposition',
      task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
      payload: {
        consultation_id: consultationId,
        evidence_revision: state.evidence_revision,
        action: 'accept',
        rationale: `Accepted fix attempt ${cycle}`,
        correction: { action_id: actionId, episode_id: episodeId, validation_command: 'npm test' }
      }
    });
    state = dispRes.state;

    // Modify file to simulate work
    writeFileSync(join(cwd, 'source.txt'), `content after attempt ${cycle}\n`);

    // Outcome (unresolved)
    const outcomeRes = invoke(['state', 'outcome'], {
      protocol: 'evcrate-advisor-state', version: 1, operation: 'outcome',
      task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision,
      payload: {
        consultation_id: consultationId,
        action_id: actionId,
        episode_id: episodeId,
        result: 'unresolved',
        validation: { suite: 'test', command: 'npm test', status: 'failed', passed: 0, failed: 1, details: 'test failed' },
        actual_changed_paths: ['source.txt']
      }
    });
    state = outcomeRes.state;
    observedOrdinals.push(state.outcome.correction_number);
  }

  // Verify exact 1-indexed correction ordinals: 1, 2, 3!
  assert.deepEqual(observedOrdinals, [1, 2, 3], `Expected ordinals [1, 2, 3], received ${JSON.stringify(observedOrdinals)}`);
  assert.equal(state.correction_count, 3);
  assert.equal(state.gate_status, 'needs_human');
  // Complete is BLOCKED at needs_human
  const blockedComplete = spawnSync(process.execPath, [CLI, 'state', 'complete'], {
    cwd, env, encoding: 'utf8',
    input: JSON.stringify({
      protocol: 'evcrate-advisor-state', version: 1, operation: 'complete',
      task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: state.task_revision, payload: {}
    })
  });
  assert.equal(blockedComplete.status, 1);
  assert.ok(blockedComplete.stdout.includes('STATE_GATE_BLOCKED'));
});

