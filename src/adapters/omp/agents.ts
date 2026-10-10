import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, writeJson, writeText } from './resources.js';
import { splitFrontmatter } from './frontmatter.js';
import { translatePrompt } from './commands.js';
import { assertAgentName } from '../resource-naming.js';

const MODEL_MAP: Record<string, string> = { opus: '@slow', sonnet: '@default', haiku: '@smol' };
const TOOL_MAP: Record<string, string> = { read: 'read', glob: 'glob', grep: 'grep', bash: 'bash', edit: 'edit', multiedit: 'edit', write: 'write', ls: 'glob', notebookedit: 'edit', webfetch: 'read', websearch: 'web_search', todowrite: 'todo' };
function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function tools(value: string): string[] {
  const raw = value.trim().replace(/^\[/u, '').replace(/\]$/u, '');
  return raw.split(',').map((item) => item.trim().replace(/^[-"']/u, '').replace(/["']$/u, '').trim()).filter(Boolean);
}
function serialize(fields: Readonly<Record<string, string | string[]>>, body: string): string {
  const lines = ['---'];
  for (const key of ['name', 'description', 'tools', 'model', 'thinking-level']) {
    const value = fields[key];
    if (value === undefined) continue;
    lines.push(key === 'tools' && Array.isArray(value) ? `${key}: [${value.join(', ')}]` : `${key}: ${JSON.stringify(String(value).replace(/\r\n?/gu, '\n'))}`);
  }
  lines.push('---', '', body.replace(/\r\n?/gu, '\n').replace(/\n+$/u, ''), '');
  return lines.join('\n');
}
export function convertAgents(context: ProjectionBuildContext, thinkingLevel: string | null): Record<string, unknown> {
  const entries = filesUnder(context, 'agents').filter((entry) => entry.path.split('/').length === 2 && entry.path.endsWith('.md'));
  const seen = new Set<string>();
  const audit: Record<string, unknown> = {};
  for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    const parsed = splitFrontmatter(new TextDecoder().decode(entry.bytes));
    const name = (parsed.fields.name ?? '').trim();
    const description = (parsed.fields.description ?? '').trim();
    assertAgentName(name, entry.path.slice('agents/'.length, -'.md'.length));
    if (!description || seen.has(name)) invalid();
    seen.add(name);
    const rawModel = (parsed.fields.model ?? '').trim().toLowerCase();
    if (rawModel && rawModel !== 'inherit' && MODEL_MAP[rawModel] === undefined) invalid();
    const mapped: string[] = [];
    const dropped: string[] = [];
    if (parsed.fields.tools) for (const source of tools(parsed.fields.tools)) {
      const target = TOOL_MAP[source.toLowerCase()];
      if (!target) dropped.push(source); else if (!mapped.includes(target)) mapped.push(target);
    }
    if (name === 'evc-advisor' && (!parsed.body.includes('## Required checkpoint method') || !parsed.body.includes('## Checkpoint terminal report'))) invalid();
    const fields: Record<string, string | string[]> = { name, description };
    if (mapped.length) fields.tools = mapped;
    if (rawModel && rawModel !== 'inherit') fields.model = MODEL_MAP[rawModel];
    if (thinkingLevel) fields['thinking-level'] = thinkingLevel;
    writeText(context, `agents/${entry.path.split('/').pop()}`, serialize(fields, translatePrompt(parsed.body)));
    audit[name] = { source: entry.path.split('/').pop(), model: { source: rawModel || null, target: rawModel && rawModel !== 'inherit' ? MODEL_MAP[rawModel] : null }, tools: { mapped, dropped: dropped.sort() }, thinkingLevel };
  }
  writeJson(context, 'evcrate/agent-tool-audit.json', { schema: 'evcrate-omp-agent-tool-audit-v1', agents: audit });
  return audit;
}
