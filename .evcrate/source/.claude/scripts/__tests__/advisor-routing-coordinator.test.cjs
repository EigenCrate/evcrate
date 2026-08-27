'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  bindHarness,
  main: bridgeMain,
  harnessFromPath,
  resumeNative
} = require('../advisor-bridge.cjs');
const {
  dispatchCoordinator
} = require('../advisor-coordinator.cjs');
const {
  DEFAULT_STATE_DIRECTORY,
  createHandoff
} = require('../advisor-handoff.cjs');
const {
  createInvocation,
  runInvocation
} = require('../advisor-routing/runner.cjs');
const { withHome } = require('./helpers/checkpoint-routing-fixtures.cjs');

const CODEX_FIXTURE = path.join(__dirname, 'fixtures', 'codex', 'fake-codex.cjs');

function checkpoint(activeHost) {
  return {
    protocol: 'evcrate-advisor-checkpoint',
    version: 1,
    active_host: activeHost,
    checkpoint: 'review:bridge-test',
    question: 'Which safe action should follow this terminal review?',
    kind: 'review',
    task_or_phase: 'Bridge integration test',
    evidence: { terminal: 'Terminal reviewer completed successfully.', files: [] },
    changed_paths: [],
    prior_counsel: 'none',
    owner_disposition: 'none'
  };
}

function nativeDescriptor(activeHost) {
  return {
    schema: 'evcrate-advisor-route/v1',
    version: 1,
    activeHost,
    route: {
      backend: activeHost,
      model: 'opus',
      effort: 'high',
      execution: 'auto'
    },
    source: 'builtin',
    action: 'native',
    nativeCapability: {
      backend: activeHost,
      model: 'opus',
      effort: 'high',
      selector: 'model'
    },
    adapter: null
  };
}

function nativeResult(envelope, recommendation) {
  return {
    protocol: 'evcrate-advisor-result',
    version: 1,
    checkpoint: envelope.checkpoint,
    status: 'ADVICE_READY',
    recommendation,
    must_fix: [],
    cautions: [],
    assumptions: [],
    success_checks: [],
    unresolved_questions: []
  };
}

function handoffFiles(directory) {
  return fs.readdirSync(directory).filter((name) => name.startsWith('handoff-'));
}

const PROJECTED_BRIDGES = [
  ['claude', path.resolve(__dirname, '../advisor-bridge.cjs')],
  ['codex', path.resolve(__dirname, '../../../.codex/scripts/advisor-bridge.cjs')],
  ['gemini', path.resolve(__dirname, '../../../.gemini/scripts/advisor-bridge.cjs')],
  ['antigravity', path.resolve(__dirname, '../../../.antigravity/scripts/advisor-bridge.cjs')],
  ['pi', path.resolve(__dirname, '../../../.pi/agent/evcrate/scripts/advisor-bridge.cjs')]
];

test('derives each harness identity from its local runtime directory', () => {
  assert.equal(harnessFromPath('/workspace/.claude/scripts'), 'claude');
  assert.equal(harnessFromPath('/workspace/.codex/scripts'), 'codex');
  assert.equal(harnessFromPath('/workspace/.gemini/scripts'), 'gemini');
  assert.equal(harnessFromPath('/home/user/.gemini/config/scripts'), 'antigravity');
  assert.equal(harnessFromPath('/workspace/.antigravity/scripts'), 'antigravity');
  assert.equal(harnessFromPath('/workspace/.pi/agent/evcrate/scripts'), 'pi');
  assert.throws(() => harnessFromPath('/workspace/scripts'), { code: 'HOST_INVALID' });
});

test('bridge binds the physical host and rejects a mismatched caller host', () => {
  const request = { operation: 'dispatch', checkpoint: checkpoint('pi') };
  const bound = bindHarness({
    operation: request.operation,
    checkpoint: { ...request.checkpoint, active_host: undefined }
  }, 'pi');
  assert.equal(bound.active_host, 'pi');
  assert.equal(bound.checkpoint.active_host, 'pi');
  assert.throws(() => bindHarness(request, 'codex'), { code: 'HOST_INVALID' });
});

test('bridge exposes bounded lifecycle diagnostics only for explicit debug requests', async () => {
  const response = await bridgeMain(JSON.stringify({
    operation: 'dispatch',
    checkpoint: checkpoint('claude'),
    debug: true
  }), {
    dispatchRequest: () => ({ ok: true, descriptor: { action: 'external', activeHost: 'claude' } }),
    dispatchExternal: ({ descriptor }) => ({
      ok: true,
      descriptor,
      result: { status: 'ADVICE_READY' }
    })
  });
  assert.equal(response.ok, true);
  assert.equal(response.debug.schema, 'evcrate-advisor-debug/v1');
  assert.equal(response.debug.version, 1);
  assert.deepEqual(response.debug.phases, []);

  const noDebug = await bridgeMain(JSON.stringify({
    operation: 'dispatch',
    checkpoint: checkpoint('claude')
  }), {
    dispatchRequest: () => ({ ok: true, descriptor: { action: 'external', activeHost: 'claude' } }),
    dispatchExternal: ({ descriptor }) => ({
      ok: true,
      descriptor,
      result: { status: 'ADVICE_READY' }
    })
  });
  assert.equal(Object.hasOwn(noDebug, 'debug'), false);

  const nativeDebug = await bridgeMain(JSON.stringify({
    operation: 'dispatch',
    checkpoint: checkpoint('claude'),
    debug: true
  }), {
    dispatchRequest: () => ({ ok: true, descriptor: nativeDescriptor('claude') })
  });
  assert.equal(nativeDebug.ok, false);
  assert.equal(nativeDebug.error.code, 'REQUEST_INVALID');
  assert.equal(Object.hasOwn(nativeDebug, 'debug'), false);
});

test('standalone native bridges fail closed without creating a handoff', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-standalone-native-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDirectory = path.join(root, 'handoffs');

  for (const [activeHost, bridgePath] of PROJECTED_BRIDGES) {
    const bridge = require(bridgePath);
    const response = await bridge.main(JSON.stringify({
      operation: 'dispatch',
      checkpoint: checkpoint(activeHost)
    }), {
      stateDirectory,
      allowNativeHandoff: false,
      dispatchRequest: () => ({ ok: true, descriptor: nativeDescriptor(activeHost) })
    });
    assert.equal(response.ok, false, activeHost);
    assert.equal(response.error.code, 'NATIVE_DISPATCH_UNSUPPORTED', activeHost);
    assert.equal(fs.existsSync(stateDirectory), false, activeHost);
  }
});

test('standalone bridge CLI reports unsupported native dispatch and creates no handoff', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-standalone-cli-'));
  const home = path.join(root, 'home');
  const stateDirectory = path.join(home, '.evcrate', 'advisor-handoffs');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  try {
    const environment = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      TMPDIR: root
    };
    delete environment.EVCRATE_ADVISOR_ACTIVE;
    delete environment.EVCRATE_ADVISOR_DEPTH;
    const child = childProcess.spawnSync(
      process.execPath,
      [path.resolve(__dirname, '../advisor-bridge.cjs')],
      {
        cwd: path.resolve(__dirname, '../../../../..'),
        env: environment,
        input: JSON.stringify({
          operation: 'dispatch',
          checkpoint: checkpoint('claude')
        }),
        encoding: 'utf8',
        maxBuffer: 16 * 1024,
        timeout: 10_000
      }
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.equal(child.signal, null);
    assert.equal(child.stderr, '');
    const response = JSON.parse(child.stdout);
    assert.deepEqual(Object.keys(response), ['ok', 'error']);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'NATIVE_DISPATCH_UNSUPPORTED');
    assert.equal(fs.existsSync(stateDirectory), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('in-process native callback returns validated advice without a handoff', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-native-callback-'));
  const stateDirectory = path.join(root, 'handoffs');
  const descriptor = nativeDescriptor('claude');
  let nativeCalls = 0;
  try {
    const response = await bridgeMain(JSON.stringify({
      operation: 'dispatch',
      checkpoint: checkpoint('claude')
    }), {
      stateDirectory,
      dispatchRequest: () => ({ ok: true, descriptor }),
      nativeAdvisor: async ({ checkpoint: envelope, descriptor: resolved }) => {
        nativeCalls += 1;
        assert.deepEqual(resolved, descriptor);
        return nativeResult(envelope, 'Host callback completed.');
      }
    });
    assert.equal(response.ok, true);
    assert.equal(response.result.status, 'ADVICE_READY');
    assert.equal(response.result.recommendation, 'Host callback completed.');
    assert.equal(nativeCalls, 1);
    assert.equal(fs.existsSync(stateDirectory), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('external coordination resolves once and uses only the external branch', async () => {
  const calls = [];
  const descriptor = { action: 'external', activeHost: 'codex' };
  const response = await dispatchCoordinator({
    operation: 'dispatch',
    active_host: 'codex',
    checkpoint: checkpoint('codex')
  }, {
    dispatchRequest(request) {
      calls.push(['resolve', request]);
      return { ok: true, descriptor };
    },
    dispatchExternal(value) {
      calls.push(['external', value]);
      return { ok: true, descriptor, result: { status: 'ADVICE_READY' } };
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'resolve');
  assert.deepEqual(calls[0][1], { operation: 'resolve', activeHost: 'codex' });
  assert.equal(calls[1][0], 'external');
  assert.equal(response.result.status, 'ADVICE_READY');
});

test('binds an Antigravity checkpoint and executes the configured Codex adapter end to end', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-coordinator-codex-'));
  const home = path.join(root, 'home');
  const policyDirectory = path.join(home, '.evcrate');
  const bin = path.join(root, 'bin');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(policyDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.mkdirSync(workspace, { mode: 0o700 });
  fs.chmodSync(home, 0o700);
  fs.chmodSync(policyDirectory, 0o700);
  fs.writeFileSync(path.join(policyDirectory, 'advisor-routing.json'), JSON.stringify({
    version: 1,
    hosts: {
      antigravity: {
        backend: 'codex',
        model: 'gpt-5.6-sol',
        effort: 'high',
        execution: 'auto'
      }
    }
  }), { encoding: 'utf8', mode: 0o600 });
  fs.symlinkSync(CODEX_FIXTURE, path.join(bin, 'codex'));

  const request = bindHarness({
    operation: 'dispatch',
    checkpoint: { ...checkpoint('antigravity'), active_host: undefined }
  }, 'antigravity');
  const environment = {
    PATH: `${bin}${path.delimiter}${process['env'].PATH || ''}`,
    HOME: home,
    TMPDIR: root
  };
  const runner = {
    run(invocation, options) {
      const relocated = createInvocation({
        ...invocation,
        cwd: workspace,
        workspaceRoot: root
      });
      return runInvocation(relocated, options);
    }
  };

  try {
    const response = await withHome(home, () => dispatchCoordinator(request, {
      environment,
      runner
    }));
    assert.equal(response.ok, true);
    assert.equal(response.descriptor.activeHost, 'antigravity');
    assert.equal(response.descriptor.adapter, 'codex');
    assert.equal(response.descriptor.route.model, 'gpt-5.6-sol');
    assert.equal(response.result.status, 'ADVICE_READY');
    assert.equal(response.result.recommendation, 'FAKE_CODEX_OK');

    const proseRequest = bindHarness({
      operation: 'dispatch',
      brief: 'plain prose is not a checkpoint envelope'
    }, 'antigravity');
    await assert.rejects(
      dispatchCoordinator(proseRequest, { environment, runner }),
      (error) => error?.code === 'REQUEST_INVALID'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('native coordination creates a single-use handoff and resumes without re-resolving', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-coordinator-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDirectory = path.join(root, 'handoffs');
  const descriptor = nativeDescriptor('claude');
  let resolutions = 0;
  let nativeCalls = 0;
  const pending = await dispatchCoordinator({
    operation: 'dispatch',
    active_host: 'claude',
    checkpoint: checkpoint('claude')
  }, {
    stateDirectory,
    dispatchRequest() {
      resolutions += 1;
      return { ok: true, descriptor };
    }
  });
  assert.equal(pending.status, 'NATIVE_HANDOFF_PENDING');
  assert.equal(resolutions, 1);
  assert.equal(handoffFiles(stateDirectory).length, 1);

  await assert.rejects(
    dispatchCoordinator({
      operation: 'resume-native',
      active_host: 'claude',
      token: pending.handoff.token
    }, { stateDirectory }),
    (error) => error.code === 'NATIVE_DISPATCH_UNSUPPORTED'
  );

  await assert.rejects(
    dispatchCoordinator({
      operation: 'resume-native',
      active_host: 'claude',
      token: pending.handoff.token,
      result: { response: 'caller-attested' }
    }, { stateDirectory, nativeAdvisor: async () => ({ response: 'ignored' }) }),
    (error) => error.code === 'REQUEST_INVALID'
  );
  assert.equal(handoffFiles(stateDirectory).length, 1);

  await assert.rejects(
    dispatchCoordinator({
      operation: 'resume-native',
      active_host: 'codex',
      token: pending.handoff.token
    }, { stateDirectory, nativeAdvisor: async () => ({ response: 'wrong host' }) }),
    (error) => error.code === 'NATIVE_HANDOFF_INVALID'
  );
  assert.equal(handoffFiles(stateDirectory).length, 1);

  const handoffFile = handoffFiles(stateDirectory)[0];
  const handoffPath = path.join(stateDirectory, handoffFile);
  const originalHandoff = fs.readFileSync(handoffPath, 'utf8');
  fs.writeFileSync(
    handoffPath,
    originalHandoff.replace(
      'Which safe action should follow this terminal review?',
      'Caller-authored question.'
    ),
    { encoding: 'utf8', mode: 0o600 }
  );
  await assert.rejects(
    dispatchCoordinator({
      operation: 'resume-native',
      active_host: 'claude',
      token: pending.handoff.token
    }, { stateDirectory, nativeAdvisor: async () => nativeResult(checkpoint('claude'), 'ignored') }),
    (error) => error.code === 'NATIVE_HANDOFF_INVALID'
  );
  fs.writeFileSync(handoffPath, originalHandoff, { encoding: 'utf8', mode: 0o600 });

  fs.writeFileSync(
    handoffPath,
    originalHandoff.replace(
      '"schema":"evcrate-advisor-handoff/v1"',
      '"schema":"evcrate-advisor-handoff/v1","schema":"evcrate-advisor-handoff/v1"'
    ),
    { encoding: 'utf8', mode: 0o600 }
  );
  await assert.rejects(
    dispatchCoordinator({
      operation: 'resume-native',
      active_host: 'claude',
      token: pending.handoff.token
    }, { stateDirectory, nativeAdvisor: async () => nativeResult(checkpoint('claude'), 'ignored') }),
    (error) => error.code === 'NATIVE_HANDOFF_INVALID'
  );
  fs.writeFileSync(handoffPath, originalHandoff, { encoding: 'utf8', mode: 0o600 });
  assert.equal(handoffFiles(stateDirectory).length, 1);

  const response = await dispatchCoordinator({
    operation: 'resume-native',
    active_host: 'claude',
    token: pending.handoff.token
  }, {
    stateDirectory,
    nativeAdvisor: async ({ checkpoint: resumedCheckpoint, descriptor: resumedDescriptor }) => {
      nativeCalls += 1;
      assert.deepEqual(resumedCheckpoint, checkpoint('claude'));
      assert.deepEqual(resumedDescriptor, descriptor);
      return nativeResult(resumedCheckpoint, 'Use the validated adapter.');
    }
  });
  assert.equal(nativeCalls, 1);
  assert.equal(resolutions, 1);
  assert.equal(response.result.recommendation, 'Use the validated adapter.');
  assert.equal(handoffFiles(stateDirectory).length, 0);
  await assert.rejects(dispatchCoordinator({
    operation: 'resume-native',
    active_host: 'claude',
    token: pending.handoff.token
  }, {
    stateDirectory,
    nativeAdvisor: async ({ checkpoint: envelope }) => nativeResult(envelope, 'Replay')
  }), (error) => error.code === 'NATIVE_HANDOFF_INVALID');
});

test('public bridge resume ignores caller dependency overrides', async () => {
  const defaultStateExisted = fs.existsSync(DEFAULT_STATE_DIRECTORY);
  try {
    const pending = createHandoff({
      activeHost: 'claude',
      checkpoint: checkpoint('claude'),
      descriptor: nativeDescriptor('claude')
    });
    let overrideCalls = 0;
    const response = await resumeNative(pending.token, async ({ checkpoint: envelope }) => (
      nativeResult(envelope, 'Host-owned result')
    ), {
      dispatchNative: () => {
        overrideCalls += 1;
        return { ok: true, result: nativeResult(checkpoint('claude'), 'Caller override') };
      }
    });
    assert.equal(overrideCalls, 0);
    assert.equal(response.result.recommendation, 'Host-owned result');
  } finally {
    if (!defaultStateExisted) {
      try {
        const entries = fs.readdirSync(DEFAULT_STATE_DIRECTORY);
        if (entries.length === 1 && entries[0] === '.handoff-key') {
          fs.rmSync(DEFAULT_STATE_DIRECTORY, { recursive: true, force: true });
        }
      } catch { /* best effort test cleanup */ }
    }
  }
});
