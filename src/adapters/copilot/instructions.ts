import type { ProjectionBuildContext } from '../types.js';
import { writeProjectionFile, textBytes } from '../projection-utils.js';
import { readSibling, decode, invalid } from './common.js';
function workflowReferences(value: string): string {
  return value.replace(/`(?:\.\/)?\.copilot\/evcrate\/workflows\/([A-Za-z0-9_*.-]+)`/gu, (_match, name: string) => `@evcrate/workflows/${name} (local .copilot/evcrate/workflows/${name}; otherwise read ~/.copilot/evcrate/workflows/${name} (the published install))`);
}
export function generateInstructions(context: ProjectionBuildContext, transform: (value: string) => string): void {
  let rendered = transform(decode(readSibling(context, 'CLAUDE.md'))).replace('# CLAUDE.md', '# copilot-instructions.md');
  rendered = workflowReferences(rendered).replace(/\.claude\//gu, '.copilot/').replace(/\bCLAUDE\.md\b/gu, 'copilot-instructions.md');
  if (!rendered.includes('@evcrate/workflows/')) invalid();
  writeProjectionFile(context, '.copilot/copilot-instructions.md', textBytes(`${rendered.replace(/\n+$/u, '')}\n`));
}
