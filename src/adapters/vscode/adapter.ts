import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from '../types.js';
import { validateProjection } from '../projection-utils.js';
import { writeJson, writeText, decodeUtf8 } from './common.js';
import {
  renderRegistrationExamples,
  renderMcpExamples,
  renderEvcrateConfigExample,
  renderActivationGuide,
  classifySourceSettings
} from './configuration.js';
import { buildVscodeModelMap } from './metadata.js';
import { discoverAllVscodeNames } from './names.js';
import { generateVscodeInstructions } from './instructions.js';
import { convertVscodeWorkflows } from './workflows.js';
import { convertVscodeCommands } from './commands.js';
import { convertVscodeStyles } from './styles.js';
import { convertVscodeSkills } from './skills.js';
import { convertVscodeAgents } from './agents.js';
import { projectVscodeCatalogs } from './catalogs.js';
import { buildVscodeInventory } from './inventory.js';
import { convertVscodeHooks } from './hooks.js';

function assertManifest(context: ProjectionBuildContext): void {
  if (
    context.manifest.id !== 'vscode'
    || context.manifest.outputRoots.length !== 1
    || context.manifest.outputRoots[0] !== '.evcrate-vscode'
  ) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}

function build(context: ProjectionBuildContext): void {
  assertManifest(context);

  const discovered = discoverAllVscodeNames(context);

  // 1. Workflows
  convertVscodeWorkflows(context, discovered.commands, discovered.skills);

  // 2. Commands (manual skills)
  convertVscodeCommands(context, discovered.commands, discovered.skills);

  // 3. Styles (manual skills)
  convertVscodeStyles(context, discovered.styles, discovered.commands, discovered.skills);

  // 4. Skills (native skills + archived support)
  const skillsResult = convertVscodeSkills(
    context,
    discovered.skills,
    discovered.archivedSkills,
    discovered.commands
  );

  // 5. Agents
  const agentAudits = convertVscodeAgents(
    context,
    discovered.agents,
    discovered.commands,
    discovered.skills
  );

  // 6. Instructions (bootstrap rule)
  generateVscodeInstructions(context, discovered.commands, discovered.skills);

  // 7. Catalogs and scanner layout
  projectVscodeCatalogs(context, discovered.commands, discovered.skills);

  // 8. Hooks (Agent Plugins 1.0 native hooks and runtime bridge)
  const hookAudit = convertVscodeHooks(context);

  // 9. Plugin descriptor (plugin.json)
  const pluginDescriptor = {
    name: 'evcrate-local',
    version: '1.0.0',
    description: 'EVCrate VS Code Local Plugin Bundle',
    rules: [
      'com.github.copilot/rules/bootstrap.instructions.md'
    ],
    agents: Object.values(discovered.agents)
      .map((a) => a.target)
      .sort(),
    skills: [...discovered.skillDirectoryNames]
      .map((dir) => `skills/${dir}`)
      .sort(),
    hooks: 'com.github.copilot/hooks/hooks.json'
  };
  writeJson(context, 'plugin.json', pluginDescriptor);

  // 10. Inventory and name maps
  buildVscodeInventory(
    context,
    discovered.commands,
    skillsResult,
    discovered.agents,
    agentAudits,
    discovered.styles,
    discovered.workflows,
    hookAudit
  );

  // 11. Configuration examples and dispositions
  const registrationExamples = renderRegistrationExamples();
  writeJson(context, 'evcrate/examples/vscode-settings.example.json', registrationExamples.vscodeSettings);

  const mcpExamples = renderMcpExamples();
  writeJson(context, 'evcrate/examples/mcp-servers.example.json', mcpExamples.mcpServersExample);

  const evcrateConfigExample = renderEvcrateConfigExample();
  writeJson(context, 'evcrate/examples/evcrate-config.example.json', evcrateConfigExample.configExample);

  writeText(context, 'evcrate/examples/activation-guide.md', renderActivationGuide());

  let sourceSettings: Record<string, unknown> = {};
  const settingsFile = context.resources.files.find((file) => file.path === 'settings.json');
  if (settingsFile) {
    try {
      sourceSettings = JSON.parse(decodeUtf8(settingsFile.bytes));
    } catch {
      // Default to empty object
    }
  }
  const settingsDisposition = classifySourceSettings(sourceSettings);
  writeJson(context, 'evcrate/settings-disposition.json', settingsDisposition);

  const modelMap = buildVscodeModelMap();
  writeJson(context, 'evcrate/model-map.json', modelMap);
}

function validate(context: ProjectionBuildContext): ProjectionValidation {
  assertManifest(context);
  return validateProjection(context);
}

export const vscodeAdapter: ProjectionAdapter = Object.freeze({
  id: 'vscode',
  compatibility: {
    skill: { status: 'needsAdapter' },
    agent: { status: 'needsAdapter' },
    workflow: { status: 'needsAdapter' },
    command: { status: 'needsAdapter' },
    hook: { status: 'needsAdapter' }
  } as const,
  build,
  validate
});
