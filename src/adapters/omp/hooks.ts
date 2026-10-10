import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { copy, filesUnder, json, productionFiles, relativeTo, writeJson, writeText } from './resources.js';
import { translateHarnessReferences } from './commands.js';
import { OMP_POLICY_MODULE, OMP_POST_MODULE, OMP_PRE_MODULE, OMP_RUNTIME_HELPER } from './templates.js';

function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function scriptTransform(value: string, relative: string): string {
  let rendered = translateHarnessReferences(value);
  if (relative === 'worktree.cjs') {
    rendered = rendered
      .replaceAll('claude', 'omp')
      .replaceAll('AskUserQuestion', 'ask the user');
  }
  return rendered;
}
export function convertHooksAndScripts(context: ProjectionBuildContext): { hooks: string[]; scripts: string[]; modules: string[] } {
  const hooks: string[] = []; const scripts: string[] = [];
  for (const entry of productionFiles(context, 'hooks')) { const rel = relativeTo(entry.path, 'hooks'); if (!rel) continue; copy(context, entry.path, `evcrate/hooks/${rel}`, translateHarnessReferences); hooks.push(rel); }
  for (const entry of productionFiles(context, 'scripts')) { const rel = relativeTo(entry.path, 'scripts'); if (!rel || rel.includes('advise-state') || rel === 'commands_data.yaml' || rel === 'skills_data.yaml') continue; copy(context, entry.path, `evcrate/scripts/${rel}`, (value) => scriptTransform(value, rel)); scripts.push(rel); }
  scripts.push('commands_data.yaml', 'skills_data.yaml', 'scanner-layout.json');
  copy(context, '.evcrateignore', 'evcrate/.evcrateignore'); copy(context, '.evcrate.json', '.evcrate.json'); copy(context, '.evcrateignore', '.evcrateignore');
  for (const [source, target] of [['settings.json', 'claude-settings.json'], ['.mcp.json.example', '.mcp.json.example'] as const]) if (filesUnder(context, source).length) copy(context, source, `evcrate/source-metadata/${target}`, translateHarnessReferences);
  for (const entry of context.resources.files.filter((item) => item.path.startsWith('statusline.') && !item.path.includes('/'))) copy(context, entry.path, `evcrate/source-metadata/statusline/${entry.path}`, translateHarnessReferences);
  writeText(context, 'evcrate/omp-hook-runtime.ts', OMP_RUNTIME_HELPER);
  const generated: Record<string, string> = { 'hooks/pre/evcrate-context.ts': OMP_PRE_MODULE, 'hooks/pre/evcrate-policy.ts': OMP_POLICY_MODULE, 'hooks/post/evcrate-results.ts': OMP_POST_MODULE };
  for (const [path, value] of Object.entries(generated)) writeText(context, path, value);
  const settings = json(context, 'settings.json'); const events = settings.hooks;
  if (events === null || typeof events !== 'object' || Array.isArray(events)) invalid();
  const eventMap: Record<string, unknown> = {};
  for (const [event, entries] of Object.entries(events as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Array.isArray(entries)) invalid();
    const targets: Record<string, string[]> = { SessionStart: ['session_start', 'before_agent_start'], UserPromptSubmit: ['before_agent_start'], PreToolUse: ['tool_call'], PostToolUse: ['tool_result'], PreCompact: ['session_before_compact'], SessionEnd: ['session_shutdown'], SubagentStart: [] };
    eventMap[event] = { targetEvents: targets[event] ?? [], status: targets[event] ? (event === 'SubagentStart' ? 'limited' : 'migrated') : 'unsupported', sourceEntries: entries.length };
  }
  writeJson(context, 'evcrate/hook-map.json', { schema: 'evcrate-omp-hook-map-v1', events: eventMap, activeModules: Object.keys(generated).sort(), subagentStart: 'OMP has no direct agent_type/agent_id hook payload; generic context is handled by before_agent_start.' });
  return { hooks, scripts, modules: Object.keys(generated).sort() };
}
