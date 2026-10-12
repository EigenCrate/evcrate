import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createResourceRequest,
  exitCodeForResult, main, resolveInvocationContext
} from '../../dist/index.js';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url)).replace(/[/\\]+$/u, '');

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
test('conflict result statuses retain the conflict exit code', () => {
  assert.equal(exitCodeForResult({ status: 'conflict' }), 4);
});

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
test('retired commands reject without invoking any process boundary', async () => {
  for (const argv of [['health'], ...['get', 'preview', 'apply'].map((operation) => ['advisor', 'settings', operation])]) {
    const captured = capture(false);
    const selected = runtime(captured, { processRunner: { run() { throw new Error('unexpected process'); } } });
    try {
      assert.equal(await main([...argv, '--home', selected.home, '--json'], selected), 2);
      const result = JSON.parse(captured.values[0]);
      assert.equal(result.status, 'error');
      assert.equal(result.error.code, 'USAGE_INVALID');
    } finally { rmSync(selected.home, { recursive: true, force: true }); }
  }
});

test('distribution commands execute purely via TypeScript', async () => {
  const captured = capture(false);
  const selectedHome = mkdtempSync(join(tmpdir(), 'evcrate-distribution-home-'));
  const selectedState = mkdtempSync(join(tmpdir(), 'evcrate-distribution-state-'));
  assert.equal(await main([
    'distribute', 'check', '--target', 'omp', '--home', selectedHome, '--state-home', selectedState
  ], runtime(captured)), 0);
  const result = JSON.parse(captured.values[0]);
  assert.equal(result.payload.engine, 'typescript');
  assert.equal(result.payload.action, 'check');

  const retired = capture(false);
  assert.equal(await main(['distribute', 'build', '--target', 'omp'], runtime(retired, {
    engineSelectionOptions: { overrides: { omp: 'python' } }
  })), 3);
  assert.equal(JSON.parse(retired.values[0]).error.code, 'CAPABILITY_UNSUPPORTED');
});

test('retired request protocols reject before process access', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-request-'));
  try {
    for (const protocol of ['evcrate-advisor-settings', 'evcrate-advisor-diagnostic']) {
      const requestPath = join(root, 'request.json');
      writeFileSync(requestPath, JSON.stringify({ protocol, protocolVersion: 1, requestId: 'file-1', operation: 'get', payload: {} }));
      const captured = capture(false);
      const selected = runtime(captured, { processRunner: { run() { throw new Error('unexpected process'); } } });
      assert.equal(await main(['--request-file', requestPath, '--home', root, '--json'], selected), 2);
      assert.equal(JSON.parse(captured.values[0]).error.code, 'PROTOCOL_INVALID');
      rmSync(selected.home, { recursive: true, force: true });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('request-file distribution publication uses compatibility orchestration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-request-distribute-'));
  const home = join(root, 'home');
  mkdirSync(home, { mode: 0o700 });
  try {
    const context = resolveInvocationContext({ packageRoot, home, targets: ['omp'] });
    const target = context.selectedTargets[0];
    const request = createResourceRequest('file-distribute-1', 'distribute.publish', {
      canonicalSourceRoot: context.canonicalSourceRoot,
      targetManifestPath: target.manifestPath,
      generatedRoot: target.generatedRoots[0],
      homeRoot: target.homeBindings[0].homeRoot,
      stateRoot: context.stateRoot,
      projectId: context.projectId ?? 'global',
      projectRoot: context.projectRoot,
      target: target.id
    }, { scope: 'home', selectedTargets: ['omp'] });
    const requestPath = join(root, 'request.json');
    writeFileSync(requestPath, JSON.stringify(request));
    const captured = capture(false);
    const requestRuntime = runtime(captured, {
      home,
      publicationHandler: {
        publishApply() { throw new Error('request-file must use compatibility orchestration'); }
      }
    });
    assert.equal(await main([
      '--request-file', requestPath, '--home', home, '--target', 'omp', '--json'
    ], requestRuntime), 0);
    const result = JSON.parse(captured.values[0]);
    assert.equal(result.requestId, 'file-distribute-1');
    assert.equal(result.operation, 'distribute.publish');
    assert.equal(result.status, 'activated');
    assert.equal(result.payload.scope, 'home');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('project recovery request identity is checked before handler access', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-recovery-'));
  const home = join(root, 'home');
  try {
    const context = resolveInvocationContext({
      packageRoot, home, projectId: 'project-1', projectRoot: packageRoot, targets: ['omp']
    });
    const target = context.selectedTargets[0];
    const request = createResourceRequest('project-recovery-1', 'recover', {
      canonicalSourceRoot: context.canonicalSourceRoot,
      targetManifestPath: target.manifestPath,
      generatedRoot: target.generatedRoots[0],
      homeRoot: target.homeBindings[0].homeRoot,
      stateRoot: context.stateRoot,
      projectId: 'project-1',
      projectRoot: context.projectRoot,
      target: target.id
    }, { scope: 'project', projectIdentity: 'd'.repeat(64), releaseId: null });
    const requestPath = join(root, 'request.json');
    writeFileSync(requestPath, JSON.stringify(request));
    let called = false;
    const captured = capture(false);
    const requestRuntime = runtime(captured, {
      home,
      publicationHandler: {
        recover() {
          called = true;
          return { scope: 'project', projectIdentity: 'd'.repeat(64), action: 'recovered', phases: [] };
        }
      }
    });
    assert.equal(await main([
      '--request-file', requestPath, '--home', home, '--project-id', 'project-1',
      '--project-root', packageRoot, '--target', 'omp', '--json'
    ], requestRuntime), 2);
    assert.equal(called, false);
    assert.equal(JSON.parse(captured.values[0]).error.code, 'PROTOCOL_INVALID');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('request-file compatibility recovery rejects a wrong project identity before capability dispatch', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-project-compat-recovery-'));
  const home = join(root, 'home');
  try {
    const context = resolveInvocationContext({
      packageRoot, home, projectId: 'project-1', projectRoot: packageRoot, targets: ['omp']
    });
    const target = context.selectedTargets[0];
    const request = createResourceRequest('project-compat-recovery-1', 'distribute.recover', {
      canonicalSourceRoot: context.canonicalSourceRoot,
      targetManifestPath: target.manifestPath,
      generatedRoot: target.generatedRoots[0],
      homeRoot: target.homeBindings[0].homeRoot,
      stateRoot: context.stateRoot,
      projectId: 'project-1',
      projectRoot: context.projectRoot,
      target: target.id
    }, { scope: 'project', projectIdentity: 'd'.repeat(64), releaseId: null });
    const requestPath = join(root, 'request.json');
    writeFileSync(requestPath, JSON.stringify(request));
    const captured = capture(false);
    assert.equal(await main([
      '--request-file', requestPath, '--home', home, '--project-id', 'project-1',
      '--project-root', packageRoot, '--target', 'omp', '--json'
    ], runtime(captured)), 2);
    const result = JSON.parse(captured.values[0]);
    assert.equal(result.operation, 'distribute.recover');
    assert.equal(result.error.code, 'PROTOCOL_INVALID');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

test('dispatch rejects companion flags when target does not include vscode', async () => {
  const captured = capture(false);
  const selectedHome = mkdtempSync(join(tmpdir(), 'evcrate-cli-home-'));
  try {
    const exitCode = await main([
      'publish', '--apply', '--target', 'claude', '--home', selectedHome,
      '--install-vscode-companion', '--json'
    ], runtime(captured));
    assert.equal(exitCode, 3);
    const result = JSON.parse(captured.values[0]);
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'VALIDATION_INVALID');
  } finally {
    rmSync(selectedHome, { recursive: true, force: true });
  }
});

test('dispatch preserves committed publication stdout and overrides exitCode to 5 on requested companion failure', async () => {
  const captured = capture(false);
  const selectedHome = mkdtempSync(join(tmpdir(), 'evcrate-cli-home-'));
  let stderrNotice = '';
  try {
    const exitCode = await main([
      'publish', '--apply', '--target', 'vscode', '--home', selectedHome,
      '--install-vscode-companion', '--vscode-editor', '/mock/bin/code', '--json'
    ], runtime(captured, {
      vscodeCompanionConsole: {
        writeStderr: (t) => { stderrNotice += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--install-extension')) {
            return { exitCode: 1, signal: null, stdout: '', stderr: 'mock install error', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    }));
    assert.equal(exitCode, 5);
    // Stdout is the committed publication result, not an error envelope
    assert.equal(captured.values.length, 1);
    const result = JSON.parse(captured.values[0]);
    assert.equal(result.protocol, 'evcrate-resource-control');
    assert.equal(result.status, 'published');
    assert.equal(result.operation, 'publish.apply');
    // Stderr received the install notice
    assert.ok(stderrNotice.includes('evcrate-vscode-companion-install-v1'));
    const notice = JSON.parse(stderrNotice);
    assert.equal(notice.status, 'failed');
    assert.equal(notice.requested, true);
    assert.equal(notice.exitCode, 5);
  } finally {
    rmSync(selectedHome, { recursive: true, force: true });
  }
});
