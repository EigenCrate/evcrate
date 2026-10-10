import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import {
  createProjectionBuildContext,
  createStagedRoot,
  getProjectionAdapter,
  loadTargetManifestRegistry,
} from '../../dist/index.js';
import { convertAgents, discoverAgents } from '../../dist/adapters/copilot/agents.js';
import { parseFrontmatter } from '../../dist/adapters/copilot/common.js';

const registry = loadTargetManifestRegistry(join(process.cwd(), '.evcrate/targets/manifest.json'));

for (const [label, paths] of [
  ['command and ordinary skill', ['commands/evc-cmd-plan.md', 'skills/cmd-plan/SKILL.md']],
  ['command and agent', ['commands/evc-cmd-plan.md', 'agents/evc-cmd-plan.md']],
  ['ordinary skill and agent', ['skills/planner/SKILL.md', 'agents/evc-planner.md']],
  ['style and ordinary skill', ['output-styles/concise.md', 'skills/style-concise/SKILL.md']],
  ['style and agent', ['output-styles/concise.md', 'agents/evc-style-concise.md']],
  ['normalized styles', ['output-styles/Brief_Style.md', 'output-styles/brief-style.md']],
  ['flattened styles', ['output-styles/brief/style.md', 'output-styles/brief-style.md']],
  ['normalized ordinary skills', ['skills/Review_Skill/SKILL.md', 'skills/review-skill/SKILL.md']],
]) {
  test(`copilot naming rejects ${label} collisions before emitting files`, () => {
    const root = mkdtempSync(join(tmpdir(), 'evcrate-copilot-naming-'));
    const source = join(root, 'source');
    mkdirSync(source);
    const stage = createStagedRoot(source, '.copilot-naming-stage-');
    try {
      for (const path of paths) {
        const name = path.startsWith('skills/') ? basename(dirname(path)) : basename(path, '.md');
        const destination = join(source, path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, `---\nname: ${name}\ndescription: Naming collision fixture\n---\nPerform the requested work.\n`);
      }
      const context = createProjectionBuildContext(registry.targets.get('copilot'), source, stage);
      assert.throws(() => getProjectionAdapter('copilot').build(context), { code: 'VALIDATION_INVALID' });
      assert.deepEqual(readdirSync(stage.path), []);
    } finally {
      stage.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('copilot agent projection preserves explicit tool restrictions without changing inheritance', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-copilot-tools-'));
  const source = join(root, 'source');
  mkdirSync(join(source, 'agents'), { recursive: true });
  const stage = createStagedRoot(source, '.copilot-tools-stage-');
  const cases = [
    { name: 'evc-inherited', declaration: '', tools: undefined },
    { name: 'evc-none', declaration: 'tools: none\n', tools: [] },
    { name: 'evc-empty-list', declaration: 'tools: []\n', tools: [] },
    { name: 'evc-empty-field', declaration: 'tools:\n', tools: [] },
    { name: 'evc-unsupported', declaration: 'tools: [UnmappedTool]\n', tools: [] },
    { name: 'evc-allowlist', declaration: 'tools: [Read, Grep, Glob, Write, Edit]\n', tools: ['read', 'search', 'edit'] },
    { name: 'evc-mixed', declaration: 'tools:\n  - Read\n  - UnmappedTool\n', tools: ['read'] },
  ];
  try {
    for (const { name, declaration } of cases) {
      writeFileSync(join(source, 'agents', `${name}.md`),
        `---\nname: ${name}\ndescription: Tool restriction fixture\n${declaration}---\nPerform the requested work.\n`);
    }
    const context = createProjectionBuildContext(registry.targets.get('copilot'), source, stage);
    convertAgents(context, discoverAgents(context), (value) => value);
    for (const { name, tools } of cases) {
      const output = parseFrontmatter(readFileSync(join(stage.path, '.copilot/agents', `${name}.agent.md`), 'utf8'));
      assert.deepEqual(output.fields.tools?.slice(1, -1).split(',').map((tool) => tool.trim()).filter(Boolean),
        tools, `${name}: explicit restrictions must not become inherited tools`);
    }
  } finally {
    stage.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});
