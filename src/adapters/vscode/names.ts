import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import type { ResourceGraphFile } from '../resource-graph.js';
import { filesUnder, sourcePath, decodeUtf8 } from './common.js';
import { parseFrontmatter } from './metadata.js';

export interface VscodeCommandMapEntry {
  readonly source: string;
  readonly sourceSemanticId: string;
  readonly sourceName: string;
  readonly target: string;
  readonly localName: string;
  readonly targetName: string;
  readonly nativeInvocationName: string;
  readonly description: string;
  readonly argumentHint?: string;
  readonly disposition: string;
}

export interface VscodeSkillMapEntry {
  readonly source: string;
  readonly sourceSemanticId: string;
  readonly target: string;
  readonly localName: string;
  readonly targetName: string;
  readonly nativeInvocationName: string;
  readonly markerSourcePath: string;
  readonly markerTargetPath: string;
  readonly files: readonly string[];
  readonly disposition: string;
}

export interface VscodeAgentMapEntry {
  readonly source: string;
  readonly sourceSemanticId: string;
  readonly target: string;
  readonly localName: string;
  readonly targetName: string;
  readonly disposition: string;
}

export interface VscodeStyleMapEntry {
  readonly source: string;
  readonly sourceSemanticId: string;
  readonly target: string;
  readonly localName: string;
  readonly targetName: string;
  readonly nativeInvocationName: string;
  readonly description: string;
  readonly disposition: string;
}

export interface VscodeWorkflowMapEntry {
  readonly source: string;
  readonly sourceSemanticId: string;
  readonly target: string;
  readonly localName: string;
  readonly targetName: string;
  readonly disposition: string;
}

export interface VscodeDiscoveredNames {
  readonly commands: Readonly<Record<string, VscodeCommandMapEntry>>;
  readonly skills: readonly VscodeSkillMapEntry[];
  readonly archivedSkills: readonly string[];
  readonly agents: Readonly<Record<string, VscodeAgentMapEntry>>;
  readonly styles: Readonly<Record<string, VscodeStyleMapEntry>>;
  readonly workflows: Readonly<Record<string, VscodeWorkflowMapEntry>>;
  readonly skillDirectoryNames: readonly string[];
}

const KEBAB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function discoverVscodeCommands(context: ProjectionBuildContext): Record<string, VscodeCommandMapEntry> {
  const result: Record<string, VscodeCommandMapEntry> = {};
  const commandFiles = filesUnder(context, 'commands')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of commandFiles) {
    const rel = sourcePath('commands', file);
    const stem = rel.slice(0, -3); // remove .md
    const sourceSemanticId = stem.replaceAll('/', ':');
    const flattened = stem.replaceAll('/', '-');
    const localName = `cmd-${flattened}`;

    if (!KEBAB_PATTERN.test(localName) || localName.length > 64) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const parsed = parseFrontmatter(decodeUtf8(file.bytes));
    const description = typeof parsed.fields.description === 'string'
      ? parsed.fields.description.trim()
      : '';
    const argumentHint = typeof parsed.fields['argument-hint'] === 'string'
      ? parsed.fields['argument-hint'].trim()
      : undefined;

    result[stem] = Object.freeze({
      source: rel,
      sourceSemanticId,
      sourceName: stem,
      target: `skills/${localName}/SKILL.md`,
      localName,
      targetName: localName,
      nativeInvocationName: `/${localName}`,
      description,
      argumentHint,
      disposition: 'approximated'
    });
  }

  return Object.freeze(result);
}

export function discoverVscodeSkills(context: ProjectionBuildContext): {
  readonly skills: readonly VscodeSkillMapEntry[];
  readonly archived: readonly string[];
} {
  const allSkillFiles = filesUnder(context, 'skills');
  const packages = new Map<string, ResourceGraphFile[]>();

  for (const file of allSkillFiles) {
    const rel = sourcePath('skills', file);
    const topFolder = rel.split('/')[0];
    const list = packages.get(topFolder) ?? [];
    list.push(file);
    packages.set(topFolder, list);
  }

  const skills: VscodeSkillMapEntry[] = [];
  const archived: string[] = [];
  const usedNames = new Set<string>();

  for (const [topFolder, fileList] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // 1. Check direct marker: skills/<topFolder>/[sS][kK][iI][lL][lL].[mM][dD]
    const directMarker = fileList.find((f) => {
      const parts = sourcePath('skills', f).split('/');
      return parts.length === 2 && parts[0] === topFolder && parts[1].toLowerCase() === 'skill.md';
    });

    if (directMarker) {
      const localName = topFolder;
      if (!KEBAB_PATTERN.test(localName) || localName.length > 64 || usedNames.has(localName.toLowerCase())) {
        throw new ControlPlaneError('VALIDATION_INVALID');
      }
      usedNames.add(localName.toLowerCase());

      const packageFiles = fileList
        .map((f) => sourcePath(`skills/${topFolder}`, f))
        .map((p) => (p.toLowerCase() === 'skill.md' ? 'SKILL.md' : p))
        .sort();

      skills.push(Object.freeze({
        source: topFolder,
        sourceSemanticId: topFolder,
        target: `skills/${localName}`,
        localName,
        targetName: localName,
        nativeInvocationName: `/${localName}`,
        markerSourcePath: directMarker.path,
        markerTargetPath: `skills/${localName}/SKILL.md`,
        files: Object.freeze(packageFiles),
        disposition: 'native'
      }));
      continue;
    }

    // 2. Check nested markers: skills/<topFolder>/<nestedName>/[sS][kK][iI][lL][lL].[mM][dD]
    const nestedMarkers = fileList.filter((f) => {
      const parts = sourcePath('skills', f).split('/');
      return parts.length === 3 && parts[0] === topFolder && parts[2].toLowerCase() === 'skill.md';
    });

    if (!nestedMarkers.length) {
      archived.push(topFolder);
      continue;
    }

    for (const nestedMarker of nestedMarkers.sort((a, b) => a.path.localeCompare(b.path))) {
      const parts = sourcePath('skills', nestedMarker).split('/');
      const nestedName = parts[1];
      const localName = nestedName;

      if (!KEBAB_PATTERN.test(localName) || localName.length > 64 || usedNames.has(localName.toLowerCase())) {
        throw new ControlPlaneError('VALIDATION_INVALID');
      }
      usedNames.add(localName.toLowerCase());

      const packagePrefix = `${topFolder}/${nestedName}`;
      const packageFiles = fileList
        .filter((f) => sourcePath('skills', f).startsWith(`${packagePrefix}/`))
        .map((f) => sourcePath(`skills/${packagePrefix}`, f))
        .map((p) => (p.toLowerCase() === 'skill.md' ? 'SKILL.md' : p))
        .sort();

      skills.push(Object.freeze({
        source: packagePrefix,
        sourceSemanticId: packagePrefix.replaceAll('/', ':'),
        target: `skills/${localName}`,
        localName,
        targetName: localName,
        nativeInvocationName: `/${localName}`,
        markerSourcePath: nestedMarker.path,
        markerTargetPath: `skills/${localName}/SKILL.md`,
        files: Object.freeze(packageFiles),
        disposition: 'native'
      }));
    }
  }

  return {
    skills: Object.freeze(skills),
    archived: Object.freeze([...new Set(archived)].sort())
  };
}

export function discoverVscodeAgents(context: ProjectionBuildContext): Record<string, VscodeAgentMapEntry> {
  const result: Record<string, VscodeAgentMapEntry> = {};
  const files = filesUnder(context, 'agents')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of files) {
    const rel = sourcePath('agents', file);
    const name = rel.slice(0, -3);
    if (!KEBAB_PATTERN.test(name) || name.length > 64) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    result[name] = Object.freeze({
      source: rel,
      sourceSemanticId: name,
      target: `com.github.copilot/agents/${name}.agent.md`,
      localName: name,
      targetName: name,
      disposition: 'native'
    });
  }

  return Object.freeze(result);
}

export function discoverVscodeStyles(context: ProjectionBuildContext): Record<string, VscodeStyleMapEntry> {
  const result: Record<string, VscodeStyleMapEntry> = {};
  const files = filesUnder(context, 'output-styles')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of files) {
    const rel = sourcePath('output-styles', file);
    const stem = rel.slice(0, -3);
    const localName = `style-${stem}`;

    if (!KEBAB_PATTERN.test(localName) || localName.length > 64) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const parsed = parseFrontmatter(decodeUtf8(file.bytes));
    const description = typeof parsed.fields.description === 'string'
      ? parsed.fields.description.trim()
      : `Manual style procedure for ${stem}`;

    result[stem] = Object.freeze({
      source: rel,
      sourceSemanticId: stem,
      target: `skills/${localName}/SKILL.md`,
      localName,
      targetName: localName,
      nativeInvocationName: `/${localName}`,
      description,
      disposition: 'approximated'
    });
  }

  return Object.freeze(result);
}

export function discoverVscodeWorkflows(context: ProjectionBuildContext): Record<string, VscodeWorkflowMapEntry> {
  const result: Record<string, VscodeWorkflowMapEntry> = {};
  const files = filesUnder(context, 'workflows')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of files) {
    const rel = sourcePath('workflows', file);
    const stem = rel.slice(0, -3);
    const segments = stem.split('/');

    if (!segments.every((seg) => KEBAB_PATTERN.test(seg) && seg.length <= 64)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    result[stem] = Object.freeze({
      source: rel,
      sourceSemanticId: stem,
      target: `evcrate/workflows/${rel}`,
      localName: stem,
      targetName: stem,
      disposition: 'managed-static'
    });
  }

  return Object.freeze(result);
}

export function discoverAllVscodeNames(context: ProjectionBuildContext): VscodeDiscoveredNames {
  const commands = discoverVscodeCommands(context);
  const skillDiscovery = discoverVscodeSkills(context);
  const agents = discoverVscodeAgents(context);
  const styles = discoverVscodeStyles(context);
  const workflows = discoverVscodeWorkflows(context);

  // Validate no collisions in the skills/ directory namespace
  const skillDirs = new Set<string>();
  const allSkillDirs: string[] = [];

  for (const skill of skillDiscovery.skills) {
    const lower = skill.localName.toLowerCase();
    if (skillDirs.has(lower)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    skillDirs.add(lower);
    allSkillDirs.push(skill.localName);
  }

  for (const cmd of Object.values(commands)) {
    const lower = cmd.localName.toLowerCase();
    if (skillDirs.has(lower)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    skillDirs.add(lower);
    allSkillDirs.push(cmd.localName);
  }

  for (const style of Object.values(styles)) {
    const lower = style.localName.toLowerCase();
    if (skillDirs.has(lower)) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    skillDirs.add(lower);
    allSkillDirs.push(style.localName);
  }

  allSkillDirs.sort();

  return Object.freeze({
    commands,
    skills: skillDiscovery.skills,
    archivedSkills: skillDiscovery.archived,
    agents,
    styles,
    workflows,
    skillDirectoryNames: Object.freeze(allSkillDirs)
  });
}
