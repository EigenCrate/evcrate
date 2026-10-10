import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createProjectionBuildContext, createStagedRoot, loadTargetManifestRegistry } from '../../dist/index.js';
import { codexAdapter } from '../../dist/adapters/codex/index.js';
import { applyReplacements, renderHarnessScriptReferences } from '../../dist/adapters/codex/transforms.js';
import { generateInstructions } from '../../dist/adapters/copilot/instructions.js';
import { translatePrompt } from '../../dist/adapters/copilot/prompts.js';
import { generateVscodeInstructions } from '../../dist/adapters/vscode/instructions.js';
import { transformVscodePrompt } from '../../dist/adapters/vscode/references.js';

const repository = process.cwd();
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const builders = {
  codex: (context) => codexAdapter.build(context),
  copilot: (context) => generateInstructions(context, (value) => translatePrompt(value, {})),
  vscode: (context) => generateVscodeInstructions(context, {}, []),
};
const outputs = {
  codex: ['AGENTS.md', '.codex/AGENTS.md'],
  copilot: ['.github/copilot-instructions.md', '.copilot/copilot-instructions.md'],
  vscode: ['.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md'],
};

function fixture(t, fullSource = false) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-native-instructions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const canonical = join(root, '.claude');
  if (fullSource) cpSync(join(repository, '.evcrate/source/.claude'), canonical, { recursive: true });
  else mkdirSync(canonical);
  writeFileSync(join(root, 'AGENTS.md'), '# Generated Codex output must not become source\n');
  return { root, canonical };
}

function contextFor(t, target, canonical) {
  const stage = createStagedRoot(repository, `.native-instructions-${target}-`);
  t.after(() => stage.cleanup());
  return createProjectionBuildContext(registry.targets.get(target), canonical, stage);
}

test('native instruction outputs use only graph authority, with project and HOME self references', (t) => {
  const { canonical } = fixture(t, true);
  const document = '# AGENTS.md\n\nCanonical instruction sentinel. Read `./.claude/rules/AGENTS.md`.\n\nRead `.claude/workflows/development-rules.md`.\n';
  writeFileSync(join(canonical, 'AGENTS.md'), document);
  for (const [target, build] of Object.entries(builders)) {
    const context = contextFor(t, target, canonical);
    build(context);
    for (const output of outputs[target]) {
      const body = readFileSync(join(context.stage.path, output), 'utf8');
      assert.match(body, /Canonical instruction sentinel/u);
      assert.doesNotMatch(body, /Generated Codex output must not become source/u);
      assert.doesNotMatch(body, /\.claude\/rules\/AGENTS\.md/u);
      const expectedReference = output === '.codex/AGENTS.md' || output === '.copilot/copilot-instructions.md' ? `~/${output}` : output;
      assert.ok(body.includes(`Read \`${expectedReference}\``), `${target} ${output}: installed self reference`);
      assert.ok(body.includes(`# ${output.split('/').at(-1)}\n`), `${target} ${output}: native header`);
    }
    if (target !== 'codex') assert.equal(existsSync(join(context.stage.path, 'AGENTS.md')), false);
  }
});

for (const [name, payload] of [['missing', undefined], ['empty', ' \n'], ['invalid UTF-8', Buffer.from([0xff])]]) {
  test(`native instruction delivery rejects ${name} graph payload despite generated root document`, (t) => {
    const { canonical } = fixture(t);
    if (payload !== undefined) writeFileSync(join(canonical, 'AGENTS.md'), payload);
    for (const [target, build] of Object.entries(builders)) {
      const context = contextFor(t, target, canonical);
      assert.throws(() => build(context), (error) => error?.code === 'VALIDATION_INVALID');
      for (const output of outputs[target]) assert.equal(existsSync(join(context.stage.path, output)), false);
    }
  });
}

test('instruction reference rendering preserves URI literals and user override paths', () => {
  const source = 'Read .claude/rules/AGENTS.md and ~/.claude/rules/AGENTS.md. Keep AGENTS.override.md and user/AGENTS.md. https://example.test/.claude/rules/AGENTS.md file:///docs/AGENTS.md';
  for (const [render, project, home] of [
    [applyReplacements, 'AGENTS.md', '~/.codex/AGENTS.md'],
    [(value) => applyReplacements(renderHarnessScriptReferences(value)), 'AGENTS.md', '~/.codex/AGENTS.md'],
    [(value) => translatePrompt(value, {}), '.github/copilot-instructions.md', '~/.copilot/copilot-instructions.md'],
    [(value) => transformVscodePrompt(value, {}, []), '.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md', '~/.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md'],
  ]) {
    assert.equal(render(source), `Read ${project} and ${home}. Keep AGENTS.override.md and user/AGENTS.md. https://example.test/.claude/rules/AGENTS.md file:///docs/AGENTS.md`);
  }
});

test('Codex read reminders resolve HOME-only installs without rewriting explanations', () => {
  for (const [render, local, home] of [
    [applyReplacements, 'AGENTS.md', '~/.codex/AGENTS.md'],
  ]) {
    for (const prompt of [
      '**MUST READ** `.claude/rules/AGENTS.md` before working.',
      'Follow the Development Rules in your `.claude/rules/AGENTS.md` file.',
      "Read the current project's `README.md`, active `.claude/rules/AGENTS.md`, and docs.",
    ]) {
      const rendered = render(prompt);
      assert.ok(rendered.includes(`\`${local}\` if present; otherwise read \`${home}\``));
      assert.equal(render(rendered), rendered, 'fallback must not accumulate');
    }
    const explanation = render('The native document is `AGENTS.md`.');
    assert.equal(explanation, `The native document is \`${local}\`.`);
  }
});
