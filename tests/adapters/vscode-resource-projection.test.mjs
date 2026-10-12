import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createProjectionBuildContext,
  createStagedRoot,
  loadTargetManifestRegistry
} from '../../dist/index.js';
import { vscodeAdapter } from '../../dist/adapters/vscode/index.js';
import { parseFrontmatter } from '../../dist/adapters/vscode/metadata.js';
import { parseCatalogYaml } from '../../dist/adapters/catalog-types.js';
import { discoverAllVscodeNames, discoverVscodeAgents, discoverVscodeCommands } from '../../dist/adapters/vscode/names.js';
import { buildVscodeInventory } from '../../dist/adapters/vscode/inventory.js';
import { convertVscodeAgents } from '../../dist/adapters/vscode/agents.js';

const repository = process.cwd();
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const canonicalRoot = join(repository, '.evcrate/source/.claude');

test('vscode-projection: complete end-to-end build and validation', () => {
  const stage = createStagedRoot(repository, '.vscode-test-stage-');
  try {
    const targetManifest = registry.targets.get('vscode');
    assert.ok(targetManifest, 'vscode target manifest must be loaded');

    const context = createProjectionBuildContext(targetManifest, canonicalRoot, stage);
    vscodeAdapter.build(context);

    const validation = vscodeAdapter.validate(context);
    assert.equal(validation.valid, true, `Validation failed: ${JSON.stringify(validation.diagnostics)}`);
    assert.equal(validation.diagnostics.length, 0);

    const stageRoot = context.stagePath('.evcrate-vscode');

    // 1. Verify plugin.json
    const pluginJsonPath = join(stageRoot, 'plugin.json');
    assert.ok(existsSync(pluginJsonPath), 'plugin.json must exist');
    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8'));
    assert.equal(pluginJson.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(pluginJson.name, 'evc');
    assert.equal(pluginJson.version, '1.0.0');
    assert.equal(pluginJson.rules, undefined);
    assert.equal(pluginJson.agents, undefined);
    assert.equal(pluginJson.skills, undefined);
    assert.equal(pluginJson.hooks, undefined);
    // 2. Verify bootstrap instructions
    const instructionsPath = join(stageRoot, 'com.github.copilot/rules/bootstrap.instructions.md');
    assert.ok(existsSync(instructionsPath), 'bootstrap.instructions.md must exist');
    const instructionsContent = readFileSync(instructionsPath, 'utf8');
    const instructionsParsed = parseFrontmatter(instructionsContent);
    assert.equal(instructionsParsed.fields.applyTo, '**');

    // 3. Verify key agents (immutable templates, no host-discovered static agents, no model key)
    assert.equal(existsSync(join(stageRoot, 'com.github.copilot/agents')), false, 'com.github.copilot/agents must not exist');

    // Git-manager: tools mapped, no task -> agents: [], model stripped, tier haiku in intent
    const gitPath = join(stageRoot, 'evcrate/agent-templates/evc-git-manager.md');
    assert.ok(existsSync(gitPath), 'evc-git-manager.md must exist in agent-templates');
    const gitParsed = parseFrontmatter(readFileSync(gitPath, 'utf8'));
    assert.equal(gitParsed.fields.name, 'evc-git-manager');
    assert.equal(gitParsed.fields.model, undefined, 'template must strip actionable model key');
    assert.deepEqual(
      [...(gitParsed.fields.tools || [])].sort(),
      ['read/readFile', 'runInTerminal', 'search/fileSearch', 'search/textSearch'].sort()
    );
    assert.deepEqual(gitParsed.fields.agents, []);

    // TodoWrite is mapped to frontmatter 'todo' while prose remains manage_todo_list
    const pmParsed = parseFrontmatter(readFileSync(join(stageRoot, 'evcrate/agent-templates/evc-project-manager.md'), 'utf8'));
    assert.ok(pmParsed.fields.tools.includes('todo'));
    assert.equal(pmParsed.fields.model, undefined, 'template must strip actionable model key');
    const cmdCodeContent = readFileSync(join(stageRoot, 'skills/cmd-code/SKILL.md'), 'utf8');
    assert.ok(cmdCodeContent.includes('manage_todo_list'));
    assert.ok(!cmdCodeContent.includes('TodoWrite'));

    // Code-reviewer: tools mapped, model stripped
    const reviewerPath = join(stageRoot, 'evcrate/agent-templates/evc-code-reviewer.md');
    assert.ok(existsSync(reviewerPath), 'evc-code-reviewer.md must exist in agent-templates');
    const reviewerParsed = parseFrontmatter(readFileSync(reviewerPath, 'utf8'));
    assert.equal(reviewerParsed.fields.name, 'evc-code-reviewer');
    assert.equal(reviewerParsed.fields.model, undefined, 'template must strip actionable model key');

    // Scout: search/read tools mapped, no edit capability, no task -> agents: [], model stripped
    const scoutPath = join(stageRoot, 'evcrate/agent-templates/evc-scout.md');
    assert.ok(existsSync(scoutPath), 'evc-scout.md must exist in agent-templates');
    const scoutParsed = parseFrontmatter(readFileSync(scoutPath, 'utf8'));
    assert.equal(scoutParsed.fields.name, 'evc-scout');
    assert.equal(scoutParsed.fields.model, undefined, 'template must strip actionable model key');
    assert.deepEqual(
      [...(scoutParsed.fields.tools || [])].sort(),
      ['getTerminalOutput', 'killTerminal', 'read/readFile', 'runInTerminal', 'search/fileSearch', 'search/textSearch', 'todo', 'web/fetch'].sort()
    );
    assert.deepEqual(scoutParsed.fields.agents, [], 'Scout must have agents: [] to prevent delegation');
    assert.ok(!scoutParsed.fields.tools.includes('editFiles'), 'Scout must not have editFiles');
    assert.ok(!scoutParsed.fields.tools.includes('createFile'), 'Scout must not have createFile');
    assert.ok(!scoutParsed.fields.tools.includes('multiReplaceString'), 'Scout must not have multiReplaceString');
    assert.ok(!scoutParsed.fields.tools.includes('agent/runSubagent'), 'Scout must not have agent/runSubagent');

    // Planner: tools omitted in source -> tools and agents omitted in frontmatter (intentional host capability inheritance, delegation permitted)
    const plannerPath = join(stageRoot, 'evcrate/agent-templates/evc-planner.md');
    assert.ok(existsSync(plannerPath), 'evc-planner.md must exist in agent-templates');
    const plannerAgentParsed = parseFrontmatter(readFileSync(plannerPath, 'utf8'));
    assert.equal(plannerAgentParsed.fields.name, 'evc-planner');
    assert.equal(plannerAgentParsed.fields.model, undefined, 'template must strip actionable model key');
    assert.equal(plannerAgentParsed.fields.tools, undefined, 'Planner must omit tools in frontmatter');
    assert.equal(plannerAgentParsed.fields.agents, undefined, 'Planner must not restrict agents: []');

    // Docs-manager: tools omitted in source -> tools and agents omitted in frontmatter (intentional host capability inheritance)
    const docsManagerPath = join(stageRoot, 'evcrate/agent-templates/evc-docs-manager.md');
    assert.ok(existsSync(docsManagerPath), 'evc-docs-manager.md must exist in agent-templates');
    const docsManagerParsed = parseFrontmatter(readFileSync(docsManagerPath, 'utf8'));
    assert.equal(docsManagerParsed.fields.name, 'evc-docs-manager');
    assert.equal(docsManagerParsed.fields.model, undefined, 'template must strip actionable model key');
    assert.equal(docsManagerParsed.fields.tools, undefined, 'Docs manager must omit tools in frontmatter');
    assert.equal(docsManagerParsed.fields.agents, undefined, 'Docs manager must omit agents in frontmatter');
    // 4. Verify commands (70)
    const croCommandPath = join(stageRoot, 'skills/cmd-plan-x-cro/SKILL.md');
    assert.ok(existsSync(croCommandPath), 'cmd-plan-x-cro/SKILL.md must exist');
    const croParsed = parseFrontmatter(readFileSync(croCommandPath, 'utf8'));
    assert.equal(croParsed.fields.name, 'cmd-plan-x-cro');
    assert.equal(croParsed.fields['user-invocable'], true);
    assert.equal(croParsed.fields['disable-model-invocation'], true);

    // 5. Verify skills (39)
    // Normalized lowercase claude-code/skill.md -> skills/claude-code/SKILL.md
    const claudeCodeSkill = join(stageRoot, 'skills/claude-code/SKILL.md');
    assert.ok(existsSync(claudeCodeSkill), 'skills/claude-code/SKILL.md must exist');

    // Flattened document-skills/docx -> skills/docx/SKILL.md
    const docxSkill = join(stageRoot, 'skills/docx/SKILL.md');
    assert.ok(existsSync(docxSkill), 'skills/docx/SKILL.md must exist');
    const docxParsed = parseFrontmatter(readFileSync(docxSkill, 'utf8'));
    assert.equal(docxParsed.fields.name, 'docx');

    // 6. Verify styles (6)
    const stylePath = join(stageRoot, 'skills/style-coding-level-3-senior/SKILL.md');
    assert.ok(existsSync(stylePath), 'style-coding-level-3-senior must exist');
    const styleParsed = parseFrontmatter(readFileSync(stylePath, 'utf8'));
    assert.equal(styleParsed.fields.name, 'style-coding-level-3-senior');
    assert.equal(styleParsed.fields['disable-model-invocation'], true);

    // 7. Verify workflows
    const workflowPath = join(stageRoot, 'evcrate/workflows/primary-workflow.md');
    assert.ok(existsSync(workflowPath), 'evcrate/workflows/primary-workflow.md must exist');

    // 8. Verify catalogs
    const commandsDataPath = join(stageRoot, 'evcrate/scripts/commands_data.yaml');
    assert.ok(existsSync(commandsDataPath), 'commands_data.yaml must exist');
    const commandsData = parseCatalogYaml(readFileSync(commandsDataPath, 'utf8'));
    assert.equal(commandsData.length, 69, 'All 69 commands must be in commands_data.yaml');
    const croCatalogItem = commandsData.find((c) => c.source === 'evc-cmd-plan-x-cro.md');
    assert.ok(croCatalogItem);
    assert.equal(croCatalogItem.name, '/evc:cmd-plan-x-cro');
    assert.equal(croCatalogItem.path, 'cmd-plan-x-cro/SKILL.md');

    const skillsDataPath = join(stageRoot, 'evcrate/scripts/skills_data.yaml');
    assert.ok(existsSync(skillsDataPath), 'skills_data.yaml must exist');
    const skillsData = parseCatalogYaml(readFileSync(skillsDataPath, 'utf8'));
    // Canonical skills_data.yaml has 37 skills; all 37 are mapped and projected
    assert.equal(skillsData.length, 37, 'All 37 catalog skills must be in skills_data.yaml');
    assert.equal(
      skillsData.some((s) => s.name === 'template-skill'),
      false,
      'template-skill must be excluded from catalog'
    );
    const docxCatalogItem = skillsData.find((s) => s.name === 'docx');
    assert.ok(docxCatalogItem);
    assert.equal(docxCatalogItem.path, 'docx/SKILL.md');
    // 9. Verify maps and inventory
    const commandMapPath = join(stageRoot, 'evcrate/command-name-map.json');
    assert.ok(existsSync(commandMapPath));
    const commandMapJson = JSON.parse(readFileSync(commandMapPath, 'utf8'));
    assert.equal(commandMapJson.commands.length, 69);
    assert.equal(commandMapJson.schema, 'evcrate-vscode-command-name-map-v1');
    assert.equal(commandMapJson.plugin_id, 'evc');
    for (const [canonicalName, semanticId, localName] of [
      ['evc-cmd-plan-x-cro', 'plan/cro', 'cmd-plan-x-cro'],
      ['evc-cmd-code-x-auto', 'code/auto', 'cmd-code-x-auto'],
      ['evc-cmd-ask', 'ask', 'cmd-ask']
    ]) {
      const entry = commandMapJson.commands.find((command) => command.localName === localName);
      assert.ok(entry);
      assert.deepEqual({
        source: entry.source,
        sourceName: entry.sourceName,
        sourceSemanticId: entry.sourceSemanticId,
        target: entry.target,
        localName: entry.localName,
        targetName: entry.targetName,
        nativeInvocationName: entry.nativeInvocationName
      }, {
        source: `${canonicalName}.md`,
        sourceName: semanticId,
        sourceSemanticId: semanticId,
        target: `skills/${localName}/SKILL.md`,
        localName: localName,
        targetName: localName,
        nativeInvocationName: `/evc:${localName}`
      });
    }

    const skillMapPath = join(stageRoot, 'evcrate/skill-map.json');
    assert.ok(existsSync(skillMapPath));
    const skillMapJson = JSON.parse(readFileSync(skillMapPath, 'utf8'));
    assert.equal(skillMapJson.skills.length, 39);

    const resourceMapPath = join(stageRoot, 'evcrate/resource-name-map.json');
    assert.ok(existsSync(resourceMapPath));
    const resourceMapJson = JSON.parse(readFileSync(resourceMapPath, 'utf8'));
    assert.ok(resourceMapJson.resources.length > 100);
    const directoryManifest = JSON.parse(readFileSync(join(stageRoot, 'evcrate/directory-manifest.json'), 'utf8'));
    const actualDirectories = ['skills', 'evcrate/skills'].flatMap((root) =>
      readdirSync(join(stageRoot, root), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${root}/${entry.name}`)
    ).sort();
    assert.equal(directoryManifest.total_skill_directories, actualDirectories.length);
    assert.equal(directoryManifest.total_archived_directories,
      actualDirectories.filter((directory) => directory.startsWith('evcrate/skills/')).length);
    assert.deepEqual(directoryManifest.directories.map((entry) => entry.destinationDirectory).sort(), actualDirectories);
    for (const entry of readdirSync(join(canonicalRoot, 'skills'), { withFileTypes: true })) {
      if (entry.isFile()) assert.equal(lstatSync(join(stageRoot, 'evcrate/skills', entry.name)).isFile(), true);
    }
    for (const entry of resourceMapJson.resources) {
      assert.equal(entry.localName.includes('evcrate-local:'), false);
      assert.equal(entry.targetName.includes('evcrate-local:'), false);
    }


    // 10. Verify Phase 05 configuration examples, guides, and dispositions
    const vscodeSettingsExamplePath = join(stageRoot, 'evcrate/examples/vscode-settings.example.json');
    assert.ok(existsSync(vscodeSettingsExamplePath));
    const vscodeSettingsExample = JSON.parse(readFileSync(vscodeSettingsExamplePath, 'utf8'));
    assert.equal(vscodeSettingsExample['chat.plugins.enabled'], true);
    assert.equal(vscodeSettingsExample['chat.useHooks'], true);
    assert.equal(typeof vscodeSettingsExample['chat.pluginLocations'], 'object');

    const mcpServersExamplePath = join(stageRoot, 'evcrate/examples/mcp-servers.example.json');
    assert.ok(existsSync(mcpServersExamplePath));
    const mcpServersExample = JSON.parse(readFileSync(mcpServersExamplePath, 'utf8'));
    assert.ok(mcpServersExample.servers.context7);
    assert.ok(mcpServersExample.servers['chrome-devtools']);
    assert.ok(mcpServersExample.servers['sequential-thinking']);
    assert.deepEqual(mcpServersExample.inputs, [
      {
        id: 'context7ApiKey',
        type: 'promptString',
        description: 'Context7 API Key (stored in secure credential store, never in project settings)',
        password: true
      }
    ]);

    const evcrateConfigExamplePath = join(stageRoot, 'evcrate/examples/evcrate-config.example.json');
    assert.ok(existsSync(evcrateConfigExamplePath));

    const activationGuidePath = join(stageRoot, 'evcrate/examples/activation-guide.md');
    assert.ok(existsSync(activationGuidePath));
    const activationGuideContent = readFileSync(activationGuidePath, 'utf8');
    assert.ok(activationGuideContent.includes('chat.pluginLocations'));
    assert.ok(activationGuideContent.includes('Workspace Trust'));

    const settingsDispositionPath = join(stageRoot, 'evcrate/settings-disposition.json');
    assert.ok(existsSync(settingsDispositionPath));
    const settingsDisposition = JSON.parse(readFileSync(settingsDispositionPath, 'utf8'));
    assert.equal(settingsDisposition.keys.hooks.disposition, 'mapped');
    assert.equal(settingsDisposition.keys.includeCoAuthoredBy.disposition, 'unsupported');
    assert.equal(settingsDisposition.keys['settings.local.json'].disposition, 'inactive');

    // Negative check: model-map.json must not exist
    assert.equal(existsSync(join(stageRoot, 'evcrate/model-map.json')), false, 'model-map.json must not exist');

    // Positive check: agent-intent.json (schema v1)
    const intentPath = join(stageRoot, 'evcrate/agent-intent.json');
    assert.ok(existsSync(intentPath), 'agent-intent.json must exist');
    const intentManifest = JSON.parse(readFileSync(intentPath, 'utf8'));
    assert.equal(intentManifest.schema, 'evcrate-vscode-agent-intent-v1');
    assert.equal(intentManifest.pluginName, 'evc');
    assert.equal(intentManifest.actors['evc-planner'].intent.mode, 'tier');
    assert.equal(intentManifest.actors['evc-planner'].intent.tier, 'opus');
    assert.equal(intentManifest.actors['evc-git-manager'].intent.tier, 'haiku');
    assert.equal(intentManifest.actors['evc-docs-manager'].intent.tier, 'haiku');
    assert.equal(intentManifest.actors['evc-ui-ux-designer'].intent.mode, 'inherit');
    assert.equal(intentManifest.actors['evc-planner'].templatePath, 'evcrate/agent-templates/evc-planner.md');

    // Positive check: agent-tool-audit.json (schema v2)
    const toolAuditPath = join(stageRoot, 'evcrate/agent-tool-audit.json');
    assert.ok(existsSync(toolAuditPath), 'agent-tool-audit.json must exist');
    const toolAudit = JSON.parse(readFileSync(toolAuditPath, 'utf8'));
    assert.equal(toolAudit.schema, 'evcrate-vscode-agent-tool-audit-v2');
    assert.equal(toolAudit.agents['evc-planner'].modelIntent.tier, 'opus');
    assert.equal(toolAudit.agents['evc-planner'].modelIntent.disposition, 'tier-required');
    assert.equal(toolAudit.agents['evc-planner'].target, 'evcrate/agent-templates/evc-planner.md');
    assert.equal(toolAudit.agents['evc-ui-ux-designer'].modelIntent.tier, null);
    assert.equal(toolAudit.agents['evc-ui-ux-designer'].modelIntent.disposition, 'inherit');

    // 11. Verify canonical command delivery.
    const cmdAskPath = join(stageRoot, 'skills/cmd-ask/SKILL.md');
    assert.ok(existsSync(cmdAskPath));

    // 12. Verify workflow fallback in staged instructions, agents, and skills
    assert.ok(instructionsContent.includes('`./.evcrate-vscode/evcrate/workflows/primary-workflow.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/primary-workflow.md` (the published install)'));
    assert.ok(instructionsContent.includes('`./.evcrate-vscode/evcrate/workflows/development-rules.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/development-rules.md` (the published install)'));
    assert.ok(instructionsContent.includes('`./.evcrate-vscode/evcrate/workflows/orchestration-protocol.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/orchestration-protocol.md` (the published install)'));
    assert.ok(instructionsContent.includes('`./.evcrate-vscode/evcrate/workflows/documentation-management.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/documentation-management.md` (the published install)'));
    assert.equal(instructionsContent.includes('./docs/development-rules.md'), false);

    const plannerAgentContent = readFileSync(join(stageRoot, 'evcrate/agent-templates/evc-planner.md'), 'utf8');
    assert.equal(parseFrontmatter(plannerAgentContent).fields.name, 'evc-planner');
    assert.equal(plannerAgentContent.includes('./docs/development-rules.md'), false);
    assert.ok(plannerAgentContent.includes('.evcrate-vscode/evcrate/workflows/development-rules.md'));
    assert.ok(plannerAgentContent.includes('if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/development-rules.md` (the published install)'));

    const uiUxDesignerContent = readFileSync(join(stageRoot, 'evcrate/agent-templates/evc-ui-ux-designer.md'), 'utf8');
    assert.equal(uiUxDesignerContent.includes('./docs/development-rules.md'), false);
    assert.ok(uiUxDesignerContent.includes('.evcrate-vscode/evcrate/workflows/development-rules.md'));

    const planningSkillContent = readFileSync(join(stageRoot, 'skills/planning/SKILL.md'), 'utf8');
    assert.equal(planningSkillContent.includes('./docs/development-rules.md'), false);
    assert.ok(planningSkillContent.includes('.evcrate-vscode/evcrate/workflows/development-rules.md'));

    const docMgmtContent = readFileSync(join(stageRoot, 'evcrate/workflows/documentation-management.md'), 'utf8');
    assert.equal(docMgmtContent.includes('./docs/development-rules.md'), false);
    assert.ok(docMgmtContent.includes('.evcrate-vscode/evcrate/workflows/development-rules.md'));

  } finally {
    stage.cleanup();
  }
});

test('vscode-inventory: archived directory counts exclude preserved loose support files', () => {
  const stage = createStagedRoot(repository, '.vscode-inventory-test-stage-');
  try {
    const supportFiles = [
      ['archive-a/readme.txt', 'first archive\n'],
      ['archive-b/tool.txt', 'second archive\n'],
      ['README.md', 'loose documentation\n'],
      ['build.sh', 'loose support script\n']
    ];
    const fixtureRoot = join(stage.path, 'source');
    const writeFixture = (root, name, text) => {
      const destination = join(root, name);
      mkdirSync(join(destination, '..'), { recursive: true });
      writeFileSync(destination, text);
    };
    for (const [name, text] of supportFiles) writeFixture(fixtureRoot, `skills/${name}`, text);
    const context = createProjectionBuildContext(registry.targets.get('vscode'), fixtureRoot, stage);
    const stageRoot = context.stagePath('.evcrate-vscode');
    writeFixture(stageRoot, 'com.github.copilot/rules/bootstrap.instructions.md', 'Bootstrap\n');
    for (const [name, text] of supportFiles) writeFixture(stageRoot, `evcrate/skills/${name}`, text);
    buildVscodeInventory(context, {}, {
      skills: [],
      audit: [],
      archived: ['archive-a', 'archive-b', 'README.md', 'build.sh']
    }, {}, {}, {}, {});
    const directoryManifest = JSON.parse(readFileSync(join(stageRoot, 'evcrate/directory-manifest.json'), 'utf8'));
    const emittedInventory = JSON.parse(readFileSync(join(stageRoot, 'evcrate/projection-inventory.json'), 'utf8'));
    assert.equal(emittedInventory.summary.archived_directories_count, 2);
    assert.equal(directoryManifest.total_archived_directories, 2);
    assert.deepEqual(directoryManifest.directories.map((entry) => entry.destinationDirectory),
      ['evcrate/skills/archive-a', 'evcrate/skills/archive-b']);
    for (const [name, text] of supportFiles.slice(2)) {
      const archivedFile = join(stageRoot, 'evcrate/skills', name);
      assert.equal(lstatSync(archivedFile).isFile(), true);
      assert.equal(readFileSync(archivedFile, 'utf8'), text);
    }
  } finally {
    stage.cleanup();
  }
});

function namingContext(entries) {
  return {
    resources: {
      files: entries.map(([path, text = '']) => ({ path, bytes: new TextEncoder().encode(text) }))
    }
  };
}

test('vscode-names: rejects noncanonical command paths, invalid names, and duplicates', () => {
  for (const path of [
    'commands/plan/cro.md',
    'commands/cmd-plan-cro.md',
    'commands/evc-cmd-Plan.md',
    `commands/evc-cmd-${'a'.repeat(57)}.md`
  ]) {
    assert.throws(() => discoverVscodeCommands(namingContext([[path]])), { code: 'VALIDATION_INVALID' });
  }
  assert.throws(() => discoverVscodeCommands(namingContext([
    ['commands/evc-cmd-plan.md'], ['commands/evc-cmd-plan.md']
  ])), { code: 'VALIDATION_INVALID' });
});

test('vscode-names: agent metadata must match its canonical basename', () => {
  const valid = ['agents/evc-planner.md', '---\nname: evc-planner\ndescription: Planning\n---\n'];
  const agent = discoverVscodeAgents(namingContext([valid]))['evc-planner'];
  assert.equal(agent.target, 'evcrate/agent-templates/evc-planner.md');
  assert.equal(agent.disposition, 'immutable-template');
  assert.equal(agent.sourceSemanticId, 'evc-planner');
  for (const entry of [
    ['agents/planner.md', '---\nname: planner\n---\n'],
    ['agents/evc-planner.md', '---\nname: evc-tester\n---\n'],
    ['agents/evc-planner.md', '---\ndescription: Planning\n---\n'],
    [`agents/evc-${'a'.repeat(61)}.md`, `---\nname: evc-${'a'.repeat(61)}\n---\n`]
  ]) {
    assert.throws(() => discoverVscodeAgents(namingContext([entry])), { code: 'VALIDATION_INVALID' });
  }
  assert.throws(() => discoverVscodeAgents(namingContext([valid, valid])), { code: 'VALIDATION_INVALID' });
});

test('vscode-names: shared skill directories reject command and style collisions', () => {
  for (const entries of [
    [['commands/evc-cmd-plan.md'], ['skills/cmd-plan/SKILL.md']],
    [['output-styles/concise.md'], ['skills/style-concise/SKILL.md']],
    [['skills/docx/SKILL.md'], ['skills/document-skills/docx/SKILL.md']]
  ]) {
    assert.throws(() => discoverAllVscodeNames(namingContext(entries)), { code: 'VALIDATION_INVALID' });
  }
  const names = discoverAllVscodeNames(namingContext([
    ['commands/evc-cmd-plan-x-cro.md'],
    ['skills/planning/SKILL.md'],
    ['output-styles/concise.md'],
    ['agents/evc-planner.md', '---\nname: evc-planner\n---\n']
  ]));
  assert.deepEqual(names.skillDirectoryNames, ['cmd-plan-x-cro', 'planning', 'style-concise']);
});

test('vscode-agents: convertVscodeAgents rejects invalid canonical models and preserves custom metadata', () => {
  const stage = createStagedRoot(repository, '.vscode-agents-test-stage-');
  const tempSrcStage = createStagedRoot(repository, '.vscode-agents-src-stage-');
  try {
    const targetManifest = registry.targets.get('vscode');
    const agentsDir = join(tempSrcStage.path, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const agentMap = {
      'evc-test-agent': {
        source: 'evc-test-agent.md',
        sourceSemanticId: 'evc-test-agent',
        target: 'evcrate/agent-templates/evc-test-agent.md',
        localName: 'evc-test-agent',
        targetName: 'evc-test-agent',
        disposition: 'immutable-template'
      }
    };

    const makeContext = (content) => {
      writeFileSync(join(agentsDir, 'evc-test-agent.md'), content);
      return createProjectionBuildContext(targetManifest, tempSrcStage.path, stage);
    };

    // 1. Invalid concrete model rejects
    assert.throws(() => {
      convertVscodeAgents(makeContext('---\nname: evc-test-agent\ndescription: Test\nmodel: claude-3-opus\n---\nBody\n'), agentMap, {}, []);
    }, { code: 'VALIDATION_INVALID' });

    // 2. Wrong case alias rejects
    assert.throws(() => {
      convertVscodeAgents(makeContext('---\nname: evc-test-agent\ndescription: Test\nmodel: Opus\n---\nBody\n'), agentMap, {}, []);
    }, { code: 'VALIDATION_INVALID' });

    // 3. Non-string model rejects
    assert.throws(() => {
      convertVscodeAgents(makeContext('---\nname: evc-test-agent\ndescription: Test\nmodel: 12345\n---\nBody\n'), agentMap, {}, []);
    }, { code: 'VALIDATION_INVALID' });

    // 4. Valid agent with skills, non-bypass permissionMode, disable-model-invocation: false, and tools: none converts cleanly
    const validContent = `---
name: evc-test-agent
description: Test Leaf
model: sonnet
disable-model-invocation: false
skills:
  - snyk-scan
permissionMode: dont-ask
tools: none
---

# Test Body
`;
    const audits = convertVscodeAgents(makeContext(validContent), agentMap, {}, []);
    assert.equal(audits['evc-test-agent'].modelIntent.tier, 'sonnet');
    assert.equal(audits['evc-test-agent'].modelIntent.disposition, 'tier-required');
    assert.deepEqual(audits['evc-test-agent'].tools.mapped, []);
    assert.equal(audits['evc-test-agent'].tools.explicitNone, true);
    assert.equal(audits['evc-test-agent'].delegation.allowed, false);

    const emitted = readFileSync(join(stage.path, '.evcrate-vscode/evcrate/agent-templates/evc-test-agent.md'), 'utf8');
    const parsed = parseFrontmatter(emitted);
    assert.equal(parsed.fields.model, undefined, 'model must be stripped from template');
    assert.deepEqual(parsed.fields.skills, ['snyk-scan']);
    assert.equal(parsed.fields.permissionMode, 'dont-ask');
    assert.equal(parsed.fields['disable-model-invocation'], false, 'disable-model-invocation: false must be preserved');
    assert.deepEqual(parsed.fields.tools, []);
    assert.deepEqual(parsed.fields.agents, []);

    // Exact hash coherence: emitted bytes sha256 must match audit and intent records
    const expectedHash = createHash('sha256').update(emitted, 'utf8').digest('hex');
    assert.equal(audits['evc-test-agent'].templateSha256, expectedHash);

    const intentRaw = readFileSync(join(stage.path, '.evcrate-vscode/evcrate/agent-intent.json'), 'utf8');
    const intentData = JSON.parse(intentRaw);
    assert.equal(intentData.actors['evc-test-agent'].templateSha256, expectedHash);
  } finally {
    stage.cleanup();
    tempSrcStage.cleanup();
  }
});

