import type { ProjectionBuildContext } from '../types.js';
import type { ResourceGraphFile } from '../resource-graph.js';
import { copyFile, copyText, filesUnder, fieldString, parseFrontmatter, sourcePath, invalid, writeJson, decode } from './common.js';
import { yamlValue } from './prompts.js';
import type { SimpleMap } from './prompts.js';
import { assertUniqueNames, copilotSkillName } from '../resource-naming.js';

function serializeNativeSkill(fields: Record<string, string>, name: string, description: string, body: string): string {
  const output: Record<string, unknown> = { name, description };
  for (const key of Object.keys(fields).filter((key) => !['name', 'description', 'model'].includes(key)).sort()) output[key] = fields[key];
  const lines = ['---']; for (const [key, value] of Object.entries(output)) lines.push(`${key}: ${yamlValue(value)}`);
  lines.push('---', '', body.replace(/\r\n?/gu, '\n').replace(/\n+$/u, ''), ''); return lines.join('\n');
}
export interface NativeSkill { packageName: string; marker: string; targetName: string; source: string }
export interface SkillAudit { source: string; target: string; files: string[] }
export interface SkillDiscovery { names: SimpleMap; native: NativeSkill[]; archived: string[] }
export interface SkillResult { names: SimpleMap; native: SkillAudit[]; archived: string[] }

function packageFiles(context: ProjectionBuildContext): Map<string, ResourceGraphFile[]> {
  const result = new Map<string, ResourceGraphFile[]>();
  for (const file of filesUnder(context, 'skills')) {
    const relative = sourcePath('skills', file);
    const packageName = relative.split('/')[0];
    const list = result.get(packageName) ?? [];
    list.push(file);
    result.set(packageName, list);
  }
  return result;
}
function skillMarker(file: ResourceGraphFile, packageName: string, nested: boolean): boolean {
  const relative = sourcePath('skills', file).split('/');
  return relative.length === (nested ? 3 : 2)
    && relative.slice(0, nested ? 2 : 1).join('/') === packageName
    && ['skill.md', 'SKILL.md'].includes(relative.at(-1) as string);
}
function nestedSkillMarker(file: ResourceGraphFile, packageName: string): boolean {
  const relative = sourcePath('skills', file).split('/');
  return relative.length === 3 && relative[0] === packageName && relative[2].toLowerCase() === 'skill.md';
}
export function discoverSkills(context: ProjectionBuildContext): SkillDiscovery {
  const names: Record<string, string> = {};
  const native: NativeSkill[] = [];
  const archived: string[] = [];
  for (const [packageName, list] of [...packageFiles(context)].sort(([a], [b]) => a.localeCompare(b))) {
    const direct = list.filter((file) => skillMarker(file, packageName, false));
    if (direct.length > 1) invalid();
    const candidates: { packageName: string; marker: ResourceGraphFile; skillName: string }[] = [];
    if (direct.length) {
      candidates.push({ packageName, marker: direct[0], skillName: packageName });
    } else {
      const nested = list.filter((file) => nestedSkillMarker(file, packageName));
      if (!nested.length) { archived.push(packageName); continue; }
      if (list.some((file) => sourcePath('skills', file).split('/').length === 2)) archived.push(packageName);
      for (const marker of nested) {
        const relative = sourcePath('skills', marker).split('/');
        candidates.push({ packageName: `${packageName}/${relative[1]}`, marker, skillName: relative[1] });
      }
    }
    for (const candidate of candidates) {
      const target = copilotSkillName(candidate.skillName);
      names[candidate.skillName.toLowerCase()] = target;
      native.push({ packageName: candidate.packageName, marker: candidate.marker.path, targetName: target, source: candidate.packageName });
    }
  }
  assertUniqueNames(native.map((item) => item.targetName));
  for (const file of filesUnder(context, 'skills')) {
    const relative = sourcePath('skills', file);
    if (relative.split('/').length === 1 && !archived.includes(relative)) archived.push(relative);
  }
  return { names, native, archived: [...new Set(archived)].sort() };
}
export function convertSkills(context: ProjectionBuildContext, discovered: SkillDiscovery, transform: (value: string) => string): SkillResult {
  const nativeAudit: SkillAudit[] = [];
  for (const item of discovered.native) {
    const marker = context.resources.files.find((file) => file.path === item.marker); if (!marker) invalid();
    const parsed = parseFrontmatter(decode(marker.bytes)); const sourceName = fieldString(parsed.fields, 'name').trim(); const description = fieldString(parsed.fields, 'description').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(sourceName) || sourceName.length > 64 || !description || description.length > 1024) invalid();
    const finalDescription = transform(description).trim(); if (!finalDescription || finalDescription.length > 1024) invalid();
    const files: string[] = [];
    for (const file of filesUnder(context, `skills/${item.packageName}`)) {
      const relative = sourcePath(`skills/${item.packageName}`, file);
      const destination = relative === sourcePath(`skills/${item.packageName}`, marker)
        ? `skills/${item.targetName}/SKILL.md` : `skills/${item.targetName}/${relative}`;
      if (file.path === marker.path) copyText(context, file.path, destination, () => serializeNativeSkill(parsed.fields, item.targetName, finalDescription, transform(parsed.body)));
      else copyFile(context, file.path, destination, transform);
      files.push(destination.slice(`skills/${item.targetName}/`.length));
    }
    nativeAudit.push({ source: item.source, target: `skills/${item.targetName}`, files });
  }
  const nativeRoots = discovered.native.map((item) => item.packageName);
  for (const file of filesUnder(context, 'skills')) {
    const relative = sourcePath('skills', file); const packageName = relative.split('/')[0];
    const archivedPackage = discovered.archived.includes(packageName);
    const nativeFile = nativeRoots.some((root) => relative === root || relative.startsWith(`${root}/`));
    if (!archivedPackage && nativeFile) continue;
    if (!archivedPackage) continue;
    copyFile(context, file.path, `evcrate/skills/${relative}`, transform);
  }
  writeJson(context, 'evcrate/skill-map.json', { schema: 'evcrate-copilot-skill-map-v1', native: nativeAudit, archived: discovered.archived });
  return { names: discovered.names, native: nativeAudit, archived: discovered.archived };
}
