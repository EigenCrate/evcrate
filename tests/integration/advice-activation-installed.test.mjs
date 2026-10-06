import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import stateFixtures from '../advisor-controller/activation-test-helpers.cjs';
import { assertFixturePreserved, createInstalledFixture, installScope, invokeInstalledHelper }
  from './advice-activation-installed-fixture.mjs';

const { createContext, createRequest, initializeStateFixture, reserveStateFixture } = stateFixtures;
const work = '  "quoted task"\tViệt 日本\r\nnext';

function ready(f, context, raw, handoff, mode, reason, expectedWork, run = null) {
  const { exitCode, result } = invokeInstalledHelper(f, createRequest({
    context, raw_arguments: raw, handoff
  }));
  assert.equal(exitCode, 0);
  assert.deepEqual(result, { protocol: 'evcrate-advice-mode', version: 1, status: 'MODE_READY',
    mode, reason, work_arguments: expectedWork, context, run, error: null });
  assert.deepEqual(Buffer.from(result.work_arguments), Buffer.from(expectedWork));
  assertFixturePreserved(f);
}

for (const scopes of [['home'], ['project'], ['home', 'project']]) {
  test(`installed HOME helper: ${scopes.join('+')} harnesses preserve bytes and continuation without policy`, async (t) => {
    const f = createInstalledFixture(t);
    for (const scope of scopes) installScope(f, scope);
    const context = createContext({ project_root: f.project, command: 'code/auto' });
    ready(f, context, work, null, 'off', 'NO_FINAL_FLAG', work);
    ready(f, context, `${work} "--advice"`, null, 'off', 'NO_FINAL_FLAG', `${work} "--advice"`);
    ready(f, context, `${work}  --advice\r\n`, null, 'explicit', 'EXPLICIT_FINAL_FLAG', work);
    ready(f, context, work, { kind: 'pre-run', context, run: null },
      'inherited', 'INHERITED_PRE_RUN', work);
    assert.equal(existsSync(join(f.home, '.evcrate/advisor-state')), false);

    // Deliberate fixture setup, not runtime activation: use actual controller operations.
    const state = reserveStateFixture(f, initializeStateFixture(f));
    const before = readFileSync(f.stateFile);
    const run = Object.fromEntries(['task_run_id', 'project_id', 'task_revision',
      'scope_revision', 'evidence_revision'].map((key) => [key, state[key]]));
    ready(f, context, work, { kind: 'same-run', context, run },
      'inherited', 'INHERITED_SAME_RUN', work, run);
    assert.deepEqual(readFileSync(f.stateFile), before);
    ready(f, context, `${work}\t--advice`, { kind: 'same-run', context, run },
      'inherited', 'INHERITED_SAME_RUN', work, run);
    const stale = invokeInstalledHelper(f, createRequest({ context, raw_arguments: `${work} --advice`,
      handoff: { kind: 'same-run', context, run: { ...run, task_revision: run.task_revision + 1 } } }));
    assert.equal(stale.exitCode, 1);
    assert.equal(stale.result.status, 'FAILED');
    assert.equal(stale.result.mode, null);
    assert.equal(stale.result.run, null);
    assert.deepEqual(readFileSync(f.stateFile), before);
    assertFixturePreserved(f);
  });
}

for (const scopes of [['home'], ['project'], ['home', 'project']]) {
  test(`installed Pi consumer: ${scopes.join('+')} resolves and executes from extension root with spaces/Unicode`, async (t) => {
    const f = createInstalledFixture(t);
    for (const scope of scopes) installScope(f, scope);
    const context = createContext({ project_root: f.project, command: 'code/auto' });

    for (const scope of scopes) {
      const agentRoot = join(scope === 'home' ? f.home : f.project, '.pi/agent');
      // Direct Node imports do not use Pi's bundled dependency aliases.
      symlinkSync(fileURLToPath(new URL('../../node_modules', import.meta.url)),
        join(agentRoot, 'node_modules'), 'dir');
      const extensionUrl = pathToFileURL(join(agentRoot, 'extensions/evcrate/paths.js'));
      const { getInstalledAgentRoot, resolveEvcrateMarkers } = await import(extensionUrl.href);

      // Invariant: root correctly derived from loaded extension URL despite spaces and Unicode, not cwd
      const installedRoot = getInstalledAgentRoot(extensionUrl);
      assert.equal(installedRoot, agentRoot);

      // Consumer selection: command discovery and expansion selects neutral workflows from extension root
      const { expandManagedCommand, findManagedCommand } = await import(pathToFileURL(
        join(agentRoot, 'extensions/evcrate/commands.js')).href);
      const command = findManagedCommand('code', agentRoot);
      assert.ok(command, 'published code command must be discoverable');

      const expanded = await expandManagedCommand(command, work, { cwd: f.project }, {
        agentRoot, env: { ...process.env, HOME: f.home }
      });
      assert.ok(expanded.body.includes(agentRoot), 'expanded command must resolve workflows to installed extension root');

      // Rejection: marker traversal attempts reject
      assert.throws(() => resolveEvcrateMarkers('{{evcrate:workflows/../../escaped}}', installedRoot),
        /unavailable/);

      // Consumer dispatch: model command tool dispatches with context and validates handoff
      const { dispatchManagedCommand } = await import(pathToFileURL(
        join(agentRoot, 'extensions/evcrate/command-tool.js')).href);
      const options = { agentRoot, env: { ...process.env, HOME: f.home } };

      for (const handoff of [null, { kind: 'pre-run', context, run: null }]) {
        const raw = `${work}\t--advice`;
        const dispatched = await dispatchManagedCommand({ name: 'code:auto', args: raw, handoff },
          { cwd: f.project }, options);
        const header = JSON.parse(dispatched.body.split('\n')[0]);
        assert.deepEqual(header, { evcrate_command_context: {
          protocol: 'evcrate-pi-command-context', version: 1, source: 'model-tool',
          command: 'code/auto', raw_arguments: raw, handoff
        } });
        assert.equal(dispatched.canonicalCommand, 'code/auto');
        assert.deepEqual(dispatched.handoff, handoff);
      }

      // Rejection: invalid handoff rejects at consumer boundary
      await assert.rejects(() => dispatchManagedCommand({ name: 'code:auto', args: work, handoff: 'invalid' },
        { cwd: f.project }, options));
      await assert.rejects(() => dispatchManagedCommand({ name: 'code:auto', args: work, handoff: [1, 2] },
        { cwd: f.project }, options));
    }

    assertFixturePreserved(f);
  });
}

test('installed Pi consumer isolates copies and rejects missing neutral resources without fallback', async (t) => {
  const f = createInstalledFixture(t);
  installScope(f, 'home');
  installScope(f, 'project');

  const homeAgent = join(f.home, '.pi/agent');
  const projectAgent = join(f.project, '.pi/agent');

  const { expandManagedCommand: expandHome, findManagedCommand: findHome } = await import(pathToFileURL(
    join(homeAgent, 'extensions/evcrate/commands.js')).href);
  const { expandManagedCommand: expandProject, findManagedCommand: findProject } = await import(pathToFileURL(
    join(projectAgent, 'extensions/evcrate/commands.js')).href);

  const homeCmd = findHome('code', homeAgent);
  const projectCmd = findProject('code', projectAgent);
  assert.ok(homeCmd && projectCmd);

  const homeExpand = () => expandHome(homeCmd, work, { cwd: f.project }, {
    agentRoot: homeAgent, env: { ...process.env, HOME: f.home }
  });
  const projectExpand = () => expandProject(projectCmd, work, { cwd: f.project }, {
    agentRoot: projectAgent, env: { ...process.env, HOME: f.home }
  });

  // Both expand initially
  await homeExpand();
  await projectExpand();

  // Breaking HOME workflow rejects HOME consumer; project consumer remains unaffected (strict copy isolation)
  for (const name of ['advice-activation', 'plan-progress']) {
    const homeResource = join(homeAgent, 'evcrate/workflows', `${name}.md`);
    const homeUnavailable = `${homeResource}.unavailable`;
    renameSync(homeResource, homeUnavailable);
    try {
      await assert.rejects(homeExpand, /unavailable/);
      // Project copy must still expand successfully — HOME failure does NOT affect project copy
      const projResult = await projectExpand();
      assert.ok(projResult.body.includes(projectAgent));
    } finally {
      renameSync(homeUnavailable, homeResource);
    }
    await homeExpand();
  }

  // Conversely: breaking project workflow rejects project consumer; HOME consumer remains unaffected
  for (const name of ['advice-activation', 'plan-progress']) {
    const projectResource = join(projectAgent, 'evcrate/workflows', `${name}.md`);
    const projectUnavailable = `${projectResource}.unavailable`;
    renameSync(projectResource, projectUnavailable);
    try {
      await assert.rejects(projectExpand, /unavailable/);
      // HOME copy must still expand successfully — project failure does NOT affect HOME copy
      const homeResult = await homeExpand();
      assert.ok(homeResult.body.includes(homeAgent));
    } finally {
      renameSync(projectUnavailable, projectResource);
    }
    await projectExpand();
  }

  // CWD isolation: rogue workflow in cwd must NOT shadow or satisfy extension root
  const cwdRogueDir = join(f.project, 'evcrate/workflows');
  mkdirSync(cwdRogueDir, { recursive: true, mode: 0o700 });
  const rogueFile = join(cwdRogueDir, 'advice-activation.md');
  writeFileSync(rogueFile, '# Rogue workflow in cwd\n');
  const homeResource = join(homeAgent, 'evcrate/workflows', 'advice-activation.md');
  const homeUnavailable = `${homeResource}.unavailable`;
  renameSync(homeResource, homeUnavailable);
  try {
    // HOME consumer MUST reject even though rogue file exists in cwd
    await assert.rejects(homeExpand, /unavailable/);
  } finally {
    renameSync(homeUnavailable, homeResource);
    rmSync(cwdRogueDir, { recursive: true, force: true });
  }

  assertFixturePreserved(f);
});
