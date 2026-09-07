'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const RUNNER = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/runner.cjs'));

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-runner-test-'));
  const cwd = path.join(root, 'cwd');
  fs.mkdirSync(cwd, { mode: 0o700 });
  return { root, cwd };
}
function clean(root) { fs.rmSync(root, { recursive: true, force: true }); }
function invocation(root, cwd, executable, argv, limits = {}) {
  return RUNNER.createInvocation({
    adapter: 'codex', executable, argv, cwd, workspaceRoot: root, prompt: 'bounded',
    authKeys: [], limits: { ...RUNNER.DEFAULT_LIMITS, ...limits }
  });
}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}
async function waitFor(predicate, timeout = 1500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
}

test('deadline facade clamps every invocation to remaining budget', async () => {
  const f = workspace();
  try {
    let clock = 1000;
    let captured;
    const base = { run: async (value) => { captured = value; return { result: { stdout: 'ok', stderr: '' } }; } };
    const value = invocation(f.root, f.cwd, process.execPath, [path.join(f.root, 'noop.cjs')], { timeoutMs: 30000 });
    const deadline = RUNNER.createDeadlineRunner({ runner: base, deadline: 3500, now: () => clock });
    await deadline.run(value);
    assert.equal(captured.limits.timeoutMs, 2500);
    clock = 3600;
    await assert.rejects(() => deadline.run(value), { code: 'TIMEOUT' });
  } finally { clean(f.root); }
});

test('runner decodes invalid UTF-8 as a typed output failure', async () => {
  const f = workspace();
  const script = path.join(f.root, 'invalid-output.cjs');
  fs.writeFileSync(script, "process.stdout.write(Buffer.from([0xc3, 0x28]));\n");
  try {
    const result = await RUNNER.runInvocation(invocation(f.root, f.cwd, process.execPath, [script]));
    assert.equal(result.error.code, 'OUTPUT_INVALID');
  } finally { clean(f.root); }
});

test('cancellation terminates the whole POSIX process group and reaps descendants', async () => {
  const f = workspace();
  const child = path.join(f.root, 'child.cjs');
  const pidFile = path.join(f.root, 'child.pid');
  const parent = path.join(f.root, 'parent.cjs');
  fs.writeFileSync(child, 'setInterval(() => {}, 1000);\n');
  fs.writeFileSync(parent, [
    "const fs = require('node:fs');",
    "const cp = require('node:child_process');",
    `const child = cp.spawn(process.execPath, [${JSON.stringify(child)}], {stdio: 'ignore'});`,
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
    'setInterval(() => {}, 1000);',
  ].join('\n'));
  const cancellation = new AbortController();
  try {
    const running = RUNNER.runInvocation(
      invocation(f.root, f.cwd, process.execPath, [parent], { timeoutMs: 5000, killGraceMs: 100 }),
      { signal: cancellation.signal },
    );
    assert.equal(await waitFor(() => fs.existsSync(pidFile)), true);
    const parentPid = await new Promise((resolve) => {
      // The runner does not expose its pid; the parent process is the only
      // process in this invocation and is found from the pid file's child.
      const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
      resolve(childPid);
    });
    cancellation.abort();
    const result = await running;
    assert.equal(result.error.code, 'CANCELLED');
    assert.equal(await waitFor(() => !alive(parentPid)), true);
    assert.equal(spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }).stdout.includes(path.basename(child)), false);
  } finally { clean(f.root); }
});

test('successful leader exit terminates detached descendants before returning', async () => {
  const f = workspace();
  const child = path.join(f.root, 'success-child.cjs');
  const pidFile = path.join(f.root, 'success-child.pid');
  const parent = path.join(f.root, 'success-parent.cjs');
  fs.writeFileSync(child, 'setInterval(() => {}, 1000);\n');
  fs.writeFileSync(parent, [
    "const fs = require('node:fs');",
    "const cp = require('node:child_process');",
    `const child = cp.spawn(process.execPath, [${JSON.stringify(child)}], {stdio: 'ignore'});`,
    'child.unref();',
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
    'process.exit(0);',
  ].join('\n'));
  try {
    const running = RUNNER.runInvocation(
      invocation(f.root, f.cwd, process.execPath, [parent], { timeoutMs: 5000, killGraceMs: 100 }),
    );
    assert.equal(await waitFor(() => fs.existsSync(pidFile)), true);
    const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    const result = await running;
    assert.equal(result.error, undefined);
    assert.equal(await waitFor(() => !alive(childPid)), true);
    assert.equal(spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }).stdout.includes(path.basename(child)), false);
  } finally { clean(f.root); }
});
test('limits reject invalid mode and mismatched timing options at construction', () => {
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'invalid' }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'probe', warnAfterMs: 5000 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'probe', warnEveryMs: 5000 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'probe', maxWarnings: 5 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', timeoutMs: 5000 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', warnAfterMs: 0 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', warnEveryMs: 0 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', warnAfterMs: -1 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', warnAfterMs: 3600001 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', warnEveryMs: 3600001 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', maxWarnings: 0 }), { code: 'INVOCATION_INVALID' });
  assert.throws(() => RUNNER.normalizeLimits({ mode: 'generation', maxWarnings: 13 }), { code: 'INVOCATION_INVALID' });
  const genLimits = RUNNER.normalizeLimits({ mode: 'generation' });
  assert.equal(genLimits.mode, 'generation');
  assert.equal(genLimits.warnAfterMs, 120000);
  assert.equal(genLimits.warnEveryMs, 300000);
  assert.equal(genLimits.maxWarnings, 12);
  assert.equal(genLimits.timeoutMs, undefined);
  const probeLimits = RUNNER.normalizeLimits({ mode: 'probe', timeoutMs: 15000 });
  assert.equal(probeLimits.mode, 'probe');
  assert.equal(probeLimits.timeoutMs, 15000);
});

test('createGenerationRunner constructs generation invocation without timeout', async () => {
  const f = workspace();
  try {
    let captured;
    const base = { run: async (value) => { captured = value; return { result: { stdout: 'ok', stderr: '' } }; } };
    const value = invocation(f.root, f.cwd, process.execPath, [path.join(f.root, 'noop.cjs')], { timeoutMs: 30000 });
    const genRunner = RUNNER.createGenerationRunner({
      runner: base,
      wait: { warn_after_ms: 60000, warn_every_ms: 120000, max_warnings: 8 }
    });
    await genRunner.run(value);
    assert.equal(captured.limits.mode, 'generation');
    assert.equal(captured.limits.timeoutMs, undefined);
    assert.equal(captured.limits.warnAfterMs, 60000);
    assert.equal(captured.limits.warnEveryMs, 120000);
    assert.equal(captured.limits.maxWarnings, 12);
  } finally { clean(f.root); }
});

test('generation mode warning schedule emits bounded nonblocking warnings and suppresses after maxWarnings', async () => {
  const f = workspace();
  const script = path.join(f.root, 'delayed.cjs');
  fs.writeFileSync(script, 'setTimeout(() => { process.stdout.write("ok"); }, 250);\n');
  try {
    const warnings = [];
    const customStderr = { write: (msg) => { warnings.push(msg); } };
    const onWarningEvents = [];
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: {
        mode: 'generation',
        warnAfterMs: 50,
        warnEveryMs: 50,
        maxWarnings: 2
      }
    });
    const result = await RUNNER.runInvocation(inv, {
      stderr: customStderr,
      onWarning: (event) => onWarningEvents.push(event)
    });
    assert.equal(result.result.stdout, 'ok');
    assert.equal(result.cleanupOutcome, 'confirmed');
    assert.ok(warnings.length >= 2, `Expected at least 2 warnings, got ${warnings.length}`);
    assert.ok(warnings[0].includes('Warning: active generation in progress'));
    assert.ok(onWarningEvents.length >= 2);
    assert.equal(onWarningEvents.some((e) => e.suppressed), true);
  } finally { clean(f.root); }
});

test('cancellation before terminal commit dominates provisional success', async () => {
  const f = workspace();
  const script = path.join(f.root, 'quick-exit.cjs');
  fs.writeFileSync(script, 'process.stdout.write("provisional"); setTimeout(() => { process.exit(0); }, 100);\n');
  const cancellation = new AbortController();
  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: { mode: 'generation', killGraceMs: 100 }
    });
    const earlyCancel = new AbortController();
    earlyCancel.abort();
    await assert.rejects(() => RUNNER.runInvocation(inv, { signal: earlyCancel.signal }), { code: 'CANCELLED' });

    const running = RUNNER.runInvocation(inv, { signal: cancellation.signal });
    await new Promise((resolve) => setTimeout(resolve, 30));
    cancellation.abort();
    const result = await running;
    assert.equal(result.error.code, 'CANCELLED');
  } finally { clean(f.root); }
});

test('unconfirmed process cleanup produces failure even if exit was 0', async () => {
  const f = workspace();
  const script = path.join(f.root, 'success.cjs');
  fs.writeFileSync(script, 'process.stdout.write("ok"); process.exit(0);\n');
  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: { mode: 'generation', killGraceMs: 50 }
    });
    const fakeKill = (pid, sig) => {
      if (sig === 0) return true;
    };
    const result = await RUNNER.runInvocation(inv, { kill: fakeKill });
    assert.equal(result.error.code, 'CLEANUP_UNCONFIRMED');
    assert.equal(result.cleanupOutcome, 'unconfirmed');
  } finally { clean(f.root); }
});

test('output overflow terminates immediately during generation without waiting', async () => {
  const f = workspace();
  const script = path.join(f.root, 'overflow.cjs');
  fs.writeFileSync(script, 'process.stdout.write("x".repeat(200)); setTimeout(() => {}, 5000);\n');
  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: { mode: 'generation', maxStdoutBytes: 50, killGraceMs: 50 }
    });
    const result = await RUNNER.runInvocation(inv);
    assert.equal(result.error.code, 'OUTPUT_LIMIT');
  } finally { clean(f.root); }
});
test('virtual clock proves generation mode remains silent beyond 30s deadline and succeeds', async () => {
  const f = workspace();
  const script = path.join(f.root, 'silent-success.cjs');
  fs.writeFileSync(script, 'process.stdout.write("long-generation");\n');
  try {
    let callCount = 0;
    const clock = () => {
      callCount += 1;
      return callCount === 1 ? 1000 : 45000;
    };
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: { mode: 'generation', warnAfterMs: 5000, warnEveryMs: 10000, maxWarnings: 3 }
    });
    const result = await RUNNER.runInvocation(inv, { now: clock });
    assert.equal(result.result.stdout, 'long-generation');
    assert.equal(result.cleanupOutcome, 'confirmed');
  } finally { clean(f.root); }
});

test('warning emission to closed stderr stream does not crash generation', async () => {
  const f = workspace();
  const script = path.join(f.root, 'delayed-epipe.cjs');
  fs.writeFileSync(script, 'setTimeout(() => { process.stdout.write("ok"); }, 150);\n');
  const EventEmitter = require('node:events');
  try {
    const fakeStderr = new EventEmitter();
    fakeStderr.write = () => {
      process.nextTick(() => {
        const err = new Error('write EPIPE');
        err.code = 'EPIPE';
        fakeStderr.emit('error', err);
      });
      return false;
    };
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: { mode: 'generation', warnAfterMs: 30, warnEveryMs: 30, maxWarnings: 2 }
    });
    const result = await RUNNER.runInvocation(inv, { stderr: fakeStderr });
    assert.equal(result.result.stdout, 'ok');
    assert.equal(result.cleanupOutcome, 'confirmed');
  } finally { clean(f.root); }
});

test('cancellation during process run settles as CANCELLED with matching lifecycle status', async () => {
  const f = workspace();
  const script = path.join(f.root, 'long-run.cjs');
  fs.writeFileSync(script, 'setTimeout(() => { process.stdout.write("ok"); }, 200);\n');
  const cancellation = new AbortController();
  let lifecycleEvent = null;
  try {
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: { mode: 'generation', killGraceMs: 50 }
    });
    const running = RUNNER.runInvocation(inv, {
      signal: cancellation.signal,
      onLifecycle: (event) => {
        lifecycleEvent = event;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    cancellation.abort();
    const result = await running;
    assert.equal(result.error.code, 'CANCELLED');
    assert.ok(lifecycleEvent);
    assert.equal(lifecycleEvent.status, 'cancelled');
  } finally { clean(f.root); }
});

test('delayed asynchronous EPIPE after generation completion does not trigger uncaught error', async () => {
  const f = workspace();
  const script = path.join(f.root, 'quick-warning.cjs');
  fs.writeFileSync(script, 'setTimeout(() => { process.stdout.write("ok"); }, 40);\n');
  const EventEmitter = require('node:events');
  try {
    const fakeStderr = new EventEmitter();
    fakeStderr.write = (msg, cb) => {
      setTimeout(() => {
        const err = new Error('write EPIPE');
        err.code = 'EPIPE';
        fakeStderr.emit('error', err);
        if (typeof cb === 'function') cb(err);
      }, 100);
      return false;
    };
    const inv = RUNNER.createInvocation({
      adapter: 'codex', executable: process.execPath, argv: [script],
      cwd: f.cwd, workspaceRoot: f.root, prompt: 'bounded', authKeys: [],
      limits: { mode: 'generation', warnAfterMs: 10, warnEveryMs: 10, maxWarnings: 1 }
    });
    const result = await RUNNER.runInvocation(inv, { stderr: fakeStderr });
    assert.equal(result.result.stdout, 'ok');
    assert.equal(result.cleanupOutcome, 'confirmed');
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally { clean(f.root); }
});
