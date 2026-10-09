import type { ProjectionBuildContext } from '../types.js';
import { graphText, writeProjectionFile, textBytes } from '../projection-utils.js';
import { invalid } from './common.js';
import { instructionReferences } from './prompts.js';
function workflowReferences(value: string): string {
  return value.replace(/`(?:\.\/)?\.copilot\/evcrate\/workflows\/([A-Za-z0-9_*.-]+)`/gu, (_match, name: string) => `@evcrate/workflows/${name} (local .copilot/evcrate/workflows/${name}; otherwise read ~/.copilot/evcrate/workflows/${name} (the published install))`);
}
export function generateInstructions(context: ProjectionBuildContext, transform: (value: string) => string): void {
  const source = graphText(context, 'AGENTS.md');
  if (!source.trim()) invalid();
  let rendered = transform(source.replace(/^# AGENTS\.md(?=\r?$)/mu, '# copilot-instructions.md'));
  rendered = workflowReferences(rendered);
  if (!rendered.includes('@evcrate/workflows/')) invalid();
  // Only .github is a native project document; .copilot retains the HOME payload.
  for (const [output, instructionPath] of [
    ['.github/copilot-instructions.md', '.github/copilot-instructions.md'],
    ['.copilot/copilot-instructions.md', '~/.copilot/copilot-instructions.md'],
  ] as const) {
    const body = instructionReferences(rendered, instructionPath);
    writeProjectionFile(context, output, textBytes(`${body.replace(/\n+$/u, '')}\n`));
  }
}
