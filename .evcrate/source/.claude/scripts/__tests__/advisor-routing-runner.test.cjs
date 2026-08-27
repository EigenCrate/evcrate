'use strict';

const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  DEFAULT_LIMITS,
  RECURSION_MARKER,
  buildChildEnvironment,
  createInvocation,
  redactDiagnostics,
  runInvocation,
  validateContainedCwd
} = require('../advisor-routing/runner.cjs');
const {
  cleanupWorkspace,
  createFakeInvocation,
  createWorkspace,
  FIXTURE,
  runFakeMode
} = require('./helpers/fake-advisor-cli-harness.cjs');

function expectCode(callback, code) {
  return assert.rejects(callback, (error) => error && error.code === code);
}

async function assertDescendantGone(pid) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } catch {
      return;
    }
  }
  assert.fail(`descendant process ${pid} survived cleanup`);
}

test('runs a fixed executable with prompt on stdin and a minimal marked environment', async () => {
  const result = await runFakeMode('success', {
    environment: {
      PATH: process['env'].PATH,
      HOME: '/safe/home',
      FAKE_ADVISOR_AUTH: 'opaque-secret',
      EVCRATE_PRIVATE: 'must-not-inherit'
    }
  });
  assert.equal(result.error, undefined);
  assert.equal(JSON.parse(result.result.stdout).response, 'FAKE_OK');
  assert.equal(JSON.parse(result.result.stdout).promptBytes, Buffer.byteLength('Reply exactly: OK'));
});

test('keeps only common runtime and declared auth keys, then sets one recursion marker', () => {
  const environment = buildChildEnvironment({
    adapter: 'codex',
    source: {
      PATH: '/bin',
      HOME: '/home/test',
      FAKE_ADVISOR_AUTH: 'opaque-secret',
      UNDECLARED_SECRET: 'do-not-copy',
      EVCRATE_PRIVATE: 'inherited',
      EVCRATE_REQUEST_DEPTH: '5'
    },
    authKeys: []
  });
  assert.deepEqual(Object.keys(environment).sort(), ['EVCRATE_ADVISOR_ACTIVE', 'HOME', 'PATH']);
  assert.equal(environment[RECURSION_MARKER], '1');
  assert.equal(environment.UNDECLARED_SECRET, undefined);
  assert.equal(environment.FAKE_ADVISOR_AUTH, undefined);
  assert.throws(() => buildChildEnvironment({
    adapter: 'codex', source: { PATH: '/bin', FAKE_ADVISOR_AUTH: 'opaque-secret' },
    authKeys: ['FAKE_ADVISOR_AUTH']
  }), (error) => error.code === 'ADAPTER_CONTRACT_INVALID');
});

test('rejects recursion before spawn and before any executable work', async () => {
  const fixture = createFakeInvocation();
  let spawns = 0;
  try {
    await expectCode(
      () => runInvocation(fixture.invocation, {
        environment: { PATH: process['env'].PATH, EVCRATE_ADVISOR_ACTIVE: '1' },
        spawn: () => { spawns += 1; }
      }),
      'ADVISOR_RECURSION'
    );
    assert.equal(spawns, 0);
    await expectCode(
      () => runInvocation(fixture.invocation, {
        environment: { PATH: process['env'].PATH },
        requestDepth: 1,
        spawn: () => { spawns += 1; }
      }),
      'ADVISOR_RECURSION'
    );
    assert.equal(spawns, 0);
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('rejects shell text, prompt-in-argv, and uncontained working directories', () => {
  const fixture = createWorkspace();
  try {
    assert.throws(() => createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [fixture.root, '-c', 'echo hi'],
      cwd: fixture.cwd, workspaceRoot: fixture.root, prompt: 'prompt', authKeys: [], limits: {}
    }), (error) => error.code === 'INVOCATION_INVALID');
    assert.throws(() => createInvocation({
      adapter: 'codex', executable: process.execPath, argv: ['prompt'],
      cwd: fixture.cwd, workspaceRoot: fixture.root, prompt: 'prompt', authKeys: [], limits: {}
    }), (error) => error.code === 'INVOCATION_INVALID');
    assert.throws(() => createInvocation({
      adapter: 'codex', executable: process.execPath, argv: ['x'],
      cwd: fixture.cwd, workspaceRoot: fixture.root, prompt: 'x', authKeys: [], limits: {}
    }), (error) => error.code === 'INVOCATION_INVALID');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-outside-'));
    try {
      assert.throws(() => validateContainedCwd(outside, fixture.root), (error) => error.code === 'CWD_UNSAFE');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    cleanupWorkspace(fixture);
  }
});

test('supports spaces in contained paths and argv values with shell false', async () => {
  const workspace = createWorkspace('evcrate fake advisor-');
  try {
    const invocation = createInvocation({
      adapter: 'codex',
      executable: process.execPath,
      argv: [FIXTURE, '--mode', 'success', '--label', path.join(workspace.cwd, 'value with spaces')],
      cwd: workspace.cwd,
      workspaceRoot: workspace.root,
      prompt: 'Reply exactly: OK',
      authKeys: [],
      limits: {}
    });
    const outcome = await runInvocation(invocation, { environment: { PATH: process['env'].PATH } });
    assert.equal(outcome.error, undefined);
    assert.equal(JSON.parse(outcome.result.stdout).response, 'FAKE_OK');
  } finally {
    cleanupWorkspace(workspace);
  }
});

test('fails closed on missing executable and nonzero process exit', async () => {
  const missing = await runFakeMode('missing');
  assert.equal(missing.error.code, 'EXECUTABLE_UNAVAILABLE');
  const failed = await runFakeMode('process');
  assert.equal(failed.error.code, 'PROCESS_FAILED');
});

test('bounds stdout, stderr, lines, and invalid UTF-8 without returning partial success', async () => {
  const output = await runFakeMode('output', { limits: { maxStdoutBytes: 128, killGraceMs: 20 } });
  assert.equal(output.error.code, 'OUTPUT_LIMIT');
  assert.equal(output.result, undefined);
  const lines = await runFakeMode('lines', { limits: { maxLines: 2, killGraceMs: 20 } });
  assert.equal(lines.error.code, 'LINE_LIMIT');
  const stderr = await runFakeMode('stderr', {
    environment: { FAKE_ADVISOR_AUTH: 'opaque-secret' },
    limits: { maxStderrBytes: 100000 }
  });
  assert.equal(stderr.error, undefined);
  assert.doesNotMatch(stderr.result.stderr, /super-secret/);
  const processFailure = await runFakeMode('process', {
    limits: { maxStdoutBytes: 128, maxStderrBytes: 128 }
  });
  assert.equal(processFailure.error.code, 'PROCESS_FAILED');
  assert.ok(Buffer.byteLength(processFailure.failure.diagnostics.stdout, 'utf8') <= 128);
  assert.doesNotMatch(processFailure.failure.diagnostics.stdout, /stdout-secret/iu);
  assert.doesNotMatch(processFailure.failure.diagnostics.stderr, /super-secret/iu);
  const redacted = redactDiagnostics(
    'token=super-secret auth=opaque-secret Bearer bearer-secret',
    ['opaque-secret']
  );
  assert.doesNotMatch(redacted, /super-secret|opaque-secret|bearer-secret/iu);
  const credentialText = '{"access_token":"tok-123","client_secret":"sec-456"} '
    + 'Authorization: Basic dXNlcjpwYXNz gho_12345678901234567890 '
    + 'npm_12345678901234567890 AKIA1234567890123456';
  const credentialRedacted = redactDiagnostics(credentialText, [], 128);
  assert.doesNotMatch(credentialRedacted, /tok-123|sec-456|dXNlcjpwYXNz|gho_|npm_|AKIA/iu);
  assert.ok(Buffer.byteLength(credentialRedacted, 'utf8') <= 128);
  const boundedExpansion = redactDiagnostics('x'.repeat(20_000), ['x'], 128);
  assert.ok(Buffer.byteLength(boundedExpansion, 'utf8') <= 128);
  const invalid = await runFakeMode('invalid-utf8');
  assert.equal(invalid.error.code, 'OUTPUT_INVALID');
});

test('terminates timeout and cancellation paths with typed failures', async () => {
  const timedOut = await runFakeMode('timeout', { limits: { timeoutMs: 40, killGraceMs: 20 } });
  assert.equal(timedOut.error.code, 'TIMEOUT');

  const fixture = createFakeInvocation({ mode: 'cancel', limits: { timeoutMs: 1000, killGraceMs: 20 } });
  const controller = new AbortController();
  try {
    const pending = runInvocation(fixture.invocation, { signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    const cancelled = await pending;
    assert.equal(cancelled.error.code, 'CANCELLED');
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('reports process lifecycle details without exposing command or stream data', async () => {
  const events = [];
  let clock = 0;
  const timedOut = await runFakeMode('timeout', {
    limits: { timeoutMs: 40, killGraceMs: 20 },
    now: () => { clock += 1; return clock; },
    onLifecycle: (event) => events.push(event)
  });
  assert.equal(timedOut.error.code, 'TIMEOUT');
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'timeout');
  assert.ok(Number.isInteger(events[0].pid) && events[0].pid > 0);
  assert.ok(Number.isSafeInteger(events[0].elapsed_ms) && events[0].elapsed_ms >= 0);
  assert.ok(Number.isSafeInteger(events[0].termination_wait_ms) && events[0].termination_wait_ms >= 0);
  assert.deepEqual(Object.keys(events[0]).sort(), [
    'elapsed_ms', 'pid', 'status', 'termination_wait_ms'
  ]);
});

test('cancels synchronously after spawn before stdin delivery', async () => {
  const fixture = createFakeInvocation({ limits: { killGraceMs: 0 } });
  const controller = new AbortController();
  const child = new EventEmitter();
  const signals = [];
  let stdinEnds = 0;
  child.pid = 4343;
  child.stdin = new EventEmitter();
  child.stdin.destroy = () => {};
  child.stdin.end = () => { stdinEnds += 1; };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  try {
    const outcome = await runInvocation(fixture.invocation, {
      environment: { PATH: '/bin' },
      signal: controller.signal,
      spawn: () => {
        controller.abort();
        return child;
      },
      kill: (pid, signal) => signals.push([pid, signal])
    });
    assert.equal(outcome.error.code, 'CANCELLED');
    assert.equal(outcome.result, undefined);
    assert.equal(stdinEnds, 0);
    assert.deepEqual(signals, [[-4343, 'SIGTERM'], [-4343, 'SIGKILL']]);
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('handles stdin EPIPE as a typed process failure without an unhandled stream error', async () => {
  const fixture = createFakeInvocation();
  const child = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.destroy = () => {};
  child.stdin.end = () => process.nextTick(() => child.stdin.emit('error', new Error('EPIPE')));
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  try {
    const outcome = await runInvocation(fixture.invocation, {
      environment: { PATH: '/bin' },
      spawn: () => child,
      kill: () => {}
    });
    assert.equal(outcome.error.code, 'PROCESS_FAILED');
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('sends process-group SIGKILL even when the direct child closes after SIGTERM', async () => {
  const fixture = createFakeInvocation({ limits: { timeoutMs: 5, killGraceMs: 2 } });
  const child = new EventEmitter();
  const signals = [];
  child.pid = 4242;
  child.stdin = new EventEmitter();
  child.stdin.destroy = () => {};
  child.stdin.end = () => {};
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (signal) => signals.push(signal);
  const recordSignal = (pid, signal) => {
    signals.push([pid, signal]);
    if (signal === 'SIGTERM') process.nextTick(() => child.emit('close', 0, null));
  };
  try {
    const outcome = await runInvocation(fixture.invocation, {
      environment: { PATH: '/bin' },
      spawn: () => child,
      kill: recordSignal
    });
    assert.equal(outcome.error.code, 'TIMEOUT');
    assert.deepEqual(signals, [[-4242, 'SIGTERM'], [-4242, 'SIGKILL']]);
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('kills a real POSIX descendant after the direct fake CLI closes', { skip: process.platform === 'win32' }, async () => {
  const fixture = createFakeInvocation({ mode: 'tree-timeout', limits: { timeoutMs: 40, killGraceMs: 20 } });
  let descendantPid;
  try {
    const outcome = await runInvocation(fixture.invocation, { environment: { PATH: '/bin' } });
    assert.equal(outcome.error.code, 'TIMEOUT');
    descendantPid = Number(fs.readFileSync(path.join(fixture.workspace.cwd, 'descendant.pid'), 'utf8'));
    assert.ok(Number.isInteger(descendantPid) && descendantPid > 0);
    await assertDescendantGone(descendantPid);
    descendantPid = undefined;
  } finally {
    if (descendantPid) {
      try { process.kill(descendantPid, 'SIGKILL'); } catch { /* already reaped */ }
    }
    cleanupWorkspace(fixture.workspace);
  }
});

test('cleans POSIX descendants for nonzero and signal failures', { skip: process.platform === 'win32' }, async () => {
  for (const mode of ['tree-process', 'tree-signal']) {
    const fixture = createFakeInvocation({ mode, limits: { killGraceMs: 20 } });
    let descendantPid;
    try {
      const outcome = await runInvocation(fixture.invocation, { environment: { PATH: '/bin' } });
      assert.equal(outcome.error.code, 'PROCESS_FAILED');
      descendantPid = Number(fs.readFileSync(path.join(fixture.workspace.cwd, 'descendant.pid'), 'utf8'));
      assert.ok(Number.isInteger(descendantPid) && descendantPid > 0);
      await assertDescendantGone(descendantPid);
      descendantPid = undefined;
    } finally {
      if (descendantPid) {
        try { process.kill(descendantPid, 'SIGKILL'); } catch { /* already reaped */ }
      }
      cleanupWorkspace(fixture.workspace);
    }
  }
});

test('cleans POSIX descendants for output-limit and cancellation failures', { skip: process.platform === 'win32' }, async () => {
  const outputFixture = createFakeInvocation({
    mode: 'tree-output',
    limits: { maxStdoutBytes: 128, killGraceMs: 20 }
  });
  let outputPid;
  try {
    const outcome = await runInvocation(outputFixture.invocation, { environment: { PATH: '/bin' } });
    assert.equal(outcome.error.code, 'OUTPUT_LIMIT');
    outputPid = Number(fs.readFileSync(path.join(outputFixture.workspace.cwd, 'descendant.pid'), 'utf8'));
    await assertDescendantGone(outputPid);
    outputPid = undefined;
  } finally {
    if (outputPid) {
      try { process.kill(outputPid, 'SIGKILL'); } catch { /* already reaped */ }
    }
    cleanupWorkspace(outputFixture.workspace);
  }

  const cancelFixture = createFakeInvocation({
    mode: 'tree-cancel',
    limits: { timeoutMs: 1000, killGraceMs: 20 }
  });
  const controller = new AbortController();
  let cancelPid;
  try {
    const pending = runInvocation(cancelFixture.invocation, {
      environment: { PATH: '/bin' },
      signal: controller.signal
    });
    setTimeout(() => controller.abort(), 50);
    const outcome = await pending;
    assert.equal(outcome.error.code, 'CANCELLED');
    cancelPid = Number(fs.readFileSync(path.join(cancelFixture.workspace.cwd, 'descendant.pid'), 'utf8'));
    await assertDescendantGone(cancelPid);
    cancelPid = undefined;
  } finally {
    if (cancelPid) {
      try { process.kill(cancelPid, 'SIGKILL'); } catch { /* already reaped */ }
    }
    cleanupWorkspace(cancelFixture.workspace);
  }
});

test('normalizes synchronous spawn failures and rejects non-numeric request depth', async () => {
  const fixture = createFakeInvocation();
  try {
    await expectCode(() => runInvocation(fixture.invocation, {
      environment: { PATH: '/bin' },
      spawn: () => {
        const error = new Error('permission denied');
        error.code = 'EACCES';
        throw error;
      }
    }), 'PROCESS_FAILED');
    await expectCode(
      () => runInvocation(fixture.invocation, { environment: { PATH: '/bin' }, requestDepth: Number.NaN }),
      'REQUEST_DEPTH_INVALID'
    );
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('uses stable bounded defaults and freezes created invocations', () => {
  const fixture = createFakeInvocation({ limits: { maxPromptBytes: DEFAULT_LIMITS.maxPromptBytes } });
  try {
    assert.ok(Object.isFrozen(fixture.invocation));
    assert.ok(Object.isFrozen(fixture.invocation.limits));
    assert.equal(fixture.invocation.limits.timeoutMs, DEFAULT_LIMITS.timeoutMs);
    assert.throws(() => createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [], cwd: fixture.workspace.cwd,
      workspaceRoot: fixture.workspace.root, prompt: 'x'.repeat(DEFAULT_LIMITS.maxPromptBytes + 1),
      authKeys: [], limits: {}
    }), (error) => error.code === 'PROMPT_OVERSIZED');
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});
