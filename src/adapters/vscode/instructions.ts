import type { ProjectionBuildContext } from '../types.js';
import { writeProjectionFile, textBytes } from '../projection-utils.js';
import { readSiblingString, outputPath } from './common.js';
import { serializeFrontmatter } from './metadata.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';

export function generateVscodeInstructions(
  context: ProjectionBuildContext,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): void {
  const source = readSiblingString(context, 'CLAUDE.md');
  const transformed = transformVscodePrompt(source, commandMap, skills);
  const updatedHeader = transformed.replace(/^#\s+CLAUDE\.md/u, '# bootstrap.instructions.md');

  const frontmatter: Record<string, unknown> = {
    applyTo: '**',
    description: 'Always-on bootstrap instruction rule for EVCrate VS Code Local'
  };

  const output = serializeFrontmatter(frontmatter, updatedHeader);
  writeProjectionFile(
    context,
    outputPath('com.github.copilot/rules/bootstrap.instructions.md'),
    textBytes(output)
  );
}
