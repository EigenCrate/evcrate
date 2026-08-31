import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, fieldString, parseFrontmatter, sourcePath, invalid, writeJson, copyText, decode } from './common.js';
import type { SimpleMap } from './prompts.js';
import { yamlValue } from './prompts.js';
function serializeAgent(name: string, description: string, tools: string[], body: string): string {
  const lines = ['---', `name: ${yamlValue(name)}`, `description: ${yamlValue(description)}`];
  if (tools.length) lines.push(`tools: [${tools.join(', ')}]`);
  lines.push('---', '', body.replace(/\r\n?/gu, '\n').replace(/\n+$/u, ''), '');
  return lines.join('\n');
}
const TOOL_MAP: Record<string, string> = { bash: 'shell', read: 'read', write: 'edit', edit: 'edit', grep: 'search', glob: 'search', task: 'agent', webfetch: 'web', websearch: 'web', todowrite: 'todo' };
export interface AgentAudit { source: string; target: string; model: { source?: string; target: null; reason: string }; tools: { mapped: string[]; dropped: string[] }; droppedFields: string[] }
function sourceTools(value: string): string[] { return value.replace(/^\[/u, '').replace(/\]$/u, '').split(/[,\n]/u).map((item) => item.trim().replace(/^['"]|['"]$/gu, '').replace(/^- /u, '')).filter(Boolean); }
function mapTools(value: string): { mapped: string[]; dropped: string[] } {
  const mapped: string[] = []; const dropped: string[] = [];
  for (const item of sourceTools(value)) { const target = TOOL_MAP[item.toLowerCase()]; if (!target) dropped.push(item); else if (!mapped.includes(target)) mapped.push(target); }
  return { mapped, dropped };
}
export function discoverAgents(context: ProjectionBuildContext): SimpleMap {
  const result: Record<string, string> = {}; const used = new Set<string>();
  for (const file of filesUnder(context, 'agents').filter((item) => item.path.endsWith('.md'))) {
    const parsed = parseFrontmatter(decode(file.bytes));
    const name = fieldString(parsed.fields, 'name').trim();
    const description = fieldString(parsed.fields, 'description').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) || name.length > 64 || !description) invalid();
    const target = `evcrate-${name}`; if (target.length > 64 || used.has(target.toLowerCase())) invalid(); used.add(target.toLowerCase()); result[name.toLowerCase()] = target;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
export function convertAgents(context: ProjectionBuildContext, map: SimpleMap, transform: (value: string) => string): Record<string, AgentAudit> {
  const audit: Record<string, AgentAudit> = {};
  for (const file of filesUnder(context, 'agents').filter((item) => item.path.endsWith('.md'))) {
    const parsed = parseFrontmatter(decode(file.bytes));
    const sourceName = fieldString(parsed.fields, 'name').trim();
    const targetName = map[sourceName.toLowerCase()];
    if (!targetName) invalid();
    const tools = mapTools(fieldString(parsed.fields, 'tools'));
    const body = transform(parsed.body);
    if (sourceName === 'advisor' && (!body.includes('## Required checkpoint method') || !body.includes('## Checkpoint terminal report'))) invalid();
    const description = transform(fieldString(parsed.fields, 'description').trim()).trim(); if (!description) invalid();
    copyText(context, file.path, `agents/${targetName}.agent.md`, () => serializeAgent(targetName, description, tools.mapped, body));
    const droppedFields = Object.keys(parsed.fields).filter((key) => !['name', 'description', 'tools', 'model'].includes(key)); if (parsed.fields.model) droppedFields.push('model');
    audit[sourceName] = { source: sourcePath('agents', file), target: `agents/${targetName}.agent.md`, model: { source: parsed.fields.model, target: null, reason: 'Copilot inherits the active model' }, tools: { mapped: tools.mapped, dropped: tools.dropped.sort() }, droppedFields: [...new Set(droppedFields)].sort() };
  }
  writeJson(context, 'evcrate/agent-tool-audit.json', { schema: 'evcrate-copilot-agent-tool-audit-v1', agents: audit }); return audit;
}
