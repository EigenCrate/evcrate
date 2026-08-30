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
