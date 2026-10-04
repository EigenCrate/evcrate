import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, decodeUtf8, copyText } from './common.js';
import { parseFrontmatter, serializeFrontmatter } from './metadata.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry, VscodeStyleMapEntry } from './names.js';

export function convertVscodeStyles(
  context: ProjectionBuildContext,
  styleMap: Record<string, VscodeStyleMapEntry>,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): void {
  const styleFiles = filesUnder(context, 'output-styles')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of styleFiles) {
    const rel = sourcePath('output-styles', file);
    const stem = rel.slice(0, -3);
    const entry = styleMap[stem];
    if (!entry) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const parsed = parseFrontmatter(decodeUtf8(file.bytes));
    const description = typeof parsed.fields.description === 'string'
      ? transformVscodePrompt(parsed.fields.description.trim(), commandMap, skills)
      : entry.description;

    const outFrontmatter: Record<string, unknown> = {
      name: entry.localName,
      description: description || `Manual style procedure for ${stem}`,
      'user-invocable': true,
      'disable-model-invocation': true
    };

    const body = transformVscodePrompt(parsed.body, commandMap, skills);
    const rendered = serializeFrontmatter(outFrontmatter, body);
    copyText(context, file.path, entry.target, () => rendered);
  }
}
