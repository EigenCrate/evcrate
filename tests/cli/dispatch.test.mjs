import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createResourceRequest, createSettingsGetResult, createAdvisorSettingsRequest,
  main, resolveInvocationContext
} from '../../dist/index.js';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');

function capture(isTTY = false) {
  const values = [];
  return { output: { isTTY, write: (value) => values.push(value) }, values };
}

function runtime(captureValue, extra = {}) {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-home-'));
  return {
    packageRoot, cwd: packageRoot, packageVersion: '1.0.0', home,
    requestId: () => 'dispatch-1', output: captureValue.output, ...extra
  };
}

test('version emits one resource envelope and supports human rendering', async () => {
  const captured = capture(false);
  const exitCode = await main(['version', '--json'], runtime(captured));
  assert.equal(exitCode, 0);
  assert.equal(captured.values.length, 1);
  const result = JSON.parse(captured.values[0]);
  assert.equal(result.protocol, 'evcrate-resource-control');
  assert.equal(result.operation, 'version');
  assert.equal(result.payload.version, '1.0.0');

  const human = capture(true);
  await main(['version'], runtime(human));
  assert.deepEqual(human.values, ['evcrate 1.0.0\n']);
});
test('settings stay on their dedicated handler boundary', async () => {
  const captured = capture(false);
  const settingsRuntime = runtime(captured);
  const exitCode = await main([
    'advisor', 'settings', 'get', '--home', settingsRuntime.home, '--json'
  ], settingsRuntime);
  assert.equal(exitCode, 0);
  const result = JSON.parse(captured.values[0]);
  assert.equal(result.protocol, 'evcrate-advisor-settings');
  assert.equal(result.status, 'OK');
  assert.equal(result.policy, null);
  assert.deepEqual(result.revision, { kind: 'absent', identity: 'absent' });
  for (const operation of ['preview', 'apply']) {
    const unsupported = capture(false);
    assert.equal(
      await main(['advisor', 'settings', operation, '--json'], runtime(unsupported)), 3
    );
    const unsupportedResult = JSON.parse(unsupported.values[0]);
    assert.equal(unsupportedResult.protocol, 'evcrate-advisor-settings');
    assert.equal(unsupportedResult.operation, operation);
    assert.equal(unsupportedResult.status, 'FAILED');
    assert.equal(unsupportedResult.error.code, 'CAPABILITY_UNSUPPORTED');
  }

  const handled = capture(false);
  const handler = {
    handle(request) {
      return createSettingsGetResult(request, null, { kind: 'absent', identity: 'absent' }, null);
    }
  };
  assert.equal(await main(['advisor', 'settings', 'get'], runtime(handled, { settingsHandler: handler })), 0);
  assert.equal(JSON.parse(handled.values[0]).status, 'OK');
});

test('compatibility distribution labels Python and forwards resolved paths', async () => {
  let capturedProcess;
  const captured = capture(false);
  const selectedHome = mkdtempSync(join(tmpdir(), 'evcrate-distribution-home-'));
  const selectedState = mkdtempSync(join(tmpdir(), 'evcrate-distribution-state-'));
  const runner = { run: async (options) => {
    capturedProcess = options;
    return { exitCode: 0, signal: null, stdout: '', stderr: '', termination: 'completed', timedOut: false, aborted: false };
  } };
  assert.equal(await main([
    'distribute', 'build', '--target', 'omp', '--home', selectedHome, '--state-home', selectedState
  ], runtime(captured, { processRunner: runner })), 0);
  const result = JSON.parse(captured.values[0]);
  assert.equal(result.payload.engine, 'python-compatibility');
  assert.deepEqual(capturedProcess.args.slice(-2), ['--target', 'omp']);
  assert.equal(capturedProcess.executable, 'python3');
  assert.equal(capturedProcess.env.EVCRATE_HOME, selectedHome);
  assert.equal(capturedProcess.env.EVCRATE_STATE_DIR, selectedState);

  const multi = capture(false);
  let called = false;
  const multiRunner = { run: async () => { called = true; throw new Error('must not run'); } };
  assert.equal(await main(['distribute', 'build', '--target', 'omp', '--target', 'copilot'], runtime(multi, { processRunner: multiRunner })), 3);
  assert.equal(called, false);
  assert.equal(JSON.parse(multi.values[0]).error.code, 'CAPABILITY_UNSUPPORTED');
});

test('request-file accepts a complete typed settings envelope', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-request-'));
  const requestPath = join(root, 'request.json');
  const request = createAdvisorSettingsRequest('file-1', 'get');
  writeFileSync(requestPath, JSON.stringify(request));
  const captured = capture(false);
  const requestRuntime = runtime(captured);
  const exitCode = await main([
    'advisor', 'settings', 'get', '--request-file', requestPath, '--home', requestRuntime.home, '--json'
  ], requestRuntime);
  assert.equal(exitCode, 0);
  const result = JSON.parse(captured.values[0]);
  assert.equal(result.requestId, 'file-1');
  assert.equal(result.operation, 'get');
});

test('resource request files require the selected project identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-resource-'));
  const home = join(root, 'home');
  const context = resolveInvocationContext({
    packageRoot, home, projectId: 'project-1', projectRoot: packageRoot, targets: ['omp']
  });
  const selected = context.selectedTargets[0];
  const request = createResourceRequest('resource-1', 'version', {
    canonicalSourceRoot: context.canonicalSourceRoot,
    targetManifestPath: selected.manifestPath,
    generatedRoot: selected.generatedRoots[0],
    homeRoot: selected.homeBindings[0].homeRoot,
    stateRoot: context.stateRoot,
    projectId: 'project-1',
    projectRoot: context.projectRoot,
    target: selected.id
  });
  const requestPath = join(root, 'request.json');
  writeFileSync(requestPath, JSON.stringify(request));

  const missingProject = capture(false);
  assert.equal(
    await main([
      '--request-file', requestPath, '--home', home, '--project-root', packageRoot,
      '--target', 'omp', '--json'
    ], runtime(missingProject)), 2
  );
  assert.equal(JSON.parse(missingProject.values[0]).error.code, 'PROTOCOL_INVALID');

  const matched = capture(false);
  assert.equal(
    await main([
      '--request-file', requestPath, '--home', home, '--project-id', 'project-1',
      '--project-root', packageRoot, '--target', 'omp', '--json'
    ], runtime(matched)), 0
  );
  assert.equal(JSON.parse(matched.values[0]).payload.version, '1.0.0');
});
