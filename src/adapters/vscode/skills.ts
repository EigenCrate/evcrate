import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import type { ResourceGraphFile } from '../resource-graph.js';
import { filesUnder, sourcePath, decodeUtf8, copyFile, copyText, writeJson } from './common.js';
import { parseFrontmatter, serializeFrontmatter } from './metadata.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';

export interface VscodeSkillAudit {
  readonly source: string;
  readonly target: string;
  readonly marker: string;
  readonly files: readonly string[];
}

export interface VscodeSkillsResult {
  readonly skills: readonly VscodeSkillMapEntry[];
  readonly archived: readonly string[];
  readonly audit: readonly VscodeSkillAudit[];
}

export function convertVscodeSkills(
  context: ProjectionBuildContext,
  skills: readonly VscodeSkillMapEntry[],
  archived: readonly string[],
  commandMap: Record<string, VscodeCommandMapEntry>
): VscodeSkillsResult {
  const allSkillFiles = filesUnder(context, 'skills');
  const audits: VscodeSkillAudit[] = [];

  for (const skill of skills) {
    const isNested = skill.source.startsWith('document-skills/');
    const sourcePrefix = `skills/${skill.source}`;
    const targetDir = skill.target; // e.g. "skills/docx"

    const packageFiles = allSkillFiles.filter((file) => {
      const rel = file.path;
      return rel === sourcePrefix || rel.startsWith(`${sourcePrefix}/`);
    });

    const copiedFiles: string[] = [];

    for (const file of packageFiles) {
      const relUnderPackage = file.path.slice(sourcePrefix.length + 1);
      const isMarker = relUnderPackage.toLowerCase() === 'skill.md';
      const targetRel = isMarker ? 'SKILL.md' : relUnderPackage;
      const targetPath = `${targetDir}/${targetRel}`;

      // Check if test or fixture file
      const parts = relUnderPackage.split('/');
      if (['tests', '__tests__', 'fixtures', 'helpers'].some((part) => parts.includes(part))) {
        // Excluded from production package
        continue;
      }

      if (isMarker) {
        const parsed = parseFrontmatter(decodeUtf8(file.bytes));
        const outFrontmatter: Record<string, unknown> = {
          name: skill.localName
        };

        if (typeof parsed.fields.description === 'string') {
          outFrontmatter.description = transformVscodePrompt(
            parsed.fields.description.trim(),
            commandMap,
            skills
          );
        }

        for (const [key, value] of Object.entries(parsed.fields)) {
          if (['name', 'description'].includes(key)) continue;
          outFrontmatter[key] = value;
        }

        const body = transformVscodePrompt(parsed.body, commandMap, skills);
        const rendered = serializeFrontmatter(outFrontmatter, body);
        copyText(context, file.path, targetPath, () => rendered);
      } else {
        copyFile(context, file.path, targetPath, (text) =>
          transformVscodePrompt(text, commandMap, skills)
        );
      }

      copiedFiles.push(targetRel);
    }

    audits.push(Object.freeze({
      source: skill.source,
      target: targetDir,
      marker: skill.markerTargetPath,
      files: Object.freeze(copiedFiles.sort())
    }));
  }

  // Copy archived support files to evcrate/skills/<relative>
  for (const archiveName of archived) {
    const archiveFiles = allSkillFiles.filter((file) => {
      const rel = sourcePath('skills', file);
      return rel === archiveName || rel.startsWith(`${archiveName}/`);
    });

    for (const file of archiveFiles) {
      const rel = sourcePath('skills', file);
      const targetPath = `evcrate/skills/${rel}`;
      copyFile(context, file.path, targetPath, (text) =>
        transformVscodePrompt(text, commandMap, skills)
      );
    }
  }

  // Write evcrate/skill-map.json
  const skillMapData = {
    schema: 'evcrate-vscode-skill-map-v1',
    plugin_id: 'evcrate-local',
    skills: skills.map((s) => ({
      source: s.source,
      sourceSemanticId: s.sourceSemanticId,
      target: s.target,
      localName: s.localName,
      targetName: s.targetName,
      nativeInvocationName: s.nativeInvocationName,
      marker: s.markerTargetPath,
      files: audits.find((a) => a.source === s.source)?.files ?? s.files,
      disposition: s.disposition
    })),
    archived: archived
  };

  writeJson(context, 'evcrate/skill-map.json', skillMapData);

  return Object.freeze({
    skills,
    archived,
    audit: Object.freeze(audits)
  });
}
