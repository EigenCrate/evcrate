import type { ProjectionBuildContext } from '../types.js';
import { copyFile, copyText, filesUnder, fieldString, parseFrontmatter, sourcePath, targetName, invalid, decode } from './common.js';
import { serializeSkill } from './prompts.js';

export interface StyleAudit { source: string; target: string; archive: string }
export function convertStyles(context: ProjectionBuildContext, transform: (value: string) => string): StyleAudit[] {
  const result: StyleAudit[] = []; const used = new Set<string>();
  for (const file of filesUnder(context, 'output-styles')) {
    const relative = sourcePath('output-styles', file); if (!relative.endsWith('.md')) invalid();
    const parsed = parseFrontmatter(decode(file.bytes));
    const description = fieldString(parsed.fields, 'description').trim(); if (!description || description.length > 1024) invalid();
    const target = `evcrate-style-${targetName(relative.slice(0, -3).split('/').join('-'))}`; if (target.length > 64 || used.has(target.toLowerCase())) invalid(); used.add(target.toLowerCase());
    const translated = transform(description).trim(); if (!translated || translated.length > 1024) invalid();
    const body = `Apply this style for the current response and the remainder of this session.\n\n${transform(parsed.body).replace(/^\s+/u, '')}`;
    copyText(context, file.path, `skills/${target}/SKILL.md`, () => serializeSkill({ name: target, description: translated, 'user-invocable': true, 'disable-model-invocation': true }, body));
    copyFile(context, file.path, `evcrate/output-styles/${relative}`, transform);
    result.push({ source: relative, target: `skills/${target}/SKILL.md`, archive: `evcrate/output-styles/${relative}` });
  }
  return result;
}
