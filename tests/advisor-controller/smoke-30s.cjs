'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CONTROLLER = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/evcrate-advisor');
const CHECKPOINT_PATH = path.join(__dirname, 'fixtures/checkpoint.json');
const FAKE_CODEX = path.join(__dirname, 'fixtures/fake-codex.cjs');
const CHECKPOINT = fs.readFileSync(CHECKPOINT_PATH, 'utf8');

async function main() {
  console.log('Starting real >30s acceptance smoke scenario for Phase 02...');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-smoke-30s-'));
  const home = path.join(root, 'home');
  const tmp = path.join(root, 'tmp');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(home, '.evcrate'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(tmp, { mode: 0o700 });
  fs.mkdirSync(bin, { mode: 0o700 });

  const policy = JSON.stringify({
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 10000, warn_every_ms: 10000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  });
  fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), `${policy}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(home, '.evcrate/fake-codex-mode'), 'delayed-31s\n', { mode: 0o600 });

  try { fs.chmodSync(FAKE_CODEX, 0o755); } catch {}
  fs.symlinkSync(FAKE_CODEX, path.join(bin, 'codex'));

  const env = {
    ...process.env,
    HOME: home,
    TMPDIR: tmp,
    PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`
  };
  delete env.EVCRATE_ADVISOR_ACTIVE;
  delete env.EVCRATE_ADVISOR_DEPTH;

  const startedAt = Date.now();
  const child = spawn(CONTROLLER, [], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const watchdog = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch {}
    console.error('Smoke scenario watchdog timed out after 45s');
    process.exit(1);
  }, 45000);
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', (c) => stdoutChunks.push(c));
  child.stderr.on('data', (c) => {
    stderrChunks.push(c);
    process.stderr.write(`[smoke stderr] ${c.toString('utf8')}`);
  });
  child.stdin.end(CHECKPOINT);

  const exitResult = await new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      clearTimeout(watchdog);
      resolve({ code, signal });
    });
  });
  const durationMs = Date.now() - startedAt;
  console.log(`Smoke scenario completed in ${Math.round(durationMs / 1000)}s with exit code ${exitResult.code}`);

  try {
    assert.equal(exitResult.code, 0, `Expected exit 0, got ${exitResult.code}`);
    assert.ok(durationMs >= 31000, `Expected elapsed >= 31000ms, observed ${durationMs}ms`);

    const stderrText = Buffer.concat(stderrChunks).toString('utf8');
    const warnings = stderrText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('[evcrate-advisor] Warning: active generation in progress'));
    assert.equal(warnings.length, 3, `Expected exactly 3 warnings, got ${warnings.length}`);
    assert.ok(warnings[0].includes('elapsed: 10s'), `Warning 0 expected 10s, got: ${warnings[0]}`);
    assert.ok(warnings[1].includes('elapsed: 20s'), `Warning 1 expected 20s, got: ${warnings[1]}`);
    assert.ok(warnings[2].includes('elapsed: 30s'), `Warning 2 expected 30s, got: ${warnings[2]}`);
    const stdoutText = Buffer.concat(stdoutChunks).toString('utf8').trim();
    const envelope = JSON.parse(stdoutText);
    assert.equal(envelope.status, 'ADVICE_READY');
    assert.equal(envelope.result.status, 'ADVICE_READY');

    const stateFile = path.join(home, '.evcrate/fake-codex-state.json');
    const recordedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(recordedState.finalCount, 1, 'Expected fake codex to be launched exactly once');

    console.log('✓ Smoke scenario PASSED: 31s silence handled, exactly 1 launch, warnings emitted, valid envelope delivered.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Smoke scenario failed:', err);
  process.exit(1);
});
