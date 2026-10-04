import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, decodeUtf8, copyText } from './common.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';
import { renderVscodeAdvisoryInterviewWorkflow, renderVscodeMentoringWorkflow } from './advisory.js';

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
      let body = text;
      if (rel === 'advisory-interview.md') {
        body = renderVscodeAdvisoryInterviewWorkflow(body);
      } else if (rel === 'advisor-mentoring.md') {
        body = renderVscodeMentoringWorkflow(body);
      }
      return transformVscodePrompt(body, commandMap, skills);
    });
    projected.push(rel);
  }

  return Object.freeze(projected);
}
