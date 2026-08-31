import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveHomeRoot, resolveStateRoot, resolveInvocationContext, loadTargetRegistry
} from '../../dist/index.js';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'evcrate-cli-context-'));
}

test('resolves explicit HOME/state/project values and target roots independently', () => {
  const root = temporaryDirectory();
  const home = join(root, 'home');
  const state = join(root, 'state');
  const project = join(root, 'project');
  mkdirSync(home); mkdirSync(state); mkdirSync(project);
  const context = resolveInvocationContext({
    packageRoot, cwd: packageRoot, home, stateHome: state, projectRoot: project,
    projectId: 'project-1', targets: ['omp', 'copilot']
  });
  assert.deepEqual(context.selectedTargetIds, ['copilot', 'omp']);
  assert.equal(context.canonicalHarnessRoot, join(packageRoot, '.evcrate/source/.claude'));
  assert.equal(context.controllerRoot, join(packageRoot, '.evcrate/source/.evcrate/bin'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'omp').generatedRoots[0], join(packageRoot, '.evcrate/source/.omp'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'copilot').generatedRoots[0], join(packageRoot, '.evcrate/source/.copilot'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'omp').homeBindings[0].homeRoot, join(home, '.omp'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'copilot').homeBindings[0].homeRoot, join(home, '.copilot'));
  assert.equal(context.stateRoot, state);
  assert.equal(context.projectRoot, project);
  assert.equal(context.projectId, 'project-1');
});

test('applies HOME and state precedence without inventing state suffixes for overrides', () => {
  const root = temporaryDirectory();
  const home = join(root, 'home');
  const envHome = join(root, 'env-home');
  const stateBase = join(root, 'state-base');
  const xdgBase = join(root, 'xdg-base');
  mkdirSync(home); mkdirSync(envHome); mkdirSync(stateBase); mkdirSync(xdgBase);
  const env = { EVCRATE_HOME: envHome, EVCRATE_STATE_HOME: stateBase, XDG_STATE_HOME: xdgBase };
  assert.equal(resolveHomeRoot({ home, env }), home);
  assert.equal(resolveStateRoot({ home, env }), join(stateBase, 'evcrate'));
  assert.equal(resolveStateRoot({ home, env: { XDG_STATE_HOME: xdgBase } }), join(xdgBase, 'evcrate'));
  assert.equal(resolveStateRoot({ home, env: {} }), join(home, '.local/state/evcrate'));
  assert.equal(resolveStateRoot({ home, stateHome: stateBase, env }), stateBase);
});

test('rejects unknown targets, traversal, and symlinked context roots', () => {
  const root = temporaryDirectory();
  const link = join(root, 'home-link');
  const actual = join(root, 'actual-home');
  mkdirSync(actual); symlinkSync(actual, link, 'dir');
  assert.throws(() => resolveInvocationContext({ packageRoot, cwd: packageRoot, home: link }), (error) => error.code === 'PATH_UNSAFE');
  assert.throws(() => resolveInvocationContext({ packageRoot, cwd: packageRoot, targets: ['unknown'] }), (error) => error.code === 'CAPABILITY_UNSUPPORTED');
  const registryPath = join(root, 'manifest.json');
  writeFileSync(registryPath, JSON.stringify({ schema_version: 2, targets: { omp: '../escape/manifest.json' } }));
  assert.throws(() => loadTargetRegistry(registryPath), (error) => error.code === 'PROTOCOL_INVALID');
});
