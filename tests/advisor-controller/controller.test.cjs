'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const CONTROLLER = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/evcrate-advisor');
const CHECKPOINT_PATH = path.join(__dirname, 'fixtures/checkpoint.json');
const FAKE_CODEX = path.join(__dirname, 'fixtures/fake-codex.cjs');
const FAKE_OMP = path.join(__dirname, 'fixtures/fake-omp.cjs');
const CHECKPOINT = fs.readFileSync(CHECKPOINT_PATH, 'utf8');
const MAX_CHECKPOINT_BYTES = 32 * 1024;
const CODEX_NO_TOOL_PREFIX = [
  'You are a read-only advisor. Do not use tools, execute commands, inspect files, browse, or call subagents. Use only the checkpoint JSON below. Return one concise recommendation as your final answer.',
  '',
  'Checkpoint JSON:',
  '',
].join('\n');
const ADVISOR_DIR = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const { parseInput } = require(path.join(ADVISOR_DIR, 'controller.cjs'));
const { createRoutingError } = require(path.join(ADVISOR_DIR, 'errors.cjs'));
const { validatePolicy } = require(path.join(ADVISOR_DIR, 'policy-schema.cjs'));
const { getAdapter } = require(path.join(ADVISOR_DIR, 'adapter-registry.cjs'));
const { createWorkspace, cleanupWorkspace } = require(path.join(ADVISOR_DIR, 'isolated-workspace.cjs'));

function policy(backend = 'codex') {
  const model = backend === 'omp' ? 'openai-codex/gpt-5.6-sol' : 'gpt-5.6-sol';
  return JSON.stringify({ version: 1, advisor: {
    backend, model, effort: 'high', timeout_ms: 60000
  } });
}
function setup({ mode = 'success', backend = 'codex', withPolicy = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-controller-test-'));
  const home = path.join(root, 'home');
  const tmp = path.join(root, 'tmp');
  const bin = path.join(root, 'bin');
  const executable = backend === 'omp' ? 'omp' : 'codex';
  const fixture = backend === 'omp' ? FAKE_OMP : FAKE_CODEX;
  fs.mkdirSync(path.join(home, '.evcrate'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(tmp, { mode: 0o700 });
  fs.mkdirSync(bin, { mode: 0o700 });
  if (withPolicy) fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), `${policy(backend)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(home, `.evcrate/fake-${executable}-mode`), `${mode}\n`, { mode: 0o600 });
  fs.symlinkSync(fixture, path.join(bin, executable));
  const environment = { ...process.env, HOME: home, TMPDIR: tmp, PATH: `${bin}${path.delimiter}${process.env.PATH || ''}` };
  delete environment.EVCRATE_ADVISOR_ACTIVE;
  delete environment.EVCRATE_ADVISOR_DEPTH;
  return { root, home, environment };
}
function cleanup(fixture) { fs.rmSync(fixture.root, { recursive: true, force: true }); }
function state(fixture, backend = 'codex') {
  const name = backend === 'omp' ? 'fake-omp-state.json' : 'fake-codex-state.json';
  const file = path.join(fixture.home, `.evcrate/${name}`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
function run(fixture, input = CHECKPOINT) {
  return spawnSync(CONTROLLER, [], { input, env: fixture.environment, encoding: 'utf8' });
}
function envelope(result) {
  assert.equal(result.stderr, '');
  const lines = result.stdout.split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert.equal(lines.length, 1, result.stdout);
  return JSON.parse(lines[0]);
}
function codexCheckpoint(prompt) {
  const start = prompt.indexOf('{"protocol":"evcrate-advisor-checkpoint"');
  assert.notEqual(start, -1);
  assert.equal(prompt.slice(0, start), CODEX_NO_TOOL_PREFIX);
  return JSON.parse(prompt.slice(start));
}
function maxSizedCheckpoint() {
  const value = JSON.parse(CHECKPOINT);
  let low = 0;
  let high = MAX_CHECKPOINT_BYTES;
  let candidate = CHECKPOINT;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    value.prior_counsel = 'x'.repeat(middle);
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_CHECKPOINT_BYTES) {
      candidate = serialized;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  assert.equal(Buffer.byteLength(candidate, 'utf8'), MAX_CHECKPOINT_BYTES);
  return candidate;
}
function assertFailed(result, code) {
  assert.equal(result.status, 1);
  const value = envelope(result);
  assert.equal(value.status, 'FAILED');
  assert.equal(value.error.code, code);
  return value;
}

test('standard sticky temporary roots accept foreign ownership', () => {
  if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
  const root = os.tmpdir();
  const rootStat = fs.lstatSync(root);
  if (rootStat.uid === process.getuid() || !(rootStat.mode & 0o1000)) return;
  const workspace = createWorkspace({ environment: { TMPDIR: root } });
  try {
    assert.equal(workspace.root, path.resolve(root));
    const workspaceStat = fs.statSync(workspace.path);
    assert.equal(workspaceStat.uid, process.getuid());
    assert.equal(workspaceStat.mode & 0o077, 0);
  } finally {
    cleanupWorkspace(workspace);
  }
});

test('direct checkpoint succeeds through exactly one final Codex process', () => {
  const fixture = setup();
  try {
    const result = run(fixture);
    assert.equal(result.status, 0);
    const value = envelope(result);
    assert.deepEqual(Object.keys(value).sort(), ['correlation_id', 'protocol', 'receipt', 'result', 'status', 'version'].sort());
    assert.equal(value.protocol, 'evcrate-advisor-controller');
    assert.equal(value.version, 1);
    assert.match(value.correlation_id, /^[0-9a-f-]{36}$/i);
    assert.equal(value.status, 'ADVICE_READY');
    assert.deepEqual(value.receipt, {
      backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 1,
      adapter_version: '0.150.1', elapsed_ms: value.receipt.elapsed_ms
    });
    assert.equal(value.result.protocol, 'evcrate-advisor-result');
    assert.equal(value.result.version, 1);
    assert.equal(value.result.checkpoint, 'review:fixture');
    assert.equal(value.result.recommendation, 'FAKE_CODEX_OK');
    assert.deepEqual(value.result.must_fix, []);
    const recorded = state(fixture);
    assert.equal(recorded.finalCount, 1);
    assert.equal(recorded.calls.length, 5);
    assert.deepEqual(recorded.calls.map((call) => call.args), [
      ['--version'],
      ['login', 'status'],
      ['exec', '--help'],
      ['debug', 'models', '--bundled'],
      [
        'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config',
        '--skip-git-repo-check', '--sandbox', 'read-only', '--model', 'gpt-5.6-sol',
        '--config', 'model_reasoning_effort="high"', '--json', '-'
      ],
    ]);
    assert.equal(recorded.calls.filter((call) => call.final).length, 1);
    assert.equal(recorded.lastStdin, `${CODEX_NO_TOOL_PREFIX}${JSON.stringify(JSON.parse(CHECKPOINT))}`);
    assert.deepEqual(codexCheckpoint(recorded.lastStdin), JSON.parse(CHECKPOINT));
    assert.equal(fs.existsSync(recorded.lastCwd), false);
  } finally { cleanup(fixture); }
});

test('Codex accepts a terminal item completion without item.started', () => {
  const fixture = setup({ mode: 'implicit-start' });
  try {
    const result = run(fixture);
    assert.equal(result.status, 0);
    const value = envelope(result);
    assert.equal(value.status, 'ADVICE_READY');
    assert.equal(value.result.recommendation, 'FAKE_CODEX_OK');
    assert.equal(state(fixture).finalCount, 1);
  } finally { cleanup(fixture); }
});

test('Codex preserves the maximum checkpoint size with its fixed instruction', () => {
  const fixture = setup();
  try {
    const input = maxSizedCheckpoint();
    const result = run(fixture, input);
    assert.equal(result.status, 0);
    const value = envelope(result);
    assert.equal(value.status, 'ADVICE_READY');
    assert.deepEqual(codexCheckpoint(state(fixture).lastStdin), JSON.parse(input));
  } finally { cleanup(fixture); }
});

test('Codex rejects a checkpoint over the envelope limit before probing', () => {
  const fixture = setup();
  try {
    const value = JSON.parse(maxSizedCheckpoint());
    value.prior_counsel += 'x';
    const input = JSON.stringify(value);
    assert.equal(Buffer.byteLength(input, 'utf8'), MAX_CHECKPOINT_BYTES + 1);
    assertFailed(run(fixture, input), 'REQUEST_INVALID');
    assert.equal(state(fixture), null);
  } finally { cleanup(fixture); }
});
test('OMP backend succeeds through one final no-tool process', () => {
  const fixture = setup({ backend: 'omp' });
  try {
    const result = run(fixture);
    assert.equal(result.status, 0);
    const value = envelope(result);
    assert.equal(value.status, 'ADVICE_READY');
    assert.deepEqual(value.receipt, {
      backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high', controller_version: 1,
      adapter_version: '18.0.11', elapsed_ms: value.receipt.elapsed_ms
    });
    assert.equal(value.result.checkpoint, 'review:fixture');
    assert.equal(value.result.recommendation, 'FAKE_OMP_OK');
    const recorded = state(fixture, 'omp');
    assert.equal(recorded.finalCount, 1);
    assert.deepEqual(recorded.calls.at(-1).args, [
      '--no-session', '--no-tools', '--no-lsp', '--no-pty', '--no-extensions', '--no-skills', '--no-rules',
      '--model', 'openai-codex/gpt-5.6-sol', '--thinking', 'high', '--mode', 'json', '-p'
    ]);
    assert.deepEqual(JSON.parse(recorded.lastStdin), JSON.parse(CHECKPOINT));
    assert.equal(fs.existsSync(recorded.lastCwd), false);
  } finally { cleanup(fixture); }
});
test('OMP capability probes fail closed before any final process', () => {
  const cases = [
    ['version', 'CLI_VERSION_UNSUPPORTED'],
    ['auth', 'AUTH_UNAVAILABLE'],
    ['auth-malformed', 'AUTH_UNAVAILABLE'],
    ['read-only', 'READ_ONLY_UNSUPPORTED'],
    ['session', 'SESSION_UNSUPPORTED'],
    ['output', 'OUTPUT_UNSUPPORTED'],
    ['model', 'MODEL_UNSUPPORTED'],
    ['effort', 'EFFORT_UNSUPPORTED'],
    ['catalog-failure', 'PROCESS_FAILED'],
  ];
  for (const [mode, code] of cases) {
    const fixture = setup({ backend: 'omp', mode });
    try {
      assertFailed(run(fixture), code);
      assert.equal(state(fixture, 'omp').finalCount, 0, mode);
    } finally { cleanup(fixture); }
  }
});

test('old host policy fails migration before any final process', () => {
  const fixture = setup();
  try {
    fs.writeFileSync(path.join(fixture.home, '.evcrate/advisor-routing.json'), JSON.stringify({ version: 1, hosts: { codex: {} } }), { mode: 0o600 });
    const value = assertFailed(run(fixture), 'ROUTE_SCHEMA_MIGRATION_REQUIRED');
    assert.equal(value.error.message, 'Global advisor policy requires migration from host routes');
    assert.equal(value.error.action, 'Replace version 1 hosts with one version 1 advisor object containing backend, model, effort, and timeout_ms.');
    assert.equal(state(fixture), null);
  } finally { cleanup(fixture); }
});

test('missing policy and disabled candidate fail closed', () => {
  const missing = setup({ withPolicy: false });
  try {
    assertFailed(run(missing), 'ROUTE_POLICY_REQUIRED');
    assert.equal(state(missing), null);
  } finally { cleanup(missing); }
  const disabled = setup({ backend: 'antigravity' });
  try {
    const value = assertFailed(run(disabled), 'CLI_CAPABILITY_UNSUPPORTED');
    assert.equal(value.error.message, 'Advisor CLI lacks a qualified controller contract');
    assert.equal(value.error.action, 'Select a qualified backend or complete its Linux capability qualification.');
    assert.equal(state(disabled), null);
  } finally { cleanup(disabled); }
});

test('strict request validation rejects extras, credentials, invalid UTF-8, and oversized input', () => {
  const fixture = setup();
  try {
    const extra = JSON.parse(CHECKPOINT);
    extra.backend = 'codex';
    assertFailed(run(fixture, JSON.stringify(extra)), 'REQUEST_INVALID');
    const credential = {
      ...JSON.parse(CHECKPOINT),
      evidence: { ...JSON.parse(CHECKPOINT).evidence, terminal: '{"api_key":"SECRET"}' },
    };
    assertFailed(run(fixture, JSON.stringify(credential)), 'REQUEST_INVALID');
    assertFailed(run(fixture, Buffer.from([0xc3, 0x28])), 'REQUEST_INVALID');
    assertFailed(run(fixture, Buffer.alloc(33 * 1024, 0x20)), 'REQUEST_INVALID');
    assert.equal(state(fixture), null);
  } finally { cleanup(fixture); }
});

test('oversized open stdin fails closed without waiting for EOF', async () => {
  const fixture = setup();
  try {
    const child = spawn(CONTROLLER, [], {
      env: fixture.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = [];
    const errors = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.stdin.on('error', () => {});
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('controller waited for EOF after oversized input'));
      }, 3000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (status, signal) => {
        clearTimeout(timer);
        resolve({
          status,
          signal,
          stdout: Buffer.concat(output).toString('utf8'),
          stderr: Buffer.concat(errors).toString('utf8'),
        });
      });
      child.stdin.write(Buffer.alloc(33 * 1024, 0x20));
    });
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    assert.equal(result.status, 1);
    assert.equal(envelope(result).error.code, 'REQUEST_INVALID');
  } finally {
    cleanup(fixture);
  }
});
test('partial open stdin reaches one bounded timeout envelope', async () => {
  const fixture = setup();
  try {
    const child = spawn(CONTROLLER, [], {
      env: fixture.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = [];
    const errors = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.stdin.on('error', () => {});
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('controller waited indefinitely for EOF after partial input'));
      }, 5000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (status, signal) => {
        clearTimeout(timer);
        resolve({
          status,
          signal,
          stdout: Buffer.concat(output).toString('utf8'),
          stderr: Buffer.concat(errors).toString('utf8'),
        });
      });
      child.stdin.write('{');
    });
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    assert.equal(result.status, 1);
    assert.equal(envelope(result).error.code, 'TIMEOUT');
  } finally {
    cleanup(fixture);
  }
});
test('SIGTERM closes open stdin and emits one cancellation envelope', async () => {
  const fixture = setup();
  try {
    const child = spawn(CONTROLLER, [], {
      env: fixture.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = [];
    const errors = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.stdin.on('error', () => {});
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('controller did not exit after SIGTERM'));
      }, 3000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (status, signal) => {
        clearTimeout(timer);
        resolve({
          status,
          signal,
          stdout: Buffer.concat(output).toString('utf8'),
          stderr: Buffer.concat(errors).toString('utf8'),
        });
      });
      child.stdin.write('{}');
      setTimeout(() => child.kill('SIGTERM'), 50);
    });
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    assert.equal(result.status, 1);
    assert.equal(envelope(result).error.code, 'CANCELLED');
  } finally {
    cleanup(fixture);
  }
});

test('recursion is rejected before the final process', () => {
  const fixture = setup();
  fixture.environment.EVCRATE_ADVISOR_ACTIVE = '1';
  try {
    assertFailed(run(fixture), 'ADVISOR_RECURSION');
    assert.equal(state(fixture), null);
  } finally { cleanup(fixture); }
});

test('final output failures remain one-attempt terminal failures', () => {
  const cases = [
    ['malformed', 'PROTOCOL_INVALID'],
    ['command', 'READ_ONLY_UNSUPPORTED'],
    ['late', 'PROTOCOL_INVALID'],
    ['between', 'PROTOCOL_INVALID'],
    ['implicit-reasoning', 'PROTOCOL_INVALID'],
    ['empty-id', 'PROTOCOL_INVALID'],
    ['post-response', 'PROTOCOL_INVALID'],
    ['oversized', 'OUTPUT_LIMIT'],
    ['invalid-utf8', 'OUTPUT_INVALID'],
    ['nonzero', 'PROCESS_FAILED'],
  ];
  for (const [mode, code] of cases) {
    const fixture = setup({ mode });
    try {
      assertFailed(run(fixture), code);
      assert.equal(state(fixture).finalCount, 1, mode);
    } finally { cleanup(fixture); }
  }
});

test('checkpoint and policy contracts are exact and immutable', () => {
  const value = parseInput(CHECKPOINT);
  assert.deepEqual(Object.keys(value), [
    'protocol', 'version', 'checkpoint', 'question', 'kind', 'task_or_phase',
    'evidence', 'changed_paths', 'prior_counsel', 'owner_disposition'
  ]);
  assert.equal(Object.isFrozen(value), true);
  assert.throws(() => parseInput(JSON.stringify({ ...JSON.parse(CHECKPOINT), active_host: 'codex' })), { code: 'REQUEST_INVALID' });
  const target = validatePolicy(JSON.parse(policy()));
  assert.equal(Object.isFrozen(target), true);
  assert.equal(Object.isFrozen(target.advisor), true);
  assert.throws(() => validatePolicy(JSON.parse(JSON.stringify({ version: 1, advisor: { backend: 'gemini', model: 'x', effort: 'high', timeout_ms: 60000 } }))), { code: 'ROUTE_ENTRY_INVALID' });
  assert.throws(() => getAdapter('gemini'), { code: 'ADAPTER_UNSUPPORTED' });
  assert.equal(getAdapter('omp').name, 'omp');
});
