import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { createProjectionBuildContext, createStagedRoot, getProjectionAdapter, loadTargetManifestRegistry } from '../../dist/index.js';
import { projectionExpectations } from '../../dist/adapters/types.js';
import { mapPublicationPath, publishFile } from '../../dist/distribution/publication-rules.js';
import { translatePrompt } from '../../dist/adapters/copilot/prompts.js';
import { applyReplacements } from '../../dist/adapters/codex/transforms.js';
import { vscodeAdapter } from '../../dist/adapters/vscode/index.js';

const repository = process.cwd();
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const targets = ['claude', 'codex', 'antigravity', 'pi', 'omp', 'copilot', 'vscode'];

function put(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function installedPath(manifest, root, path, scope) {
  if (scope === 'project') return join(root, path);
  const outputRoot = manifest.outputRoots.find((candidate) => path.startsWith(`${candidate}/`));
  assert.ok(outputRoot, `No output root for ${path}`);
  const mapped = mapPublicationPath(manifest, path.slice(outputRoot.length + 1));
  return mapped === null ? null : join(root, manifest.homePolicy.bindings[outputRoot], mapped);
}

function invoke(script, args, cwd, home) {
  return spawnSync('python3', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env, HOME: home, USERPROFILE: home, PYTHONDONTWRITEBYTECODE: '1',
      CLAUDE_PROJECT_DIR: cwd, CODEX_PROJECT_DIR: cwd, AGY_PROJECT_DIR: cwd,
      COPILOT_PROJECT_DIR: cwd, PI_PROJECT_DIR: cwd, OMP_PROJECT_DIR: cwd,
    },
  });
}

for (const target of targets) {
  test(`${target}: installed help uses its own catalog and relay identity from foreign CWD`, (t) => {
    const root = mkdtempSync(join(tmpdir(), `evcrate-help-${target}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const stage = createStagedRoot(root, '.projection-');
    t.after(() => stage.cleanup());
    const manifest = registry.targets.get(target);
    const context = createProjectionBuildContext(manifest, join(repository, '.evcrate/source/.claude'), stage);
    const adapter = target === 'vscode' ? vscodeAdapter : getProjectionAdapter(target);
    adapter.build(context);
    const files = projectionExpectations(context).filter((entry) => entry.kind === 'file');
    const helper = files.find((entry) => entry.path.endsWith('/scripts/ev-help.py'));
    assert.ok(helper, 'Documented help helper must be emitted and hash-managed');
    const document = files.find((entry) => /\/(?:evc-cmd-help\.md|evc-cmd-help\/SKILL\.md)$/u.test(entry.path));
    assert.ok(document, 'Help procedure must be emitted');
    const guidance = readFileSync(join(stage.path, document.path), 'utf8');
    const roster = [...guidance.matchAll(/^\d+\. `([^`]+)` \(/gmu)].map((match) => match[1]);
    assert.deepEqual(roster, targets, 'Shared target guidance must not turn Claude into a host duplicate');
    const invocation = guidance.match(/python\s+(\S*ev-help\.py(?:\}\})?)/u)?.[1];
    assert.ok(invocation, 'Help procedure must document its executable helper');
    const helperReference = invocation.startsWith('{{evcrate:')
      ? join(dirname(helper.path), '..', invocation.slice('{{evcrate:'.length, -2))
      : invocation;
    assert.equal(resolve(stage.path, helperReference), resolve(stage.path, helper.path));

    for (const scope of ['project', 'home']) {
      const install = join(root, scope);
      const foreign = join(root, `${scope}-foreign`);
      mkdirSync(foreign, { recursive: true });
      for (const entry of files) {
        if (scope === 'project') {
          put(join(install, entry.path), readFileSync(join(stage.path, entry.path)));
          continue;
        }
        const outputRoot = manifest.outputRoots.find((candidate) => entry.path.startsWith(`${candidate}/`));
        if (!outputRoot) continue;
        const destinationRoot = join(install, manifest.homePolicy.bindings[outputRoot]);
        const published = publishFile(manifest, entry.path.slice(outputRoot.length + 1), readFileSync(join(stage.path, entry.path)), destinationRoot);
        if (published) put(join(destinationRoot, published.relativePath), published.content);
      }
      const script = installedPath(manifest, install, helperReference, scope);
      const layout = JSON.parse(readFileSync(join(dirname(script), 'scanner-layout.json'), 'utf8'));
      const commands = resolve(dirname(script), layout.commands.root);
      const ownCommand = layout.commands.format === 'command-skill'
        ? join(commands, 'evc-cmd-plan-x-fast/SKILL.md')
        : join(commands, 'evc-cmd-plan-x-fast.md');
      const sentinel = `Installed ${target} ${scope} catalog`;
      writeFileSync(ownCommand, readFileSync(ownCommand, 'utf8').replace(/^description:.*$/mu, `description: ${sentinel}`));
      const decoy = '---\ndescription: Foreign catalog must never win\n---\n';
      put(join(foreign, '.claude/commands/evc-cmd-plan-x-fast.md'), decoy);
      if (target !== 'claude') put(join(install, '.claude/commands/evc-cmd-plan-x-fast.md'), decoy);

      const overview = invoke(script, [], foreign, install);
      assert.equal(overview.status, 0, overview.stderr + overview.stdout);
      const detail = invoke(script, ['plan:fast'], foreign, install);
      assert.equal(detail.status, 0, detail.stderr + detail.stdout);
      assert.ok(detail.stdout.includes(sentinel), detail.stdout);
      assert.ok(!detail.stdout.includes('Foreign catalog'), detail.stdout);
      const advice = invoke(script, ['advise'], foreign, install);
      assert.equal(advice.status, 0, advice.stderr + advice.stdout);
      if (target === 'claude') {
        assert.match(advice.stdout, /Claude-only relay/u);
        assert.doesNotMatch(advice.stdout, /ADVISE_AGENT_RELAY_UNSUPPORTED_/u);
      } else {
        assert.ok(advice.stdout.includes(`ADVISE_AGENT_RELAY_UNSUPPORTED_${target.toUpperCase()}`), advice.stdout);
        assert.doesNotMatch(advice.stdout, /Claude-only relay/u);
      }
      assert.doesNotMatch(advice.stdout, /gemini/iu);

      renameSync(commands, `${commands}.unavailable`);
      for (const args of [[], ['advise']]) {
        const missing = invoke(script, args, foreign, install);
        assert.notEqual(missing.status, 0, 'Another installed/caller catalog must not hide a missing own catalog');
        assert.ok(missing.stdout.includes(commands), missing.stdout);
      }
      renameSync(`${commands}.unavailable`, commands);

      const layoutPath = join(dirname(script), 'scanner-layout.json');
      writeFileSync(layoutPath, JSON.stringify({ ...layout, target: 'gemini' }));
      const retired = invoke(script, ['advise'], foreign, install);
      assert.notEqual(retired.status, 0, 'A retired target ID must not become a selectable help host');
      assert.doesNotMatch(retired.stdout, /ADVISE_AGENT_RELAY_UNSUPPORTED_GEMINI/u);
      writeFileSync(layoutPath, JSON.stringify(layout));
    }

    // The actual delivered helper participates in the ordinary projection hash closure.
    writeFileSync(join(stage.path, helper.path), '# altered helper\n');
    const validation = adapter.validate(context);
    assert.equal(validation.valid, false);
    assert.ok(validation.diagnostics.some((diagnostic) => diagnostic.path === helper.path));
  });
}

test('prompt translation preserves persisted target IDs and proper names, while mapping operational references', () => {
  const identities = { target: 'claude', targets, vendor: 'Anthropic', product: 'Claude Code CLI', model: 'claude-sonnet' };
  for (const render of [applyReplacements, (value) => translatePrompt(value, {})]) {
    assert.deepEqual(JSON.parse(render(JSON.stringify(identities))), identities);
  }
  assert.equal(applyReplacements('.claude/scripts/tool.py CLAUDE_PROJECT_DIR AskUserQuestion'), '.codex/scripts/tool.py CODEX_PROJECT_DIR request_user_input');
  assert.equal(translatePrompt('.claude/scripts/tool.py CLAUDE_PROJECT_DIR AskUserQuestion', {}), '.copilot/evcrate/scripts/tool.py COPILOT_PROJECT_DIR user input');
});
