'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const RUNNER = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/runner.cjs'));
const {
  isWindows,
  superviseWindowsInvocation,
  observeConsoleWindows,
  checkWindowsProcessStatus
} = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/windows-platform.cjs'));

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-supervision-test-'));
  const cwd = path.join(root, 'cwd');
  fs.mkdirSync(cwd, { mode: 0o700 });
  return { root, cwd };
}

function clean(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

function alive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('R1 reproduction: leader exit 0 with detached worker reaps descendant and confirms empty Job', { skip: !isWindows }, async () => {
  const f = workspace();
  const workerScript = path.join(f.root, 'worker.cjs');
  const leaderScript = path.join(f.root, 'leader.cjs');
  const pidFile = path.join(f.root, 'worker.pid');

  fs.writeFileSync(workerScript, 'setInterval(() => {}, 1000);\n');
  fs.writeFileSync(leaderScript, [
    "const cp = require('node:child_process');",
    "const fs = require('node:fs');",
    `const worker = cp.spawn(process.execPath, [${JSON.stringify(workerScript)}], { detached: true, stdio: 'ignore' });`,
    'worker.unref();',
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(worker.pid));`,
    'process.stdout.write("leader-finished");',
    'process.exit(0);'
  ].join('\n'));

  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [leaderScript],
      cwd: f.cwd,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'probe', timeoutMs: 10000, killGraceMs: 250 }
    });

    const res = await RUNNER.runInvocation(inv);
    assert.equal(res.error, undefined);
    assert.equal(res.cleanupOutcome, 'confirmed');
    assert.equal(res.result.exitCode, 0);
    assert.equal(res.result.stdout, 'leader-finished');

    assert.equal(fs.existsSync(pidFile), true);
    const workerPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    assert.ok(workerPid > 0);

    // Assert the detached descendant process is dead
    assert.equal(alive(workerPid), false, `worker PID ${workerPid} must be terminated`);
  } finally {
    clean(f.root);
  }
});

test('leader nonzero exit with detached worker reaps descendant and confirms empty Job', { skip: !isWindows }, async () => {
  const f = workspace();
  const workerScript = path.join(f.root, 'worker-nonzero.cjs');
  const leaderScript = path.join(f.root, 'leader-nonzero.cjs');
  const pidFile = path.join(f.root, 'worker-nonzero.pid');

  fs.writeFileSync(workerScript, 'setInterval(() => {}, 1000);\n');
  fs.writeFileSync(leaderScript, [
    "const cp = require('node:child_process');",
    "const fs = require('node:fs');",
    `const worker = cp.spawn(process.execPath, [${JSON.stringify(workerScript)}], { detached: true, stdio: 'ignore' });`,
    'worker.unref();',
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(worker.pid));`,
    'process.stderr.write("leader-failed");',
    'process.exit(17);'
  ].join('\n'));

  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [leaderScript],
      cwd: f.cwd,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'probe', timeoutMs: 10000, killGraceMs: 250 }
    });

    const res = await RUNNER.runInvocation(inv);
    assert.ok(res.error);
    assert.equal(res.error.code, 'PROCESS_FAILED');
    assert.equal(res.cleanupOutcome, 'confirmed');
    assert.equal(res.failure.diagnostics.exitCode, 17);

    assert.equal(fs.existsSync(pidFile), true);
    const workerPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    assert.ok(workerPid > 0);

    assert.equal(alive(workerPid), false, `worker PID ${workerPid} must be terminated on nonzero exit`);
  } finally {
    clean(f.root);
  }
});

test('probe timeout terminates Job Object and reaps long-running provider', { skip: !isWindows }, async () => {
  const f = workspace();
  const script = path.join(f.root, 'hang.cjs');
  fs.writeFileSync(script, 'setInterval(() => {}, 1000);\n');

  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [script],
      cwd: f.cwd,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'probe', timeoutMs: 600, killGraceMs: 250 }
    });

    const t0 = Date.now();
    const res = await RUNNER.runInvocation(inv);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 4000, `timeout must resolve bounded, took ${elapsed}ms`);
    assert.ok(res.error);
    assert.equal(res.error.code, 'TIMEOUT');
    assert.equal(res.cleanupOutcome, 'confirmed');
  } finally {
    clean(f.root);
  }
});

test('signal abortion terminates Job Object and reports CANCELLED', { skip: !isWindows }, async () => {
  const f = workspace();
  const script = path.join(f.root, 'cancel-target.cjs');
  fs.writeFileSync(script, 'setInterval(() => {}, 1000);\n');

  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [script],
      cwd: f.cwd,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'generation', killGraceMs: 250 }
    });

    const ac = new AbortController();
    const promise = RUNNER.runInvocation(inv, { signal: ac.signal });

    setTimeout(() => ac.abort(), 300);

    const res = await promise;
    assert.ok(res.error);
    assert.equal(res.error.code, 'CANCELLED');
    assert.equal(res.cleanupOutcome, 'confirmed');
  } finally {
    clean(f.root);
  }
});

test('output flood limit terminates Job Object and reports OUTPUT_LIMIT', { skip: !isWindows }, async () => {
  const f = workspace();
  const script = path.join(f.root, 'flood.cjs');
  fs.writeFileSync(script, 'process.stdout.write("x".repeat(100000)); setInterval(() => {}, 1000);\n');

  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [script],
      cwd: f.cwd,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'generation', maxStdoutBytes: 1024, maxResultBytes: 1024, killGraceMs: 250 }
    });

    const res = await RUNNER.runInvocation(inv);
    assert.ok(res.error);
    assert.equal(res.error.code, 'OUTPUT_LIMIT');
    assert.equal(res.cleanupOutcome, 'confirmed');
  } finally {
    clean(f.root);
  }
});

test('lifetime EOF on supervisor stdin closes Job Object and terminates process', { skip: !isWindows }, async () => {
  const f = workspace();
  const script = path.join(f.root, 'lifetime-target.cjs');

  fs.writeFileSync(script, 'setInterval(() => {}, 1000);\n');

  let supervisor;
  try {
    supervisor = superviseWindowsInvocation({
      executable: process.execPath,
      argv: [script],
      cwd: f.cwd,
      env: process.env,
      prompt: '',
      killGraceMs: 250
    });

    // Wait until child spawns and capture PID
    const spawned = await new Promise((resolve) => {
      supervisor.on('spawned', resolve);
    });
    const targetPid = spawned.pid;
    assert.ok(targetPid > 0);

    // Verify target process is alive
    assert.equal(alive(targetPid), true);

    // Close supervisor stdin (simulating controller process death / pipe closure)
    supervisor.close();

    const cleanup = await supervisor.completionPromise;
    assert.ok(cleanup);

    // Target process must be dead due to Job kill-on-close
    let dead = false;
    for (let i = 0; i < 20; i++) {
      if (!alive(targetPid)) { dead = true; break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(dead, true, `target PID ${targetPid} must be terminated upon supervisor stdin EOF`);
  } finally {
    if (supervisor) supervisor.cancel();
    clean(f.root);
  }
});

test('superviseWindowsInvocation emits spawn-time PID and creation token', { skip: !isWindows }, async () => {
  const f = workspace();
  const script = path.join(f.root, 'token.cjs');
  fs.writeFileSync(script, 'process.stdout.write("hello"); process.exit(0);\n');

  try {
    const supervisor = superviseWindowsInvocation({
      executable: process.execPath,
      argv: [script],
      cwd: f.cwd,
      env: process.env,
      prompt: '',
      killGraceMs: 250
    });

    let spawnedData = null;
    supervisor.on('spawned', (data) => {
      spawnedData = data;
    });

    await supervisor.completionPromise;

    assert.ok(spawnedData);
    assert.ok(Number.isInteger(spawnedData.pid) && spawnedData.pid > 0);
    assert.ok(typeof spawnedData.startToken === 'string' && /^\d{1,32}$/u.test(spawnedData.startToken));
  } finally {
    clean(f.root);
  }
});

test('console observation fails closed with HUMAN_EVENT_REQUIRED when unattended', { skip: !isWindows }, async () => {
  const decision = JSON.stringify({ task_run_id: 'test-run', expected_revision: 1, decision: 'abandon' });
  const challenge = 'authorize test-run 1 abcdef';

  // With 100ms timeout and no user input on CONIN$, must fail closed
  await assert.rejects(
    () => observeConsoleWindows(decision, challenge, null, 100),
    (err) => err?.code === 'HUMAN_EVENT_REQUIRED'
  );
});

test('self-status query returns unknown when own birth token is missing', { skip: !isWindows }, () => {
  // Pass an identity with our PID but a fabricated start token when own identity start is verified
  const status = checkWindowsProcessStatus({ pid: process.pid, start: '999999999999999999' });
  assert.equal(status, 'dead');

  // When invalid or missing start token:
  assert.equal(checkWindowsProcessStatus({ pid: process.pid, start: null }), 'unknown');
  assert.equal(checkWindowsProcessStatus({ pid: process.pid, start: '' }), 'unknown');
  assert.equal(checkWindowsProcessStatus(null), 'unknown');
  assert.equal(checkWindowsProcessStatus({ pid: -1, start: '123' }), 'unknown');
});
