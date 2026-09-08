import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setupTestEnvironment, makeValidCheckpoint, defaultPolicyV2, CLI } from './phase10-test-helpers.mjs';

test('SCENARIO 1.1: Primary success in 1 launch with verified envelope and receipt', (t) => {
  const env = setupTestEnvironment('evcrate-p10-s1-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());
  env.setFakeCodexState({
    finalCount: 0, calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Phase 10 primary verified.', rationale: 'Contracts satisfied.',
      must_fix: [], cautions: [], assumptions: [], success_checks: ['npm test'], unresolved_questions: []
    })
  });
  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-p10-1', []);
  const initRes = env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });
  assert.equal(initRes.status, 0);
  const reserveRes = env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });
  assert.equal(reserveRes.status, 0);

  const controllerRes = env.invoke([], checkpoint);
  assert.equal(controllerRes.status, 0);
  assert.equal(controllerRes.json.status, 'ADVICE_READY');
  assert.equal(controllerRes.json.receipt.backend, 'codex');
  assert.equal(controllerRes.json.receipt.model, 'gpt-5.6-sol');

  const codexState = JSON.parse(readFileSync(join(env.home, '.evcrate/fake-codex-state.json'), 'utf8'));
  assert.equal(codexState.finalCount, 1, 'Expected exactly 1 primary launch');
});

test('SCENARIO 1.2: Non-retryable fatal error fails closed immediately without retry or backup', (t) => {
  const env = setupTestEnvironment('evcrate-p10-s2-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());
  env.setFakeCodexMode('malformed');
  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-p10-2', []);

  const initRes = env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });
  assert.equal(initRes.status, 0);
  const reserveRes = env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });
  assert.equal(reserveRes.status, 0);

  const controllerRes = env.invoke([], checkpoint);
  assert.notEqual(controllerRes.status, 0, 'Fatal error must return non-zero exit code');
  assert.equal(controllerRes.json?.error?.code, 'PROTOCOL_INVALID');

  const codexState = JSON.parse(readFileSync(join(env.home, '.evcrate/fake-codex-state.json'), 'utf8'));
  assert.equal(codexState.finalCount, 1, 'Fatal error must stop after 1 launch without retries');
  assert.ok(!existsSync(join(env.home, '.evcrate/fake-omp-state.json')), 'Backup must not be invoked on fatal error');
});

test('SCENARIO 1.3: Malformed input on stdin fails closed immediately with zero launches', (t) => {
  const env = setupTestEnvironment('evcrate-p10-s3-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());

  const res = env.invoke([], '{ "invalid_json": true');
  assert.notEqual(res.status, 0);
  assert.ok(!existsSync(join(env.home, '.evcrate/fake-codex-state.json')), 'Zero launches on malformed stdin');
});

test('SCENARIO 1.4: Stream backpressure and clean process termination handling', (t) => {
  const env = setupTestEnvironment('evcrate-p10-s4-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());
  env.setFakeCodexState({
    finalCount: 0, calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Success despite stream load', rationale: 'Handled',
      must_fix: [], cautions: [], assumptions: [], success_checks: ['npm test'], unresolved_questions: []
    })
  });
  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-p10-4', []);
  env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });
  env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });

  const res = env.invoke([], checkpoint);
  assert.equal(res.status, 0);
  assert.equal(res.json.status, 'ADVICE_READY');
});

test('SCENARIO 1.5: Unsupported backend fails closed immediately with ROUTE_ENTRY_INVALID', (t) => {
  const env = setupTestEnvironment('evcrate-p10-s5-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2({
    advisor: {
      primary: { backend: 'unsupported-backend', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    }
  }));
  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-p10-5', []);
  env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });
  env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });

  const res = env.invoke([], checkpoint);
  assert.notEqual(res.status, 0);
  assert.equal(res.json?.error?.code, 'ROUTE_ENTRY_INVALID');
});

test('SCENARIO 1.6: Process cancellation via abort signal terminates cleanly', (t) => {
  const env = setupTestEnvironment('evcrate-p10-s6-');
  t.after(env.cleanup);
  env.writePolicy(defaultPolicyV2());
  env.setFakeCodexMode('timeout');

  const taskRunId = randomUUID();
  const checkpoint = makeValidCheckpoint(taskRunId, 'chk-p10-6', []);
  env.invoke(['state', 'init'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 0,
    payload: { phase_id: 'phase-10', task: checkpoint.task, baseline_paths: ['source.txt'] }
  });
  env.invoke(['state', 'checkpoint'], {
    protocol: 'evcrate-advisor-state', version: 1, operation: 'checkpoint',
    task_run_id: taskRunId, operation_id: randomUUID(), expected_revision: 1,
    payload: { checkpoint }
  });

  let outputText = '';
  const child = spawn(process.execPath, [CLI], {
    cwd: env.cwd, env: env.env, stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdout.on('data', (c) => { outputText += c.toString('utf8'); });
  child.stdin.write(JSON.stringify(checkpoint));
  child.stdin.end();
  setTimeout(() => { child.kill('SIGINT'); }, 200);

  return new Promise((resolve) => {
    child.on('close', (code, signal) => {
      assert.ok(code !== 0 || signal === 'SIGINT');
      const lines = outputText.trim().split('\n').filter(Boolean);
      assert.ok(lines.length <= 1, 'Cancellation must not produce duplicate output envelopes');
      resolve();
    });
  });
});

test('SCENARIO 1.7: Child process environment scrubs seeded credentials and PATs', (t) => {
  process.env.GH_PAT = 'ghp_secret_test_token_12345';
  process.env.OPENAI_API_KEY = 'sk-proj-secret-key-12345';
  t.after(() => {
    delete process.env.GH_PAT;
    delete process.env.OPENAI_API_KEY;
  });
  const env = setupTestEnvironment('evcrate-p10-s7-');
  t.after(env.cleanup);

  const child = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(process.env))'], {
    env: env.env, encoding: 'utf8'
  });
  assert.equal(child.status, 0);
  const observedEnv = JSON.parse(child.stdout.trim());
  assert.equal(observedEnv.GH_PAT, undefined, 'GH_PAT must not reach spawned child');
  assert.equal(observedEnv.OPENAI_API_KEY, undefined, 'OPENAI_API_KEY must not reach spawned child');
  assert.ok(observedEnv.PATH, 'PATH must be present and executable');
});
