import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { graphFile, writeProjectionFile } from '../projection-utils.js';
import type { ProjectionBuildContext } from '../types.js';
import { serializeFrontmatter, splitFrontmatter } from './frontmatter.js';
import { translatePrompt } from './transforms.js';
import { writeJson } from './resources.js';

const MODEL_ROLES: Record<string, string> = { opus: 'strong', sonnet: 'standard', haiku: 'fast', inherit: 'parent' };
const TOOL_MAP: Record<string, string> = {
  glob: 'find', grep: 'grep', read: 'read', edit: 'edit', multiedit: 'edit', write: 'write', bash: 'bash', ls: 'ls', task: 'evcrate_subagent', askuserquestion: 'ask_user_question'
};
const MODEL_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\bopus\b/giu, 'strong'], [/\bsonnet\b/giu, 'standard'], [/\bhaiku\b/giu, 'fast'],
  [/\bclaude-[a-z0-9._-]+\b/giu, 'active-provider model'], [/\bgpt-[a-z0-9._-]+\b/giu, 'active-provider model']
];
function neutralize(value: string): string { for (const [pattern, replacement] of MODEL_REPLACEMENTS) value = value.replace(pattern, replacement); return value; }
function sourceTools(value: string): string[] { return value.split(/[,\n]/u).map((item) => item.trim().replace(/^-\s*/u, '').trim()).filter(Boolean); }

function convertTools(value: string): { mapped: string[]; dropped: string[] } {
  const mapped: string[] = []; const dropped: string[] = [];
  for (const source of sourceTools(value)) {
    const target = TOOL_MAP[source.toLowerCase()];
    if (!target) dropped.push(source); else if (!mapped.includes(target)) mapped.push(target);
  }
  return { mapped, dropped };
}

export function convertAgents(context: ProjectionBuildContext, commands: readonly string[]): void {
  const paths = context.resources.files.filter((file) => file.path.startsWith('agents/') && file.path.endsWith('.md') && !file.path.slice('agents/'.length).includes('/')).map((file) => file.path).sort();
  const roles: Record<string, Record<string, string>> = {}; const audit: Record<string, Record<string, string[]>> = {}; const seen = new Set<string>();
  for (const path of paths) {
    const parsed = splitFrontmatter(new TextDecoder('utf-8', { fatal: true }).decode(graphFile(context, path).bytes));
    const name = parsed.fields.name ?? ''; if (!name || seen.has(name)) throw new ControlPlaneError('VALIDATION_INVALID'); seen.add(name);
    const model = (parsed.fields.model ?? '').toLowerCase() || 'standard'; const role = MODEL_ROLES[model] ?? (model === 'standard' ? model : undefined);
    if (!role) throw new ControlPlaneError('VALIDATION_INVALID');
    const tools = convertTools(parsed.fields.tools ?? '');
    let description = neutralize(translatePrompt(parsed.fields.description ?? '', commands)); let body = neutralize(translatePrompt(parsed.body, commands));
    if (name === 'advisor') {
      description = 'Use this high-tier mentor for fresh named checkpoints; Pi rejects interview relay.';
      if (!body.includes('## Required checkpoint method') || !body.includes('## Checkpoint terminal report')) throw new ControlPlaneError('VALIDATION_INVALID');
    }
    const fields: Record<string, string> = { name, description }; if (tools.mapped.length) fields.tools = tools.mapped.join(', ');
    writeProjectionFile(context, `.pi/agent/agents/${path.slice('agents/'.length)}`, new TextEncoder().encode(serializeFrontmatter(fields, body)));
    roles[name] = { role, source: 'canonical-agent-frontmatter' }; audit[name] = { dropped: tools.dropped.sort(), mapped: tools.mapped };
  }
  writeJson(context, '.pi/agent/evcrate/model-roles.json', { agents: roles, schema: 'evcrate-model-roles-v1' });
  writeJson(context, '.pi/agent/evcrate/agent-tool-audit.json', { agents: audit, schema: 'evcrate-agent-tool-audit-v1' });
}

