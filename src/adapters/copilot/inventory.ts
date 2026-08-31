import { lstatSync, readFileSync } from 'node:fs';
import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, invalid, writeJson } from './common.js';
import type { NameMap } from './prompts.js';
import type { SkillResult } from './skills.js';
import type { AgentAudit } from './agents.js';
import type { HookAudit } from './hooks.js';
import type { StyleAudit } from './styles.js';
import type { SupportAudit } from './support.js';

type Entry = { source: string; target: string | string[]; targets: string[]; disposition: string; reason?: string };
const sourcePrefix = '.evcrate/source/.claude/';
function target(relative: string): string { return `.copilot/${relative.replace(/^\//u, '')}`; }
function sourceName(context: ProjectionBuildContext, path: string): string { return `${sourcePrefix}${path}`; }
function targetExists(context: ProjectionBuildContext, value: string): boolean {
  const [path, fragment] = value.split('#', 2); if (!path.startsWith('.copilot')) return false;
  try { const stat = lstatSync(context.stagePath(path)); if (!stat.isFile() && !stat.isDirectory()) return false; if (!fragment) return true; const data = JSON.parse(new TextDecoder().decode(readFileSync(context.stagePath(path)))); const match = /^([A-Za-z][A-Za-z0-9]*)(?:\[(\d+)\])?$/u.exec(fragment); if (!match) return false; const hooks = data?.hooks?.[match[1]]; return Array.isArray(hooks) && (match[2] === undefined || Number(match[2]) < hooks.length); } catch { return false; }
}
export function buildInventory(context: ProjectionBuildContext, commandMap: NameMap, skills: SkillResult, agents: Record<string, AgentAudit>, hooks: HookAudit, styles: StyleAudit[], workflows: readonly string[], support: SupportAudit): Record<string, unknown> {
  const entries: Entry[] = []; const seen = new Set<string>();
  const add = (source: string, targets: string[], disposition: string, reason = ''): void => { if (seen.has(source)) invalid(); seen.add(source); if (disposition !== 'native' && !reason) invalid(); entries.push({ source, target: targets.length === 1 ? targets[0] : targets, targets, disposition, ...(disposition === 'native' ? {} : { reason }) }); };
  add(sourceName(context, 'CLAUDE.md'), [target('copilot-instructions.md')], 'native');
  for (const workflow of workflows) add(sourceName(context, `workflows/${workflow}`), [target(`evcrate/workflows/${workflow}`)], 'managed-static', 'Copilot CLI has no native workflow loader; transformed workflow remains managed support.');
  for (const item of Object.values(commandMap)) add(sourceName(context, `commands/${item.source}`), [target(item.target)], 'approximated', 'Claude command invocation is represented by a user-invocable Copilot skill with an exact raw-argument contract.');
  for (const file of filesUnder(context, 'skills')) {
    const relative = sourcePath('skills', file);
    const native = skills.native
      .filter((item) => relative === item.source || relative.startsWith(`${item.source}/`))
      .sort((a, b) => b.source.length - a.source.length)[0];
    const isArchived = skills.archived.some((name) => relative === name || relative.startsWith(`${name}/`));
    if (native) {
      const suffix = relative.slice(native.source.length + 1);
      const mapped = suffix.toLowerCase() === 'skill.md' ? 'SKILL.md' : suffix;
      add(sourceName(context, relative), [target(`${native.target}/${mapped}`)], 'native');
    } else if (isArchived) add(sourceName(context, relative), [target(`evcrate/skills/${relative}`)], 'managed-static', 'Non-invokable skill support is archived without entering Copilot skill discovery.');
    else if (['tests', '__tests__', 'fixtures', 'helpers'].some((part) => relative.split('/').includes(part))) add(sourceName(context, relative), [], 'unsupported', 'Non-production skill test or fixture is excluded from the published support tree.');
    else invalid();
  }
  for (const [name, item] of Object.entries(agents)) add(sourceName(context, `agents/${item.source}`), [target(item.target)], 'approximated', 'Copilot agent metadata omits Claude model pins and maps only documented tool aliases.');
  for (const registration of hooks.registrations) { const source = sourceName(context, `settings.json#hooks.${registration.event}[${registration.index}]`); if (registration.event === 'UserPromptSubmit') add(source, [], 'unsupported', 'Copilot target hooks intentionally omit the Claude-only UserPromptSubmit registration.'); else add(source, [target(`hooks/evcrate.json#${registration.targetEvent}`)], 'approximated', 'Claude hook registration is bridged to the corresponding native camelCase Copilot event and source matcher.'); }
  for (const file of filesUnder(context, 'hooks')) { const relative = sourcePath('hooks', file); const copied = hooks.hooks.includes(relative); add(sourceName(context, `hooks/${relative}`), copied ? [target(`evcrate/hooks/${relative}`)] : [], copied ? 'managed-static' : 'unsupported', copied ? 'Production hook entrypoint is executed through the Copilot compatibility bridge.' : 'Non-production hook test or helper is excluded from the bridge closure.'); }
  for (const file of filesUnder(context, 'scripts')) { const relative = sourcePath('scripts', file); const copied = hooks.scripts.includes(relative); add(sourceName(context, `scripts/${relative}`), copied ? [target(`evcrate/scripts/${relative}`)] : [], copied ? 'managed-static' : 'unsupported', copied ? 'Production script is retained as managed Copilot support.' : 'Non-production script test or helper is excluded from the published closure.'); }
  const stylesBySource = Object.fromEntries(styles.map((item) => [item.source, item])); for (const file of filesUnder(context, 'output-styles')) { const relative = sourcePath('output-styles', file); const style = stylesBySource[relative]; if (!style) invalid(); add(sourceName(context, `output-styles/${relative}`), [target(style.target), target(style.archive)], 'approximated', 'Copilot has no native output-style loader; style is also available as a manual skill.'); }
  add(sourceName(context, '.evcrate.json'), [target('.evcrate.json')], 'managed-static', 'Target-local EVCrate configuration is consumed by translated scripts.'); add(sourceName(context, '.evcrateignore'), [target('.evcrateignore'), target('evcrate/.evcrateignore')], 'managed-static', 'Ignore policy is consumed by translated hook closure at both target levels.');
  add(sourceName(context, '.gitignore'), support.archives.includes('evcrate/source-gitignore') ? [target('evcrate/source-gitignore')] : [], support.archives.includes('evcrate/source-gitignore') ? 'managed-static' : 'unsupported', 'Source-only ignore file is retained for audit and never loaded as Copilot configuration.'); add(sourceName(context, 'settings.json'), [target('evcrate/claude-settings.json')], 'managed-static', 'Canonical hook/settings JSON is archived for audit; only EVCrate-owned Copilot settings are activated.'); add(sourceName(context, 'settings.local.json'), [], 'unsupported', 'Claude local permission patterns are not activated by personal Copilot target.'); add(sourceName(context, '.mcp.json.example'), [target('mcp-config.example.json')], 'managed-static', 'Placeholder example is renamed and retained as opt-in documentation; no live MCP configuration is created.');
  for (const file of context.resources.files.filter((item) => /^statusline\./u.test(item.path))) add(sourceName(context, file.path), [target(`evcrate/${file.path}`)], 'approximated', 'Status-line variant is transformed for Copilot session fields and bounded output.'); add(sourceName(context, 'settings.json#CLAUDE_ENV_FILE'), [], 'unsupported', 'Copilot has no CLAUDE_ENV_FILE propagation hook; bridge removes that dependency.');
  const inventory = { schema: 'evcrate-copilot-migration-v1', source: '.evcrate/source/.claude', target: '.copilot', entries: entries.sort((a, b) => a.source.localeCompare(b.source)), maps: { commands: 'evcrate/command-name-map.json', skills: 'evcrate/skill-map.json', agents: 'evcrate/agent-tool-audit.json' }, support };
  for (const map of Object.values(inventory.maps)) if (!targetExists(context, target(map))) invalid(); for (const item of entries) if (item.disposition !== 'unsupported' && !item.targets.every(targetExists.bind(null, context))) invalid();
  writeJson(context, 'evcrate/migration-inventory.json', inventory); return inventory;
}
