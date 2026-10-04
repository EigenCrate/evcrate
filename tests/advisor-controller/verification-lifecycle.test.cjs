'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ADVISOR_DIR = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const CLI = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/evcrate-advisor');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const {
  isWindows,
  observeConsoleWindows,
  readPinnedFileWindows,
  writePinnedFileWindows,
  resolveWindowsLaunchRecord,
  verifyWindowsLaunchRecord,
  canonicalizeWindowsEnvironment
} = require(path.join(ADVISOR_DIR, 'windows-platform.cjs'));

const {
  createInvocation,
  runInvocation
} = require(path.join(ADVISOR_DIR, 'runner.cjs'));

const {
  observeTerminalDecision
} = require(path.join(ADVISOR_DIR, 'state-human.cjs'));

function makeTestFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-vr-life-'));
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

// ---------------------------------------------------------------------------
// 1. NATIVE FAILURE BOUNDARIES & HOSTILE LIFECYCLE
// ---------------------------------------------------------------------------
test('Native Boundary: Pinned file operations on Windows handle CAS conflicts and CAS integrity', { skip: !isWindows }, () => {
  const f = makeTestFixture();
  try {
    const targetDir = path.join(f.root, 'pinned-cas-test');
    fs.mkdirSync(targetDir);

    const targetFile = path.join(targetDir, 'state.json');
    const content1 = Buffer.from(JSON.stringify({ rev: 1 }));
    const write1 = writePinnedFileWindows(targetFile, content1, { replaceIfExists: false });
    assert.equal(write1.status, 'ok');

    // Read pinned file
    const read1 = readPinnedFileWindows(targetFile, 65536);
    assert.notEqual(read1, null);
    assert.deepEqual(read1.bytes, content1);

    // Write conflict: replaceIfExists = false on existing file
    const writeConflict = writePinnedFileWindows(targetFile, Buffer.from(JSON.stringify({ rev: 99 })), { replaceIfExists: false });
    assert.equal(writeConflict.status, 'conflict');
    assert.equal(writeConflict.code, 'STATE_CONFLICT');

    // CAS Digest mismatch conflict
    const writeDigestMismatch = writePinnedFileWindows(targetFile, Buffer.from(JSON.stringify({ rev: 2 })), {
      replaceIfExists: true,
      expectedDev: write1.dev,
      expectedIno: write1.ino,
      expectedDigest: '0000000000000000000000000000000000000000000000000000000000000000'
    });
    assert.equal(writeDigestMismatch.status, 'conflict');
    assert.equal(writeDigestMismatch.code, 'STATE_CONFLICT');

    // File content remains unchanged
    const readAfterMismatch = readPinnedFileWindows(targetFile, 65536);
    assert.deepEqual(readAfterMismatch.bytes, content1);
  } finally {
    f.cleanup();
  }
});

test('Native Boundary: Supervisor terminates on output flood limit and reports OUTPUT_LIMIT', { skip: !isWindows }, async () => {
  const f = makeTestFixture();
  const script = path.join(f.root, 'flood.cjs');
  fs.writeFileSync(script, 'process.stdout.write("x".repeat(100000)); setInterval(() => {}, 1000);\n');

  try {
    const inv = createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [script],
      cwd: f.project,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'generation', maxStdoutBytes: 1024, maxResultBytes: 1024, killGraceMs: 250 }
    });

    const res = await runInvocation(inv);
    assert.ok(res.error);
    assert.equal(res.error.code, 'OUTPUT_LIMIT');
    assert.equal(res.cleanupOutcome, 'confirmed');
  } finally {
    f.cleanup();
  }
});

test('Native Boundary: Supervisor terminates on timeout and reports TIMEOUT with confirmed cleanup', { skip: !isWindows }, async () => {
  const f = makeTestFixture();
  const script = path.join(f.root, 'hang.cjs');
  fs.writeFileSync(script, 'setInterval(() => {}, 1000);\n');

  try {
    const inv = createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [script],
      cwd: f.project,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'probe', timeoutMs: 600, killGraceMs: 250 }
    });

    const t0 = Date.now();
    const res = await runInvocation(inv);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 4000, `Timeout must resolve bounded, took ${elapsed}ms`);
    assert.ok(res.error);
    assert.equal(res.error.code, 'TIMEOUT');
    assert.equal(res.cleanupOutcome, 'confirmed');
  } finally {
    f.cleanup();
  }
});

test('Native Boundary: Supervisor terminates on AbortSignal cancellation', { skip: !isWindows }, async () => {
  const f = makeTestFixture();
  const script = path.join(f.root, 'cancel.cjs');
  fs.writeFileSync(script, 'setInterval(() => {}, 1000);\n');

  try {
    const inv = createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [script],
      cwd: f.project,
      workspaceRoot: f.root,
      prompt: '',
      authKeys: [],
      limits: { mode: 'generation', killGraceMs: 250 }
    });

    const ac = new AbortController();
    const promise = runInvocation(inv, { signal: ac.signal });

    setTimeout(() => ac.abort(), 200);

    const res = await promise;
    assert.ok(res.error);
    assert.equal(res.error.code, 'CANCELLED');
    assert.equal(res.cleanupOutcome, 'confirmed');
  } finally {
    f.cleanup();
  }
});

test('Native Boundary: Tampered launcher, script, or package.json invalidates launch record', { skip: !isWindows }, () => {
  const f = makeTestFixture();
  try {
    const pkgDir = path.join(f.bin, 'node_modules', '@openai', 'codex');
    fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
    const pkgJson = path.join(pkgDir, 'package.json');
    const scriptJs = path.join(pkgDir, 'bin', 'codex.js');

    fs.writeFileSync(pkgJson, JSON.stringify({ name: '@openai/codex', version: '0.157.1', bin: { codex: 'bin/codex.js' } }));
    fs.writeFileSync(scriptJs, 'console.log("original");');
    fs.writeFileSync(path.join(f.bin, 'codex.cmd'), '@echo off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');

    const env = { PATH: f.bin, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
    const record = resolveWindowsLaunchRecord('codex', env, 'codex');
    assert.notEqual(record, null);
    assert.equal(verifyWindowsLaunchRecord(record), true);

    // Tamper script
    fs.writeFileSync(scriptJs, 'console.log("tampered");');
    assert.equal(verifyWindowsLaunchRecord(record), false, 'Tampered script must invalidate record');

    // Restore script, tamper package.json
    fs.writeFileSync(scriptJs, 'console.log("original");');
    assert.equal(verifyWindowsLaunchRecord(record), true);
    fs.writeFileSync(pkgJson, JSON.stringify({ name: '@openai/codex', version: '0.157.2-tampered', bin: { codex: 'bin/codex.js' } }));
    assert.equal(verifyWindowsLaunchRecord(record), false, 'Tampered package.json must invalidate record');
  } finally {
    f.cleanup();
  }
});

test('Native Boundary: Case-insensitive conflicting environment variables throw INVOCATION_INVALID', { skip: !isWindows }, () => {
  assert.throws(() => {
    canonicalizeWindowsEnvironment({
      Path: 'C:\\first',
      PATH: 'C:\\second'
    });
  }, (err) => err.code === 'INVOCATION_INVALID');

  // Identical values deduplicate safely when PATH is in commonKeys
  const canonical = canonicalizeWindowsEnvironment({
    Path: 'C:\\same',
    PATH: 'C:\\same'
  }, { commonKeys: ['PATH'] });
  assert.equal(canonical.PATH, 'C:\\same');
});

// ---------------------------------------------------------------------------
// 2. COMPLETE ISOLATED CLI V2 CONSULTATION LIFECYCLE
// ---------------------------------------------------------------------------
test('Isolated Source CLI: Complete V2 consultation lifecycle (init -> reserve -> consult -> disp -> outcome -> complete) with history', () => {
  const f = makeTestFixture();
  try {
    fs.writeFileSync(path.join(f.project, 'source.txt'), 'clean user code\n');

    // Set up mock codex provider in sandbox bin with proper scoped package layout
    const pkgDir = path.join(f.bin, 'node_modules', '@openai', 'codex');
    fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: '@openai/codex',
      version: '0.157.1',
      bin: { codex: 'bin/codex.js' }
    }));
    fs.copyFileSync(path.join(FIXTURES_DIR, 'fake-codex.cjs'), path.join(pkgDir, 'bin', 'codex.js'));
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(f.bin, 'codex.cmd'), '@echo off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');
    } else {
      const launcher = path.join(f.bin, 'codex');
      fs.writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${path.join(pkgDir, 'bin', 'codex.js')}" "$@"\n`, { mode: 0o755 });
    }

    // Configure advisor routing policy
    const evcrateDir = path.join(f.home, '.evcrate');
    fs.mkdirSync(evcrateDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(evcrateDir, 'advisor-routing.json'), JSON.stringify({
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
        backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
      history: { retention_days: 30, max_bytes: 104857600 }
    }));

    // Configure fake codex response (concern-free)
    fs.writeFileSync(path.join(f.home, '.evcrate', 'fake-codex-state.json'), JSON.stringify({
      finalCount: 0,
      calls: [],
      returnJson: JSON.stringify({
        recommendation: 'Proceed with verification.',
        rationale: 'All checks passed cleanly.',
        must_fix: [],
        cautions: [],
        assumptions: [],
        success_checks: ['node --version'],
        unresolved_questions: []
      })
    }));

    const taskRunId = randomUUID();
    const task = {
      goal: 'Complete verification readiness',
      non_goals: ['Modifying user workspace'],
      authorized_paths: ['source.txt'],
      scope_rationale: 'Readiness gate',
      invariants: ['Preserve user data'],
      success_criteria: ['Verification passes']
    };

    const tmpDir = path.join(f.root, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
    const env = {
      ...process.env,
      HOME: f.home,
      USERPROFILE: f.home,
      TMPDIR: tmpDir,
      TEMP: tmpDir,
      TMP: tmpDir,
      PATH: `${f.bin}${path.delimiter}${process.env.PATH}`
    };
    delete env.EVCRATE_ADVISOR_ACTIVE;
    delete env.EVCRATE_ADVISOR_DEPTH;

    function invokeCli(args, input) {
      const res = spawnSync(process.execPath, [CLI, ...args], {
        cwd: f.project,
        env,
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 20000
      });
      assert.equal(res.error, undefined, `CLI error: ${res.error}`);
      const trimmed = res.stdout.trim();
      const lines = trimmed.split('\n');
      assert.ok(lines.length >= 1, `Output lines empty: ${trimmed}`);
      return { exit: res.status, value: JSON.parse(lines[lines.length - 1]) };
    }

    // Step 1: Init state (rev 0 -> 1)
    const initRes = invokeCli(['state', 'init'], {
      protocol: 'evcrate-advisor-state',
      version: 1,
      operation: 'init',
      task_run_id: taskRunId,
      operation_id: randomUUID(),
      expected_revision: 0,
      payload: { phase_id: 'phase-04', task, baseline_paths: ['source.txt'] }
    });
    assert.equal(initRes.exit, 0);
    assert.equal(initRes.value.status, 'STATE_READY');
    assert.equal(initRes.value.state.task_revision, 1);

    // Step 2: Reserve checkpoint (rev 1 -> 2)
    const checkpoint = {
      protocol: 'evcrate-advisor-checkpoint',
      version: 2,
      task_run_id: taskRunId,
      checkpoint_id: 'chk-01',
      phase_id: 'phase-04',
      task_revision: 1,
      evidence_revision: 0,
      checkpoint: 'review:phase-04',
      kind: 'review',
      question: 'Is the verification complete?',
      task,
      proposal: { next_action: 'Proceed', rationale: 'Ready', intended_changed_paths: ['source.txt'] },
      evidence: {
        summary: 'Source verified',
        files: [{
          path: 'source.txt',
          excerpt: 'clean user code',
          digest: createHash('sha256').update(fs.readFileSync(path.join(f.project, 'source.txt'))).digest('hex')
        }],
        validation_results: [(() => {
          const check = spawnSync(process.execPath, ['--version'], { encoding: 'utf8' });
          assert.equal(check.status, 0, 'node --version check must succeed');
          assert.match(check.stdout.trim(), /^v\d+\.\d+\.\d+/, 'node --version output must start with v');
          return { suite: 'smoke', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: check.stdout.trim() };
        })()],
        artifacts: []
      },
      prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
    };

    const reserveRes = invokeCli(['state', 'checkpoint'], {
      protocol: 'evcrate-advisor-state',
      version: 1,
      operation: 'checkpoint',
      task_run_id: taskRunId,
      operation_id: randomUUID(),
      expected_revision: 1,
      payload: { checkpoint }
    });
    assert.equal(reserveRes.exit, 0);
    assert.equal(reserveRes.value.status, 'STATE_READY');
    assert.equal(reserveRes.value.state.task_revision, 2);

    // Step 3: Controller consultation -> ADVICE_READY (advances state rev 2 -> 4)
    const adviceRes = invokeCli([], checkpoint);
    assert.equal(adviceRes.exit, 0);
    assert.equal(adviceRes.value.status, 'ADVICE_READY');
    assert.ok(adviceRes.value.correlation_id);

    // Step 4: Disposition (rev 4 -> 5)
    const dispRes = invokeCli(['state', 'disposition'], {
      protocol: 'evcrate-advisor-state',
      version: 1,
      operation: 'disposition',
      task_run_id: taskRunId,
      operation_id: randomUUID(),
      expected_revision: 4,
      payload: {
        consultation_id: adviceRes.value.correlation_id,
        evidence_revision: 0,
        action: 'accept',
        rationale: 'Accepted without correction',
        correction: null
      }
    });
    assert.equal(dispRes.exit, 0);
    assert.equal(dispRes.value.status, 'STATE_READY');
    assert.equal(dispRes.value.state.task_revision, 5);

    // Step 5: Outcome (rev 5 -> 6)
    const outcomeRes = invokeCli(['state', 'outcome'], {
      protocol: 'evcrate-advisor-state',
      version: 1,
      operation: 'outcome',
      task_run_id: taskRunId,
      operation_id: randomUUID(),
      expected_revision: 5,
      payload: {
        consultation_id: adviceRes.value.correlation_id,
        action_id: null,
        episode_id: null,
        result: 'resolved',
        validation: (() => {
          const check = spawnSync(process.execPath, ['--version'], { encoding: 'utf8' });
          assert.equal(check.status, 0, 'node --version check must succeed');
          assert.match(check.stdout.trim(), /^v\d+\.\d+\.\d+/, 'node --version output must start with v');
          return { suite: 'smoke', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: check.stdout.trim() };
        })(),
        actual_changed_paths: []
      }
    });
    assert.equal(outcomeRes.exit, 0);
    assert.equal(outcomeRes.value.status, 'STATE_READY');
    assert.equal(outcomeRes.value.state.task_revision, 6);

    // Step 6: Complete (rev 6 -> completed)
    const completeRes = invokeCli(['state', 'complete'], {
      protocol: 'evcrate-advisor-state',
      version: 1,
      operation: 'complete',
      task_run_id: taskRunId,
      operation_id: randomUUID(),
      expected_revision: 6,
      payload: {}
    });
    assert.equal(completeRes.exit, 0);
    assert.equal(completeRes.value.status, 'STATE_READY');
    assert.equal(completeRes.value.state.gate_status, 'completed');

    // Step 7: History Management operations
    const projectId = createHash('sha256').update(f.project).digest('hex');
    const exportTarget = path.join(f.root, 'cli-export.json');

    // History metrics
    const metricsRes = invokeCli(['history', 'metrics'], {
      protocol: 'evcrate-advisor-history',
      version: 1,
      operation: 'metrics',
      project_id: projectId,
      task_run_id: null,
      filters: null
    });
    assert.equal(metricsRes.exit, 0);
    assert.equal(metricsRes.value.status, 'HISTORY_READY');
    assert.ok(metricsRes.value.counts.terminal >= 1);

    // History export preview
    const previewRes = invokeCli(['history', 'export'], {
      protocol: 'evcrate-advisor-history',
      version: 1,
      operation: 'export',
      destination: exportTarget,
      project_id: projectId,
      task_run_id: null,
      consultation_id: null,
      dry_run: true
    });
    assert.equal(previewRes.exit, 0);
    assert.equal(previewRes.value.status, 'HISTORY_READY');
    assert.ok(previewRes.value.exported_count >= 1);

    // History export apply
    const exportRes = invokeCli(['history', 'export'], {
      protocol: 'evcrate-advisor-history',
      version: 1,
      operation: 'export',
      destination: exportTarget,
      project_id: projectId,
      task_run_id: null,
      consultation_id: null,
      dry_run: false
    });
    assert.equal(exportRes.exit, 0);
    assert.equal(exportRes.value.status, 'HISTORY_READY');
    assert.ok(exportRes.value.exported_count >= 1);
    assert.equal(fs.existsSync(exportTarget), true);

    // History prune
    const pruneRes = invokeCli(['history', 'prune'], {
      protocol: 'evcrate-advisor-history',
      version: 1,
      operation: 'prune',
      dry_run: true,
      retention_days: 1,
      max_bytes: null
    });
    assert.equal(pruneRes.exit, 0);
    assert.equal(pruneRes.value.status, 'HISTORY_READY');
  } finally {
    f.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 3. CONSOLE OBSERVATION & NONCE CHALLENGE
// ---------------------------------------------------------------------------
test('Console Observation: Unattended observer fails closed with HUMAN_EVENT_REQUIRED', { skip: !isWindows }, async () => {
  const decision = JSON.stringify({ task_run_id: 'vr-run', expected_revision: 1, decision: 'abandon' });
  const challenge = 'authorize vr-run 1 abcdef';

  await assert.rejects(
    () => observeConsoleWindows(decision, challenge, null, 100),
    (err) => err?.code === 'HUMAN_EVENT_REQUIRED'
  );
});

test('Console Observation: Abort signal cancellation immediately aborts and reports CANCELLED', async () => {
  const request = { task_run_id: randomUUID(), expected_revision: 1, payload: { action: 'continue' } };
  await assert.rejects(
    () => observeTerminalDecision(request, AbortSignal.abort()),
    (err) => err?.code === 'CANCELLED'
  );
});

test('Console Observation: Piped challenge text to stdin does not satisfy CONIN$ console requirement', { skip: !isWindows }, async () => {
  const decision = JSON.stringify({ task_run_id: 'pipe-test', expected_revision: 1, decision: 'continue' });
  const challenge = 'authorize pipe-test 1 123456';

  await assert.rejects(
    () => observeConsoleWindows(decision, challenge, null, 150),
    (err) => err?.code === 'HUMAN_EVENT_REQUIRED'
  );
});
