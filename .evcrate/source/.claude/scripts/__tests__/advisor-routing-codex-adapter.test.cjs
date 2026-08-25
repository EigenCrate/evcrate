'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const codex = require('../advisor-routing/adapters/codex.cjs');
const { createRoutingError } = require('../advisor-routing/errors.cjs');
const {
  createInvocation,
  runInvocation
} = require('../advisor-routing/runner.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'codex', 'fake-codex.cjs');
const EXPECTED_FAILURES = Object.freeze({
  executable: 'EXECUTABLE_UNAVAILABLE',
  version: 'CLI_VERSION_UNSUPPORTED',
  auth: 'AUTH_UNAVAILABLE',
  model: 'MODEL_UNSUPPORTED',
  effort: 'EFFORT_UNSUPPORTED',
  'read-only': 'READ_ONLY_UNSUPPORTED',
  session: 'SESSION_UNSUPPORTED',
  output: 'OUTPUT_UNSUPPORTED',
  timeout: 'TIMEOUT',
  cancel: 'CANCELLED',
  recursion: 'ADVISOR_RECURSION'
});

function workspaceFor(mode, { install = true, signal, shortProbe = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-codex-adapter-'));
  const bin = path.join(root, 'bin');
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.mkdirSync(cwd, { mode: 0o700 });
  if (install) fs.symlinkSync(FIXTURE, path.join(bin, 'codex'));
  fs.writeFileSync(path.join(cwd, 'codex-fixture.json'), JSON.stringify({ mode }), { mode: 0o600 });
  const created = [];
  const context = {
    descriptor: { route: { model: 'gpt-5.6-sol', effort: 'high' } },
    brief: 'Reply exactly: codex adapter stdin',
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
        limits: { ...specification.limits, timeoutMs: 35, killGraceMs: 10 }
      } : specification;
      return createInvocation(adjusted);
    },
    signal,
    created
  };
  return Object.freeze({ root, cwd, context });
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

async function probeAll(context) {
  await codex.probeVersion(context);
  await codex.probeAuth(context);
  await codex.probeCapabilities(context);
}

async function executeFixture(fixture) {
  await probeAll(fixture.context);
  const invocation = codex.buildInvocation(fixture.context);
  const execution = await fixture.context.runner.run(invocation, {
    environment: fixture.context.environment
  });
  return { invocation, execution, parsed: execution.error
    ? undefined : codex.parseResult({ execution: execution.result }) };
}

async function expectAdapterFailure(mode, expected, options = {}) {
  const fixture = workspaceFor(mode, options);
  try {
    await assert.rejects(probeAll(fixture.context), (error) => error?.code === expected);
  } finally {
    cleanup(fixture);
  }
}

test('exports a frozen codex adapter with the exact six-method contract', () => {
  assert.equal(codex.name, 'codex');
  assert.deepEqual(codex.authKeys, []);
  assert.ok(Object.isFrozen(codex));
  assert.ok(Object.isFrozen(codex.authKeys));
  assert.deepEqual(Object.keys(codex), [
    'name', 'authKeys', 'probeVersion', 'probeAuth', 'probeCapabilities',
    'buildInvocation', 'parseResult', 'classifyFailure'
  ]);
});

test('probes the version, auth, capability controls, exact model/effort, and builds fixed argv', async () => {
  const fixture = workspaceFor('success');
  try {
    await probeAll(fixture.context);
    const invocation = codex.buildInvocation(fixture.context);
    assert.equal(invocation.executable, 'codex');
    assert.deepEqual(invocation.authKeys, []);
    assert.deepEqual(invocation.argv, [
      'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
      '--ask-for-approval', 'never', '--model', 'gpt-5.6-sol', '--config',
      'model_reasoning_effort="high"', '--json', '-'
    ]);
    assert.ok(fixture.context.created.every(({ executable, authKeys }) =>
      executable === 'codex' && Array.isArray(authKeys) && authKeys.length === 0
    ));
  } finally {
    cleanup(fixture);
  }
});

test('delivers the brief only on stdin and parses one bounded assistant result', async () => {
  const fixture = workspaceFor('success');
  try {
    const result = await executeFixture(fixture);
    assert.equal(result.execution.error, undefined);
    assert.deepEqual(result.parsed, { response: 'FAKE_CODEX_OK' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.cwd, 'codex-argv.json'), 'utf8')),
      result.invocation.argv);
    assert.equal(fs.readFileSync(path.join(fixture.cwd, 'codex-stdin.txt'), 'utf8'), fixture.context.brief);
    assert.ok(!result.invocation.argv.includes(fixture.context.brief));
  } finally {
    cleanup(fixture);
  }
});

test('covers every required fail-closed conformance category with the independent fake CLI', async () => {
  for (const [category, expected] of Object.entries(EXPECTED_FAILURES)) {
    const options = category === 'executable' ? { install: false } : {};
    if (category === 'timeout') Object.assign(options, { shortProbe: true });
    if (category === 'cancel') {
      const controller = new AbortController();
      Object.assign(options, { shortProbe: true, signal: controller.signal });
      const fixture = workspaceFor(category, options);
      try {
        const pending = probeAll(fixture.context);
        setTimeout(() => controller.abort(), 15);
        await assert.rejects(pending, (error) => error?.code === expected);
      } finally {
        cleanup(fixture);
      }
      continue;
    }
    if (category === 'recursion') {
      const fixture = workspaceFor(category);
      fixture.context.environment.EVCRATE_ADVISOR_ACTIVE = '1';
      try {
        await assert.rejects(probeAll(fixture.context), (error) => error?.code === expected);
      } finally {
        cleanup(fixture);
      }
      continue;
    }
    await expectAdapterFailure(category, expected, options);
  }
});

test('rejects nonzero execution, malformed/duplicate/missing/unexpected JSONL, and oversized result', async () => {
  const cases = [
    ['nonzero', 'PROCESS_FAILED'],
    ['malformed', 'PROTOCOL_INVALID'],
    ['duplicate', 'PROTOCOL_INVALID'],
    ['missing', 'PROTOCOL_INVALID'],
    ['incomplete', 'PROTOCOL_INVALID'],
    ['between-terminal', 'PROTOCOL_INVALID'],
    ['trailing', 'PROTOCOL_INVALID'],
    ['unexpected', 'PROTOCOL_INVALID'],
    ['oversized', 'OUTPUT_LIMIT']
  ];
  for (const [mode, expected] of cases) {
    const fixture = workspaceFor(mode);
    try {
      await probeAll(fixture.context);
      const invocation = codex.buildInvocation(fixture.context);
      const execution = await fixture.context.runner.run(invocation, {
        environment: fixture.context.environment
      });
      if (execution.error) {
        assert.equal(codex.classifyFailure(execution.failure || execution.error), expected, mode);
        assert.doesNotMatch(execution.failure?.diagnostics?.stderr || '', /fixture-secret|fixture-token/iu);
      } else {
        assert.throws(() => codex.parseResult({ execution: execution.result }),
          (error) => error?.code === expected, mode);
      }
    } finally {
      cleanup(fixture);
    }
  }
});

test('classifies lifecycle/protocol errors without returning diagnostics or credential values', () => {
  for (const code of ['TIMEOUT', 'CANCELLED', 'ADVISOR_RECURSION', 'PROTOCOL_INVALID']) {
    assert.equal(codex.classifyFailure(createRoutingError(code)), code);
  }
  assert.equal(codex.classifyFailure(new Error('path and secret=hidden')), 'PROCESS_FAILED');
});
