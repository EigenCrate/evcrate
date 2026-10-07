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
const { createBaselineStateFixture, completeStateFixtureWithBaseline } = require('./activation-qualification-helpers.cjs');

const POSIX_ONLY = { skip: process.platform === 'win32' ? 'symlink fixtures are POSIX-only' : false };
const STATE_KEYS = ['task_run_id', 'project_id', 'task_revision', 'scope_revision', 'evidence_revision'];

// Records type, mode, size, mtime, inode, bytes and directory entries so any write,
// touch, repair or unlink performed by an observed invocation is detectable.
function snapshotTree(root) {
  const snapshot = {};
  const visit = (entry, label) => {
    const stat = fs.lstatSync(entry, { bigint: true });
    const record = { mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs, ino: stat.ino };
    if (stat.isDirectory()) {
      record.entries = fs.readdirSync(entry).sort();
      snapshot[label] = record;
      for (const name of record.entries) visit(path.join(entry, name), `${label}/${name}`);
    } else if (stat.isSymbolicLink()) {
      snapshot[label] = { ...record, target: fs.readlinkSync(entry) };
    } else {
      snapshot[label] = { ...record, bytes: fs.readFileSync(entry).toString('base64') };
    }
  };
  visit(root, '.');
  return snapshot;
}

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

test('CLI accepts a symlinked project_root resolving to cwd in off and explicit modes', POSIX_ONLY, async (t) => {
  const f = createIsolatedFixture(t);
  const link = path.join(f.root, 'project-link');
  fs.symlinkSync(f.project, link);
  for (const [raw_arguments, mode, reason] of [
    ['work', 'off', 'NO_FINAL_FLAG'], ['work --advice', 'explicit', 'EXPLICIT_FINAL_FLAG']
  ]) {
    const context = createContext({ project_root: link });
    const result = await spawnCli(JSON.stringify(createRequest({ raw_arguments, context })), {
      cwd: f.project, env: { ...process.env, HOME: f.home }
    });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'MODE_READY');
    assert.equal(parsed.mode, mode);
    assert.equal(parsed.reason, reason);
    assert.equal(parsed.work_arguments, 'work');
    // The caller's logical root is reported unchanged, never rewritten to the real path.
    assert.deepEqual(parsed.context, context);
  }
  // The reverse direction: real project_root while the process runs from the link.
  const reverse = await spawnCli(JSON.stringify(createRequest({ raw_arguments: 'work', context: createContext({ project_root: f.project }) })), {
    cwd: link, env: { ...process.env, HOME: f.home }
  });
  assert.equal(reverse.status, 0);
  assert.equal(JSON.parse(reverse.stdout).mode, 'off');
});

test('CLI rejects project_root that resolves to a different or unresolvable directory', POSIX_ONLY, async (t) => {
  const f = createIsolatedFixture(t);
  const other = path.join(f.root, 'other-real');
  fs.mkdirSync(other);
  const otherLink = path.join(f.root, 'other-link');
  fs.symlinkSync(other, otherLink);
  const danglingLink = path.join(f.root, 'dangling-link');
  fs.symlinkSync(path.join(f.root, 'does-not-exist'), danglingLink);
  for (const project_root of [other, otherLink, path.join(f.root, 'missing-root'), danglingLink]) {
    for (const raw_arguments of ['work', 'work --advice']) {
      const result = await spawnCli(JSON.stringify(createRequest({
        raw_arguments, context: createContext({ project_root })
      })), { cwd: f.project, env: { ...process.env, HOME: f.home } });
      assert.equal(result.status, 1);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.status, 'FAILED');
      assert.equal(parsed.error.code, 'ADVICE_CONTEXT_MISMATCH');
      assert.equal(parsed.mode, null);
      assert.equal(parsed.work_arguments, null);
    }
  }
  assert.equal(fs.existsSync(path.join(f.home, '.evcrate')), false);
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

function plantLiveLock(f) {
  const lockFile = path.join(path.dirname(f.stateFile), 'state.lock');
  fs.writeFileSync(lockFile, JSON.stringify({ token: 'l'.repeat(32), process: { pid: process.pid, start: null } }), { mode: 0o600 });
  return lockFile;
}

// Each row builds hostile durable state with real controller operations; setup
// writes finish before the single snapshot taken ahead of the observed invocation.
const HOSTILE_OFF_ROWS = [
  ['live lock', (t) => { const f = createIsolatedFixture(t); initializeStateFixture(f); plantLiveLock(f); return f; }],
  ['corrupt state', (t) => {
    const f = createIsolatedFixture(t); initializeStateFixture(f);
    fs.writeFileSync(f.stateFile, '{ corrupt json'); return f;
  }],
  ['genuinely completed state with receipt', (t) => {
    const f = createBaselineStateFixture(t);
    const completed = completeStateFixtureWithBaseline(f, f.state);
    assert.equal(completed.gate_status, 'completed');
    assert.equal(fs.existsSync(path.join(f.project, 'plans/test/reports/phase-01-completion-receipt.md')), true);
    return f;
  }],
  ['missing state and no store', (t) => createIsolatedFixture(t)],
  ['interrupted run with pending gate', (t) => {
    const f = createIsolatedFixture(t);
    const pending = reserveStateFixture(f, initializeStateFixture(f));
    assert.equal(pending.gate_status, 'in_consultation');
    return f;
  }]
];

test('CLI off mode ignores hostile controller state without touching state, locks or entries', async (t) => {
  for (const [row, build] of HOSTILE_OFF_ROWS) {
    const f = build(t);
    const lockFile = f.stateFile === undefined ? null : path.join(path.dirname(f.stateFile), 'state.lock');
    const lockBefore = lockFile !== null && fs.existsSync(lockFile);
    const raw_arguments = 'plans/test/plan.md  phase-01 "keep exact" bytes ';
    const request = createRequest({ raw_arguments, context: createContext({ project_root: f.project }), handoff: null });
    const before = snapshotTree(f.root);
    const result = await spawnCli(JSON.stringify(request), { cwd: f.project, env: { ...process.env, HOME: f.home } });
    assert.equal(result.status, 0, row);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'MODE_READY', row);
    assert.equal(parsed.mode, 'off', row);
    assert.equal(parsed.reason, 'NO_FINAL_FLAG', row);
    assert.equal(parsed.run, null, row);
    assert.equal(parsed.error, null, row);
    assert.equal(parsed.work_arguments, raw_arguments, row);
    assert.deepEqual(snapshotTree(f.root), before, `${row}: off invocation must not change any byte, mtime or entry`);
    // Lock absence stays absence; an existing live lock is never reaped.
    if (lockFile !== null) assert.equal(fs.existsSync(lockFile), lockBefore, row);
  }
});

test('CLI keeps strict same-run failures for live lock and corrupt state without repair', async (t) => {
  for (const [row, harm, expected] of [
    ['live lock', (f) => plantLiveLock(f), 'STATE_LOCKED'],
    ['corrupt state', (f) => fs.writeFileSync(f.stateFile, '{ corrupt json'), 'STATE_INVALID']
  ]) {
    const f = createIsolatedFixture(t);
    const state = initializeStateFixture(f);
    const context = createContext({ project_root: f.project, phase_id: state.phase_id });
    const run = Object.fromEntries(STATE_KEYS.map((key) => [key, state[key]]));
    harm(f);
    const lockFile = path.join(path.dirname(f.stateFile), 'state.lock');
    const before = [fs.readFileSync(f.stateFile), fs.existsSync(lockFile) ? fs.readFileSync(lockFile) : null];
    const result = await spawnCli(JSON.stringify(createRequest({
      raw_arguments: 'continue --advice', context, handoff: { kind: 'same-run', context, run }
    })), { cwd: f.project, env: { ...process.env, HOME: f.home } });
    assert.equal(result.status, 1, row);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'FAILED', row);
    assert.equal(parsed.error.code, expected, row);
    assert.equal(parsed.run, null, row);
    assert.deepEqual(fs.readFileSync(f.stateFile), before[0], row);
    assert.deepEqual(fs.existsSync(lockFile) ? fs.readFileSync(lockFile) : null, before[1], row);
  }
});
