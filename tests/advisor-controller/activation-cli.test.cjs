'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const {
  CLI_PATH,
  createContext,
  createRequest,
  createPreRunHandoff,
  createIsolatedFixture,
  initializeStateFixture,
  abandonStateFixture,
  reserveStateFixture,
  completeStateFixture,
  spawnCli
} = require('./activation-test-helpers.cjs');

test('CLI rejects empty stdin with ADVICE_MODE_INVALID and exit code 1', async () => {
  const result = await spawnCli('');
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'ADVICE_MODE_INVALID');
  assert.equal(parsed.protocol, 'evcrate-advice-mode');
  assert.equal(parsed.version, 1);
});

test('CLI rejects unexpected positional arguments with ADVICE_MODE_INVALID', async () => {
  const result = await spawnCli(JSON.stringify(createRequest()), {
    args: ['--unexpected-positional']
  });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'ADVICE_MODE_INVALID');
});

test('CLI times out on stalled stdin after deadline with TIMEOUT', async () => {
  // Keep stdin open without sending EOF or data
  const result = await spawnCli(null, { keepStdinOpen: true });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'TIMEOUT');
});

test('CLI handles queued cancellation without a startup timing race', async () => {
  const result = await spawnCli(null, {
    keepStdinOpen: true,
    ipc: true,
    onSpawn: (child) => child.send('SIGINT')
  });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'CANCELLED');
});

test('CLI rejects oversized input exceeding 64 KiB with ADVICE_MODE_OVERSIZED', async () => {
  const hugeInput = Buffer.alloc(65537, 0x20); // 64 KiB + 1 byte
  const result = await spawnCli(hugeInput);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'ADVICE_MODE_OVERSIZED');
});

test('CLI rejects context project_root mismatching invocation cwd', async (t) => {
  const f = createIsolatedFixture(t);
  const mismatchRequest = createRequest({
    context: createContext({ project_root: path.join(f.root, 'different-project') })
  });
  const result = await spawnCli(JSON.stringify(mismatchRequest), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'ADVICE_CONTEXT_MISMATCH');
});

test('CLI delivers large complete stdout on boundary work text', async (t) => {
  const f = createIsolatedFixture(t);
  const largeWork = 'x'.repeat(30000); // 30 KiB raw work text
  const request = createRequest({
    raw_arguments: largeWork,
    context: createContext({ project_root: f.project })
  });

  const result = await spawnCli(JSON.stringify(request), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });
  assert.equal(result.status, 0);
  assert(result.stdout.endsWith('\n'), 'stdout must be a newline-terminated line');

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'MODE_READY');
  assert.equal(parsed.mode, 'off');
  assert.equal(parsed.reason, 'NO_FINAL_FLAG');
  assert.equal(parsed.work_arguments.length, 30000);
  assert.equal(parsed.work_arguments, largeWork);
});

test('CLI executes off and explicit modes cleanly without state creation', async (t) => {
  const f = createIsolatedFixture(t);

  // Off mode
  const offReq = createRequest({
    raw_arguments: 'do code review',
    context: createContext({ project_root: f.project })
  });
  const offRes = await spawnCli(JSON.stringify(offReq), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });
  assert.equal(offRes.status, 0);
  const offJson = JSON.parse(offRes.stdout);
  assert.equal(offJson.status, 'MODE_READY');
  assert.equal(offJson.mode, 'off');
  assert.equal(offJson.reason, 'NO_FINAL_FLAG');
  assert.equal(offJson.work_arguments, 'do code review');
  assert.equal(offJson.run, null);

  // Explicit mode
  const expReq = createRequest({
    raw_arguments: 'do code review --advice',
    context: createContext({ project_root: f.project })
  });
  const expRes = await spawnCli(JSON.stringify(expReq), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });
  assert.equal(expRes.status, 0);
  const expJson = JSON.parse(expRes.stdout);
  assert.equal(expJson.status, 'MODE_READY');
  assert.equal(expJson.mode, 'explicit');
  assert.equal(expJson.reason, 'EXPLICIT_FINAL_FLAG');
  assert.equal(expJson.work_arguments, 'do code review');
  assert.equal(expJson.run, null);

  // Verify no state or advisor directory created in HOME
  assert.equal(fs.existsSync(path.join(f.home, '.evcrate')), false);
});

test('CLI executes pre-run handoff cleanly without state access', async (t) => {
  const f = createIsolatedFixture(t);
  const preReq = createRequest({
    raw_arguments: 'router dispatch task',
    context: createContext({ project_root: f.project }),
    handoff: createPreRunHandoff({ project_root: f.project })
  });

  const result = await spawnCli(JSON.stringify(preReq), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'MODE_READY');
  assert.equal(parsed.mode, 'inherited');
  assert.equal(parsed.reason, 'INHERITED_PRE_RUN');
  assert.equal(parsed.run, null);

  // Pre-run must not create any state directory
  assert.equal(fs.existsSync(path.join(f.home, '.evcrate')), false);
});

test('CLI executes valid same-run continuation with isolated state fixture and verifies state byte immutability', async (t) => {
  const f = createIsolatedFixture(t);
  const state = initializeStateFixture(f);

  const beforeBytes = fs.readFileSync(f.stateFile);
  const beforeState = JSON.parse(beforeBytes.toString('utf8'));

  const matchingRun = {
    task_run_id: state.task_run_id,
    project_id: state.project_id,
    task_revision: state.task_revision,
    scope_revision: state.scope_revision,
    evidence_revision: state.evidence_revision
  };

  const matchingContext = createContext({
    project_root: f.project,
    phase_id: state.phase_id
  });

  const request = createRequest({
    raw_arguments: 'continue phase work --advice',
    context: matchingContext,
    handoff: {
      kind: 'same-run',
      context: matchingContext,
      run: matchingRun
    }
  });

  const result = await spawnCli(JSON.stringify(request), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'MODE_READY');
  assert.equal(parsed.mode, 'inherited');
  assert.equal(parsed.reason, 'INHERITED_SAME_RUN');
  assert.equal(parsed.work_arguments, 'continue phase work');
  assert.deepEqual(parsed.run, matchingRun);

  // Existing get may acquire/release locks; durable bytes and ledger stay unchanged.
  const afterBytes = fs.readFileSync(f.stateFile);
  assert.deepEqual(afterBytes, beforeBytes);
  const afterState = JSON.parse(afterBytes.toString('utf8'));
  assert.deepEqual(afterState.operation_ledger, beforeState.operation_ledger);

  // Verify no audit history or policy files were created
  assert.equal(fs.existsSync(path.join(f.home, '.evcrate', 'advisor-history')), false);
});

test('CLI rejects missing continuation without creating replacement state', async (t) => {
  const f = createIsolatedFixture(t);
  const missingRunId = '00000000-0000-4000-8000-000000009999';

  const context = createContext({
    project_root: f.project,
    phase_id: 'phase-01'
  });

  const request = createRequest({
    context,
    handoff: {
      kind: 'same-run',
      context,
      run: {
        task_run_id: missingRunId,
        project_id: 'a'.repeat(64),
        task_revision: 1,
        scope_revision: 0,
        evidence_revision: 0
      }
    }
  });

  const result = await spawnCli(JSON.stringify(request), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'STATE_NOT_FOUND');
  assert.equal(parsed.run, null);
  assert.equal(fs.existsSync(path.join(f.home, '.evcrate')), false);
});

test('CLI rejects same-run for completed and abandoned states', async (t) => {
  const f = createIsolatedFixture(t);
  const state = initializeStateFixture(f);
  const abandonedState = abandonStateFixture(f, state);

  const context = createContext({
    project_root: f.project,
    phase_id: state.phase_id
  });

  const request = createRequest({
    context,
    handoff: {
      kind: 'same-run',
      context,
      run: {
        task_run_id: abandonedState.task_run_id,
        project_id: abandonedState.project_id,
        task_revision: abandonedState.task_revision,
        scope_revision: abandonedState.scope_revision,
        evidence_revision: abandonedState.evidence_revision
      }
    }
  });

  const result = await spawnCli(JSON.stringify(request), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'ADVICE_RUN_COMPLETED');
});

test('CLI rejects same-run with stale revisions', async (t) => {
  const f = createIsolatedFixture(t);
  const state = initializeStateFixture(f);

  const context = createContext({
    project_root: f.project,
    phase_id: state.phase_id
  });

  const staleRequest = createRequest({
    context,
    handoff: {
      kind: 'same-run',
      context,
      run: {
        task_run_id: state.task_run_id,
        project_id: state.project_id,
        task_revision: 99, // Stale revision
        scope_revision: state.scope_revision,
        evidence_revision: state.evidence_revision
      }
    }
  });

  const result = await spawnCli(JSON.stringify(staleRequest), {
    cwd: f.project,
    env: { ...process.env, HOME: f.home }
  });

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'FAILED');
  assert.equal(parsed.error?.code, 'ADVICE_HANDOFF_STALE');
});

test('CLI preserves exact raw bytes and rejects malformed transport at byte boundaries', async (t) => {
  const f = createIsolatedFixture(t);
  const context = createContext({ project_root: f.project });
  const encoded = (raw) => JSON.stringify(createRequest({ context, raw_arguments: raw }));
  const exactWire = encoded('wire boundary');
  for (const [input, mode, work, code] of [
    [encoded(''), 'off', '', null],
    [encoded('--advice'), 'explicit', '', null],
    [encoded('  nhiệm vụ\t第一\r\nnext  --advice\r\n'), 'explicit', '  nhiệm vụ\t第一\r\nnext', null],
    [encoded('"--advice" --advice more'), 'off', '"--advice" --advice more', null],
    [encoded('雪'.repeat(10922) + 'ab'), 'off', '雪'.repeat(10922) + 'ab', null],
    [encoded('雪'.repeat(10922) + 'abc'), null, null, 'ADVICE_MODE_OVERSIZED'],
    [exactWire + ' '.repeat(65536 - Buffer.byteLength(exactWire)), 'off', 'wire boundary', null],
    [exactWire + ' '.repeat(65537 - Buffer.byteLength(exactWire)), null, null, 'ADVICE_MODE_OVERSIZED'],
    [encoded('\u0001'.repeat(12000)), null, null, 'ADVICE_MODE_OVERSIZED'],
    [encoded('--advice --advice'), null, null, 'ADVICE_MODE_DUPLICATE_FLAG'],
    [Buffer.from([0xc3, 0x28]), null, null, 'ADVICE_MODE_INVALID'],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(encoded('task'))]), null, null, 'ADVICE_MODE_INVALID'],
    [exactWire.replace('"version":1', '"version":1,"version":1'), null, null, 'ADVICE_MODE_INVALID'],
    [exactWire + '{}', null, null, 'ADVICE_MODE_INVALID'],
    ['['.repeat(33) + '0' + ']'.repeat(33), null, null, 'ADVICE_MODE_INVALID']
  ]) {
    const result = await spawnCli(input, { cwd: f.project, env: { HOME: f.home, PATH: '' } });
    const value = JSON.parse(result.stdout);
    assert.equal(result.status, code ? 1 : 0);
    assert.equal(value.error?.code ?? null, code);
    assert.equal(value.mode, mode);
    assert.equal(value.work_arguments, work);
  }
  assert.deepEqual(fs.readdirSync(f.home), []);
  assert.deepEqual(fs.readdirSync(f.project), []);
});

test('CLI rejects every conflicting binding before final flag can override it', async (t) => {
  const f = createIsolatedFixture(t);
  const state = initializeStateFixture(f);
  const context = createContext({ project_root: f.project });
  const run = Object.fromEntries(['task_run_id', 'project_id', 'task_revision', 'scope_revision', 'evidence_revision']
    .map((key) => [key, state[key]]));
  const before = fs.readFileSync(f.stateFile);
  for (const [contextChange, runChange, expected] of [
    [{ work_target: 'other' }, {}, 'ADVICE_CONTEXT_MISMATCH'],
    [{ command: 'cook' }, {}, 'ADVICE_CONTEXT_MISMATCH'],
    [{ plan_path: 'plans/other/plan.md' }, {}, 'ADVICE_CONTEXT_MISMATCH'],
    [{ phase_path: 'plans/test/phase-02.md' }, {}, 'ADVICE_CONTEXT_MISMATCH'],
    [{ phase_id: 'phase-02' }, {}, 'ADVICE_CONTEXT_MISMATCH'],
    [{ project_root: path.join(f.root, 'other') }, {}, 'ADVICE_CONTEXT_MISMATCH'],
    [{}, { task_revision: 2 }, 'ADVICE_HANDOFF_STALE'],
    [{}, { scope_revision: 1 }, 'ADVICE_HANDOFF_STALE'],
    [{}, { evidence_revision: 1 }, 'ADVICE_HANDOFF_STALE'],
    [{}, { project_id: 'f'.repeat(64) }, 'ADVICE_CONTEXT_MISMATCH']
  ]) {
    const request = createRequest({ context, raw_arguments: 'continue --advice',
      handoff: { kind: 'same-run', context: { ...context, ...contextChange }, run: { ...run, ...runChange } } });
    const result = await spawnCli(JSON.stringify(request), { cwd: f.project, env: { HOME: f.home, PATH: '' } });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).error.code, expected);
    assert.deepEqual(fs.readFileSync(f.stateFile), before);
  }
});

test('CLI preserves pending gate without recovery and refuses successfully completed runs', async (t) => {
  for (const transition of [reserveStateFixture, completeStateFixture]) {
    const f = createIsolatedFixture(t);
    const state = transition(f, initializeStateFixture(f));
    const context = createContext({ project_root: f.project });
    const run = Object.fromEntries(['task_run_id', 'project_id', 'task_revision', 'scope_revision', 'evidence_revision']
      .map((key) => [key, state[key]]));
    const before = fs.readFileSync(f.stateFile);
    const result = await spawnCli(JSON.stringify(createRequest({ context, handoff: { kind: 'same-run', context, run } })),
      { cwd: f.project, env: { HOME: f.home, PATH: '' } });
    const value = JSON.parse(result.stdout);
    if (state.gate_status === 'completed') {
      assert.equal(state.operation_ledger.at(-1).operation, 'complete');
      assert.equal(result.status, 1);
      assert.equal(value.error.code, 'ADVICE_RUN_COMPLETED');
    } else {
      assert.equal(state.gate_status, 'in_consultation');
      assert.equal(result.status, 0);
      assert.equal(value.mode, 'inherited');
      assert.deepEqual(value.run, run);
    }
    assert.deepEqual(fs.readFileSync(f.stateFile), before);
  }
});

test('CLI reports failed delivery when the stdout consumer has closed', async (t) => {
  const f = createIsolatedFixture(t);
  const child = spawn(process.execPath, [CLI_PATH], {
    cwd: f.project, env: { HOME: f.home, PATH: '' }, stdio: ['pipe', 'pipe', 'pipe']
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const stderr = [];
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const closed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  // Closing the reader before submitting input deterministically forces EPIPE.
  await new Promise((resolve) => { child.stdout.once('close', resolve); child.stdout.destroy(); });
  child.stdin.end(JSON.stringify(createRequest({ context: createContext({ project_root: f.project }) })));
  assert.deepEqual(await closed, { code: 1, signal: null });
  assert.equal(Buffer.concat(stderr).toString('utf8'), '');
});
