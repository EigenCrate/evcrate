'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const adapter = require('../advisor-routing/adapters/claude.cjs');
const { dispatchExternal } = require('../advisor-dispatch.cjs');
const {
  DEFAULT_LIMITS,
  createInvocation,
  runInvocation
} = require('../advisor-routing/runner.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'claude', 'fake-claude-cli-v2.1.207.cjs');
const BASE_ENVIRONMENT = Object.freeze({ PATH: process['env'].PATH || '' });

function descriptor({
  model = 'opus', effort = 'high', activeHost = 'codex', backend = 'claude'
} = {}) {
  return Object.freeze({
    schema: 'evcrate-advisor-route/v1',
    version: 1,
    activeHost,
    route: Object.freeze({ backend, model, effort, execution: 'external' }),
    source: 'test',
    action: 'external',
    nativeCapability: null,
    adapter: 'claude'
  });
}

function fakeRunner(mode, captures = []) {
  return Object.freeze({
    async run(invocation, options = {}) {
      captures.push(Object.freeze({
        executable: invocation.executable,
        argv: Object.freeze([...invocation.argv]),
        prompt: invocation.prompt
      }));
      if (mode === 'executable') {
        return runInvocation(invocation, { ...options, environment: { PATH: '' } });
      }
      const limits = {
        ...invocation.limits,
        ...(mode === 'timeout' || mode === 'cancel'
          ? { timeoutMs: 40, killGraceMs: 20 }
          : {})
      };
      const fakeInvocation = createInvocation({
        adapter: invocation.adapter,
        executable: process.execPath,
        argv: [FIXTURE, '--case', mode, ...invocation.argv],
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

function dependencies(mode, captures = [], extra = {}) {
  return {
    registry: { getAdapter: () => adapter },
    runner: fakeRunner(mode, captures),
    environment: BASE_ENVIRONMENT,
    ...extra
  };
}

async function dispatch(mode, options = {}) {
  return dispatchExternal(
    { descriptor: descriptor(options.route), brief: options.brief || 'bounded brief' },
    dependencies(mode, options.captures, options.dependencies)
  );
}

function errorCode(error) {
  return error && error.code;
}

test('exports a frozen Claude adapter with the exact six-method contract and no auth keys', () => {
  assert.equal(adapter.name, 'claude');
  assert.deepEqual(adapter.authKeys, []);
  assert.ok(Object.isFrozen(adapter));
  assert.ok(Object.isFrozen(adapter.authKeys));
  assert.deepEqual(Object.keys(adapter), [
    'name', 'authKeys', 'probeVersion', 'probeAuth', 'probeCapabilities',
    'buildInvocation', 'parseResult', 'classifyFailure'
  ]);
  for (const method of [
    'probeVersion', 'probeAuth', 'probeCapabilities', 'buildInvocation', 'parseResult', 'classifyFailure'
  ]) assert.equal(typeof adapter[method], 'function');
});

test('runs version, auth, help, and final result through the injected runner with stdin-only prompt delivery', async () => {
  const captures = [];
  const brief = 'Read only: --model opus; do not put this in argv';
  const response = await dispatch('success', { captures, brief });
  assert.equal(response.ok, true);
  assert.equal(response.result.response, `CLAUDE_OK:${brief}`);
  assert.deepEqual(captures.map(({ argv, prompt }) => ({ argv, prompt })), [
    { argv: ['--version'], prompt: '' },
    { argv: ['auth', 'status'], prompt: '' },
    { argv: ['--help'], prompt: '' },
    {
      argv: [
        '--model', 'opus', '--effort', 'high', '--permission-mode', 'plan',
        '--output-format', 'json', '--no-session-persistence', '--max-turns', '3', '--help'
      ],
      prompt: ''
    },
    {
      argv: [
        '-p', '--model', 'opus', '--effort', 'high', '--permission-mode', 'plan',
        '--output-format', 'json', '--no-session-persistence', '--max-turns', '3'
      ],
      prompt: brief
    }
  ]);
  const final = captures.at(-1);
  assert.equal(final.executable, 'claude');
  assert.ok(final.argv.every((arg) => !arg.includes(brief)));
  assert.doesNotMatch(final.argv.join(' '), /bypass|dangerously|skip-permissions/iu);
});

test('executes the complete independent eleven-category fake-CLI conformance matrix', async () => {
  const cases = [
    ['executable', 'EXECUTABLE_UNAVAILABLE'],
    ['version', 'CLI_VERSION_UNSUPPORTED'],
    ['auth', 'AUTH_UNAVAILABLE'],
    ['model', 'MODEL_UNSUPPORTED'],
    ['effort', 'EFFORT_UNSUPPORTED'],
    ['read-only', 'READ_ONLY_UNSUPPORTED'],
    ['session', 'SESSION_UNSUPPORTED'],
    ['output', 'OUTPUT_UNSUPPORTED'],
    ['timeout', 'TIMEOUT'],
    ['cancel', 'CANCELLED'],
    ['recursion', 'ADVISOR_RECURSION']
  ];
  for (const [category, expected] of cases) {
    if (category === 'recursion') {
      const context = {
        descriptor: descriptor(),
        brief: 'bounded brief',
        environment: { ...BASE_ENVIRONMENT, EVCRATE_ADVISOR_ACTIVE: '1' },
        runner: fakeRunner('success')
      };
      await assert.rejects(adapter.probeVersion(context), (error) => errorCode(error) === expected);
      continue;
    }
    const route = category === 'model' ? { model: 'sonnet', effort: 'high' }
      : category === 'effort' ? { model: 'opus', effort: 'low' } : undefined;
    const controller = category === 'cancel' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20) : null;
    try {
      await assert.rejects(
        dispatch(category, {
          route,
          dependencies: controller ? { signal: controller.signal } : undefined
        }),
        (error) => errorCode(error) === expected
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
});

test('rejects direct same-host external dispatch before adapter lookup', async () => {
  let lookups = 0;
  await assert.rejects(
    dispatchExternal({
      descriptor: descriptor({ activeHost: 'claude' }),
      brief: 'bounded brief'
    }, {
      registry: { getAdapter: () => { lookups += 1; return adapter; } },
      environment: BASE_ENVIRONMENT
    }),
    (error) => errorCode(error) === 'NATIVE_DISPATCH_UNSUPPORTED'
  );
  assert.equal(lookups, 0);
});

test('forwards one cancellation signal to every probe and final run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-claude-signal-'));
  const signal = new AbortController().signal;
  const seen = [];
  const probingAdapter = {
    name: 'claude',
    authKeys: [],
    probeVersion(context) { seen.push(context.signal); },
    probeAuth(context) { seen.push(context.signal); },
    probeCapabilities(context) { seen.push(context.signal); },
    buildInvocation() {
      return createInvocation({
        adapter: 'claude', executable: process.execPath, argv: ['--version'],
        cwd: root, workspaceRoot: root, prompt: 'bounded brief', authKeys: [], limits: DEFAULT_LIMITS
      });
    },
    parseResult() { return { response: 'ok' }; },
    classifyFailure() { return 'PROCESS_FAILED'; }
  };
  const finalRunSignals = [];
  try {
    const result = await dispatchExternal({
      descriptor: descriptor(), brief: 'bounded brief'
    }, {
      registry: { getAdapter: () => probingAdapter },
      runner: { run: async (_invocation, options) => {
        finalRunSignals.push(options.signal);
        return { result: { stdout: 'ok', stderr: '' } };
      } },
      environment: BASE_ENVIRONMENT,
      signal
    });
    assert.equal(result.result.response, 'ok');
    assert.deepEqual(seen, [signal, signal, signal]);
    assert.deepEqual(finalRunSignals, [signal]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects nonzero process output and every malformed, missing, duplicate, or unexpected terminal result', async () => {
  await assert.rejects(dispatch('nonzero'), (error) => errorCode(error) === 'PROCESS_FAILED');
  for (const mode of ['protocol', 'missing-terminal', 'duplicate-terminal', 'unexpected']) {
    await assert.rejects(dispatch(mode), (error) => errorCode(error) === 'PROTOCOL_INVALID');
  }
});

test('normalizes process diagnostics without exposing stderr secrets or paths', async () => {
  const captures = [];
  await assert.rejects(dispatch('nonzero', { captures }), (error) => {
    assert.equal(errorCode(error), 'PROCESS_FAILED');
    assert.doesNotMatch(`${error.name}:${error.message}:${error.action}`, /fixture-secret|fixture-bearer|private\/fake/iu);
    return true;
  });
  assert.equal(captures.at(-1).executable, 'claude');

  const context = {
    descriptor: descriptor(),
    brief: 'bounded brief',
    environment: BASE_ENVIRONMENT,
    runner: fakeRunner('nonzero')
  };
  await adapter.probeVersion(context);
  await adapter.probeAuth(context);
  await adapter.probeCapabilities(context);
  const execution = await context.runner.run(await adapter.buildInvocation(context), {
    environment: context.environment
  });
  assert.equal(execution.error.code, 'PROCESS_FAILED');
  assert.match(execution.failure.diagnostics.stderr, /\[REDACTED\]/u);
  assert.doesNotMatch(execution.failure.diagnostics.stderr, /fixture-secret|fixture-bearer/iu);
  assert.equal(adapter.classifyFailure(execution.failure), 'PROCESS_FAILED');
});

test('keeps final response bounded and rejects oversized protocol data', async () => {
  const context = {
    descriptor: descriptor(),
    brief: 'bounded brief',
    limits: { ...DEFAULT_LIMITS, maxResultBytes: 32 },
    execution: { stdout: JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, result: 'x'.repeat(64)
    }) }
  };
  await assert.rejects(adapter.parseResult(context), (error) => errorCode(error) === 'OUTPUT_LIMIT');
});

test('uses fixed capability validation before final invocation construction', async () => {
  const created = [];
  const context = {
    descriptor: descriptor({ model: 'sonnet', effort: 'high' }),
    brief: 'bounded brief',
    environment: BASE_ENVIRONMENT,
    runner: fakeRunner('success'),
    createInvocation(specification) {
      created.push(specification);
      return createInvocation(specification);
    }
  };
  await adapter.probeVersion(context);
  await adapter.probeAuth(context);
  await assert.rejects(adapter.probeCapabilities(context), (error) => errorCode(error) === 'MODEL_UNSUPPORTED');

  const supportedContext = { ...context, descriptor: descriptor() };
  await adapter.probeVersion(supportedContext);
  await adapter.probeAuth(supportedContext);
  await adapter.probeCapabilities(supportedContext);
  supportedContext.descriptor = descriptor({ model: 'opus', effort: 'low' });
  await assert.rejects(adapter.buildInvocation(supportedContext),
    (error) => errorCode(error) === 'EFFORT_UNSUPPORTED');
  supportedContext.descriptor = descriptor();
  const invocation = await adapter.buildInvocation(supportedContext);
  assert.equal(invocation.executable, 'claude');
  assert.ok(created.length >= 4);
  assert.ok(created.every(({ authKeys }) => Array.isArray(authKeys) && authKeys.length === 0));
});

test('does not require live authentication or model calls', () => {
  assert.match(fs.readFileSync(path.join(__dirname, 'fixtures', 'claude', 'version-2.1.207.txt'), 'utf8'), /2\.1\.207/u);
  assert.match(fs.readFileSync(path.join(__dirname, 'fixtures', 'claude', 'result-2.1.207.json'), 'utf8'), /"type": "result"/u);
});
