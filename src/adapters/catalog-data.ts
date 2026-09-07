import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { graphText, writeProjectionFile } from './projection-utils.js';
import type { ProjectionBuildContext } from './types.js';
import {
  COMMAND_KEYS,
  SKILL_KEYS,
  VALID_CMD_CATS,
  VALID_SKILL_CATS,
  isSafePosixPath,
  parseCatalogYaml,
  serializeCommandYaml,
  serializeSkillYaml,
  type CommandCatalogRecord,
  type ScannerLayout,
  type SkillCatalogRecord,
  type TargetCatalogMapping
} from './catalog-types.js';

export * from './catalog-types.js';

export function validateCommandRecords(records: unknown): CommandCatalogRecord[] {
  if (!Array.isArray(records)) throw new ControlPlaneError('VALIDATION_INVALID');
  const seenSrc = new Set<string>();
  const seenName = new Set<string>();
  const seenPath = new Set<string>();
  const validated: CommandCatalogRecord[] = [];

  for (const item of records) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ControlPlaneError('VALIDATION_INVALID');
    const rec = item as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length !== COMMAND_KEYS.length || !COMMAND_KEYS.every((k) => k in rec)) throw new ControlPlaneError('VALIDATION_INVALID');
    for (const k of COMMAND_KEYS) {
      if (typeof rec[k] !== 'string') throw new ControlPlaneError('VALIDATION_INVALID');
      if (k !== 'argument_hint' && !(rec[k] as string).trim()) throw new ControlPlaneError('VALIDATION_INVALID');
    }
    const src = rec.source as string;
    const name = rec.name as string;
    const path = rec.path as string;
    const cat = rec.category as string;
    if (!isSafePosixPath(src) || !isSafePosixPath(path) || !name.startsWith('/') || !VALID_CMD_CATS[cat]) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    if (seenSrc.has(src) || seenName.has(name) || seenPath.has(path)) throw new ControlPlaneError('VALIDATION_INVALID');
    seenSrc.add(src);
    seenName.add(name);
    seenPath.add(path);
    validated.push({
      source: src,
      name,
      path,
      description: rec.description as string,
      argument_hint: rec.argument_hint as string,
      category: cat
    });
  }
  return validated;
}

export function validateSkillRecords(records: unknown): SkillCatalogRecord[] {
  if (!Array.isArray(records)) throw new ControlPlaneError('VALIDATION_INVALID');
  const seenSrc = new Set<string>();
  const seenName = new Set<string>();
  const seenPath = new Set<string>();
  const validated: SkillCatalogRecord[] = [];

  for (const item of records) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ControlPlaneError('VALIDATION_INVALID');
    const rec = item as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length !== SKILL_KEYS.length || !SKILL_KEYS.every((k) => k in rec)) throw new ControlPlaneError('VALIDATION_INVALID');
    for (const k of ['source', 'name', 'path', 'description', 'category'] as const) {
      if (typeof rec[k] !== 'string' || !(rec[k] as string).trim()) throw new ControlPlaneError('VALIDATION_INVALID');
    }
    if (typeof rec.has_scripts !== 'boolean' || typeof rec.has_references !== 'boolean') {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    const src = rec.source as string;
    const name = rec.name as string;
    const path = rec.path as string;
    const cat = rec.category as string;
    if (!isSafePosixPath(src) || !isSafePosixPath(path) || src.includes('template-skill') || name.includes('template-skill') || path.includes('template-skill') || !VALID_SKILL_CATS[cat]) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    if (seenSrc.has(src) || seenName.has(name) || seenPath.has(path)) throw new ControlPlaneError('VALIDATION_INVALID');
    seenSrc.add(src);
    seenName.add(name);
    seenPath.add(path);
    validated.push({
      source: src,
      name,
      path,
      description: rec.description as string,
      category: cat,
      has_scripts: rec.has_scripts as boolean,
      has_references: rec.has_references as boolean
    });
  }
  return validated;
}

export function projectCatalogDataAndLayout(
  context: ProjectionBuildContext,
  mapping: TargetCatalogMapping
): void {
  const canonicalCommandsRaw = parseCatalogYaml(graphText(context, 'scripts/commands_data.yaml'));
  const canonicalSkillsRaw = parseCatalogYaml(graphText(context, 'scripts/skills_data.yaml'));
  const canonicalCommands = validateCommandRecords(canonicalCommandsRaw);
  const canonicalSkills = validateSkillRecords(canonicalSkillsRaw);

  const commandOut = mapping.commands.output ?? 'commands_data.yaml';
  const skillOut = mapping.skills.output ?? 'skills_data.yaml';

  const transformedCommands: CommandCatalogRecord[] = [];
  for (const cmd of canonicalCommands) {
    const mapped = mapping.commands.mapRecord(cmd);
    const nativeFilePath = context.stagePath(join(mapping.scriptDirectory, mapping.commands.root, mapped.path));
    if (!existsSync(nativeFilePath) || lstatSync(nativeFilePath).isSymbolicLink() || !lstatSync(nativeFilePath).isFile()) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    transformedCommands.push({
      source: cmd.source,
      name: mapped.name,
      path: mapped.path,
      description: mapped.description ?? cmd.description,
      argument_hint: mapped.argument_hint ?? cmd.argument_hint,
      category: mapped.category ?? cmd.category
    });
  }
  const validatedCommands = validateCommandRecords(transformedCommands);

  const transformedSkills: SkillCatalogRecord[] = [];
  for (const skill of canonicalSkills) {
    const mapped = mapping.skills.mapRecord(skill);
    if (!mapped) continue;
    const nativeSkillFile = context.stagePath(join(mapping.scriptDirectory, mapping.skills.root, mapped.path));
    if (!existsSync(nativeSkillFile) || lstatSync(nativeSkillFile).isSymbolicLink() || !lstatSync(nativeSkillFile).isFile()) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    const skillDir = join(nativeSkillFile, '..');
    const hasScripts = existsSync(join(skillDir, 'scripts')) && !lstatSync(join(skillDir, 'scripts')).isSymbolicLink() && lstatSync(join(skillDir, 'scripts')).isDirectory();
    const hasReferences = existsSync(join(skillDir, 'references')) && !lstatSync(join(skillDir, 'references')).isSymbolicLink() && lstatSync(join(skillDir, 'references')).isDirectory();
    transformedSkills.push({
      source: skill.source,
      name: mapped.name,
      path: mapped.path,
      description: mapped.description ?? skill.description,
      category: mapped.category ?? skill.category,
      has_scripts: hasScripts,
      has_references: hasReferences
    });
  }
  const validatedSkills = validateSkillRecords(transformedSkills);

  const layout: ScannerLayout = {
    schema: 'evcrate-scanner-layout-v1',
    target: mapping.target,
    commands: {
      format: mapping.commands.format,
      root: mapping.commands.root,
      output: commandOut,
      authority: mapping.commands.authorityPath
    },
    skills: {
      root: mapping.skills.root,
      output: skillOut,
      authority: mapping.skills.authorityPath
    }
  };

  const encoder = new TextEncoder();
  writeProjectionFile(context, `${mapping.scriptDirectory}/scanner-layout.json`, encoder.encode(JSON.stringify(layout, null, 2) + '\n'), 0o644);
  writeProjectionFile(context, `${mapping.scriptDirectory}/${commandOut}`, encoder.encode(serializeCommandYaml(validatedCommands)), 0o644);
  writeProjectionFile(context, `${mapping.scriptDirectory}/${skillOut}`, encoder.encode(serializeSkillYaml(validatedSkills)), 0o644);
}
