import type { ProjectionBuildContext } from '../types.js';
import { copyFile, copyText, filesUnder, fieldString, parseFrontmatter, sourcePath, invalid, decode } from './common.js';
import { serializeSkill } from './prompts.js';
import type { SimpleMap } from './prompts.js';
import { assertUniqueNames, copilotStyleName } from '../resource-naming.js';

export interface StyleAudit { source: string; target: string; archive: string }
export function discoverStyles(context: ProjectionBuildContext): SimpleMap {
  const names: Record<string, string> = {};
  for (const file of filesUnder(context, 'output-styles')) {
    const relative = sourcePath('output-styles', file);
    if (!relative.endsWith('.md')) invalid();
    names[relative] = copilotStyleName(relative.slice(0, -3));
  }
  assertUniqueNames(Object.values(names));
  return names;
}

export function convertStyles(context: ProjectionBuildContext, names: SimpleMap, transform: (value: string) => string): StyleAudit[] {
  const result: StyleAudit[] = [];
  for (const file of filesUnder(context, 'output-styles')) {
    const relative = sourcePath('output-styles', file); if (!relative.endsWith('.md')) invalid();
    const parsed = parseFrontmatter(decode(file.bytes));
    const description = fieldString(parsed.fields, 'description').trim(); if (!description || description.length > 1024) invalid();
    const target = names[relative]; if (!target) invalid();
    const translated = transform(description).trim(); if (!translated || translated.length > 1024) invalid();
    const body = `Apply this style for the current response and the remainder of this session.\n\n${transform(parsed.body).replace(/^\s+/u, '')}`;
    copyText(context, file.path, `skills/${target}/SKILL.md`, () => serializeSkill({ name: target, description: translated, 'user-invocable': true, 'disable-model-invocation': true }, body));
    copyFile(context, file.path, `evcrate/output-styles/${relative}`, transform);
    result.push({ source: relative, target: `skills/${target}/SKILL.md`, archive: `evcrate/output-styles/${relative}` });
  }
  return result;
}
