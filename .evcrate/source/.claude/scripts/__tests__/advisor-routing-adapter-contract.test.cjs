'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dispatcher = require('../advisor-dispatch.cjs');
const {
  ADAPTER_NAMES,
  CONFORMANCE_TABLE,
  REQUIRED_METHODS,
  validateAdapter
} = require('../advisor-routing/adapter-contract.cjs');
const {
  BUILTIN_ADAPTERS,
  getAdapter,
  listAdapters,
  validateRegistry
} = require('../advisor-routing/adapter-registry.cjs');
const { DEFAULT_LIMITS, runInvocation } = require('../advisor-routing/runner.cjs');
const { resolveRoute } = require('../advisor-routing/resolve-route.cjs');
const { dispatchExternal } = dispatcher;
const {
  conformanceCategories,
  createFakeInvocation,
  cleanupWorkspace,
  CONFORMANCE_MODES,
  runConformanceMatrix,
  runFakeMode
} = require('./helpers/fake-advisor-cli-harness.cjs');

function expectCode(callback, code) {
  return assert.throws(callback, (error) => error && error.code === code);
}

function externalDescriptor() {
  return resolveRoute({
    activeHost: 'codex',
    policy: {
      version: 1,
      hosts: {
        codex: { backend: 'claude', model: 'opus', effort: 'high', execution: 'external' }
      }
    }
  });
}

test('ships exactly five fixed adapter names and validates every interface method', () => {
  assert.deepEqual(listAdapters(), ADAPTER_NAMES);
  assert.deepEqual(Object.keys(BUILTIN_ADAPTERS), ADAPTER_NAMES);
  for (const name of ADAPTER_NAMES) {
    const adapter = getAdapter(name);
    assert.equal(adapter.name, name);
    for (const method of REQUIRED_METHODS) assert.equal(typeof adapter[method], 'function');
    assert.ok(Object.isFrozen(adapter));
  }
  expectCode(() => getAdapter('user-selected-cli'), 'ADAPTER_UNSUPPORTED');
  expectCode(() => validateRegistry({ ...BUILTIN_ADAPTERS, custom: BUILTIN_ADAPTERS.codex }), 'ADAPTER_REGISTRY_INVALID');
  expectCode(() => validateAdapter({ name: 'codex' }), 'ADAPTER_CONTRACT_INVALID');
});

test('exposes the complete reusable eleven-failure conformance matrix', () => {
  assert.equal(CONFORMANCE_TABLE.length, 11);
  assert.deepEqual(conformanceCategories(), Object.keys(CONFORMANCE_MODES));
  assert.deepEqual(CONFORMANCE_TABLE.map(({ category }) => category), Object.keys(CONFORMANCE_MODES));
  assert.ok(CONFORMANCE_TABLE.every((entry) => Object.isFrozen(entry)));
});

test('executes the eleven-category matrix for every fixed adapter and a bounded success path', async () => {
  for (const adapter of ADAPTER_NAMES) {
    const matrix = await runConformanceMatrix(adapter);
    assert.deepEqual(matrix.map(({ category }) => category), conformanceCategories());
    assert.deepEqual(matrix.map(({ actual }) => actual), CONFORMANCE_TABLE.map(({ errorCode }) => errorCode));
    assert.equal(matrix.find(({ category }) => category === 'recursion').marker, '1');
    const success = await runFakeMode('success', { adapter });
    assert.equal(success.error, undefined);
    assert.equal(JSON.parse(success.result.stdout).response, 'FAKE_OK');
  }
});

test('external dispatch uses the adapter contract and runner injection only outside production JSON', async () => {
  const fixture = createFakeInvocation({ adapter: 'claude' });
  const calls = [];
  const adapter = {
    name: 'claude',
    authKeys: [],
    probeVersion: (context) => {
      calls.push('version');
      assert.equal(context.environment.UNDECLARED_SECRET, undefined);
      assert.equal(context.environment.EVCRATE_PRIVATE, undefined);
    },
    probeAuth: () => { calls.push('auth'); },
    probeCapabilities: () => { calls.push('capabilities'); },
    buildInvocation: () => { calls.push('build'); return fixture.invocation; },
    parseResult: ({ execution }) => { calls.push('parse'); return { response: execution.stdout }; },
    classifyFailure: () => 'PROCESS_FAILED'
  };
  try {
    const response = await dispatchExternal(
      { descriptor: externalDescriptor(), brief: 'bounded brief' },
      {
        registry: { getAdapter: (name) => { assert.equal(name, 'claude'); return adapter; } },
        runner: { run: async () => { calls.push('run'); return { result: { stdout: 'FAKE_OK', stderr: '' } }; } },
        environment: { PATH: '/bin', UNDECLARED_SECRET: 'must-not-probe', EVCRATE_PRIVATE: 'must-not-probe' }
      }
    );
    assert.equal(response.ok, true);
    assert.deepEqual(calls, ['version', 'auth', 'capabilities', 'build', 'run', 'parse']);
    assert.equal(response.result.response, 'FAKE_OK');
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('passes bounded redacted process evidence to the adapter classifier', async () => {
  const fixture = createFakeInvocation({ mode: 'process', adapter: 'claude' });
  let classifyCalls = 0;
  const adapter = {
    name: 'claude',
    authKeys: [],
    probeVersion: () => {},
    probeAuth: () => {},
    probeCapabilities: () => {},
    buildInvocation: () => fixture.invocation,
    parseResult: () => ({ response: 'unexpected success' }),
    classifyFailure: (failure, context) => {
      classifyCalls += 1;
      assert.equal(failure.error.code, 'PROCESS_FAILED');
      assert.equal(failure.diagnostics.reason, 'nonzero-exit');
      assert.equal(failure.diagnostics.exitCode, 17);
      assert.equal(failure.diagnostics.signal, null);
      assert.doesNotMatch(failure.diagnostics.stderr, /super-secret|opaque-secret/iu);
      assert.equal(context.environment, undefined);
      return 'AUTH_UNAVAILABLE';
    }
  };
  try {
    await assert.rejects(
      dispatchExternal(
        { descriptor: externalDescriptor(), brief: 'bounded brief' },
        {
          registry: { getAdapter: () => adapter },
          runner: { run: (invocation, options) => runInvocation(invocation, options) },
          environment: { PATH: process['env'].PATH }
        }
      ),
      (error) => error.code === 'AUTH_UNAVAILABLE'
    );
    assert.equal(classifyCalls, 1);
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('rejects permissive adapters, swapped registry identities, and oversized final results', async () => {
  const descriptor = externalDescriptor();
  expectCode(() => validateAdapter({
    name: 'claude',
    probeVersion() {},
    probeAuth() {},
    probeCapabilities() {},
    buildInvocation() {},
    parseResult() {},
    classifyFailure() {}
  }), 'ADAPTER_CONTRACT_INVALID');
  expectCode(() => validateRegistry({
    ...BUILTIN_ADAPTERS,
    claude: BUILTIN_ADAPTERS.codex
  }), 'ADAPTER_REGISTRY_INVALID');

  const fixture = createFakeInvocation({ adapter: 'claude' });
  let probes = 0;
  const adapter = {
    name: 'claude',
    authKeys: [],
    probeVersion: () => { probes += 1; },
    probeAuth: () => {},
    probeCapabilities: () => {},
    buildInvocation: () => fixture.invocation,
    parseResult: () => 'x'.repeat(DEFAULT_LIMITS.maxResultBytes + 1),
    classifyFailure: () => 'PROCESS_FAILED'
  };
  try {
    await assert.rejects(
      dispatchExternal({ descriptor, brief: 'x'.repeat(DEFAULT_LIMITS.maxPromptBytes + 1) }, {
        registry: { getAdapter: () => { throw new Error('lookup should not happen'); } },
        environment: { PATH: '/bin' }
      }),
      (error) => error.code === 'REQUEST_INVALID'
    );
    await assert.rejects(
      dispatchExternal({ descriptor, brief: 'bounded brief' }, {
        registry: { getAdapter: () => adapter },
        runner: { run: async () => ({ result: { stdout: 'small', stderr: '' } }) },
        environment: { PATH: '/bin' }
      }),
      (error) => error.code === 'OUTPUT_LIMIT'
    );
    assert.equal(probes, 1);
  } finally {
    cleanupWorkspace(fixture.workspace);
  }
});

test('rejects recursion before adapter lookup and rejects executable/argv injection in production requests', async () => {
  let lookups = 0;
  await assert.rejects(
    dispatchExternal(
      { descriptor: externalDescriptor(), brief: 'bounded brief' },
      {
        environment: { PATH: '/bin', EVCRATE_ADVISOR_ACTIVE: '1' },
        registry: { getAdapter: () => { lookups += 1; return null; } }
      }
    ),
    (error) => error.code === 'ADVISOR_RECURSION'
  );
  assert.equal(lookups, 0);
  expectCode(() => dispatcher.validateRequest({
    activeHost: 'codex', operation: 'dispatch', brief: 'x', executable: '/tmp/user-cli'
  }), 'REQUEST_INVALID');
  expectCode(() => dispatcher.validateRequest({
    activeHost: 'codex', operation: 'dispatch', brief: 'x', argv: ['--dangerous']
  }), 'REQUEST_INVALID');
});

test('default production dispatch fails closed through the fixed registry without launching a child', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-dispatch-contract-'));
  const home = path.join(root, 'home');
  const policyDirectory = path.join(home, '.evcrate');
  fs.mkdirSync(policyDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(home, 0o700);
  fs.chmodSync(policyDirectory, 0o700);
  fs.writeFileSync(path.join(policyDirectory, 'advisor-routing.json'), JSON.stringify({
    version: 1,
    hosts: { codex: { backend: 'claude', model: 'opus', effort: 'high', execution: 'external' } }
  }), { mode: 0o600 });
  const originalHome = os.homedir;
  os.homedir = () => home;
  try {
    await assert.rejects(
      dispatcher.dispatchRequest({ operation: 'dispatch', activeHost: 'codex', brief: 'bounded brief' }),
      (error) => error.code === 'ADAPTER_UNSUPPORTED'
    );
  } finally {
    os.homedir = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps fake fixtures and test seams outside the production runtime modules', () => {
  const production = [
    require('node:fs').readFileSync(path.join(__dirname, '..', 'advisor-dispatch.cjs'), 'utf8'),
    require('node:fs').readFileSync(path.join(__dirname, '..', 'advisor-routing', 'runner.cjs'), 'utf8'),
    require('node:fs').readFileSync(path.join(__dirname, '..', 'advisor-routing', 'adapter-registry.cjs'), 'utf8')
  ].join('\n');
  assert.doesNotMatch(production, /fake-advisor-cli|__tests__|fixture/iu);
});
