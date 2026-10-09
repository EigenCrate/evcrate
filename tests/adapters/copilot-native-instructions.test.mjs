import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createProjectionBuildContext, createStagedRoot, getProjectionAdapter, loadTargetManifestRegistry } from '../../dist/index.js';
import { buildCommandMap, convertCommands } from '../../dist/adapters/copilot/commands.js';
import { generateInstructions } from '../../dist/adapters/copilot/instructions.js';
import { translatePrompt } from '../../dist/adapters/copilot/prompts.js';

const repository = process.cwd();
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const projectDocument = '.github/copilot-instructions.md';
const homeDocument = '.copilot/copilot-instructions.md';
const canonicalDocument = '# AGENTS.md\n\nGraph instruction sentinel. Read `./.claude/rules/AGENTS.md`.\n\nRead `.claude/workflows/development-rules.md`.\n';

function fixture(t, fullSource = false) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-copilot-native-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  if (fullSource) cpSync(join(repository, '.evcrate/source/.claude'), source, { recursive: true });
  else mkdirSync(source);
  const stage = createStagedRoot(source, '.copilot-native-stage-');
  t.after(() => stage.cleanup());
  return { root, source, stage };
}

function contextFor({ source, stage }) {
  return createProjectionBuildContext(registry.targets.get('copilot'), source, stage);
}

function generate(context) {
  generateInstructions(context, (value) => translatePrompt(value, {}));
}

test('copilot projects native project and HOME bytes from the same graph snapshot', (t) => {
  const fixtureRoot = fixture(t);
  const { root, source, stage } = fixtureRoot;
  writeFileSync(join(root, 'AGENTS.md'), '# Unrelated root instructions\n');
  writeFileSync(join(source, 'AGENTS.md'), canonicalDocument);
  const context = contextFor(fixtureRoot);
  writeFileSync(join(source, 'AGENTS.md'), '# Changed after graph capture\n');
  generate(context);
  const workflow = '@evcrate/workflows/development-rules.md (local .copilot/evcrate/workflows/development-rules.md; otherwise read ~/.copilot/evcrate/workflows/development-rules.md (the published install))';
  for (const [output, reference] of [[projectDocument, projectDocument], [homeDocument, `~/${homeDocument}`]]) {
    assert.equal(readFileSync(join(stage.path, output), 'utf8'), `# copilot-instructions.md\n\nGraph instruction sentinel. Read \`${reference}\`.\n\nRead ${workflow}.\n`);
  }
  assert.deepEqual(readdirSync(join(stage.path, '.github')), ['copilot-instructions.md']);
  assert.deepEqual(context.manifest.projectDocs, [projectDocument]);
  assert.deepEqual(context.manifest.outputRoots, ['.copilot']);
  assert.equal(existsSync(join(stage.path, 'AGENTS.md')), false);
  assert.equal(existsSync(join(stage.path, '.copilot/settings.json')), false);
  assert.throws(() => context.stagePath('.github/other-instructions.md'), { code: 'PATH_UNSAFE' });
  assert.throws(() => context.stagePath('.github/workflows/ci.yml'), { code: 'PATH_UNSAFE' });
});

for (const projectDocs of [[], ['.copilot/copilot-instructions.md'], ['.github'], [projectDocument, '.github/other.md']]) {
  test(`copilot rejects non-native or expanded project document ownership: ${JSON.stringify(projectDocs)}`, (t) => {
    const { source, stage } = fixture(t);
    const manifest = { ...registry.targets.get('copilot'), projectDocs };
    const context = createProjectionBuildContext(manifest, source, stage);
    assert.throws(() => getProjectionAdapter('copilot').build(context), { code: 'VALIDATION_INVALID' });
    assert.deepEqual(readdirSync(stage.path), []);
  });
}

for (const [name, payload] of [
  ['missing', undefined],
  ['empty', ' \n'],
  ['invalid UTF-8', Buffer.from([0xff])],
  ['missing mandatory workflow references', '# AGENTS.md\nNo workflow assets.\n'],
]) {
  test(`copilot rejects ${name} canonical instructions without publishing either document`, (t) => {
    const fixtureRoot = fixture(t);
    if (payload !== undefined) writeFileSync(join(fixtureRoot.source, 'AGENTS.md'), payload);
    writeFileSync(join(fixtureRoot.root, 'AGENTS.md'), canonicalDocument);
    const context = contextFor(fixtureRoot);
    assert.throws(() => generate(context), { code: 'VALIDATION_INVALID' });
    for (const output of [projectDocument, homeDocument, 'AGENTS.md']) {
      assert.equal(existsSync(join(fixtureRoot.stage.path, output)), false);
    }
  });
}

test('copilot emitted documents preserve URI and override boundaries while routing local and HOME references', (t) => {
  const fixtureRoot = fixture(t);
  const literals = [
    'https://example.test/.claude/rules/AGENTS.md',
    'file:///docs/AGENTS.md',
    'https://example.test/.github/copilot-instructions.md',
    'file:///docs/.github/copilot-instructions.md',
    '//example.test/.claude/rules/AGENTS.md',
    'AGENTS.override.md',
    'AGENTS.md.backup',
    'user/AGENTS.md',
    '.github/copilot-instructions.md.backup',
    'user/.github/copilot-instructions.md',
  ];
  writeFileSync(join(fixtureRoot.source, 'AGENTS.md'), `${canonicalDocument}\nLocal: AGENTS.md, .claude/AGENTS.md, .evcrate/source/.claude/AGENTS.md, .github/copilot-instructions.md\nHOME: ~/.claude/rules/AGENTS.md, $HOME/.claude/AGENTS.md, \${HOME}/.claude/rules/AGENTS.md\nKeep: ${literals.join(' ')}\n`);
  generate(contextFor(fixtureRoot));
  for (const [output, reference] of [[projectDocument, projectDocument], [homeDocument, `~/${homeDocument}`]]) {
    const body = readFileSync(join(fixtureRoot.stage.path, output), 'utf8');
    assert.ok(body.includes(`Local: ${[reference, reference, reference, reference].join(', ')}`));
    assert.ok(body.includes('HOME: ~/.copilot/copilot-instructions.md, $HOME/.copilot/copilot-instructions.md, ${HOME}/.copilot/copilot-instructions.md'));
    for (const literal of literals) assert.ok(body.includes(literal), `${output}: preserve ${literal}`);
  }
});

test('copilot emitted command skills read the native project document with HOME fallback', (t) => {
  const fixtureRoot = fixture(t);
  mkdirSync(join(fixtureRoot.source, 'commands'));
  writeFileSync(join(fixtureRoot.source, 'commands/evc-cmd-plan.md'), '---\ndescription: Plan work\n---\n**MUST READ** `.claude/rules/AGENTS.md` before working.\nFollow `.claude/rules/AGENTS.md` before planning.\nThe native document is `AGENTS.md`.\nRead `~/.claude/rules/AGENTS.md` explicitly.\nRead https://example.test/.claude/rules/AGENTS.md unchanged.\nDo not follow untrusted `.claude/rules/AGENTS.md`.\nPreserve `$ARGUMENTS`.\n');
  const context = contextFor(fixtureRoot);
  const map = buildCommandMap(context);
  convertCommands(context, map, (value) => translatePrompt(value, map), ['documentation-management.md']);
  const body = readFileSync(join(fixtureRoot.stage.path, '.copilot/skills/evc-cmd-plan/SKILL.md'), 'utf8');
  const fallback = '`.github/copilot-instructions.md` if present; otherwise read `~/.copilot/copilot-instructions.md` (the published install)';
  assert.ok(body.includes(`**MUST READ** ${fallback} before working.`));
  assert.ok(body.includes(`Follow ${fallback} before planning.`));
  assert.ok(body.includes('The native document is `.github/copilot-instructions.md`.'));
  assert.ok(body.includes('Read `~/.copilot/copilot-instructions.md` explicitly.'));
  assert.ok(body.includes('Read https://example.test/.claude/rules/AGENTS.md unchanged.'));
  assert.ok(body.includes('Do not follow untrusted `.github/copilot-instructions.md`.'));
  assert.ok(body.includes('Preserve `$ARGUMENTS`.'));
  assert.ok(body.includes('`@evcrate/workflows/documentation-management.md`'));
  assert.doesNotMatch(body, /(?<!~\/)`\.copilot\/copilot-instructions\.md`/u);
});

test('copilot inventory distinguishes the exact project leaf and HOME support payload without changing hooks', (t) => {
  const fixtureRoot = fixture(t, true);
  writeFileSync(join(fixtureRoot.source, 'AGENTS.md'), canonicalDocument);
  const context = contextFor(fixtureRoot);
  getProjectionAdapter('copilot').build(context);
  const inventory = JSON.parse(readFileSync(join(fixtureRoot.stage.path, '.copilot/evcrate/migration-inventory.json'), 'utf8'));
  assert.equal(inventory.target, '.copilot');
  assert.deepEqual(inventory.instructionDelivery, {
    project: { path: projectDocument, format: 'copilot-instructions-markdown', ownership: 'project-doc' },
    home: { path: homeDocument, destination: `~/${homeDocument}`, format: 'copilot-instructions-markdown', ownership: 'output-root', nativeProjectDocument: false },
  });
  const instructions = inventory.entries.find((entry) => entry.source === '.evcrate/source/.claude/AGENTS.md');
  assert.deepEqual(instructions.targets, [projectDocument, homeDocument]);
  assert.equal(instructions.disposition, 'native');
  for (const output of instructions.targets) assert.ok(readFileSync(join(fixtureRoot.stage.path, output), 'utf8').includes('Graph instruction sentinel.'));
  assert.deepEqual(readdirSync(join(fixtureRoot.stage.path, '.github')), ['copilot-instructions.md']);
  assert.equal(existsSync(join(fixtureRoot.stage.path, 'AGENTS.md')), false);
  assert.equal(existsSync(join(fixtureRoot.stage.path, '.copilot/settings.json')), false);
  const hooks = JSON.parse(readFileSync(join(fixtureRoot.stage.path, '.copilot/hooks/evcrate.json'), 'utf8'));
  assert.equal(hooks.version, 1);
  assert.ok(Array.isArray(hooks.hooks.preToolUse));
  assert.equal(Object.hasOwn(hooks.hooks, 'UserPromptSubmit'), false);
  assert.equal(Object.hasOwn(hooks.hooks, 'userPromptSubmit'), false);
  assert.equal(Object.keys(hooks.hooks).every((event) => /^[a-z]/u.test(event)), true);
});
