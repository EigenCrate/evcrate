import { lstatSync } from 'node:fs';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, writeJson, outputPath } from './common.js';
import type {
  VscodeCommandMapEntry,
  VscodeSkillMapEntry,
  VscodeAgentMapEntry,
  VscodeStyleMapEntry,
  VscodeWorkflowMapEntry
} from './names.js';
import type { VscodeAgentAudit } from './agents.js';
import type { VscodeSkillsResult } from './skills.js';
import type { VscodeHookAudit } from './hooks.js';

export interface VscodeInventoryEntry {
  readonly source: string;
  readonly target: string | readonly string[];
  readonly targets: readonly string[];
  readonly disposition: string;
  readonly reason?: string;
}

export interface VscodeResourceMapEntry {
  readonly source: string;
  readonly sourceSemanticId: string;
  readonly target: string;
  readonly localName: string;
  readonly targetName: string;
  readonly nativeInvocationName?: string;
  readonly family: 'instruction' | 'agent' | 'skill' | 'command' | 'style' | 'workflow';
  readonly disposition: string;
}

function targetExists(context: ProjectionBuildContext, targetRel: string): boolean {
  try {
    const full = context.stagePath(outputPath(targetRel));
    const stat = lstatSync(full);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

export function buildVscodeInventory(
  context: ProjectionBuildContext,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skillsResult: VscodeSkillsResult,
  agents: Record<string, VscodeAgentMapEntry>,
  agentAudits: Record<string, VscodeAgentAudit>,
  styles: Record<string, VscodeStyleMapEntry>,
  workflows: Record<string, VscodeWorkflowMapEntry>,
  hookAudit?: VscodeHookAudit
): Record<string, unknown> {
  const entries: VscodeInventoryEntry[] = [];
  const resourceMap: VscodeResourceMapEntry[] = [];
  const seenSources = new Set<string>();

  const add = (source: string, targets: string[], disposition: string, reason = ''): void => {
    if (seenSources.has(source)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    seenSources.add(source);
    if (disposition !== 'native' && !reason) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    entries.push(Object.freeze({
      source,
      target: targets.length === 1 ? targets[0] : Object.freeze([...targets]),
      targets: Object.freeze([...targets]),
      disposition,
      ...(disposition === 'native' ? {} : { reason })
    }));
  };

  const sourcePrefix = '.evcrate/source/.claude/';

  // 1. Sibling Instruction
  const instructionTarget = 'com.github.copilot/rules/bootstrap.instructions.md';
  add('.evcrate/source/CLAUDE.md', [instructionTarget], 'native');
  resourceMap.push(Object.freeze({
    source: '.evcrate/source/CLAUDE.md',
    sourceSemanticId: 'bootstrap-instructions',
    target: instructionTarget,
    localName: 'bootstrap.instructions.md',
    targetName: 'bootstrap.instructions.md',
    family: 'instruction',
    disposition: 'native'
  }));

  // 2. Workflows (6)
  for (const [name, wf] of Object.entries(workflows).sort(([a], [b]) => a.localeCompare(b))) {
    add(
      `${sourcePrefix}workflows/${wf.source}`,
      [wf.target],
      'managed-static',
      'Transformed workflow is retained as managed static guidance; VS Code Local has no native workflow engine.'
    );
    resourceMap.push(Object.freeze({
      source: `workflows/${wf.source}`,
      sourceSemanticId: wf.sourceSemanticId,
      target: wf.target,
      localName: wf.localName,
      targetName: wf.targetName,
      family: 'workflow',
      disposition: 'managed-static'
    }));
  }

  // 3. Commands (70)
  for (const [stem, cmd] of Object.entries(commandMap).sort(([a], [b]) => a.localeCompare(b))) {
    add(
      `${sourcePrefix}commands/${cmd.source}`,
      [cmd.target],
      'approximated',
      'Claude command procedure is projected as a manual-only skill with exact argument contracts.'
    );
    resourceMap.push(Object.freeze({
      source: `commands/${cmd.source}`,
      sourceSemanticId: cmd.sourceSemanticId,
      target: cmd.target,
      localName: cmd.localName,
      targetName: cmd.targetName,
      nativeInvocationName: cmd.nativeInvocationName,
      family: 'command',
      disposition: 'approximated'
    }));
  }

  // 4. Skills (40 markers + companion files + archives + exclusions)
  const allSkillFiles = filesUnder(context, 'skills');
  for (const file of allSkillFiles) {
    const rel = sourcePath('skills', file);
    const nativeMatch = skillsResult.skills
      .filter((s) => rel === s.source || rel.startsWith(`${s.source}/`))
      .sort((a, b) => b.source.length - a.source.length)[0];

    const isArchived = skillsResult.archived.some(
      (name) => rel === name || rel.startsWith(`${name}/`)
    );

    const isTestOrFixture = ['tests', '__tests__', 'fixtures', 'helpers'].some((part) =>
      rel.split('/').includes(part)
    );

    if (nativeMatch) {
      if (isTestOrFixture) {
        add(
          `${sourcePrefix}skills/${rel}`,
          [],
          'unsupported',
          'Non-production skill test or fixture is excluded from the published support tree.'
        );
      } else {
        const subRel = rel.slice(nativeMatch.source.length + 1);
        const mappedRel = subRel.toLowerCase() === 'skill.md' ? 'SKILL.md' : subRel;
        const targetPath = `${nativeMatch.target}/${mappedRel}`;
        add(`${sourcePrefix}skills/${rel}`, [targetPath], 'native');
      }
    } else if (isArchived) {
      add(
        `${sourcePrefix}skills/${rel}`,
        [`evcrate/skills/${rel}`],
        'managed-static',
        'Non-invocable skill support is archived without entering skill discovery.'
      );
    } else if (isTestOrFixture) {
      add(
        `${sourcePrefix}skills/${rel}`,
        [],
        'unsupported',
        'Non-production skill test or fixture is excluded from the published support tree.'
      );
    } else {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
  }

  for (const s of skillsResult.skills) {
    resourceMap.push(Object.freeze({
      source: `skills/${s.source}`,
      sourceSemanticId: s.sourceSemanticId,
      target: s.target,
      localName: s.localName,
      targetName: s.targetName,
      nativeInvocationName: s.nativeInvocationName,
      family: 'skill',
      disposition: 'native'
    }));
  }

  // 5. Agents (19)
  for (const [name, agent] of Object.entries(agents).sort(([a], [b]) => a.localeCompare(b))) {
    add(`${sourcePrefix}agents/${agent.source}`, [agent.target], 'native');
    resourceMap.push(Object.freeze({
      source: `agents/${agent.source}`,
      sourceSemanticId: agent.sourceSemanticId,
      target: agent.target,
      localName: agent.localName,
      targetName: agent.targetName,
      family: 'agent',
      disposition: 'native'
    }));
  }

  // 6. Styles (6)
  for (const [stem, style] of Object.entries(styles).sort(([a], [b]) => a.localeCompare(b))) {
    add(
      `${sourcePrefix}output-styles/${style.source}`,
      [style.target],
      'approximated',
      'VS Code Local has no native output-style loader; style is projected as an explicit manual skill procedure.'
    );
    resourceMap.push(Object.freeze({
      source: `output-styles/${style.source}`,
      sourceSemanticId: style.sourceSemanticId,
      target: style.target,
      localName: style.localName,
      targetName: style.targetName,
      nativeInvocationName: style.nativeInvocationName,
      family: 'style',
      disposition: 'approximated'
    }));
  }

  // 7. Synthetic and support configurations
  add(
    `${sourcePrefix}settings.local.json`,
    [],
    'unsupported',
    'Claude local permission patterns are not activated by VS Code Local plugin.'
  );

  for (const file of context.resources.files.filter((item) => /^statusline\./u.test(item.path))) {
    add(
      `${sourcePrefix}${file.path}`,
      [],
      'unsupported',
      'VS Code Local provides no native statusline event or display mechanism.'
    );
  }

  // Validate all non-unsupported targets actually exist in staged output
  for (const entry of entries) {
    if (entry.disposition !== 'unsupported') {
      for (const t of entry.targets) {
        if (!targetExists(context, t)) {
          throw new ControlPlaneError('VALIDATION_INVALID');
        }
      }
    }
  }

  // Write resource-name-map.json
  writeJson(context, 'evcrate/resource-name-map.json', {
    schema: 'evcrate-vscode-resource-name-map-v1',
    plugin_id: 'evcrate-local',
    resources: resourceMap.sort((a, b) => a.source.localeCompare(b.source))
  });

  // Build source-to-output directory manifest
  const directoryEntries: Array<{
    readonly destinationDirectory: string;
    readonly sourceDirectory: string;
    readonly kind: string;
    readonly localName: string;
    readonly disposition: string;
    readonly fileCount: number;
  }> = [];

  const seenDestDirs = new Set<string>();

  // 1. Native and flattened document skills (40)
  for (const s of skillsResult.skills) {
    const destDir = s.target;
    if (seenDestDirs.has(destDir)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    seenDestDirs.add(destDir);
    const auditItem = skillsResult.audit.find((a) => a.source === s.source);
    directoryEntries.push(Object.freeze({
      destinationDirectory: destDir,
      sourceDirectory: `skills/${s.source}`,
      kind: s.source.startsWith('document-skills/') ? 'nested-document-skill' : 'native-skill',
      localName: s.localName,
      disposition: s.disposition,
      fileCount: auditItem?.files.length ?? s.files.length
    }));
  }

  // 2. Command procedures as manual skills (70)
  for (const cmd of Object.values(commandMap)) {
    const destDir = `skills/${cmd.localName}`;
    if (seenDestDirs.has(destDir)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    seenDestDirs.add(destDir);
    directoryEntries.push(Object.freeze({
      destinationDirectory: destDir,
      sourceDirectory: `commands/${cmd.source}`,
      kind: 'command-skill',
      localName: cmd.localName,
      disposition: cmd.disposition,
      fileCount: 1
    }));
  }

  // 3. Output styles as manual skills (6)
  for (const style of Object.values(styles)) {
    const destDir = `skills/${style.localName}`;
    if (seenDestDirs.has(destDir)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    seenDestDirs.add(destDir);
    directoryEntries.push(Object.freeze({
      destinationDirectory: destDir,
      sourceDirectory: `output-styles/${style.source}`,
      kind: 'style-skill',
      localName: style.localName,
      disposition: style.disposition,
      fileCount: 1
    }));
  }

  // 4. Archived support directories; loose root files remain in the resource inventory.
  let archivedDirectoryCount = 0;
  for (const arch of skillsResult.archived) {
    const archFiles = allSkillFiles.filter((f) => sourcePath('skills', f).startsWith(`${arch}/`));
    if (!archFiles.length) continue;
    const destDir = `evcrate/skills/${arch}`;
    if (seenDestDirs.has(destDir)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    seenDestDirs.add(destDir);
    directoryEntries.push(Object.freeze({
      destinationDirectory: destDir,
      sourceDirectory: `skills/${arch}`,
      kind: 'archived-skill',
      localName: arch,
      disposition: 'managed-static',
      fileCount: archFiles.length
    }));
    archivedDirectoryCount += 1;
  }

  // Write directory-manifest.json
  writeJson(context, 'evcrate/directory-manifest.json', {
    schema: 'evcrate-vscode-directory-manifest-v1',
    plugin_id: 'evcrate-local',
    total_skill_directories: directoryEntries.length,
    total_archived_directories: archivedDirectoryCount,
    directories: directoryEntries.sort((a, b) => a.destinationDirectory.localeCompare(b.destinationDirectory))
  });

  // Write projection-inventory.json
  const inventory = {
    schema: 'evcrate-vscode-projection-inventory-v1',
    plugin_id: 'evcrate-local',
    source: '.evcrate/source/.claude',
    target: '.evcrate-vscode',
    entries: entries.sort((a, b) => a.source.localeCompare(b.source)),
    maps: {
      commands: 'evcrate/command-name-map.json',
      skills: 'evcrate/skill-map.json',
      resources: 'evcrate/resource-name-map.json',
      agents: 'evcrate/agent-tool-audit.json',
      directories: 'evcrate/directory-manifest.json',
      hooks: 'evcrate/hook-inventory.json'
    },
    summary: {
      agents_count: Object.keys(agents).length,
      commands_count: Object.keys(commandMap).length,
      skills_count: skillsResult.skills.length,
      styles_count: Object.keys(styles).length,
      workflows_count: Object.keys(workflows).length,
      skill_directories_count: directoryEntries.length,
      archived_directories_count: archivedDirectoryCount,
      hooks_count: hookAudit ? hookAudit.events.length : 8
    }
  };

  writeJson(context, 'evcrate/projection-inventory.json', inventory);
  return Object.freeze(inventory);
}
