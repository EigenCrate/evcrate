import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from '../types.js';
import { validateProjection } from '../projection-utils.js';
import { buildCommandMap, convertCommands, convertWorkflows } from './commands.js';
import { convertAgents, discoverAgents } from './agents.js';
import { convertSkills, discoverSkills } from './skills.js';
import { convertStyles } from './styles.js';
import { convertHooks } from './hooks.js';
import { convertSupport } from './support.js';
import { generateInstructions } from './instructions.js';
import { buildInventory } from './inventory.js';
import { translatePrompt } from './prompts.js';
function assertManifest(context: ProjectionBuildContext): void {
  const shared = context.manifest.sharedJson;
  if (context.manifest.id !== 'copilot' || context.manifest.outputRoots.length !== 1
    || context.manifest.outputRoots[0] !== '.copilot' || shared === null
    || shared.schema !== 'managed-json-v1' || shared.destination !== 'settings.json'
    || shared.fragment !== 'evcrate/managed-settings.json'
    || shared.managedKeys.length !== 3
    || new Set(shared.managedKeys).size !== 3
    || !['includeCoAuthoredBy', 'effortLevel', 'statusLine'].every((key) => shared.managedKeys.includes(key))) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}

function build(context: ProjectionBuildContext): void {
  assertManifest(context);
  const commandMap = buildCommandMap(context);
  const agentMap = discoverAgents(context);
  const skillDiscovery = discoverSkills(context);
  const transform = (value: string): string => translatePrompt(value, commandMap, agentMap, skillDiscovery.names);
  const workflows = convertWorkflows(context, transform);
  convertCommands(context, commandMap, transform, workflows);
  const styles = convertStyles(context, transform);
  const skills = convertSkills(context, skillDiscovery, transform);
  const agents = convertAgents(context, agentMap, transform);
  const hooks = convertHooks(context, transform);
  const support = convertSupport(context, transform);
  generateInstructions(context, transform);
  buildInventory(context, commandMap, skills, agents, hooks, styles, workflows, support);
}
function validate(context: ProjectionBuildContext): ProjectionValidation { assertManifest(context); return validateProjection(context); }
export const copilotAdapter: ProjectionAdapter = Object.freeze({
  id: 'copilot',
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
