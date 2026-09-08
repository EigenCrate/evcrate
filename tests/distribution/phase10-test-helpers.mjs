import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');
export const CLI = join(packageRoot, '.evcrate/source/.evcrate/bin/evcrate-advisor');
export const FAKE_CODEX = join(packageRoot, 'tests/advisor-controller/fixtures/fake-codex.cjs');
export const FAKE_OMP = join(packageRoot, 'tests/advisor-controller/fixtures/fake-omp.cjs');

export function defaultPolicyV2(overrides = {}) {
  return {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' },
      ...overrides.advisor
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000, ...overrides.wait },
    history: { retention_days: 30, max_bytes: 104857600, ...overrides.history },
    ...overrides
  };
}
export function setupTestEnvironment(prefix = 'evcrate-phase10-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const home = join(root, 'home');
  const cwd = join(root, 'project');
  const bin = join(root, 'bin');

  for (const dir of [home, cwd, bin, join(home, '.evcrate'), join(cwd, '.evcrate')]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  symlinkSync(FAKE_CODEX, join(bin, 'codex'));
  symlinkSync(FAKE_OMP, join(bin, 'omp'));

  // Strict environment allowlist: only essential OS/Node runtime variables
  const ALLOWLIST = ['PATH', 'LANG', 'LC_ALL', 'TERM', 'NODE_ENV', 'SHELL', 'SYSTEMROOT', 'COMSPEC', 'USER', 'LOGNAME'];
  const env = {};
  for (const key of ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  // Explicitly scrub any sensitive/token variables (word boundary regex to protect PATH)
  for (const key of Object.keys(env)) {
    if (/(?:^|_)(?:api_key|token|pat|secret|password|passwd|auth|credential)(?:_|$)/iu.test(key)) {
      delete env[key];
    }
  }
  env.HOME = home;
  env.TMPDIR = root;
  const nodeBinDir = dirname(process.execPath);
  env.PATH = `${bin}:${nodeBinDir}:${env.PATH || '/usr/bin:/bin'}`;

  // Setup git repo strictly within isolated environment and check each exit status
  writeFileSync(join(cwd, 'source.txt'), 'initial user source code\n');
  assert.equal(spawnSync('git', ['init'], { cwd, env }).status, 0, 'git init failed');
  assert.equal(spawnSync('git', ['config', 'user.name', 'Test'], { cwd, env }).status, 0);
  assert.equal(spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd, env }).status, 0);
  assert.equal(spawnSync('git', ['add', 'source.txt'], { cwd, env }).status, 0);
  assert.equal(spawnSync('git', ['commit', '-m', 'initial'], { cwd, env }).status, 0);
  function writePolicy(policy) {
    writeFileSync(join(home, '.evcrate/advisor-routing.json'), JSON.stringify(policy), { mode: 0o600 });
  }

  function setFakeCodexState(state) {
    writeFileSync(join(home, '.evcrate/fake-codex-state.json'), JSON.stringify(state), { mode: 0o600 });
  }

  function setFakeCodexMode(mode) {
    writeFileSync(join(home, '.evcrate/fake-codex-mode'), mode, { mode: 0o600 });
  }

  function setFakeOmpState(state) {
    writeFileSync(join(home, '.evcrate/fake-omp-state.json'), JSON.stringify(state), { mode: 0o600 });
  }

  function setFakeOmpMode(mode) {
    writeFileSync(join(home, '.evcrate/fake-omp-mode'), mode, { mode: 0o600 });
  }

  function invoke(args, input) {
    const res = spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      env,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 25000
    });
    return {
      status: res.status,
      stdout: res.stdout,
      stderr: res.stderr,
      json: (() => {
        try { return JSON.parse(res.stdout.trim().split('\n')[0]); }
        catch { return null; }
      })()
    };
  }

  function cleanup() {
    rmSync(root, { recursive: true, force: true });
  }

  return { root, home, cwd, bin, env, writePolicy, setFakeCodexState, setFakeCodexMode, setFakeOmpState, setFakeOmpMode, invoke, cleanup };
}

export function makeValidCheckpoint(taskRunId, checkpointId = 'chk-p10-1', files = []) {
  return {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: taskRunId,
    checkpoint_id: checkpointId,
    phase_id: 'phase-10',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:step-4',
    kind: 'review',
    question: 'Is Phase 10 end-to-end acceptance proven?',
    task: {
      goal: 'Phase 10 acceptance validation',
      non_goals: ['paid live inference'],
      authorized_paths: ['source.txt'],
      scope_rationale: 'Acceptance verification',
      invariants: ['Zero unmanaged home mutations', 'Preserve user work'],
      success_criteria: ['All tests pass']
    },
    proposal: {
      next_action: 'Proceed to approval',
      rationale: 'All scenarios validated',
      intended_changed_paths: ['source.txt']
    },
    evidence: {
      summary: 'Verified controller scenarios',
      files,
      validation_results: [{ suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null }],
      artifacts: []
    },
    prior: {
      prior_consultation_id: null,
      prior_counsel: null,
      prior_disposition: null,
      observed_outcome: null
    }
  };
}
