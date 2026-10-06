import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { copy, filesUnder, relativeTo, writeJson, writeText } from './resources.js';
import { serializeFrontmatter, splitFrontmatter } from './frontmatter.js';
import { renderAdvisoryInterviewWorkflow, renderInlineAdviseCommand, renderMentoringWorkflow } from '../advisory.js';
import { restoreIndexedTokens } from '../uri-restoration.js';
import { OMP_COMMAND_RUNTIME } from './activation.js';
export interface CommandRecord { readonly source: string; readonly sourceName: string; readonly target: string; readonly targetName: string; }
export type CommandMap = Readonly<Record<string, CommandRecord>>;
const URI = /(?<![A-Za-z0-9_./:])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/giu;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const SKILL_MARKERS = ['activate the skills', 'activate needed skills', 'activate only needed skills', 'activate from catalog', 'skills catalog', 'list of skills', 'skill tool'];
const NO_SKILLS = '**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP\'s normal skill discovery.';
const ADVICE_MODE_INVOCATION = /## Advice Mode\s*\n\nBefore discovery or routing, resolve the HOME helper per `[^\n`]+` with original `\$ARGUMENTS`, canonical `context\.command: "[^"]+"`, the current root and any direct caller handoff\.\s*\nPreserve known direct-caller selections; use `work_target: "[^"]+"` only when no caller target exists, and null plan\/phase fields only when unknown\.\s*\nSet `WORK_ARGUMENTS = result\.work_arguments` and `ADVICE_MODE = result\.mode`; use the returned work input everywhere below\./u;
const NATIVE_ADVICE_HEADER = `## Advice Mode

Native command execution validates and resolves advice activation prior to prompt admission, prepending the \`evcrate_omp_command_context\` header.
If \`evcrate_omp_command_context\` is missing or invalid, treat activation as failed and fail closed per the shared activation contract without making native authentication claims.
Consume the validated \`result = evcrate_omp_command_context.activation_result\`, validated \`context\`, \`WORK_ARGUMENTS = result.work_arguments\`, and \`ADVICE_MODE = result.mode\`. Do not re-invoke the HOME helper or skip required approvals; use the validated work input everywhere below.`;
function renderNativeAdviceMode(body: string): string {
  if (!ADVICE_MODE_INVOCATION.test(body)) throw new ControlPlaneError('VALIDATION_INVALID');
  return body.replace(ADVICE_MODE_INVOCATION, NATIVE_ADVICE_HEADER);
}

function protectUris(value: string): { rendered: string; values: string[] } {
  const values: string[] = [];
  const rendered = value.replace(URI, (match) => { values.push(match); return `__OMP_URI_${values.length - 1}__`; });
  return { rendered, values };
}
function restoreUris(value: string, values: readonly string[]): string {
  return restoreIndexedTokens(value, '__OMP_URI_', values);
}
export function buildCommandMap(context: ProjectionBuildContext): CommandMap {
  const records: Record<string, CommandRecord> = {};
  const used = new Set<string>();
  const allEntries = filesUnder(context, 'commands').filter((entry) => entry.path !== 'commands');
  if (allEntries.some((entry) => !entry.path.endsWith('.md'))) throw new ControlPlaneError('VALIDATION_INVALID');
  const entries = allEntries.filter((entry) => entry.path.endsWith('.md')).sort((a, b) => a.path.localeCompare(b.path));
  if (!entries.length) throw new ControlPlaneError('VALIDATION_INVALID');
  for (const entry of entries) {
    const source = relativeTo(entry.path, 'commands');
    const parts = source.slice(0, -3).split('/');
    const sourceName = parts.join(':');
    const targetName = `cmd-${parts.join('__')}`;
    if (!NAME.test(targetName) || used.has(targetName.toLowerCase())) throw new ControlPlaneError('VALIDATION_INVALID');
    used.add(targetName.toLowerCase());
    records[sourceName.toLowerCase()] = { source, sourceName, target: `${targetName}.md`, targetName };
  }
  return Object.freeze(Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b))));
}
export function renderCommandReferences(value: string, map: CommandMap): string {
  const protectedValue = protectUris(value);
  let rendered = protectedValue.rendered;
  const items = Object.values(map).sort((a, b) => b.source.length - a.source.length);
  for (const item of items) {
    for (const [prefix, replacement] of [['${HOME}/', '${HOME}/.omp/agent/'], ['$HOME/', '$HOME/.omp/agent/'], ['~/', '~/.omp/agent/'], ['./', './.omp/'], ['', '.omp/']] as const) {
      rendered = rendered.replaceAll(`${prefix}.claude/commands/${item.source}`, `${replacement}evcrate/commands/${item.target}`);
    }
  }
  for (const item of items) {
    const escapedSourceName = item.sourceName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = new RegExp(`(?<![A-Za-z0-9_/:])/(?:evcrate:)?${escapedSourceName}(?![A-Za-z0-9_-])`, 'giu');
    rendered = rendered.replace(pattern, `/${item.targetName}`);
  }
  return restoreUris(rendered, protectedValue.values);
}
function harnessPaths(value: string): string {
  const protectedValue = protectUris(value);
  let rendered = protectedValue.rendered;
  for (const prefix of ['~', '$HOME', '${HOME}']) {
    for (const suffix of ['workflows', 'scripts', 'hooks', 'skills', 'output-styles', 'commands']) {
      const target = suffix === 'skills' ? '.omp/agent/skills' : `.omp/agent/evcrate/${suffix}`;
      rendered = rendered.replaceAll(`${prefix}/.claude/${suffix}`, `${prefix}/${target}`);
    }
    rendered = rendered.replaceAll(`${prefix}/.claude`, `${prefix}/.omp/agent`);
  }
  for (const suffix of ['workflows', 'scripts', 'hooks', 'skills', 'output-styles', 'commands']) {
    const target = suffix === 'skills' ? '.omp/skills' : `.omp/evcrate/${suffix}`;
    rendered = rendered.replaceAll(`.claude/${suffix}`, target);
  }
  rendered = rendered.replace(/(?<![A-Za-z0-9_])\.claude(?=[/\\'"`\)\]\}]|\s|$)/gu, '.omp');
  return restoreUris(rendered, protectedValue.values);
}
export function translateHarnessReferences(value: string): string { return harnessPaths(value); }
function addRuntimeGuidance(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('omp skill loading (runtime)') || !SKILL_MARKERS.some((marker) => lower.includes(marker))) return value;
  return `${value.trimEnd()}\n\n${NO_SKILLS}\n`;
}
function workflowFallback(value: string): string {
  return value.replace(/`((?:\.\/)?\.omp\/evcrate\/workflows\/([A-Za-z0-9_*.-]+))`/gu, (full, path: string, name: string, offset: number, whole: string) => {
    if (whole.slice(offset + full.length).startsWith(' if present; otherwise read')) return full;
    return `\`${path}\` if present; otherwise read \`~/.omp/agent/evcrate/workflows/${name}\``;
  });
}
export function translatePrompt(value: string, map: CommandMap): string {
  let rendered = harnessPaths(renderCommandReferences(value, map));
  rendered = workflowFallback(rendered);
  rendered = addRuntimeGuidance(rendered);
  return rendered.replaceAll('Skill tool', 'OMP command mechanism').replaceAll('Task tool', 'task tool').replaceAll('AskUserQuestion', 'ask the user').replaceAll('SlashCommand', 'OMP command');
}
export function convertCommands(context: ProjectionBuildContext, map: CommandMap): void {
  const allEntries = filesUnder(context, 'commands').filter((item) => item.path !== 'commands');
  if (allEntries.some((item) => !item.path.endsWith('.md'))) throw new ControlPlaneError('VALIDATION_INVALID');
  writeText(context, 'evcrate/omp-command-runtime.ts', OMP_COMMAND_RUNTIME);
  for (const entry of allEntries.filter((item) => item.path.endsWith('.md'))) {
    const relSource = relativeTo(entry.path, 'commands');
    const canonicalName = relSource.slice(0, -3);
    const record = map[canonicalName.split('/').join(':').toLowerCase()];
    if (!record) throw new ControlPlaneError('VALIDATION_INVALID');
    const source = new TextDecoder().decode(entry.bytes);
    const parsed = source.startsWith('---\n') ? splitFrontmatter(source) : { fields: {}, body: source };
    const fields: Record<string, string> = { ...parsed.fields };
    if (fields.name) fields.name = renderCommandReferences(fields.name, map);
    const activation = parsed.body.includes('## Advice Mode');
    let body = parsed.body;
    if (activation) {
      body = renderNativeAdviceMode(body);
    }
    if (entry.path === 'commands/advise.md') {
      fields.description = 'Interview-first technical advice; advisor relay is unsupported by OMP.';
      fields['argument-hint'] = '[prompt-or-url]';
      body = renderInlineAdviseCommand(parsed.body, 'omp', 'native user-input flow');
    }
    const translatedBody = translatePrompt(body, map);
    const generatedMarkdown = Object.keys(fields).length ? serializeFrontmatter(fields, translatedBody) : translatedBody.replace(/^\s+/u, '');
    writeText(context, `evcrate/commands/${record.target}`, generatedMarkdown);
    const description = fields.description ?? '';
    const nativeModule = `import { createCommand } from '../../evcrate/omp-command-runtime.ts';\n\nexport default () => createCommand({\n  name: ${JSON.stringify(record.targetName)},\n  canonicalName: ${JSON.stringify(canonicalName)},\n  description: ${JSON.stringify(description)},\n  activation: ${activation},\n  template: ${JSON.stringify(record.target)}\n}, import.meta.url);\n`;
    writeText(context, `commands/${record.targetName}/index.ts`, nativeModule);
  }
  writeJson(context, 'evcrate/command-name-map.json', { schema: 'evcrate-omp-command-map-v1', commands: Object.values(map) });
}
export function convertWorkflows(context: ProjectionBuildContext, map: CommandMap): string[] {
  const copied: string[] = [];
  for (const entry of filesUnder(context, 'workflows').filter((item) => item.path.endsWith('.md'))) {
    const rel = relativeTo(entry.path, 'workflows');
    let value = translatePrompt(new TextDecoder().decode(entry.bytes), map);
    if (rel === 'advisory-interview.md') value = renderAdvisoryInterviewWorkflow(value, 'omp');
    else if (rel === 'advisor-mentoring.md') value = renderMentoringWorkflow(value, 'omp');
    copy(context, entry.path, `evcrate/workflows/${rel}`, () => value);
    copied.push(rel);
  }
  return copied;
}
