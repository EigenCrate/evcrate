import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  SET_ACTIVE_PLAN_SCRIPT_SOURCE,
  VSCODE_SESSION_CONTEXT_SCRIPT_SOURCE
} from '../../dist/adapters/vscode/support.js';
import {
  LOCAL_SESSION_STATE_SOURCE,
  LOCAL_SESSION_CONTEXT_SOURCE
} from '../../dist/adapters/vscode/runtime-sources.js';
import {
  resolveInstallationRoots,
  createSessionContext
} from '../../dist/adapters/vscode/session-context.js';
import {
  initSessionState
} from '../../dist/adapters/vscode/session-state.js';
import configUtils from '../../.evcrate/source/.claude/hooks/lib/evcrate-config-utils.cjs';

function createTempDir(prefix = 'vscode-support-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function setupInstalledEnvironment(base) {
  const projectDir = join(base, 'proj');
  const pluginDir = join(projectDir, '.evcrate-vscode');
  const runtimeDir = join(pluginDir, 'evcrate', 'runtime');
  const scriptsDir = join(pluginDir, 'evcrate', 'scripts');
  const plansDir = join(projectDir, 'plans', 'demo-plan');

  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(plansDir, { recursive: true });

  writeFileSync(join(plansDir, 'plan.md'), '# Demo Plan');

  // Emit runtime and scripts
  writeFileSync(join(runtimeDir, 'local-session-context.cjs'), LOCAL_SESSION_CONTEXT_SOURCE);
  writeFileSync(join(runtimeDir, 'local-session-state.cjs'), LOCAL_SESSION_STATE_SOURCE);

  const setActivePlanPath = join(scriptsDir, 'set-active-plan.cjs');
  const sessionContextPath = join(scriptsDir, 'vscode-session-context.cjs');
  writeFileSync(setActivePlanPath, SET_ACTIVE_PLAN_SCRIPT_SOURCE);
  writeFileSync(sessionContextPath, VSCODE_SESSION_CONTEXT_SCRIPT_SOURCE);
  chmodSync(setActivePlanPath, 0o755);
  chmodSync(sessionContextPath, 0o755);

  const selfFile = join(runtimeDir, 'local-hook-bridge.cjs');
  writeFileSync(selfFile, '//');
  const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });
  const ctx = createSessionContext({ sessionId: 'support-test-sess', cwd: projectDir }, roots, { tmpDir: base });
  initSessionState(ctx, null, Date.now());

  return { projectDir, scriptsDir, handle: ctx.handle, setActivePlanPath, sessionContextPath };
}

test('support: set-active-plan.cjs CLI execution and argument validation', () => {
  const base = createTempDir();
  try {
    const env = setupInstalledEnvironment(base);

    // 1. Set active plan (revision 1 -> 2)
    const runSet = spawnSync('node', [
      env.setActivePlanPath,
      'plans/demo-plan/plan.md',
      '--context-file', env.handle,
      '--project-root', env.projectDir,
      '--expected-revision', '1'
    ], { encoding: 'utf8' });

    assert.equal(runSet.status, 0, `set-active-plan failed: ${runSet.stderr}`);
    const setData = JSON.parse(runSet.stdout);
    assert.equal(setData.status, 'ok');
    assert.equal(setData.revision, 2);
    assert.equal(setData.activePlan, 'plans/demo-plan/plan.md');

    // 2. Clear active plan (revision 2 -> 3)
    const runClear = spawnSync('node', [
      env.setActivePlanPath,
      '--clear',
      '--context-file', env.handle,
      '--project-root', env.projectDir,
      '--expected-revision', '2'
    ], { encoding: 'utf8' });

    assert.equal(runClear.status, 0, `clear failed: ${runClear.stderr}`);
    const clearData = JSON.parse(runClear.stdout);
    assert.equal(clearData.status, 'ok');
    assert.equal(clearData.revision, 3);
    assert.equal(clearData.activePlan, null);

    // 3. Conflict: --clear with plan path
    const runConflict = spawnSync('node', [
      env.setActivePlanPath,
      'plans/demo-plan/plan.md',
      '--clear',
      '--context-file', env.handle,
      '--project-root', env.projectDir,
      '--expected-revision', '3'
    ], { encoding: 'utf8' });
    assert.notEqual(runConflict.status, 0);
    assert.ok(runConflict.stderr.includes('ARGUMENT_CONFLICT'));

    // 4. Revision conflict: passing stale revision 1
    const runStale = spawnSync('node', [
      env.setActivePlanPath,
      'plans/demo-plan/plan.md',
      '--context-file', env.handle,
      '--project-root', env.projectDir,
      '--expected-revision', '1'
    ], { encoding: 'utf8' });
    assert.notEqual(runStale.status, 0);
    assert.ok(runStale.stderr.includes('SESSION_CONTEXT_REVISION_CONFLICT'));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('support: vscode-session-context.cjs CLI subcommands (inspect, forget, sweep)', () => {
  const base = createTempDir();
  try {
    const env = setupInstalledEnvironment(base);

    // 1. inspect
    const runInspect = spawnSync('node', [
      env.sessionContextPath,
      'inspect',
      '--context-file', env.handle,
      '--project-root', env.projectDir
    ], { encoding: 'utf8' });

    assert.equal(runInspect.status, 0, `inspect failed: ${runInspect.stderr}`);
    const inspData = JSON.parse(runInspect.stdout);
    assert.equal(inspData.status, 'ok');
    assert.equal(inspData.record.revision, 1);

    // 2. sweep
    const userDir = join(base, 'evcrate', 'vscode', 'v1');
    const runSweep = spawnSync('node', [
      env.sessionContextPath,
      'sweep',
      '--project-root', env.projectDir,
      '--user-dir', userDir
    ], { encoding: 'utf8' });

    assert.equal(runSweep.status, 0, `sweep failed: ${runSweep.stderr}`);
    const sweepData = JSON.parse(runSweep.stdout);
    assert.equal(sweepData.status, 'ok');
    assert.equal(typeof sweepData.sweptCount, 'number');

    // 3. forget
    const runForget = spawnSync('node', [
      env.sessionContextPath,
      'forget',
      '--context-file', env.handle,
      '--project-root', env.projectDir,
      '--expected-revision', '1'
    ], { encoding: 'utf8' });

    assert.equal(runForget.status, 0, `forget failed: ${runForget.stderr}`);
    const forgetData = JSON.parse(runForget.stdout);
    assert.equal(forgetData.status, 'ok');
    assert.equal(existsSync(env.handle), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('support: evcrate-config-utils.cjs extension with runtimeRoots and legacy preservation', () => {
  const { getEVCrateResourceRoot, getEVCrateConfigPaths } = configUtils;

  // 1. Legacy preservation: undefined runtimeRoots returns legacy defaults
  const legacyResource = getEVCrateResourceRoot();
  const legacyPaths = getEVCrateConfigPaths();
  assert.equal(legacyResource, null);
  assert.equal(legacyPaths.configDir, '.claude');
  assert.ok(legacyPaths.localConfigPath.endsWith(join('.claude', '.evcrate.json')));

  // 2. Explicit runtimeRoots for resource root
  const explicitRes = getEVCrateResourceRoot('.claude', { resourceRoot: '/custom/resource/root' });
  assert.equal(explicitRes, '/custom/resource/root');

  // 3. Explicit runtimeRoots for config paths
  const explicitPaths = getEVCrateConfigPaths('.claude', {
    configDir: '.evcrate-vscode',
    projectRoot: '/my/project',
    globalRoot: '/my/home/.evcrate-vscode'
  });
  assert.equal(explicitPaths.configDir, '.evcrate-vscode');
  assert.equal(explicitPaths.localConfigPath, join('/my/project', '.evcrate-vscode', '.evcrate.json'));
  assert.equal(explicitPaths.globalConfigPath, join('/my/home/.evcrate-vscode', '.evcrate.json'));
});
