import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PUBLICATION_BINDING_ORDER, PERSISTED_TARGETS, assertPublicationRules, createPublicationPlanSet,
  deriveLaunchIntent, loadTargetManifest, mapPublicationPath, publishFile, resolveCurrentPublicationBuild,
  resolveInvocationContext, runLocalBuild
} from '../../dist/index.js';
const bytes = (value) => new TextEncoder().encode(value);
const text = (value) => new TextDecoder().decode(value);
function manifest(name, publicationRules = []) {
  const root = `.${name}`;
  return {
    name, id: name, manifestPath: `/manifests/${name}.json`, adapter: null, adapterSources: [],
    outputRoots: [root], ownedPaths: [], patches: [], projectDocs: [], sourceRoot: `/source/${name}`,
    overlayRoot: null, sharedJson: null,
    homePolicy: {
      bindings: { [root]: root }, preservePaths: {}, promotionOrder: 1,
      rejectUnmanagedCollisions: false, publicationRules
    }
  };
}

test('publication rules are closed, explicit, and preserve the frozen order', () => {
  assert.deepEqual([...PUBLICATION_BINDING_ORDER], [
    '.evcrate/bin', '.agents/skills', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot', '.evcrate-vscode'
  ]);
  assert.equal(mapPublicationPath(manifest('omp', ['omp-agent-prefix']), 'agents/a.md'), 'agent/agents/a.md');
  assert.equal(mapPublicationPath(manifest('claude', ['claude-skill-root-exclusion']), 'skills/README.md'), null);
  assert.equal(mapPublicationPath(manifest('claude', ['claude-skill-root-exclusion']), 'skills/kit/SKILL.md'), 'skills/kit/SKILL.md');
  assert.throws(() => assertPublicationRules(manifest('omp', ['codex-home-path-rewrite'])));
  assert.throws(() => assertPublicationRules(manifest('omp', ['unknown'])));
});


test('Claude HOME settings rewriting follows the target manifest rule', () => {
  const target = loadTargetManifest(join(process.cwd(), '.evcrate/targets/claude/manifest.json'));
  assert.deepEqual(target.homePolicy.publicationRules, ['claude-home-path-rewrite', 'claude-skill-root-exclusion']);
  const settings = bytes(JSON.stringify({
    hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/run.sh' }] }] },
    statusLine: { type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/statusline.cjs' },
    keep: 'value'
  }));
  const rewritten = publishFile(target, 'settings.json', settings, '/home/user/.claude');
  assert.ok(rewritten);
  const value = JSON.parse(text(rewritten.content));
  assert.equal(value.hooks.PreToolUse[0].hooks[0].command, '/home/user/.claude/hooks/run.sh');
  assert.equal(value.statusLine.command, '/home/user/.claude/statusline.cjs');
  assert.equal(value.keep, 'value');
});
test('Codex rewriting is selected by manifest rule, not destination naming', () => {
  const hooks = bytes(JSON.stringify({ hooks: { notify: [{ hooks: [{ command: '"$CODEX_PROJECT_DIR"/.codex/hooks/run.sh' }] }] } }));
  const rewritten = publishFile(manifest('codex', ['codex-home-path-rewrite']), 'hooks.json', hooks, '/home/user/.codex');
  assert.ok(rewritten);
  assert.match(text(rewritten.content), /\/home\/user\/\.codex\/hooks\/run\.sh/u);
  const config = publishFile(manifest('codex', ['codex-home-path-rewrite']), 'config.toml', bytes('command = ".codex/bin/run-mcp-package.sh"\n'), '/home/user/.codex');
  assert.ok(config);
  assert.match(text(config.content), /command = "\/home\/user\/\.codex\/bin\/run-mcp-package\.sh"/u);
  const noRule = publishFile(manifest('codex', []), 'hooks.json', hooks, '/home/user/.codex');
  assert.ok(noRule);
  assert.equal(text(noRule.content), text(hooks));
});
let builtPackage;
async function sourceDerivedFixture(targets = []) {
  if (builtPackage === undefined) {
    const packageRoot = mkdtempSync(join(tmpdir(), 'evcrate-plan-package-'));
    const fixturePackage = join(packageRoot, 'package');
    cpSync(join(process.cwd(), '.evcrate'), join(fixturePackage, '.evcrate'), {
      recursive: true, dereference: true
    });
    cpSync(join(process.cwd(), 'dist'), join(fixturePackage, 'dist'), {
      recursive: true, dereference: true
    });
    await runLocalBuild(fixturePackage, PERSISTED_TARGETS);
    builtPackage = { packageRoot, fixturePackage };
  }
  const root = mkdtempSync(join(tmpdir(), 'evcrate-plan-session-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(home);
  mkdirSync(project);
  const context = resolveInvocationContext({
    packageRoot: builtPackage.fixturePackage, cwd: builtPackage.fixturePackage,
    home, projectRoot: project, targets
  });
  return { root, fixturePackage: builtPackage.fixturePackage, home, project, context };
}
test.after(() => {
  if (builtPackage !== undefined) rmSync(builtPackage.packageRoot, { recursive: true, force: true });
});

test('publication plan set shares one aggregate build across fixed shared and scoped harness phases', async () => {
  const fixture = await sourceDerivedFixture();
  let sourceDestination;
  let originalSourceDestination = null;
  try {
    const build = resolveCurrentPublicationBuild(fixture.context);
    sourceDestination = join(build.outputPaths['.copilot'], 'settings.json');
    originalSourceDestination = existsSync(sourceDestination) ? readFileSync(sourceDestination) : null;
    writeFileSync(sourceDestination, '{"sourceDestination":true}');
    mkdirSync(join(fixture.home, '.copilot'));
    writeFileSync(
      join(fixture.home, '.copilot', 'settings.json'),
      JSON.stringify({
        userHome: true, includeCoAuthoredBy: false, effortLevel: 'low',
        statusLine: { type: 'path', command: 'user-home' }
      })
    );
    mkdirSync(join(fixture.home, '.pi', 'agent'), { recursive: true });
    writeFileSync(
      join(fixture.home, '.pi', 'agent', 'settings.json'),
      JSON.stringify({ theme: 'dark', packages: ['npm:other@1.0.0'] })
    );
    mkdirSync(join(fixture.project, '.copilot'));
    writeFileSync(
      join(fixture.project, '.copilot', 'settings.json'),
      JSON.stringify({
        userProject: true, includeCoAuthoredBy: false, effortLevel: 'low',
        statusLine: { type: 'path', command: 'user-project' }
      })
    );
    mkdirSync(join(fixture.project, '.pi', 'agent'), { recursive: true });
    writeFileSync(
      join(fixture.project, '.pi', 'agent', 'settings.json'),
      JSON.stringify({ theme: 'light', packages: ['npm:other@1.0.0'] })
    );
    const homePlan = createPublicationPlanSet(fixture.context, { scope: 'home', build });
    const projectPlan = createPublicationPlanSet(fixture.context, { scope: 'project', build });

    assert.strictEqual(homePlan.build, build);
    assert.strictEqual(projectPlan.build, build);
    assert.equal(homePlan.buildManifestDigest, projectPlan.buildManifestDigest);
    assert.deepEqual(homePlan.phases.map(({ phase }) => phase), ['shared', 'harness']);
    assert.deepEqual(homePlan.shared.bindingOrder, ['.evcrate/bin']);
    assert.deepEqual(homePlan.shared.selectedTargets, []);
    assert.deepEqual(homePlan.harness.bindingOrder, [
      '.agents/skills', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot', '.evcrate-vscode'
    ]);
    assert.deepEqual(projectPlan.harness.bindingOrder, [
      '.antigravity', '.agents/hooks.json', '.agents/rules/evcrate-antigravity.md',
      '.claude', '.codex', '.agents/skills', 'AGENTS.md',
      '.copilot', '.github/copilot-instructions.md', '.omp', '.pi', '.evcrate-vscode'
    ]);
    assert.equal(projectPlan.shared.destinationRoot, fixture.home);
    assert.equal(projectPlan.shared.bindings[0].destinationRoot, join(fixture.home, '.evcrate', 'bin'));
    assert.equal(projectPlan.harness.destinationRoot, fixture.project);
    assert.equal(projectPlan.harness.projectIdentity.length, 64);
    assert.equal(projectPlan.harness.bindings.some(({ controller }) => controller), false);

    const homeCopilot = homePlan.harness.bindings.find(({ target }) => target === 'copilot');
    const projectCopilot = projectPlan.harness.bindings.find(({ target }) => target === 'copilot');
    assert.ok(homeCopilot);
    assert.ok(projectCopilot);
    const homeSettings = homeCopilot.operations.find(({ relativePath }) => relativePath === 'settings.json');
    const projectSettings = projectCopilot.operations.find(({ relativePath }) => relativePath === 'settings.json');
    assert.ok(homeSettings?.content);
    assert.ok(projectSettings?.content);
    assert.equal(homeCopilot.operations.filter(({ relativePath }) => relativePath === 'settings.json').length, 1);
    assert.equal(projectCopilot.operations.filter(({ relativePath }) => relativePath === 'settings.json').length, 1);
    assert.equal(new Set(homeCopilot.operations.map(({ destination }) => destination)).size, homeCopilot.operations.length);
    assert.equal(new Set(projectCopilot.operations.map(({ destination }) => destination)).size, projectCopilot.operations.length);
    assert.equal(homeCopilot.operations.some(({ relativePath }) =>
      relativePath === 'evcrate/managed-settings.json'
    ), false);
    assert.equal(projectCopilot.operations.some(({ relativePath }) =>
      relativePath === 'evcrate/managed-settings.json'
    ), false);
    assert.equal(JSON.parse(text(homeSettings.content)).userHome, true);
    assert.equal(JSON.parse(text(projectSettings.content)).userProject, true);
    assert.notDeepEqual([...homeSettings.content], [...projectSettings.content]);
    assert.match(text(projectSettings.content), /process\.env\.COPILOT_PROJECT_DIR/u);
    const originalProjectSettings = [...projectSettings.content];
    const exposedProjectSettings = projectSettings.content;
    assert.ok(exposedProjectSettings);
    exposedProjectSettings[0] ^= 0xff;
    assert.deepEqual([...projectSettings.content], originalProjectSettings);

    const pi = homePlan.harness.bindings.find(({ target }) => target === 'pi');
    const projectPi = projectPlan.harness.bindings.find(({ target }) => target === 'pi');
    assert.ok(pi);
    assert.ok(projectPi);
    assert.equal(pi.operations.some(({ relativePath }) =>
      relativePath === 'agent/evcrate/managed-settings.json'
    ), false);
    assert.equal(projectPi.operations.some(({ relativePath }) =>
      relativePath === 'agent/evcrate/managed-settings.json'
    ), false);
    const homePiSettings = pi.operations.find(({ relativePath }) => relativePath === 'agent/settings.json');
    const projectPiSettings = projectPi.operations.find(({ relativePath }) => relativePath === 'agent/settings.json');
    assert.ok(homePiSettings?.content);
    assert.ok(projectPiSettings?.content);
    assert.equal(JSON.parse(text(homePiSettings.content)).theme, 'dark');
    assert.equal(JSON.parse(text(projectPiSettings.content)).theme, 'light');
    for (const document of [
      '.agents/hooks.json', '.agents/rules/evcrate-antigravity.md', '.github/copilot-instructions.md'
    ]) {
      const binding = projectPlan.harness.bindings.find(({ binding }) => binding === document);
      assert.ok(binding, document);
      assert.equal(binding.kind, 'document');
      const operation = binding.operations.find(({ relativePath }) => relativePath === document);
      assert.ok(operation?.content, document);
      assert.deepEqual(
        [...operation.content],
        [...readFileSync(projectPlan.build.outputPaths[document])]
      );
    }

    const reversedBuild = {
      ...build,
      selectedManifests: build.selectedManifests.map((manifest) => {
        if (manifest.name === 'codex') {
          return {
            ...manifest,
            homePolicy: { ...manifest.homePolicy, promotionOrder: 61 }
          };
        }
        if (manifest.name === 'antigravity') {
          return {
            ...manifest,
            homePolicy: { ...manifest.homePolicy, promotionOrder: 30 }
          };
        }
        return manifest;
      })
    };
    assert.throws(
      () => createPublicationPlanSet(fixture.context, { scope: 'home', build: reversedBuild }),
      (error) => error?.code === 'PROTOCOL_INVALID'
    );

    assert.equal(Object.isFrozen(homePlan), true);
    assert.equal(Object.isFrozen(homePlan.phases), true);
    assert.equal(Object.isFrozen(homePlan.harness.bindings), true);
    assert.equal(Object.isFrozen(homePlan.harness.changes), true);
  } finally {
    if (sourceDestination !== undefined) {
      if (originalSourceDestination === null) rmSync(sourceDestination, { force: true });
      else writeFileSync(sourceDestination, originalSourceDestination);
    }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('project overlap preflight runs before destination inventory reads', async () => {
  const fixture = await sourceDerivedFixture();
  try {
    const build = resolveCurrentPublicationBuild(fixture.context);
    const selectedTargets = fixture.context.selectedTargets.map((target) => {
      if (target.id !== 'antigravity') return target;
      const descriptor = target.projectDirectoryDescriptors[0];
      return {
        ...target,
        projectDirectoryDescriptors: [{
          ...descriptor,
          relativeDestination: '.copilot/nested'
        }]
      };
    });
    const malformedContext = { ...fixture.context, selectedTargets };
    const malformedBuild = {
      ...build,
      outputPaths: {
        ...build.outputPaths,
        '.copilot/nested': build.outputPaths['.copilot']
      }
    };
    symlinkSync(fixture.root, join(fixture.project, '.copilot'));
    assert.throws(
      () => createPublicationPlanSet(malformedContext, { scope: 'project', build: malformedBuild }),
      (error) => error?.code === 'PROTOCOL_INVALID'
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});


test('target subset planning preserves untouched logical ownership records', async () => {
  const fixture = await sourceDerivedFixture(['copilot']);
  const nextFixture = await sourceDerivedFixture(['omp']);
  try {
    const build = resolveCurrentPublicationBuild(fixture.context);
    mkdirSync(join(fixture.home, '.copilot'));
    writeFileSync(join(fixture.home, '.copilot', 'stale.txt'), 'stale');
    const plan = createPublicationPlanSet(fixture.context, {
      scope: 'home',
      build,
      priorManagedOwnership: {
        omp: { '.omp': ['untouched.txt'] },
        copilot: { '.copilot': ['stale.txt'] }
      }
    });
    assert.deepEqual(plan.harness.selectedTargets, ['copilot']);
    assert.deepEqual(plan.harness.managedOwnership.omp, { '.omp': ['untouched.txt'] });
    assert.ok(plan.harness.managedOwnership.copilot['.copilot'].length > 0);
    assert.equal(plan.harness.bindings.some(({ target }) => target === 'omp'), false);
    assert.equal(plan.harness.changes.some(({ target }) => target === 'omp'), false);
    const staleChange = plan.harness.changes.find(({ path }) => path === '.copilot/stale.txt');
    assert.ok(staleChange);
    assert.equal(staleChange.target, 'copilot');
    assert.equal(staleChange.action, 'delete');
    assert.equal(staleChange.beforeHash?.length, 64);
    assert.equal(staleChange.intendedHash, null);
    const malformedManifest = {
      ...build.selectedManifests[0],
      homePolicy: {
        ...build.selectedManifests[0].homePolicy,
        bindings: { '.copilot': '.ssh' }
      }
    };
    const malformedBuild = {
      ...build,
      selectedManifests: [malformedManifest]
    };
    assert.throws(
      () => createPublicationPlanSet(fixture.context, { scope: 'home', build: malformedBuild }),
      (error) => error?.code === 'PROTOCOL_INVALID'
    );
    mkdirSync(join(nextFixture.home, '.omp'));
    writeFileSync(join(nextFixture.home, '.omp', 'untouched.txt'), 'stale');
    const nextBuild = resolveCurrentPublicationBuild(nextFixture.context);
    const nextPlan = createPublicationPlanSet(nextFixture.context, {
      scope: 'home',
      build: nextBuild,
      priorManagedOwnership: plan.harness.managedOwnership
    });
    assert.deepEqual(
      nextPlan.harness.managedOwnership.copilot,
      plan.harness.managedOwnership.copilot
    );
    assert.equal(nextPlan.harness.changes.some(({ target }) => target === 'copilot'), false);
    const ompStaleChange = nextPlan.harness.changes.find(({ path }) => path === '.omp/untouched.txt');
    assert.ok(ompStaleChange);
    assert.equal(ompStaleChange.action, 'delete');
  } finally {
    rmSync(nextFixture.root, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('launch intent is derived from shebang bytes and direct launcher roles (F1 regression)', () => {
  // Shebang node wrapper (e.g. Gemini .cjs hook)
  assert.equal(deriveLaunchIntent('hooks/session-start.cjs', bytes('#!/usr/bin/env node\nconsole.log(1);')), true);
  // Extensionless hook with shebang
  assert.equal(deriveLaunchIntent('hooks/my-hook', bytes('#!/bin/sh\necho 1')), true);
  // Python script with shebang
  assert.equal(deriveLaunchIntent('scripts/tool.py', bytes('#!/usr/bin/env python3\npass')), true);
  // .sh script without shebang
  assert.equal(deriveLaunchIntent('scripts/test.sh', bytes('echo test')), true);
  // Direct advisor launcher role
  assert.equal(deriveLaunchIntent('evcrate-advisor', bytes('binary')), true);
  assert.equal(deriveLaunchIntent('bin/evcrate', bytes('binary')), true);
  // Non-launcher .cjs without shebang
  assert.equal(deriveLaunchIntent('lib/helper.cjs', bytes('module.exports = {};')), false);
  // Non-launcher markdown / json / text
  assert.equal(deriveLaunchIntent('README.md', bytes('# Readme')), false);
  assert.equal(deriveLaunchIntent('settings.json', bytes('{}')), false);
});
