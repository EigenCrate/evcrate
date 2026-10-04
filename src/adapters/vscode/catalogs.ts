import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { projectCatalogDataAndLayout } from '../catalog-data.js';
import type { ProjectionBuildContext } from '../types.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';

export function projectVscodeCatalogs(
  context: ProjectionBuildContext,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): void {
  projectCatalogDataAndLayout(context, {
    target: 'vscode',
    scriptDirectory: '.evcrate-vscode/evcrate/scripts',
    commands: {
      format: 'command-skill',
      root: '../../skills',
      authorityPath: '../command-name-map.json',
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
      authorityPath: '../skill-map.json',
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
