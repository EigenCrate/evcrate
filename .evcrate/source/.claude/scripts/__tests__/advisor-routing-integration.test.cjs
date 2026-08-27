'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dispatcher = require('../advisor-dispatch.cjs');
const { EXTERNAL_ADVISOR_TIMEOUT_MS } = dispatcher;
const { createRoutingError } = require('../advisor-routing/errors.cjs');
const { resolveRoute } = require('../advisor-routing/resolve-route.cjs');
const { HOSTS } = require('../advisor-routing/policy-schema.cjs');
const {
  expectCode,
  fakeAdapter,
  policyFor,
  temporaryHome,
  withHome
} = require('./helpers/checkpoint-routing-fixtures.cjs');

const NATIVE_CAPABILITIES = Object.freeze({
  claude: Object.freeze({ model: 'opus', effort: 'high' }),
  codex: Object.freeze({ model: 'gpt-5.6-sol', effort: 'high' }),
  antigravity: Object.freeze({ model: 'pro', effort: 'high' }),
  pi: Object.freeze({ model: 'openai-codex/gpt-5.6-sol', effort: 'high' })
});

test('missing global policy selects the built-in default without repository lookup', () => {
  const home = temporaryHome();
  try {
    withHome(home, () => {
      const response = dispatcher.dispatchRequest({ operation: 'resolve', activeHost: 'codex' });
      assert.equal(response.descriptor.source, 'builtin');
      assert.equal(response.descriptor.action, 'native');
      assert.equal(response.descriptor.route.backend, 'codex');
    });
    assert.equal(fs.existsSync(path.join(home, '.evcrate')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('present malformed global policy fails closed instead of selecting the default', () => {
  const home = temporaryHome(true);
  const policyPath = path.join(home, '.evcrate', 'advisor-routing.json');
  fs.writeFileSync(policyPath, '{ malformed', { mode: 0o600 });
  fs.chmodSync(policyPath, 0o600);
  try {
    withHome(home, () => {
      expectCode(
        () => dispatcher.dispatchRequest({ operation: 'resolve', activeHost: 'codex' }),
        'ROUTE_POLICY_MALFORMED'
      );
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('the route truth table rejects same-host external and cross-host native for every host', () => {
  for (const activeHost of HOSTS) {
    expectCode(
      () => resolveRoute({
        activeHost,
        policy: policyFor(activeHost, activeHost, 'external')
      }),
      'ROUTE_EXECUTION_INVALID'
    );
    const crossHost = HOSTS[(HOSTS.indexOf(activeHost) + 1) % HOSTS.length];
    expectCode(
      () => resolveRoute({
        activeHost,
        policy: policyFor(activeHost, crossHost, 'native')
      }),
      'ROUTE_EXECUTION_INVALID'
    );
  }
});

test('every valid cross-host pair invokes only its configured adapter with exact route metadata', async () => {
  for (const activeHost of HOSTS) {
    for (const backend of HOSTS) {
      if (backend === activeHost) continue;
      const descriptor = resolveRoute({
        activeHost,
        policy: policyFor(activeHost, backend)
      });
      assert.equal(descriptor.action, 'external');
      assert.equal(descriptor.adapter, backend);
      const calls = [];
      const adapter = fakeAdapter(backend, calls);
      const response = await dispatcher.dispatchExternal(
        { descriptor, brief: `checkpoint ${activeHost} -> ${backend}` },
        {
          registry: {
            getAdapter: (name) => {
              calls.push(`lookup:${name}`);
              assert.equal(name, backend);
              return adapter;
            }
          },
          runner: {
            run: async (invocation) => {
              calls.push('run');
              assert.equal(invocation.limits.timeoutMs, EXTERNAL_ADVISOR_TIMEOUT_MS);
              return { result: { stdout: '{}', stderr: '' } };
            }
          },
          environment: { PATH: '/bin' }
        }
      );
      assert.equal(response.ok, true);
      assert.equal(response.descriptor.adapter, backend);
      assert.equal(calls.filter((call) => call.startsWith('lookup:')).length, 1);
      assert.equal(calls.filter((call) => call === 'run').length, 1);
      assert.equal(calls.filter((call) => call.endsWith(':parse')).length, 1);
      assert.ok(calls.some((call) => call === `${backend}:capabilities:configured-${backend}:high`));
    }
  }
});

test('same-host exact native defaults remain capability-gated, including Gemini effort', () => {
  for (const [activeHost, capability] of Object.entries(NATIVE_CAPABILITIES)) {
    const descriptor = resolveRoute({
      activeHost,
      policy: {
        version: 1,
        hosts: {
          [activeHost]: {
            backend: activeHost,
            model: capability.model,
            effort: capability.effort,
            execution: 'auto'
          }
        }
      }
    });
    assert.equal(descriptor.action, 'native');
    assert.equal(descriptor.adapter, null);
  }
  expectCode(
    () => resolveRoute({
      activeHost: 'gemini',
      policy: {
        version: 1,
        hosts: {
          gemini: { backend: 'gemini', model: 'pro', effort: 'high', execution: 'auto' }
        }
      }
    }),
    'EFFORT_UNSUPPORTED'
  );
});

test('external dispatch emits phase-scoped lifecycle diagnostics when requested', async () => {
  const descriptor = resolveRoute({
    activeHost: 'antigravity',
    policy: policyFor('antigravity', 'codex')
  });
  const calls = [];
  const events = [];
  const adapter = fakeAdapter('codex', calls);
  const response = await dispatcher.dispatchExternal(
    { descriptor, brief: 'phase diagnostics' },
    {
      registry: { getAdapter: () => adapter },
      runner: {
        run: async (invocation, options) => {
          assert.equal(invocation.limits.timeoutMs, EXTERNAL_ADVISOR_TIMEOUT_MS);
          options.onLifecycle?.({
            status: 'completed',
            pid: 8123,
            elapsed_ms: 17,
            termination_wait_ms: 0
          });
          return { result: { stdout: '{}', stderr: '' } };
        }
      },
      debugSink: (event) => events.push(event),
      environment: { PATH: '/bin' }
    }
  );
  assert.equal(response.ok, true);
  assert.deepEqual(events.map(({ phase }) => phase), [
    'probe-version', 'probe-auth', 'probe-capabilities', 'build-invocation',
    'final-run', 'parse-result'
  ]);
  assert.deepEqual(events.find(({ phase }) => phase === 'final-run'), {
    phase: 'final-run',
    status: 'completed',
    pid: 8123,
    elapsed_ms: 17,
    termination_wait_ms: 0
  });
});

test('recursion and adapter failure stop before alternate work', async () => {
  const descriptor = resolveRoute({
    activeHost: 'codex',
    policy: policyFor('codex', 'claude')
  });
  let lookups = 0;
  await assert.rejects(
    dispatcher.dispatchExternal(
      { descriptor, brief: 'bounded checkpoint' },
      {
        environment: { PATH: '/bin', EVCRATE_ADVISOR_ACTIVE: '1' },
        registry: { getAdapter: () => { lookups += 1; return null; } }
      }
    ),
    (error) => error?.code === 'ADVISOR_RECURSION'
  );
  assert.equal(lookups, 0);

  const calls = [];
  const adapter = fakeAdapter('claude', calls, createRoutingError('AUTH_UNAVAILABLE'));
  await assert.rejects(
    dispatcher.dispatchExternal(
      { descriptor, brief: 'bounded checkpoint' },
      {
        registry: { getAdapter: () => { calls.push('lookup'); return adapter; } },
        runner: { run: async () => { calls.push('run'); return { result: {} }; } },
        environment: { PATH: '/bin' }
      }
    ),
    (error) => error?.code === 'AUTH_UNAVAILABLE'
  );
  assert.deepEqual(calls, ['lookup', 'claude:version', 'claude:auth']);
});
