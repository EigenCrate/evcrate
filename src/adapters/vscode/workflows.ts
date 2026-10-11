import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, copyText } from './common.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';

export function convertVscodeWorkflows(
  context: ProjectionBuildContext,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): readonly string[] {
  const workflowFiles = filesUnder(context, 'workflows')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  const projected: string[] = [];

  for (const file of workflowFiles) {
    const rel = sourcePath('workflows', file);
    copyText(context, file.path, `evcrate/workflows/${rel}`, (text) => {
      return transformVscodePrompt(text, commandMap, skills);
    });
    projected.push(rel);
  }

  return Object.freeze(projected);
}
