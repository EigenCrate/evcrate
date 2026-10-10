import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { projectCatalogDataAndLayout } from '../catalog-data.js';
import type { ProjectionBuildContext } from '../types.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';
import { writeJson } from './common.js';

export function projectVscodeCatalogs(
  context: ProjectionBuildContext,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): void {
  // Use the scanners' established behavior-map format without changing native maps.
  writeJson(context, 'evcrate/scanner-command-map.json', {
    schema: 'evcrate-vscode-scanner-map-v1',
    behaviors: Object.values(commandMap).map((command) => ({
      kind: 'command-prose',
      status: 'migrated',
      source: command.source,
      target: `skills/${command.localName}/SKILL.md`,
      target_name: command.localName
    }))
  });
  projectCatalogDataAndLayout(context, {
    target: 'vscode',
    scriptDirectory: '.evcrate-vscode/evcrate/scripts',
    commands: {
      format: 'command-skill',
      root: '../../skills',
      authorityPath: '../scanner-command-map.json',
      mapRecord(cmd) {
        const item = Object.values(commandMap).find((c) => c.source === cmd.source);
        if (!item) throw new ControlPlaneError('VALIDATION_INVALID');
        return {
          name: `/${item.localName}`,
          path: `${item.localName}/SKILL.md`
        };
      }
    },
    skills: {
      root: '../../skills',
      authorityPath: 'skills_data.yaml',
      mapRecord(skill) {
        if (skill.name === 'template-skill' || skill.source.includes('template-skill')) {
          return null;
        }
        const item = skills.find(
          (s) => s.source === skill.source
            || s.source === skill.name
            || s.localName === skill.name
            || s.source === skill.source.replace(/\/SKILL\.md$/u, '')
        );
        if (!item) return null;
        return {
          name: item.localName,
          path: `${item.localName}/SKILL.md`
        };
      }
    }
  });
}
