import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, fieldString, parseFrontmatter, sourcePath, invalid, writeJson, copyText, decode } from './common.js';
import { commandBody, firstProseLine, serializeSkill } from './prompts.js';
import { advisoryCommand, advisoryWorkflow, mentoringWorkflow } from './text.js';
import type { NameMap } from './prompts.js';
import { assertUniqueNames, commandNameFromSourcePath } from '../resource-naming.js';

export interface CommandEntry { source: string; sourceName: string; target: string; targetName: string; description?: string; descriptionSource?: string; argumentHint?: string }

export function buildCommandMap(context: ProjectionBuildContext): NameMap {
  const result: Record<string, CommandEntry> = {};
  const names: string[] = [];
  for (const file of filesUnder(context, 'commands')) {
    const relative = sourcePath('commands', file);
    const command = commandNameFromSourcePath(`commands/${relative}`);
    if (result[command.semanticId] !== undefined) invalid();
    names.push(command.name);
    result[command.semanticId] = {
      source: relative,
      sourceName: command.semanticId,
      target: `skills/${command.name}/SKILL.md`,
      targetName: command.name
    };
  }
  assertUniqueNames(names);
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export function convertWorkflows(context: ProjectionBuildContext, transform: (value: string) => string): string[] {
  const copied: string[] = [];
  for (const file of filesUnder(context, 'workflows')) {
    const relative = sourcePath('workflows', file);
    copyText(context, file.path, `evcrate/workflows/${relative}`, (value) => transform(relative === 'advisory-interview.md' ? advisoryWorkflow(value) : (relative === 'advisor-mentoring.md' ? mentoringWorkflow(value) : value)));
    copied.push(relative);
  }
  return copied.sort();
}

export function convertCommands(context: ProjectionBuildContext, map: NameMap, transform: (value: string) => string, workflows: readonly string[]): void {
  for (const file of filesUnder(context, 'commands')) {
    const relative = sourcePath('commands', file);
    const entry = Object.values(map).find((item) => item.source === relative);
    if (!entry) invalid();
    const parsed = parseFrontmatter(decode(file.bytes));
    let description = fieldString(parsed.fields, 'description').trim();
    let kind = 'frontmatter';
    if (!description) { description = firstProseLine(parsed.body); kind = 'first-prose-line'; }
    if (!description || description.length > 1024) invalid();
    let body = parsed.body;
    if (entry.sourceName === 'advise') { body = advisoryCommand(body); description = 'Interview-first technical advice; advisor relay is unsupported by Copilot CLI.'; }
    body = transform(body);
    description = transform(description).trim();
    if (!description || description.length > 1024) invalid();
    const fields = { name: entry.targetName, description, 'argument-hint': fieldString(parsed.fields, 'argument-hint'), 'user-invocable': true, 'disable-model-invocation': true };
    const rendered = serializeSkill(fields, commandBody(body, entry.targetName, workflows));
    const target = `skills/${entry.targetName}/SKILL.md`;
    copyText(context, file.path, target, () => rendered);
    entry.description = description; entry.descriptionSource = kind; entry.argumentHint = fields['argument-hint'];
  }
  writeJson(context, 'evcrate/command-name-map.json', { schema: 'evcrate-copilot-command-map-v1', commands: Object.values(map).sort((a, b) => a.source.localeCompare(b.source)) });
}
