import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGED_PI_PACKAGES, publishApply, publishDryRun, resolveInvocationContext } from '../../dist/index.js';

const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const registeredRoots = new Set();

export function createInstalledFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-installed-advice-'));
  // Register exact roots and cleanup before any publication or controller fixture setup.
  registeredRoots.add(root);
  t.after(() => { rmSync(root, { recursive: true, force: true }); registeredRoots.delete(root); });
  const home = join(root, 'HOME with spaces Việt');
  const project = join(root, 'project with spaces 日本');
  for (const path of [home, project]) mkdirSync(path, { mode: 0o700 });
  t.diagnostic(`Disposable fixture registered: ${JSON.stringify({ root, home, project })}`);
  const settings = [join(home, '.pi/agent/settings.json'), join(project, '.pi/agent/settings.json'),
    join(home, '.evcrate-vscode/.evcrate.json'), join(project, '.evcrate-vscode/.evcrate.json')];
  for (const path of settings) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, '{"userOwned":"keep exact bytes 日本"}\n', { mode: 0o600 });
  }
  const snapshots = settings.map((path) => [path, readFileSync(path)]);
  const invocation = resolveInvocationContext({ packageRoot, cwd: project, home, projectRoot: project,
    stateHome: join(root, 'publication state') });
  return { root, home, project, settings, invocation, snapshots, taskRunId: randomUUID(),
    context: { cwd: project, environment: { HOME: home } } };
}

export function installScope(f, scope) {
  assert.ok(registeredRoots.has(f.root));
  for (const path of [f.home, f.project, f.invocation.stateRoot]) {
    const child = relative(f.root, path);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child), 'fixture destination must be registered');
  }
  const request = { scope, selectedTargets: f.invocation.selectedTargetIds };
  const helperPath = join(f.home, '.evcrate/bin/evcrate-advice-mode');
  const helperExistedBefore = existsSync(helperPath);
  const dryRun = publishDryRun(f.invocation, request);
  assert.equal(dryRun.scope, scope);
  assert.equal(existsSync(helperPath), helperExistedBefore, 'publishDryRun must not write files to disk');
  const apply = publishApply(f.invocation, {}, request);
  assert.equal(apply.scope, scope);
  assert.ok(existsSync(helperPath), 'publishApply must materialize installed helper in HOME');
  f.helperBytes ??= readFileSync(helperPath);
  const targetPiSettings = join(scope === 'home' ? f.home : f.project, '.pi/agent/settings.json');
  const piSettings = JSON.parse(readFileSync(targetPiSettings, 'utf8'));
  assert.equal(piSettings.userOwned, 'keep exact bytes 日本');
  assert.deepEqual(piSettings.packages, [...MANAGED_PI_PACKAGES]);
  for (const vscodeConfig of [join(f.home, '.evcrate-vscode/.evcrate.json'), join(f.project, '.evcrate-vscode/.evcrate.json')]) {
    assert.deepEqual(readFileSync(vscodeConfig), Buffer.from('{"userOwned":"keep exact bytes 日本"}\n'));
  }
  f.snapshots = f.settings.map((path) => [path, readFileSync(path)]);
  assertFixturePreserved(f);
}

export function assertFixturePreserved(f) {
  for (const [path, bytes] of f.snapshots) assert.deepEqual(readFileSync(path), bytes);
  assert.equal(existsSync(join(f.project, '.evcrate/bin')), false);
  if (f.helperBytes) assert.deepEqual(readFileSync(join(f.home, '.evcrate/bin/evcrate-advice-mode')), f.helperBytes);
  assert.equal(existsSync(join(f.home, '.evcrate/advisor-routing.json')), false);
  assert.equal(existsSync(join(f.home, '.evcrate/advisor-history')), false);
}

export function invokeInstalledHelper(f, request) {
  const child = spawnSync(process.execPath, [join(f.home, '.evcrate/bin/evcrate-advice-mode')], {
    cwd: f.project, env: { ...process.env, HOME: f.home }, shell: false,
    input: Buffer.from(JSON.stringify(request), 'utf8'), encoding: 'utf8', timeout: 15000, maxBuffer: 256 * 1024
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.stderr, '');
  assert.equal(child.stdout.split('\n').length, 2);
  return { exitCode: child.status, result: JSON.parse(child.stdout) };
}
