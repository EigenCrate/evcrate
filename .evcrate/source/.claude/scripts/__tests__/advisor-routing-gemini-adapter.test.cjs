'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const adapter = require('../advisor-routing/adapters/gemini.cjs');
const { createRoutingError } = require('../advisor-routing/errors.cjs');
const { dispatchExternal } = require('../advisor-dispatch.cjs');
const {
  DEFAULT_LIMITS,
  createInvocation,
  createRunnerFailure,
  runInvocation
} = require('../advisor-routing/runner.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'gemini', 'fake-gemini-cli.cjs');

function descriptor({ model = 'pro', effort = 'high', activeHost = 'codex' } = {}) {
  return Object.freeze({
    schema: 'evcrate-advisor-route/v1',
    version: 1,
    activeHost,
    route: Object.freeze({ backend: 'gemini', model, effort, execution: 'external' }),
    source: 'test',
    action: 'external',
    nativeCapability: null,
    adapter: 'gemini'
  });
}

function workspaceFor(mode, { install = true, signal, shortProbe = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-gemini-adapter-'));
  const bin = path.join(root, 'bin');
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.mkdirSync(cwd, { mode: 0o700 });
  if (install) fs.symlinkSync(FIXTURE, path.join(bin, 'gemini'));
  fs.writeFileSync(path.join(cwd, 'gemini-fixture.json'), JSON.stringify({ mode }), { mode: 0o600 });
  const created = [];
  const context = {
    descriptor: descriptor(),
    brief: 'Reply exactly: Gemini stdin',
    cwd,
    workspaceRoot: root,
    environment: {
      PATH: install ? `${bin}${path.delimiter}${process['env'].PATH || ''}` : bin,
      HOME: root
    },
    runner: {
      run(invocation, options) { return runInvocation(invocation, options); }
    },
    createInvocation(specification) {
      created.push(specification);
      const adjusted = shortProbe ? {
        ...specification,
        limits: { ...specification.limits, timeoutMs: 40, killGraceMs: 10 }
      } : specification;
      return createInvocation(adjusted);
    },
    signal,
    created
  };
  return { root, cwd, context };
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

function fakeRunner(mode, captures = []) {
  return Object.freeze({
    async run(invocation, options = {}) {
      captures.push({ executable: invocation.executable, argv: [...invocation.argv], prompt: invocation.prompt });
      if (mode === 'executable') return runInvocation(invocation, { ...options, environment: { PATH: '' } });
      const limits = mode === 'timeout' || mode === 'cancel'
        ? { ...invocation.limits, timeoutMs: 40, killGraceMs: 10 } : invocation.limits;
      const fakeInvocation = createInvocation({
        adapter: invocation.adapter,
        executable: process.execPath,
        argv: [FIXTURE, '--mode', mode, ...invocation.argv],
        cwd: invocation.cwd,
        workspaceRoot: invocation.workspaceRoot,
        prompt: invocation.prompt,
        authKeys: [],
        limits
      });
      return runInvocation(fakeInvocation, options);
    }
  });
}

async function dispatch(mode, options = {}) {
  const fixture = workspaceFor(mode, options);
  const captures = options.captures || [];
  try {
    return await dispatchExternal({
      descriptor: descriptor(options.route),
      brief: options.brief || 'bounded brief'
    }, {
      registry: { getAdapter: () => adapter },
      runner: fakeRunner(mode, captures),
      environment: fixture.context.environment,
      signal: options.signal
    });
  } finally {
    cleanup(fixture);
  }
}

test('exports a frozen Gemini adapter with no EVCrate auth keys', () => {
  assert.equal(adapter.name, 'gemini');
  assert.deepEqual(adapter.authKeys, []);
  assert.ok(Object.isFrozen(adapter));
  assert.ok(Object.isFrozen(adapter.authKeys));
  assert.deepEqual(Object.keys(adapter), [
    'name', 'authKeys', 'probeVersion', 'probeAuth', 'probeCapabilities',
    'buildInvocation', 'parseResult', 'classifyFailure'
  ]);
});

test('rejects Gemini 0.47.0 exact effort before auth or execution', async () => {
  const fixture = workspaceFor('legacy');
  const calls = [];
  const context = {
    ...fixture.context,
    runner: {
      run(invocation, options) {
        calls.push([...invocation.argv]);
        return runInvocation(invocation, options);
      }
    }
  };
  try {
    await adapter.probeVersion(context);
    await assert.rejects(adapter.probeAuth(context), (error) => error?.code === 'EFFORT_UNSUPPORTED');
  } finally {
    cleanup(fixture);
  }
  assert.deepEqual(calls, [['--version']]);
});

test('probes the exact future effort fixture but fails closed without a verified read-only boundary', async () => {
  const fixture = workspaceFor('success');
  try {
    await adapter.probeVersion(fixture.context);
    await adapter.probeAuth(fixture.context);
    await assert.rejects(adapter.probeCapabilities(fixture.context),
      (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
    assert.throws(() => adapter.buildInvocation(fixture.context),
      (error) => error?.code === 'OUTPUT_UNSUPPORTED');
  } finally {
    cleanup(fixture);
  }
});

test('delivers one raw stdin brief and parses the bounded JSON response', async () => {
  const fixture = workspaceFor('success');
  try {
    const captures = [];
    await assert.rejects(dispatchExternal({ descriptor: descriptor(), brief: 'Gemini stdin only' }, {
      registry: { getAdapter: () => adapter },
      runner: fakeRunner('success', captures),
      environment: fixture.context.environment
    }), (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
    assert.equal(captures.length, 3);
    const response = adapter.parseResult({
      execution: { stdout: JSON.stringify({ response: 'GEMINI_OK:Gemini stdin only', stats: {} }) },
      limits: DEFAULT_LIMITS
    });
    assert.equal(response.response, 'GEMINI_OK:Gemini stdin only');
    assert.ok(captures.every(({ argv }) => argv.every((arg) => !arg.includes('Gemini stdin only'))));
  } finally {
    cleanup(fixture);
  }
});

test('covers executable, version, auth, model, effort, read-only, session, output, timeout, cancel, and recursion failures', async () => {
  const cases = [
    ['executable', 'EXECUTABLE_UNAVAILABLE', { install: false }],
    ['version', 'CLI_VERSION_UNSUPPORTED', {}],
    ['auth', 'AUTH_UNAVAILABLE', {}],
    ['model', 'MODEL_UNSUPPORTED', { route: { model: 'flash', effort: 'high' } }],
    ['effort', 'EFFORT_UNSUPPORTED', { route: { model: 'pro', effort: 'xhigh' } }],
    ['read-only', 'READ_ONLY_UNSUPPORTED', {}],
    ['session', 'SESSION_UNSUPPORTED', {}],
    ['output', 'OUTPUT_UNSUPPORTED', {}],
    ['timeout', 'READ_ONLY_UNSUPPORTED', {}]
  ];
  for (const [mode, expected, options] of cases) {
    await assert.rejects(dispatch(mode, options), (error) => error?.code === expected, mode);
  }
  const controller = new AbortController();
  const pending = dispatch('cancel', { shortProbe: true, signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, (error) => error?.code === 'CANCELLED');
  const fixture = workspaceFor('success');
  fixture.context.environment.EVCRATE_ADVISOR_ACTIVE = '1';
  try {
    await assert.rejects(dispatchExternal({ descriptor: descriptor(), brief: 'bounded brief' }, {
      registry: { getAdapter: () => { throw new Error('lookup must not run'); } },
      environment: fixture.context.environment
    }), (error) => error?.code === 'ADVISOR_RECURSION');
  } finally {
    cleanup(fixture);
  }
});

test('rejects malformed, duplicate, stopped, nonzero, and oversized output', async () => {
  for (const [stdout, expected] of [
    ['not-json', 'PROTOCOL_INVALID'],
    [JSON.stringify({ response: '' }), 'PROTOCOL_INVALID'],
    [[
      JSON.stringify({ event: 'init', init: {} }),
      JSON.stringify({ event: 'result', result: { response: 'one' } }),
      JSON.stringify({ event: 'result', result: { response: 'two' } })
    ].join('\n'), 'PROTOCOL_INVALID'],
    [JSON.stringify({ event: 'init', init: {} }) + '\n'
      + JSON.stringify({ event: 'error', error: 'model unavailable' }) + '\n'
      + JSON.stringify({ event: 'result', result: { response: 'must-not-succeed' } }), 'MODEL_UNSUPPORTED'],
    [JSON.stringify({ response: 'x'.repeat(40 * 1024), stats: {} }), 'OUTPUT_LIMIT']
  ]) {
    assert.throws(() => adapter.parseResult({ execution: { stdout }, limits: DEFAULT_LIMITS }),
      (error) => error?.code === expected, expected);
  }
  for (const [diagnostics, expected] of [
    [{ stderr: 'authentication required' }, 'AUTH_UNAVAILABLE'],
    [{ stdout: 'invalid model selection: model flash is not recognized' }, 'MODEL_UNSUPPORTED'],
    [{ stderr: 'invalid effort: effort xhigh is unsupported' }, 'EFFORT_UNSUPPORTED'],
    [{ stderr: 'request cancelled by user' }, 'CANCELLED']
  ]) {
    const failure = createRunnerFailure({ reason: 'nonzero-exit', ...diagnostics, exitCode: 1 });
    assert.equal(adapter.classifyFailure(failure), expected);
  }
  const timeoutFixture = workspaceFor('success');
  try {
    const invocation = createInvocation({
      adapter: 'gemini',
      executable: process.execPath,
      argv: [FIXTURE, '--mode', 'timeout', '--output-format', 'json'],
      cwd: timeoutFixture.context.cwd,
      workspaceRoot: timeoutFixture.context.workspaceRoot,
      prompt: 'bounded fixture probe',
      authKeys: [],
      limits: { ...DEFAULT_LIMITS, timeoutMs: 40, killGraceMs: 10 }
    });
    const timeout = await runInvocation(invocation, {
      environment: timeoutFixture.context.environment
    });
    assert.equal(timeout.error.code, 'TIMEOUT');
  } finally {
    cleanup(timeoutFixture);
  }
  const fixture = workspaceFor('success');
  try {
    const stream = fs.readFileSync(path.join(__dirname, 'fixtures', 'gemini', 'stream-success.jsonl'), 'utf8');
    assert.deepEqual(adapter.parseResult({ execution: { stdout: stream }, limits: DEFAULT_LIMITS }), {
      response: 'GEMINI_OK'
    });
    const stopped = fs.readFileSync(path.join(__dirname, 'fixtures', 'gemini', 'stream-stopped.jsonl'), 'utf8');
    assert.throws(() => adapter.parseResult({ execution: { stdout: stopped }, limits: DEFAULT_LIMITS }),
      (error) => error?.code === 'CANCELLED');
    const dangerous = fs.readFileSync(path.join(__dirname, 'fixtures', 'gemini', 'stream-dangerous.jsonl'), 'utf8');
    assert.throws(() => adapter.parseResult({ execution: { stdout: dangerous }, limits: DEFAULT_LIMITS }),
      (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
    for (const tool of ['create_file', 'upload', 'deploy', 'custom_mcp_mutation']) {
      const streamWithUnknownTool = [
        JSON.stringify({ event: 'init', init: { session_id: 'fixture-session', model: 'pro' } }),
        JSON.stringify({ event: 'tool_use', tool_use: { name: tool } }),
        JSON.stringify({ event: 'result', result: { response: 'must-not-succeed' } })
      ].join('\n');
      assert.throws(() => adapter.parseResult({
        execution: { stdout: streamWithUnknownTool }, limits: DEFAULT_LIMITS
      }), (error) => error?.code === 'READ_ONLY_UNSUPPORTED', tool);
    }
    const conflicting = [
      JSON.stringify({ event: 'init', init: { session_id: 'fixture-session', model: 'pro' } }),
      JSON.stringify({ event: 'tool_use', name: 'write_file', tool_use: { name: 'read_file' } }),
      JSON.stringify({ event: 'result', result: { response: 'must-not-succeed' } })
    ].join('\n');
    assert.throws(() => adapter.parseResult({
      execution: { stdout: conflicting }, limits: DEFAULT_LIMITS
    }), (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
  } finally {
    cleanup(fixture);
  }
});

test('classifies lifecycle errors without exposing diagnostics or config paths', () => {
  for (const code of [
    'TIMEOUT', 'CANCELLED', 'ADVISOR_RECURSION', 'CLI_VERSION_UNSUPPORTED',
    'EFFORT_UNSUPPORTED', 'PROTOCOL_INVALID'
  ]) assert.equal(adapter.classifyFailure(createRoutingError(code)), code);
  assert.equal(adapter.classifyFailure(new Error('path=/private/fake token=hidden')), 'PROCESS_FAILED');
  const source = fs.readFileSync(path.join(__dirname, '..', 'advisor-routing', 'adapters', 'gemini.cjs'), 'utf8');
  assert.doesNotMatch(source, /(?:\.gemini|settings\.json|HOME|credential[_-]?file)/iu);
});
