import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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

test('TARGET_MENTORING_CAPABILITIES honestly declares supported mentoring and advisory-only write checks for all 7 targets', () => {
  const expected = {
    claude: { mentoring: 'supported', writeChecks: 'advisory-only' },
    codex: { mentoring: 'supported', writeChecks: 'advisory-only' },
    omp: { mentoring: 'supported', writeChecks: 'advisory-only' },
    antigravity: { mentoring: 'supported', writeChecks: 'advisory-only' },
    gemini: { mentoring: 'supported', writeChecks: 'advisory-only' },
    copilot: { mentoring: 'supported', writeChecks: 'advisory-only' },
    pi: { mentoring: 'supported', writeChecks: 'advisory-only' },
  };

  assert.deepEqual(Object.keys(TARGET_MENTORING_CAPABILITIES).sort(), Object.keys(expected).sort());
  for (const [target, cap] of Object.entries(expected)) {
    assert.deepEqual(TARGET_MENTORING_CAPABILITIES[target], cap, `Target ${target} capability mismatch`);
  }
});

test('renderMentoringCapabilities transforms canonical markers to honest target-specific capabilities', () => {
  const sample = `${MENTORING_START}\n${CANONICAL_MENTORING}\n${MENTORING_END}\n# Workflow Content`;

  for (const target of ['claude', 'codex', 'omp', 'antigravity', 'gemini', 'copilot', 'pi']) {
    const rendered = renderMentoringCapabilities(sample, target);
    assert.ok(rendered.includes(`<!-- EVCRATE_CAPABILITY: mentoring/supported/v2 -->`));
    assert.ok(rendered.includes(`<!-- EVCRATE_CAPABILITY: write-checks/${target}/advisory-only/v1 -->`));
    assert.ok(rendered.includes('# Workflow Content'));
  }
});

test('renderMentoringCapabilities rejects malformed or invalid inputs', () => {
  const isInvalid = (err) => err?.code === 'VALIDATION_INVALID';
  assert.throws(() => renderMentoringCapabilities('no markers here', 'codex'), isInvalid);
  assert.throws(() => renderMentoringCapabilities(`${MENTORING_START}\ninvalid\n${MENTORING_END}`, 'codex'), isInvalid);
  assert.throws(() => renderMentoringCapabilities(`${MENTORING_START}\n${CANONICAL_MENTORING}\n${MENTORING_END}`, 'unknown-target'), isInvalid);
  assert.throws(() => renderMentoringCapabilities(`${MENTORING_START}\n${CANONICAL_MENTORING}\n${MENTORING_END}\n${MENTORING_START}`, 'codex'), isInvalid);
});

test('all canonical consuming commands use evcrate-advisor-checkpoint/v2 dispatcher without legacy contradictions', () => {
  const commands = [
    'commands/code.md',
    'commands/code/auto.md',
    'commands/code/no-test.md',
    'commands/code/parallel.md',
    'commands/cook.md',
    'commands/cook/auto.md',
    'commands/cook/auto/fast.md',
    'commands/cook/auto/parallel.md',
    'commands/fix/hard.md',
    'commands/fix/logs.md',
    'commands/fix/parallel.md',
    'commands/fix/test.md',
    'commands/bootstrap.md',
    'commands/bootstrap/auto.md',
    'commands/bootstrap/auto/fast.md',
    'commands/bootstrap/auto/parallel.md',
  ];

  for (const cmd of commands) {
    const content = readFileSync(join(canonicalRoot, cmd), 'utf8');
    assert.ok(
      content.includes('Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block'),
      `${cmd} missing canonical V2 dispatcher reference`
    );
    assert.ok(
      !content.includes('evcrate-advisor-checkpoint/v1'),
      `${cmd} still contains legacy v1 reference`
    );
  }
});

test('canonical advisor-mentoring.md examples pass runtime schema validation for all 10 blocks', async () => {
  const { parseStateRequest } = await import('../../.evcrate/source/.evcrate/bin/lib/advisor/state-contract.cjs');
  const { validateCheckpointV2 } = await import('../../.evcrate/source/.evcrate/bin/lib/advisor/contracts-v2.cjs');

  const workflowContent = readFileSync(join(canonicalRoot, 'workflows/advisor-mentoring.md'), 'utf8');

  // Robust extraction of all json documents, including heredoc bodies
  const jsonBlocks = [];
  const regex = /^[ \t]*```(?:json|bash)\r?\n([\s\S]*?)\r?\n[ \t]*```/gmu;
  for (const match of workflowContent.matchAll(regex)) {
    const raw = match[1].trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const jsonText = raw.slice(jsonStart, jsonEnd + 1);
      try {
        jsonBlocks.push(JSON.parse(jsonText));
      } catch (e) {
        assert.fail(`Failed to parse extracted JSON block: ${jsonText}\n${e.message}`);
      }
    }
  }

  assert.equal(jsonBlocks.length, 10, `Expected exactly 10 JSON examples, found ${jsonBlocks.length}`);

  for (const doc of jsonBlocks) {
    if (doc.protocol === 'evcrate-advisor-checkpoint') {
      assert.doesNotThrow(() => validateCheckpointV2(doc));
    } else if (doc.protocol === 'evcrate-advisor-state') {
      assert.doesNotThrow(() => parseStateRequest(doc, doc.operation));
      if (doc.operation === 'checkpoint' && doc.payload?.checkpoint) {
        assert.doesNotThrow(() => validateCheckpointV2(doc.payload.checkpoint));
      }
    } else {
      assert.fail(`Unexpected protocol in extracted document: ${doc.protocol}`);
    }
  }
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

  const env = { ...process.env, HOME: home, TMPDIR: root, PATH: `${bin}:${process.env.PATH}` };
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

  const env = { ...process.env, HOME: home, TMPDIR: root, PATH: `${bin}:${process.env.PATH}` };
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

  const env = { ...process.env, HOME: home, TMPDIR: root, PATH: `${bin}:${process.env.PATH}` };
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

test('all projection adapters (including claude) project advisor-mentoring.md with honest advisory-only capabilities', () => {
  const targets = ['claude', 'omp', 'codex', 'copilot', 'pi', 'gemini', 'antigravity'];

  for (const target of targets) {
    const stage = createStagedRoot(repository, `.phase8-test-${target}-`);
    try {
      const context = createProjectionBuildContext(registry.targets.get(target), canonicalRoot, stage);
      const adapter = getProjectionAdapter(target);
      adapter.build(context);
      const validation = adapter.validate(context);
      assert.equal(validation.valid, true, `${target} projection validation failed: ${JSON.stringify(validation.diagnostics)}`);

      let relativeWorkflowPath;
      if (target === 'claude') relativeWorkflowPath = '.claude/workflows/advisor-mentoring.md';
      else if (target === 'omp') relativeWorkflowPath = '.omp/evcrate/workflows/advisor-mentoring.md';
      else if (target === 'copilot') relativeWorkflowPath = '.copilot/evcrate/workflows/advisor-mentoring.md';
      else if (target === 'pi') relativeWorkflowPath = '.pi/agent/evcrate/workflows/advisor-mentoring.md';
      else if (target === 'gemini') relativeWorkflowPath = '.gemini/workflows/advisor-mentoring.md';
      else if (target === 'antigravity') relativeWorkflowPath = '.antigravity/workflows/advisor-mentoring.md';
      else if (target === 'codex') relativeWorkflowPath = '.codex/workflows/advisor-mentoring.md';

      const projectedFile = join(stage.path, relativeWorkflowPath);
      assert.ok(existsSync(projectedFile), `Missing projected mentoring workflow in ${target}: ${projectedFile}`);
      const projectedContent = readFileSync(projectedFile, 'utf8');

      assert.ok(
        projectedContent.includes(`<!-- EVCRATE_CAPABILITY: write-checks/${target}/advisory-only/v1 -->`),
        `${target} missing expected capability marker write-checks/${target}/advisory-only/v1`
      );
      assert.ok(
        projectedContent.includes(`<!-- EVCRATE_CAPABILITY: mentoring/supported/v2 -->`),
        `${target} missing mentoring/supported/v2`
      );
    } finally {
      stage.cleanup();
    }
  }
});
