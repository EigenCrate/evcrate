'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const adapter = require('../advisor-routing/adapters/antigravity.cjs');
const { createRoutingError } = require('../advisor-routing/errors.cjs');
const {
  DEFAULT_LIMITS,
  createInvocation,
  createRunnerFailure,
  runInvocation
} = require('../advisor-routing/runner.cjs');
const { dispatchExternal } = require('../advisor-dispatch.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'antigravity', 'fake-antigravity-cli.cjs');

function descriptor({ model = 'pro', effort = 'high', activeHost = 'codex' } = {}) {
  return Object.freeze({
    schema: 'evcrate-advisor-route/v1',
    version: 1,
    activeHost,
    route: Object.freeze({ backend: 'antigravity', model, effort, execution: 'external' }),
    source: 'test',
    action: 'external',
    nativeCapability: null,
    adapter: 'antigravity'
  });
}

function workspaceFor(mode, { install = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-antigravity-adapter-'));
  const bin = path.join(root, 'bin');
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.mkdirSync(cwd, { mode: 0o700 });
  if (install) fs.symlinkSync(FIXTURE, path.join(bin, 'agy'));
  fs.writeFileSync(path.join(cwd, 'antigravity-fixture.json'), JSON.stringify({ mode }), { mode: 0o600 });
  return {
    root,
    cwd,
    context: {
      descriptor: descriptor(),
      brief: 'Reply exactly: Antigravity stdin',
      cwd,
      workspaceRoot: root,
      environment: {
        PATH: install ? `${bin}${path.delimiter}${process['env'].PATH || ''}` : bin,
        HOME: root
      },
      runner: { run(invocation, options) { return runInvocation(invocation, options); } }
    }
  };
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

function baseDependencies(mode, fixture, captures, extra = {}) {
  return {
    registry: { getAdapter: () => adapter },
    runner: fakeRunner(mode, captures),
    environment: fixture.context.environment,
    ...extra
  };
}

function directFixtureInvocation(fixture, mode, limits = {}) {
  return createInvocation({
    adapter: 'antigravity',
    executable: process.execPath,
    argv: [FIXTURE, '--mode', mode, '--output-format', 'stream-json'],
    cwd: fixture.context.cwd,
    workspaceRoot: fixture.context.workspaceRoot,
    prompt: JSON.stringify({ event: 'user', message: { content: 'bounded fixture probe' } }),
    authKeys: [],
    limits: { ...DEFAULT_LIMITS, ...limits }
  });
}

async function dispatch(mode, options = {}) {
  const fixture = workspaceFor(mode, options);
  const captures = options.captures || [];
  try {
    return await dispatchExternal({
      descriptor: descriptor(options.route),
      brief: options.brief || 'bounded brief'
    }, baseDependencies(mode, fixture, captures, { signal: options.signal }));
  } finally {
    cleanup(fixture);
  }
}

test('exports a frozen official-contract adapter with no profile or auth-file access', () => {
  assert.equal(adapter.name, 'antigravity');
  assert.deepEqual(adapter.authKeys, []);
  assert.ok(Object.isFrozen(adapter));
  assert.deepEqual(Object.keys(adapter), [
    'name', 'authKeys', 'probeVersion', 'probeAuth', 'probeCapabilities',
    'buildInvocation', 'parseResult', 'classifyFailure'
  ]);
  const source = fs.readFileSync(path.join(__dirname, '..', 'advisor-routing', 'adapters', 'antigravity.cjs'), 'utf8');
  assert.doesNotMatch(source, /(?:\.gemini|settings\.json|HOME|credential[_-]?file)/iu);
});

test('probes the pinned official contract and fails closed without a deny-write policy', async () => {
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

test('rejects the unverified stream permission mode and parses the documented JSON envelope', async () => {
  const fixture = workspaceFor('success');
  try {
    const captures = [];
    await assert.rejects(dispatch('success', { captures }),
      (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
    assert.deepEqual(captures.map((entry) => entry.argv), [['--version'], ['--help']]);
    const stream = fs.readFileSync(path.join(__dirname, 'fixtures', 'antigravity', 'stream-success.jsonl'), 'utf8');
    assert.throws(() => adapter.parseResult({ execution: { stdout: stream }, limits: DEFAULT_LIMITS }),
      (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
    const json = fs.readFileSync(path.join(__dirname, 'fixtures', 'antigravity', 'json-success.json'), 'utf8');
    assert.deepEqual(adapter.parseResult({ execution: { stdout: json }, limits: DEFAULT_LIMITS }), {
      response: 'AGY_JSON_OK'
    });
  } finally {
    cleanup(fixture);
  }
});

test('covers executable, version, auth, model, effort, read-only, session, output, timeout, cancel, and recursion failures', async () => {
  const cases = [
    ['executable', 'EXECUTABLE_UNAVAILABLE', { install: false }],
    ['version', 'CLI_VERSION_UNSUPPORTED', {}],
    ['model', 'MODEL_UNSUPPORTED', { route: { model: 'flash', effort: 'high' } }],
    ['effort', 'EFFORT_UNSUPPORTED', { route: { model: 'pro', effort: 'xhigh' } }],
    ['read-only', 'READ_ONLY_UNSUPPORTED', {}],
    ['session', 'SESSION_UNSUPPORTED', {}],
    ['output', 'OUTPUT_UNSUPPORTED', {}]
  ];
  for (const [mode, expected, options] of cases) {
    await assert.rejects(dispatch(mode, options), (error) => error?.code === expected, mode);
  }
  const controller = new AbortController();
  const pending = dispatch('cancel', { signal: controller.signal });
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

test('rejects malformed, duplicate, missing, dangerous-tool, and typed process failures', async () => {
  for (const stdout of [
    'not-json',
    JSON.stringify({ event: 'init', init: { tools: ['read_file'], permission_mode: 'sandbox' } }),
    [
      JSON.stringify({ event: 'init', init: { tools: ['read_file'], permission_mode: 'sandbox' } }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'one' } }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'two' } })
    ].join('\n')
  ]) {
    assert.throws(() => adapter.parseResult({ execution: { stdout }, limits: DEFAULT_LIMITS }),
      (error) => error?.code === 'PROTOCOL_INVALID');
  }
  const dangerousOutput = [
    JSON.stringify({ event: 'init', init: {
      tools: ['read_file', 'write_to_file'], permission_mode: 'sandbox'
    }}),
    JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'unsafe' } })
  ].join('\n');
  assert.throws(() => adapter.parseResult({ execution: { stdout: dangerousOutput }, limits: DEFAULT_LIMITS }),
    (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
  for (const tool of ['create_file', 'upload', 'deploy', 'custom_mcp_mutation']) {
    const streamWithUnknownTool = [
      JSON.stringify({ event: 'init', init: {
        tools: ['read_file'], permission_mode: 'sandbox'
      }}),
      JSON.stringify({ event: 'step_update', step_update: { tool_name: tool } }),
      JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'must-not-succeed' } })
    ].join('\n');
    assert.throws(() => adapter.parseResult({
      execution: { stdout: streamWithUnknownTool }, limits: DEFAULT_LIMITS
    }), (error) => error?.code === 'READ_ONLY_UNSUPPORTED', tool);
  }
  const conflicting = [
    JSON.stringify({ event: 'init', init: {
      tools: ['read_file'], permission_mode: 'sandbox'
    }}),
    JSON.stringify({ event: 'step_update', step_update: {
      step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'write_to_file' }
    }}),
    JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'must-not-succeed' } })
  ].join('\n');
  assert.throws(() => adapter.parseResult({
    execution: { stdout: conflicting }, limits: DEFAULT_LIMITS
  }), (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
  const missingToolIdentity = [
    JSON.stringify({ event: 'init', init: {
      tools: ['read_file'], permission_mode: 'sandbox'
    }}),
    JSON.stringify({ event: 'step_update', step_update: { step_type: 'tool' } }),
    JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'must-not-succeed' } })
  ].join('\n');
  assert.throws(() => adapter.parseResult({
    execution: { stdout: missingToolIdentity }, limits: DEFAULT_LIMITS
  }), (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
  for (const [diagnostics, expected] of [
    [{ stderr: 'authentication required' }, 'AUTH_UNAVAILABLE'],
    [{ stdout: 'invalid model selection: model does-not-exist is not recognized' }, 'MODEL_UNSUPPORTED'],
    [{ stderr: 'invalid effort: effort xhigh is unsupported' }, 'EFFORT_UNSUPPORTED'],
    [{ stderr: 'request cancelled by user' }, 'CANCELLED']
  ]) {
    const failure = createRunnerFailure({ reason: 'nonzero-exit', ...diagnostics, exitCode: 1 });
    assert.equal(adapter.classifyFailure(failure), expected);
  }
  const fixture = workspaceFor('success');
  try {
    const stream = fs.readFileSync(path.join(__dirname, 'fixtures', 'antigravity', 'stream-success.jsonl'), 'utf8');
    assert.throws(() => adapter.parseResult({ execution: { stdout: stream }, limits: DEFAULT_LIMITS }),
      (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
    const auth = fs.readFileSync(path.join(__dirname, 'fixtures', 'antigravity', 'json-auth-error.json'), 'utf8');
    assert.throws(() => adapter.parseResult({ execution: { stdout: auth }, limits: DEFAULT_LIMITS }),
      (error) => error?.code === 'AUTH_UNAVAILABLE');
  } finally {
    cleanup(fixture);
  }
});

test('runs the independent fake-CLI auth/model/effort/timeout/cancel matrix', async () => {
  for (const [mode, expected] of [
    ['auth', 'AUTH_UNAVAILABLE'],
    ['model', 'MODEL_UNSUPPORTED'],
    ['effort', 'EFFORT_UNSUPPORTED']
  ]) {
    const fixture = workspaceFor('success');
    try {
      const execution = await runInvocation(directFixtureInvocation(fixture, mode), {
        environment: fixture.context.environment
      });
      assert.equal(execution.error, undefined, mode);
      assert.throws(() => adapter.parseResult({
        execution: execution.result, limits: DEFAULT_LIMITS
      }), (error) => error?.code === expected, mode);
    } finally {
      cleanup(fixture);
    }
  }

  const timeoutFixture = workspaceFor('success');
  try {
    const timeout = await runInvocation(directFixtureInvocation(timeoutFixture, 'timeout', {
      timeoutMs: 40, killGraceMs: 10
    }), { environment: timeoutFixture.context.environment });
    assert.equal(timeout.error.code, 'TIMEOUT');
  } finally {
    cleanup(timeoutFixture);
  }

  const cancelFixture = workspaceFor('success');
  const controller = new AbortController();
  try {
    const pending = runInvocation(directFixtureInvocation(cancelFixture, 'cancel', {
      timeoutMs: 1_000, killGraceMs: 10
    }), { environment: cancelFixture.context.environment, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    const cancelled = await pending;
    assert.equal(cancelled.error.code, 'CANCELLED');
  } finally {
    cleanup(cancelFixture);
  }
});

test('classifies lifecycle errors without returning raw diagnostics', () => {
  for (const code of [
    'TIMEOUT', 'CANCELLED', 'ADVISOR_RECURSION', 'CLI_VERSION_UNSUPPORTED',
    'READ_ONLY_UNSUPPORTED', 'PROTOCOL_INVALID'
  ]) assert.equal(adapter.classifyFailure(createRoutingError(code)), code);
  assert.equal(adapter.classifyFailure(new Error('private path token=hidden')), 'PROCESS_FAILED');
});
