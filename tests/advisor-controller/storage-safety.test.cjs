'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');

const ADVISOR_DIR = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const { stateLocation, transactState } = require(path.join(ADVISOR_DIR, 'state-io.cjs'));
const {
  recordStartedExecution,
  recordTerminalExecution,
  recordOutcome
} = require(path.join(ADVISOR_DIR, 'history-store.cjs'));
const { createWorkspace, cleanupWorkspace } = require(path.join(ADVISOR_DIR, 'isolated-workspace.cjs'));
const {
  isWindows,
  readPinnedFileWindows,
  writePinnedFileWindows,
  verifyPinnedDirectoryWindows
} = require(path.join(ADVISOR_DIR, 'windows-platform.cjs'));
const { computeCheckpointDigestV2 } = require(path.join(ADVISOR_DIR, 'contracts-v2.cjs'));

function makeTestFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-storage-test-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return {
    root,
    home,
    project,
    cleanup() {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
    }
  };
}

test('C1 regression: state no-replace creation never overwrites competing state (R4 reproduction)', () => {
  const f = makeTestFixture();
  try {
    const taskRunId = '00000000-0000-4000-8000-000000000001';
    const loc = stateLocation({ cwd: f.project, environment: { HOME: f.home } }, taskRunId);
    const stateFile = path.join(loc.taskDirectory, 'state.json');
    const competingBytes = Buffer.from(JSON.stringify({ writer: 'competitor', revision: 999 }));
    let competingStat;

    // R4 reproduction: previous was null at transaction start; competitor injects state.json
    // inside the race window before atomic publication.
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

    // Competing destination must be strictly preserved!
    const afterStat = fs.lstatSync(stateFile, { bigint: true });
    assert.equal(afterStat.dev.toString(), competingStat.dev.toString());
    assert.equal(afterStat.ino.toString(), competingStat.ino.toString());
    assert.deepEqual(fs.readFileSync(stateFile), competingBytes);

    // No temporary staging file left behind
    const remainingTmp = fs.readdirSync(loc.taskDirectory).filter(e => e.startsWith('.state-'));
    assert.equal(remainingTmp.length, 0);
  } finally {
    f.cleanup();
  }
});

test('C1 uncontended state creation succeeds', () => {
  const f = makeTestFixture();
  try {
    const taskRunId = '00000000-0000-4000-8000-000000000002';
    const loc = stateLocation({ cwd: f.project, environment: { HOME: f.home } }, taskRunId);

    const res = transactState(loc, { create: true }, () => ({
      state: { writer: 'controller', revision: 1, sentinel: 'initial' },
      result: 'created'
    }));
    assert.equal(res, 'created');

    const stateFile = path.join(loc.taskDirectory, 'state.json');
    assert.equal(fs.existsSync(stateFile), true);
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(data.revision, 1);
    assert.equal(data.sentinel, 'initial');
  } finally {
    f.cleanup();
  }
});

test('C1 regression: history outcome no-replace creation never overwrites competing outcome', () => {
  const f = makeTestFixture();
  try {
    const projectId = createHash('sha256').update(f.project).digest('hex');
    const taskRunId = '00000000-0000-4000-8000-000000000003';
    const consultationId = '00000000-0000-4000-8000-000000000004';
    const deps = { cwd: f.project, environment: { HOME: f.home } };

    const checkpoint = {
      protocol: 'evcrate-advisor-checkpoint',
      version: 2,
      task_run_id: taskRunId,
      checkpoint_id: 'chk-1',
      phase_id: 'phase-1',
      task_revision: 1,
      evidence_revision: 0,
      checkpoint: 'review:step-1',
      kind: 'review',
      question: 'Ready?',
      task: { goal: 'Test', non_goals: [], authorized_paths: [], scope_rationale: 'test', invariants: [], success_criteria: [] },
      proposal: { next_action: 'Proceed', rationale: 'none', intended_changed_paths: [] },
      evidence: { summary: 'ok', files: [], validation_results: [], artifacts: [] },
      prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
    };
    const digest = computeCheckpointDigestV2(checkpoint);

    const started = {
      schema_version: 1,
      consultation_id: consultationId,
      task_run_id: taskRunId,
      project_id: projectId,
      checkpoint_digest: digest,
      checkpoint,
      route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      receipt: null,
      prompt_identity: 'canonical-mentor-brief-v2',
      build_identity: 'test-build',
      attempts: [],
      status: 'started',
      result: null,
      error: null,
      started_at: 1000,
      completed_at: null
    };
    recordStartedExecution(deps, started);

    const terminal = {
      ...started,
      status: 'ADVICE_READY',
      receipt: {
        backend: 'codex',
        model: 'gpt-5.6-sol',
        effort: 'high',
        controller_version: 2,
        adapter_version: '0.150.1',
        elapsed_ms: 1000,
        build_identity: 'test-build'
      },
      result: {
        protocol: 'evcrate-advisor-result',
        version: 2,
        checkpoint: 'review:step-1',
        status: 'ADVICE_READY',
        recommendation: 'Done.',
        rationale: 'Verified.',
        must_fix: [],
        cautions: [],
        assumptions: [],
        success_checks: [],
        unresolved_questions: []
      },
      completed_at: 2000
    };
    recordTerminalExecution(deps, terminal);

    // Inject competing outcome.json into the consultation directory
    const consultDir = path.join(f.home, '.evcrate', 'advisor-history', projectId.toLowerCase(), taskRunId.toLowerCase(), consultationId.toLowerCase());
    assert.equal(fs.existsSync(consultDir), true);
    const outFile = path.join(consultDir, 'outcome.json');
    const competingOutcome = Buffer.from(JSON.stringify({ outcome: 'competitor', custom: 'preserved' }));
    fs.writeFileSync(outFile, competingOutcome);
    const competingStat = fs.lstatSync(outFile, { bigint: true });
    const outcomeRecord = {
      schema_version: 1,
      consultation_id: consultationId,
      task_run_id: taskRunId,
      project_id: projectId,
      disposition: { action: 'accept', rationale: 'Approved changes.' },
      evidence_revision: 3,
      actual_changed_paths: ['source.txt'],
      validation: {
        suite: 'test',
        command: 'npm run test',
        status: 'passed',
        passed: 1,
        failed: 0,
        details: null
      },
      outcome: 'resolved',
      correction_number: 1,
      recorded_at: 2500
    };

    assert.throws(() => {
      recordOutcome(deps, outcomeRecord);
    }, (err) => err.code === 'AUDIT_DEGRADED');

    // Competing outcome file MUST be untouched!
    const afterStat = fs.lstatSync(outFile, { bigint: true });
    assert.equal(afterStat.dev.toString(), competingStat.dev.toString());
    assert.equal(afterStat.ino.toString(), competingStat.ino.toString());
    assert.deepEqual(fs.readFileSync(outFile), competingOutcome);
  } finally {
    f.cleanup();
  }
});

test('C2 regression: workspace replacement is protected from deletion (R5 reproduction)', () => {
  const f = makeTestFixture();
  try {
    const ws = createWorkspace({
      environment: { TMPDIR: f.root }
    });
    assert.equal(fs.existsSync(ws.path), true);
    assert.notEqual(ws.identity, undefined);

    // R5 attack simulation: rename original aside, create replacement directory at original path
    const aside = `${ws.path}-aside-${randomBytes(4).toString('hex')}`;
    fs.renameSync(ws.path, aside);

    // Create replacement directory at original path with a sentinel file
    fs.mkdirSync(ws.path);
    const sentinelFile = path.join(ws.path, 'user-secret.txt');
    fs.writeFileSync(sentinelFile, 'DO NOT DELETE THIS USER DATA');

    // Call cleanupWorkspace with the original workspace descriptor
    const cleanupResult = cleanupWorkspace(ws);

    // MUST return unconfirmed with CLEANUP_UNCONFIRMED error!
    assert.equal(cleanupResult.outcome, 'unconfirmed');
    assert.equal(cleanupResult.error.code, 'CLEANUP_UNCONFIRMED');

    // Replacement directory AND its sentinel file MUST remain completely intact!
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

test('C2: ordinary owned workspace successfully cleans up and confirms removal', () => {
  const f = makeTestFixture();
  try {
    const ws = createWorkspace({
      environment: { TMPDIR: f.root }
    });
    assert.equal(fs.existsSync(ws.path), true);

    // Write internal entries
    fs.writeFileSync(path.join(ws.path, 'output.txt'), 'result');
    fs.mkdirSync(path.join(ws.path, 'sub'));
    fs.writeFileSync(path.join(ws.path, 'sub', 'nested.txt'), 'nested');

    const cleanupResult = cleanupWorkspace(ws);
    assert.equal(cleanupResult.outcome, 'confirmed');
    assert.equal(fs.existsSync(ws.path), false);
  } finally {
    f.cleanup();
  }
});
test('C2 probe: ancestor-junction replacement protects outside tree and returns unconfirmed', () => {
  const f = makeTestFixture();
  try {
    const ws = createWorkspace({ environment: { TMPDIR: f.root } });
    assert.equal(fs.existsSync(ws.path), true);

    const outsideTarget = path.join(f.root, 'outside-sentinel-tree');
    fs.mkdirSync(outsideTarget);
    const sentinelFile = path.join(outsideTarget, 'outside-secret.txt');
    fs.writeFileSync(sentinelFile, 'OUTSIDE SENSITIVE DATA');

    const fakeWs = {
      ...ws,
      identity: {
        ...ws.identity,
        rootDev: '99999999',
        rootIno: '88888888'
      }
    };
    const res = cleanupWorkspace(fakeWs);
    assert.equal(res.outcome, 'unconfirmed');
    assert.equal(res.error.code, 'CLEANUP_UNCONFIRMED');

    assert.equal(fs.existsSync(sentinelFile), true);
    assert.equal(fs.readFileSync(sentinelFile, 'utf8'), 'OUTSIDE SENSITIVE DATA');

    cleanupWorkspace(ws);
  } finally {
    f.cleanup();
  }
});

test('C2 probe: real ancestor junction substitution protects outside tree on Windows', () => {
  if (!isWindows) return;
  const f = makeTestFixture();
  try {
    const parentDir = path.join(f.root, 'parent');
    fs.mkdirSync(parentDir);
    const ws = createWorkspace({ environment: { TMPDIR: parentDir } });

    const outsideDir = path.join(f.root, 'outside-tree');
    fs.mkdirSync(outsideDir);
    const sentinel = path.join(outsideDir, 'critical.txt');
    fs.writeFileSync(sentinel, 'DO NOT TOUCH');

    const aside = path.join(f.root, 'parent-aside');
    fs.renameSync(parentDir, aside);
    fs.symlinkSync(outsideDir, parentDir, 'junction');

    const res = cleanupWorkspace(ws);
    assert.equal(res.outcome, 'unconfirmed');
    assert.equal(res.error.code, 'CLEANUP_UNCONFIRMED');

    assert.equal(fs.existsSync(sentinel), true);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'DO NOT TOUCH');

    fs.unlinkSync(parentDir);
    fs.renameSync(aside, parentDir);
    cleanupWorkspace(ws);
  } finally {
    f.cleanup();
  }
});

test('C2 probe: failed-creation cleanup retains error and does not delete unowned directory', () => {
  const f = makeTestFixture();
  try {
    const notDir = path.join(f.root, 'not-a-directory.txt');
    fs.writeFileSync(notDir, 'just a file');
    assert.throws(() => {
      createWorkspace({ environment: { TMPDIR: notDir } });
    }, (err) => err.code === 'CWD_UNSAFE');
    assert.equal(fs.existsSync(notDir), true);
    assert.equal(fs.readFileSync(notDir, 'utf8'), 'just a file');
  } finally {
    f.cleanup();
  }
});

test('C2 probe: swap during deletion fails closed and protects outside sentinel', () => {
  const f = makeTestFixture();
  try {
    const ws = createWorkspace({ environment: { TMPDIR: f.root } });
    const subDir = path.join(ws.path, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'file.txt'), 'content');

    const outside = path.join(f.root, 'outside');
    fs.mkdirSync(outside);
    const sentinel = path.join(outside, 'outside-keep.txt');
    fs.writeFileSync(sentinel, 'IMMUTABLE SENTINEL');

    let swapped = false;
    const interceptedFs = {
      ...fs,
      readdirSync(p, opts) {
        if (p === ws.path && !swapped) {
          swapped = true;
          fs.rmSync(subDir, { recursive: true, force: true });
          if (isWindows) {
            fs.symlinkSync(outside, subDir, 'junction');
          } else {
            fs.symlinkSync(outside, subDir);
          }
        }
        return fs.readdirSync(p, opts);
      }
    };

    const res = cleanupWorkspace(ws, interceptedFs);
    assert.notEqual(res.outcome, 'confirmed');

    assert.equal(fs.existsSync(sentinel), true);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'IMMUTABLE SENTINEL');

    try { fs.unlinkSync(subDir); } catch {}
    try { fs.rmSync(ws.path, { recursive: true, force: true }); } catch {}
  } finally {
    f.cleanup();
  }
});
test('H3: native pinned file operations on Windows', () => {
  if (!isWindows) return;
  const f = makeTestFixture();
  try {
    const targetDir = path.join(f.root, 'pinned-test');
    fs.mkdirSync(targetDir);

    // Verify pinned directory
    const validDir = verifyPinnedDirectoryWindows(targetDir);
    assert.equal(validDir, true);

    // Write pinned file (no replace)
    const targetFile = path.join(targetDir, 'state.json');
    const content1 = Buffer.from(JSON.stringify({ rev: 1 }));
    const write1 = writePinnedFileWindows(targetFile, content1, { replaceIfExists: false });
    assert.equal(write1.status, 'ok');
    assert.notEqual(write1.dev, undefined);
    assert.notEqual(write1.ino, undefined);

    // Read pinned file
    const read1 = readPinnedFileWindows(targetFile, 65536);
    assert.notEqual(read1, null);
    assert.equal(read1.stat.dev.toString(), write1.dev);
    assert.equal(read1.stat.ino.toString(), write1.ino);
    assert.deepEqual(read1.bytes, content1);

    // Write pinned file with replaceIfExists: false on existing file must return conflict
    const writeConflict = writePinnedFileWindows(targetFile, Buffer.from(JSON.stringify({ rev: 99 })), { replaceIfExists: false });
    assert.equal(writeConflict.status, 'conflict');
    assert.equal(writeConflict.code, 'STATE_CONFLICT');

    // Existing file content must be untouched
    const readAfterConflict = readPinnedFileWindows(targetFile, 65536);
    assert.deepEqual(readAfterConflict.bytes, content1);

    // Write pinned file with replaceIfExists: true and matching expectedDev/Ino
    const content2 = Buffer.from(JSON.stringify({ rev: 2 }));
    const write2 = writePinnedFileWindows(targetFile, content2, {
      replaceIfExists: true,
      expectedDev: write1.dev,
      expectedIno: write1.ino,
      expectedDigest: createHash('sha256').update(content1).digest('hex')
    });
    assert.equal(write2.status, 'ok');
    assert.notEqual(write2.ino, undefined);

    // Read updated file
    const read2 = readPinnedFileWindows(targetFile, 65536);
    assert.deepEqual(read2.bytes, content2);

    // CAS rejection: write with mismatched expectedDigest
    const writeDigestMismatch = writePinnedFileWindows(targetFile, Buffer.from(JSON.stringify({ rev: 3 })), {
      replaceIfExists: true,
      expectedDev: write2.dev,
      expectedIno: write2.ino,
      expectedDigest: '0000000000000000000000000000000000000000000000000000000000000000'
    });
    assert.equal(writeDigestMismatch.status, 'conflict');
    assert.equal(writeDigestMismatch.code, 'STATE_CONFLICT');

    // Existing content remains content2
    const readAfterMismatch = readPinnedFileWindows(targetFile, 65536);
    assert.deepEqual(readAfterMismatch.bytes, content2);
  } finally {
    f.cleanup();
  }
});
