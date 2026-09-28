'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const ADVISOR_DIR = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');

const {
  isWindows,
  resolveWindowsLaunchRecord,
  verifyWindowsLaunchRecord
} = require(path.join(ADVISOR_DIR, 'windows-platform.cjs'));

const {
  createInvocation,
  runInvocation
} = require(path.join(ADVISOR_DIR, 'runner.cjs'));

const {
  stateLocation,
  transactState
} = require(path.join(ADVISOR_DIR, 'state-io.cjs'));

const {
  createWorkspace,
  cleanupWorkspace
} = require(path.join(ADVISOR_DIR, 'isolated-workspace.cjs'));

function makeTestFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-vr-reg-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.mkdirSync(project, { recursive: true, mode: 0o700 });
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  return {
    root,
    home,
    project,
    bin,
    cleanup() {
      try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
    }
  };
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

// ---------------------------------------------------------------------------
// 1. R1 REGRESSION: PROCESS SUPERVISION & JOB CONTAINMENT
// ---------------------------------------------------------------------------
test('R1 Regression: Leader exit 0 with detached worker reaps descendant and confirms empty Job', { skip: !isWindows }, async () => {
  const f = makeTestFixture();
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
    'process.stdout.write("leader-exit-0");',
    'process.exit(0);'
  ].join('\n'));

  try {
    const inv = createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [leaderScript],
      cwd: f.project,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'probe', timeoutMs: 10000, killGraceMs: 250 }
    });

    const res = await runInvocation(inv);
    assert.equal(res.error, undefined);
    assert.equal(res.cleanupOutcome, 'confirmed');
    assert.equal(res.result.exitCode, 0);
    assert.equal(res.result.stdout, 'leader-exit-0');

    assert.equal(fs.existsSync(pidFile), true);
    const workerPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    assert.ok(workerPid > 0);

    // Verify detached worker is terminated
    assert.equal(alive(workerPid), false, `Detached worker PID ${workerPid} must be terminated`);
  } finally {
    f.cleanup();
  }
});

test('R1 Regression: Leader nonzero exit with detached worker reaps descendant and confirms empty Job', { skip: !isWindows }, async () => {
  const f = makeTestFixture();
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
    'process.stderr.write("leader-fail-exit");',
    'process.exit(42);'
  ].join('\n'));

  try {
    const inv = createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [leaderScript],
      cwd: f.project,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'probe', timeoutMs: 10000, killGraceMs: 250 }
    });

    const res = await runInvocation(inv);
    assert.ok(res.error);
    assert.equal(res.error.code, 'PROCESS_FAILED');
    assert.equal(res.cleanupOutcome, 'confirmed');
    assert.equal(res.failure.diagnostics.exitCode, 42);

    assert.equal(fs.existsSync(pidFile), true);
    const workerPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    assert.ok(workerPid > 0);

    // Verify detached worker is terminated
    assert.equal(alive(workerPid), false, `Detached worker PID ${workerPid} must be terminated on nonzero exit`);
  } finally {
    f.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 2. R2 REGRESSION & TRUSTED-FILE POLICY
// ---------------------------------------------------------------------------
test('R2 Regression: Trusted-file policy allows Everyone Modify without UID/SID gates under standard OS permissions', { skip: !isWindows }, () => {
  const f = makeTestFixture();
  try {
    const taskRunId = randomUUID();
    const loc = stateLocation({ cwd: f.project, environment: { HOME: f.home } }, taskRunId);
    fs.mkdirSync(loc.taskDirectory, { recursive: true });

    const stateFile = path.join(loc.taskDirectory, 'state.json');
    fs.writeFileSync(stateFile, JSON.stringify({ writer: 'init', revision: 1 }));

    // Explicitly grant Everyone Modify using icacls
    const icaclsRes = spawnSync('icacls.exe', [stateFile, '/grant', '*S-1-1-0:(M)'], { encoding: 'utf8' });
    assert.equal(icaclsRes.status, 0, `icacls grant failed: ${icaclsRes.stderr}`);

    // Under trusted-file policy, operations succeed based on OS permissions
    const res = transactState(loc, {}, (current) => {
      assert.equal(current.revision, 1);
      return {
        state: { writer: 'updated', revision: 2 },
        result: 'ok'
      };
    });
    assert.equal(res, 'ok');

    const updated = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(updated.revision, 2);
    assert.equal(updated.writer, 'updated');
  } finally {
    f.cleanup();
  }
});

test('R2 Regression: OS read-only permission fails closed with standard OS error', { skip: !isWindows }, () => {
  const f = makeTestFixture();
  try {
    const taskRunId = randomUUID();
    const loc = stateLocation({ cwd: f.project, environment: { HOME: f.home } }, taskRunId);
    fs.mkdirSync(loc.taskDirectory, { recursive: true });

    const stateFile = path.join(loc.taskDirectory, 'state.json');
    fs.writeFileSync(stateFile, JSON.stringify({ writer: 'init', revision: 1 }));

    // Make file read-only via standard Node chmod
    fs.chmodSync(stateFile, 0o400);

    // transactState must fail closed when file cannot be modified
    assert.throws(() => {
      transactState(loc, {}, () => {
        return { state: { writer: 'cannot-write', revision: 2 }, result: 'fail' };
      });
    });

    // Restore write permissions for cleanup
    fs.chmodSync(stateFile, 0o600);
  } finally {
    f.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 3. R3 REGRESSION: SCOPED PROVIDER LAYOUT & SIBLING REJECTION
// ---------------------------------------------------------------------------
test('R3 Regression: Scoped npm layout for Codex with CMD-only resolves JS entrypoint', { skip: !isWindows }, () => {
  const f = makeTestFixture();
  try {
    const pkgDir = path.join(f.bin, 'node_modules', '@openai', 'codex');
    fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: '@openai/codex',
      version: '0.157.1',
      bin: { codex: 'bin/codex.js' }
    }));
    fs.writeFileSync(path.join(pkgDir, 'bin', 'codex.js'), '#!/usr/bin/env node\nconsole.log("codex");');
    fs.writeFileSync(path.join(f.bin, 'codex.cmd'), '@echo off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');

    const env = { PATH: f.bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
    const record = resolveWindowsLaunchRecord('codex', env, 'codex');
    assert.notEqual(record, null);
    assert.equal(record.targetType, 'node-script');
    assert.equal(record.launcherPath.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(fs.realpathSync.native(record.scriptPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'bin', 'codex.js')).toLowerCase());
    assert.equal(verifyWindowsLaunchRecord(record), true);
  } finally {
    f.cleanup();
  }
});

test('R3 Regression: Extensionless shell sibling rejected in favor of declared package bin', { skip: !isWindows }, () => {
  const f = makeTestFixture();
  try {
    const pkgDir = path.join(f.bin, 'node_modules', '@openai', 'codex');
    fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: '@openai/codex',
      version: '0.157.1',
      bin: { codex: 'bin/codex.js' }
    }));
    fs.writeFileSync(path.join(pkgDir, 'bin', 'codex.js'), '#!/usr/bin/env node\nconsole.log("codex");');
    fs.writeFileSync(path.join(f.bin, 'codex.cmd'), '@echo off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');
    fs.writeFileSync(path.join(f.bin, 'codex'), '#!/bin/sh\necho shell\n');

    const env = { PATH: f.bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
    const record = resolveWindowsLaunchRecord('codex', env, 'codex');
    assert.notEqual(record, null);
    assert.equal(record.targetType, 'node-script');
    assert.equal(record.launcherPath.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(fs.realpathSync.native(record.scriptPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'bin', 'codex.js')).toLowerCase());
    assert.equal(verifyWindowsLaunchRecord(record), true);
  } finally {
    f.cleanup();
  }
});

test('R3 Regression: Out-of-package bin path traversal is rejected', { skip: !isWindows }, () => {
  const f = makeTestFixture();
  try {
    const pkgDir = path.join(f.bin, 'node_modules', '@openai', 'codex');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(f.root, 'malicious.js'), 'console.log("escaped");');
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: '@openai/codex',
      version: '0.157.1',
      bin: { codex: '../../malicious.js' }
    }));
    fs.writeFileSync(path.join(f.bin, 'codex.cmd'), '@echo off\r\n');

    const env = { PATH: f.bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
    const record = resolveWindowsLaunchRecord('codex', env, 'codex');
    assert.equal(record, null, 'Path traversal bin must be rejected');
  } finally {
    f.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 4. R4 REGRESSION & TRUE COMPETING-PROCESS TRANSACTION
// ---------------------------------------------------------------------------
test('R4 Regression: Controlled interleaving creation never overwrites competing state', () => {
  const f = makeTestFixture();
  try {
    const taskRunId = randomUUID();
    const loc = stateLocation({ cwd: f.project, environment: { HOME: f.home } }, taskRunId);
    const stateFile = path.join(loc.taskDirectory, 'state.json');
    const competingBytes = Buffer.from(JSON.stringify({ writer: 'competitor', revision: 999 }));
    let competingStat;

    assert.throws(() => {
      transactState(loc, { create: true }, () => {
        fs.writeFileSync(stateFile, competingBytes);
        competingStat = fs.lstatSync(stateFile, { bigint: true });
        return {
          state: { writer: 'controller', revision: 1 },
          result: 'success'
        };
      });
    }, (err) => err.code === 'STATE_CONFLICT');

    const afterStat = fs.lstatSync(stateFile, { bigint: true });
    assert.equal(afterStat.dev.toString(), competingStat.dev.toString());
    assert.equal(afterStat.ino.toString(), competingStat.ino.toString());
    assert.deepEqual(fs.readFileSync(stateFile), competingBytes);

    const remainingTmp = fs.readdirSync(loc.taskDirectory).filter(e => e.startsWith('.state-'));
    assert.equal(remainingTmp.length, 0);
  } finally {
    f.cleanup();
  }
});

test('R4 True Multi-Process Concurrency: Two competing OS processes attempting state create', async () => {
  const f = makeTestFixture();
  try {
    const taskRunId = randomUUID();
    const workerScript = path.join(f.root, 'competing-transactor.cjs');

    fs.writeFileSync(workerScript, `
'use strict';
const path = require('node:path');
const ADVISOR_DIR = ${JSON.stringify(ADVISOR_DIR)};
const { stateLocation, transactState } = require(path.join(ADVISOR_DIR, 'state-io.cjs'));

const id = process.argv[2];
const project = ${JSON.stringify(f.project)};
const home = ${JSON.stringify(f.home)};
const taskRunId = ${JSON.stringify(taskRunId)};

const loc = stateLocation({ cwd: project, environment: { HOME: home } }, taskRunId);

try {
  const res = transactState(loc, { create: true }, () => {
    // Artificial small delay to expand contention window
    const t0 = Date.now();
    while (Date.now() - t0 < 50) {}
    return {
      state: { writer: id, revision: 1, payload: 'winner-' + id },
      result: 'created'
    };
  });
  process.stdout.write(JSON.stringify({ outcome: 'success', id }));
  process.exit(0);
} catch (err) {
  process.stdout.write(JSON.stringify({ outcome: 'conflict', id, code: err.code }));
  process.exit(err.code === 'STATE_CONFLICT' || err.code === 'STATE_LOCKED' ? 2 : 1);
}
`);

    // Launch 2 processes concurrently
    const p1 = spawn(process.execPath, [workerScript, 'proc-1']);
    const p2 = spawn(process.execPath, [workerScript, 'proc-2']);

    const collect = (proc) => new Promise((resolve) => {
      let stdout = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.on('close', code => resolve({ code, stdout: stdout.trim() }));
    });

    const [r1, r2] = await Promise.all([collect(p1), collect(p2)]);

    const outcomes = [r1, r2];
    const successes = outcomes.filter(o => o.code === 0);
    const conflicts = outcomes.filter(o => o.code === 2);

    // Exactly one winner, exactly one conflict!
    assert.equal(successes.length, 1, 'Exactly one competing process must succeed');
    assert.equal(conflicts.length, 1, 'Exactly one competing process must receive STATE_CONFLICT or STATE_LOCKED');

    // Winner's written state is strictly preserved
    const winnerData = JSON.parse(successes[0].stdout);
    const loc = stateLocation({ cwd: f.project, environment: { HOME: f.home } }, taskRunId);
    const stateFile = path.join(loc.taskDirectory, 'state.json');
    assert.equal(fs.existsSync(stateFile), true);

    const finalState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(finalState.writer, winnerData.id);
    assert.equal(finalState.payload, 'winner-' + winnerData.id);
    assert.equal(finalState.revision, 1);
  } finally {
    f.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 5. R5 REGRESSION: WORKSPACE REPLACEMENT DEFENSE
// ---------------------------------------------------------------------------
test('R5 Regression: Workspace replacement directory is protected from deletion', () => {
  const f = makeTestFixture();
  try {
    const ws = createWorkspace({ environment: { TMPDIR: f.root } });
    assert.equal(fs.existsSync(ws.path), true);
    assert.notEqual(ws.identity, undefined);

    // Rename original workspace aside
    const aside = `${ws.path}-aside-${randomBytes(4).toString('hex')}`;
    fs.renameSync(ws.path, aside);

    // Create replacement directory at original path with a sentinel file
    fs.mkdirSync(ws.path);
    const sentinelFile = path.join(ws.path, 'user-secret.txt');
    fs.writeFileSync(sentinelFile, 'DO NOT DELETE THIS USER DATA');

    // Call cleanupWorkspace with the original workspace descriptor
    const cleanupResult = cleanupWorkspace(ws);

    // MUST return unconfirmed with CLEANUP_UNCONFIRMED
    assert.equal(cleanupResult.outcome, 'unconfirmed');
    assert.equal(cleanupResult.error.code, 'CLEANUP_UNCONFIRMED');

    // Replacement directory AND its sentinel file MUST remain intact
    assert.equal(fs.existsSync(ws.path), true);
    assert.equal(fs.existsSync(sentinelFile), true);
    assert.equal(fs.readFileSync(sentinelFile, 'utf8'), 'DO NOT DELETE THIS USER DATA');

    // Original aside directory must also remain untouched
    assert.equal(fs.existsSync(aside), true);

    // Clean up
    fs.rmSync(sentinelFile);
    fs.rmdirSync(ws.path);
    fs.rmdirSync(aside);
  } finally {
    f.cleanup();
  }
});
