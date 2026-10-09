import type { ProjectionBuildContext } from '../types.js';
import { graphText, writeProjectionFile, textBytes } from '../projection-utils.js';
import { outputPath } from './common.js';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { serializeFrontmatter } from './metadata.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';

export function generateVscodeInstructions(
  context: ProjectionBuildContext,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): void {
  const source = graphText(context, 'AGENTS.md');
  if (!source.trim()) throw new ControlPlaneError('VALIDATION_INVALID');
  const updatedHeader = transformVscodePrompt(source.replace(/^# AGENTS\.md(?=\r?$)/mu, '# bootstrap.instructions.md'), commandMap, skills);

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
