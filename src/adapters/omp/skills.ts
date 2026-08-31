import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { copy, copyTree, filesUnder, relativeTo, writeJson } from './resources.js';
import { splitFrontmatter } from './frontmatter.js';
import type { CommandMap } from './commands.js';
import { translatePrompt } from './commands.js';

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function topPackages(context: ProjectionBuildContext): string[] {
  const names = new Set<string>();
  for (const entry of filesUnder(context, 'skills')) {
    const rel = relativeTo(entry.path, 'skills');
    if (rel) names.add(rel.split('/')[0]);
  }
  return [...names].sort();
}
function packageFiles(context: ProjectionBuildContext, packageName: string) {
  return filesUnder(context, `skills/${packageName}`).filter((entry) => entry.path !== `skills/${packageName}`);
}
function validateNative(context: ProjectionBuildContext, marker: string, directory: string): void {
  const parsed = splitFrontmatter(new TextDecoder().decode(context.resources.files.find((entry) => entry.path === marker)?.bytes ?? invalid()));
  const name = (parsed.fields.name ?? '').trim().replace(/^['"]|['"]$/gu, '');
  const description = (parsed.fields.description ?? '').trim();
  if (!SKILL_NAME.test(name) || name.length > 64 || !description || description.length > 1024 || !SKILL_NAME.test(directory)) invalid();
}
export function convertSkills(context: ProjectionBuildContext, map: CommandMap): { native: unknown[]; archived: string[] } {
  const native: unknown[] = [];
  const archived: string[] = [];
  const used = new Set<string>();
  for (const packageName of topPackages(context)) {
    const entries = packageFiles(context, packageName);
    const direct = entries.find((entry) => entry.path === `skills/${packageName}/SKILL.md` || entry.path === `skills/${packageName}/skill.md`);
    const nested = entries.filter((entry) => entry.path.endsWith('/SKILL.md') && entry.path.split('/').length === 4);
    if (direct) {
      const target = packageName;
      if (used.has(target)) invalid();
      used.add(target);
      validateNative(context, direct.path, target);
      const copied: string[] = [];
      for (const entry of entries) {
        const rel = relativeTo(entry.path, `skills/${packageName}`);
        const targetRel = rel === 'skill.md' ? 'SKILL.md' : rel;
        copy(context, entry.path, `skills/${target}/${targetRel}`, (value) => translatePrompt(value, map));
        copied.push(targetRel);
      }
      native.push({ source: packageName, target, files: copied });
      continue;
    }
    if (nested.length) {
      for (const marker of nested) {
        const parts = relativeTo(marker.path, `skills/${packageName}`).split('/');
        const target = parts[0];
        if (used.has(target)) invalid();
        used.add(target);
        validateNative(context, marker.path, target);
        const prefix = `skills/${packageName}/${target}`;
        const copied: string[] = [];
        for (const entry of entries.filter((candidate) => candidate.path.startsWith(`${prefix}/`))) {
          const rel = relativeTo(entry.path, prefix);
          copy(context, entry.path, `skills/${target}/${rel}`, (value) => translatePrompt(value, map));
          copied.push(rel);
        }
        native.push({ source: `${packageName}/${target}`, target, files: copied });
      }
      if (entries.some((entry) => relativeTo(entry.path, `skills/${packageName}`).split('/').length === 1)) {
        copyTree(context, `skills/${packageName}`, `evcrate/skills/${packageName}`, (value) => translatePrompt(value, map));
        archived.push(packageName);
      }
    } else {
      copyTree(context, `skills/${packageName}`, `evcrate/skills/${packageName}`, (value) => translatePrompt(value, map));
      archived.push(packageName);
    }
  }
  for (const entry of filesUnder(context, 'skills').filter((item) => relativeTo(item.path, 'skills').split('/').length === 1)) {
    const rel = relativeTo(entry.path, 'skills');
    copy(context, entry.path, `evcrate/skills/${rel}`, (value) => translatePrompt(value, map));
    archived.push(rel);
  }
  writeJson(context, 'evcrate/skill-map.json', { schema: 'evcrate-omp-skill-map-v1', native, archived: [...new Set(archived)].sort() });
  return { native, archived: [...new Set(archived)].sort() };
}
