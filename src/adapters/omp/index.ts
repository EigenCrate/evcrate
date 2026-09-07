import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from '../types.js';
import { validateProjection } from '../projection-utils.js';
import { copy, filesUnder, json, prepareOutput, productionFiles, writeJson } from './resources.js';
import { buildCommandMap, convertCommands, convertWorkflows, translatePrompt } from './commands.js';
import { convertAgents } from './agents.js';
import { convertSkills } from './skills.js';
import { convertHooksAndScripts } from './hooks.js';
import { projectCatalogDataAndLayout } from '../catalog-data.js';

const THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function assertManifest(context: ProjectionBuildContext): void {
  if (context.manifest.id !== 'omp' || context.manifest.sharedJson !== null) invalid();
  if (context.manifest.outputRoots.length !== 1 || context.manifest.outputRoots[0] !== '.omp') invalid();
}
function build(context: ProjectionBuildContext): void {
  assertManifest(context);
  const settings = json(context, 'settings.json');
  const effort = settings.effortLevel;
  if (effort !== undefined && (typeof effort !== 'string' || !THINKING_LEVELS.has(effort))) invalid();
  prepareOutput(context);
  const map = buildCommandMap(context);
  convertCommands(context, map);
  const agents = convertAgents(context, map, typeof effort === 'string' ? effort : null);
  const skills = convertSkills(context, map);
  const workflows = convertWorkflows(context, map);
  const staticResources = convertHooksAndScripts(context, map);
  projectCatalogDataAndLayout(context, {
    target: 'omp',
    scriptDirectory: '.omp/evcrate/scripts',
    commands: {
      format: 'markdown',
      root: '../../commands',
      authorityPath: '../command-name-map.json',
      mapRecord(cmd) {
        const item = Object.values(map).find((c) => c.source === cmd.source);
        if (!item) throw new ControlPlaneError('VALIDATION_INVALID');
        const srcParts = item.sourceName.split(':');
        const category = srcParts.length > 1 ? srcParts[0] : 'core';
        return {
          name: '/' + item.targetName,
          path: item.target,
          category
        };
      }
    },
    skills: {
      root: '../../skills',
      authorityPath: '../skill-map.json',
      mapRecord(skill) {
        const nativeItem = (skills.native as { source: string; target: string; files: string[] }[]).find(
          (n) => n.source === skill.name || n.source === skill.source.replace(/\/SKILL\.md$/, '')
        );
        if (!nativeItem) return null;
        return {
          name: nativeItem.target,
          path: `${nativeItem.target}/SKILL.md`
        };
      }
    }
  });
  const outputStyles: string[] = [];
  for (const entry of productionFiles(context, 'output-styles')) {
    const rel = entry.path.slice('output-styles/'.length);
    if (!rel) continue;
    copy(context, entry.path, `evcrate/output-styles/${rel}`, (value) => translatePrompt(value, map));
    outputStyles.push(rel);
  }
  writeJson(context, 'evcrate/inventory.json', {
    schema: 'evcrate-omp-migration-v1', source: '.evcrate/source/.claude', target: '.omp',
    native: { agents: Object.keys(agents).sort(), commands: Object.keys(map).length, skills: skills.native.length },
    skillRuntime: { projectRoot: '.omp/skills', homeRoot: '~/.omp/agent/skills', noSkills: 'OMP --no-skills disables skill discovery and loading; workflows must read required SKILL.md files directly or use the archived .omp/evcrate/skills packages.' },
    managedStatic: { workflows, scripts: staticResources.scripts, sourceHooks: staticResources.hooks, outputStyles: outputStyles.sort(), archivedSkills: skills.archived },
    modelAliases: { opus: '@slow', sonnet: '@default', haiku: '@smol', inherit: 'omitted' },
    limitations: { advisorController: 'Uses shared ~/.evcrate/bin/evcrate-advisor; OMP is an enabled backend candidate qualified by the central controller.', subagentStart: 'OMP has no direct Claude agent_type/agent_id hook payload', settingsLocal: 'not activated; source settings.local.json is retained only by the canonical source' },
  });
}
function validate(context: ProjectionBuildContext): ProjectionValidation { assertManifest(context); return validateProjection(context); }
export const ompAdapter: ProjectionAdapter = Object.freeze({
  id: 'omp',
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
