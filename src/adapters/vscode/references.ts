import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';

const URI_PATTERN = /(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/gu;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function protectSegments(value: string): {
  readonly text: string;
  readonly protectedEntries: readonly [string, string][];
} {
  const saved: [string, string][] = [];

  const text = value.replace(URI_PATTERN, (original) => {
    if (/^(?:claude|vscode):(?!\/\/)/iu.test(original)) return original;
    const token = `__EVCRATE_VSCODE_URI_${saved.length}__`;
    saved.push([token, original]);
    return token;
  });

  return { text, protectedEntries: saved };
}

function restoreSegments(value: string, saved: readonly [string, string][]): string {
  let result = value;
  for (const [token, original] of saved) {
    result = result.replaceAll(token, original);
  }
  return result;
}

export function replaceCommandPaths(
  value: string,
  commandMap: Record<string, VscodeCommandMapEntry>
): string {
  const guarded = protectSegments(value);
  let rendered = guarded.text;

  const entries = Object.values(commandMap).sort((a, b) => b.source.length - a.source.length);

  for (const item of entries) {
    const prefixes = [
      ['${HOME}/', '${HOME}/.evcrate-vscode/'],
      ['$HOME/', '$HOME/.evcrate-vscode/'],
      ['~/', '~/.evcrate-vscode/'],
      ['./', './.evcrate-vscode/'],
      ['', '.evcrate-vscode/']
    ] as const;

    for (const [prefix, replacement] of prefixes) {
      rendered = rendered.replaceAll(
        `${prefix}.claude/commands/${item.source}`,
        `${replacement}${item.target}`
      );
    }
  }

  return restoreSegments(rendered, guarded.protectedEntries);
}

export function renderCommandReferences(
  value: string,
  commandMap: Record<string, VscodeCommandMapEntry>
): string {
  const base = replaceCommandPaths(value, commandMap);
  const guarded = protectSegments(base);
  let rendered = guarded.text;

  const entries = Object.values(commandMap).sort((a, b) => b.sourceName.length - a.sourceName.length);

  for (const item of entries) {
    const forms = [item.sourceName, item.sourceName.replaceAll('/', ':'), item.sourceName.replaceAll(':', '/')];
    for (const form of forms) {
      const pattern = new RegExp(
        `(?<![A-Za-z0-9_/:])/(?:evcrate:)?${escapeRegex(form)}(?![A-Za-z0-9_-])`,
        'giu'
      );
      rendered = rendered.replace(pattern, `/${item.localName}`);
    }
  }

  return restoreSegments(rendered, guarded.protectedEntries);
}

export function replaceSkillReferences(
  value: string,
  skills: readonly VscodeSkillMapEntry[]
): string {
  const guarded = protectSegments(value);
  let rendered = guarded.text;

  // Sort nested document-skills first to prevent partial replacement
  const sorted = [...skills].sort((a, b) => b.source.length - a.source.length);

  for (const skill of sorted) {
    const prefixes = [
      ['${HOME}/', '${HOME}/.evcrate-vscode/'],
      ['$HOME/', '$HOME/.evcrate-vscode/'],
      ['~/', '~/.evcrate-vscode/'],
      ['./', './.evcrate-vscode/'],
      ['', '.evcrate-vscode/']
    ] as const;

    for (const [prefix, replacement] of prefixes) {
      rendered = rendered.replaceAll(
        `${prefix}.claude/skills/${skill.source}`,
        `${replacement}${skill.target}`
      );
    }

    // Relative markdown link adjustments: (../document-skills/docx/...) -> (../docx/...)
    if (skill.source.startsWith('document-skills/')) {
      rendered = rendered.replace(
        new RegExp(`\\]\\(\\.\\./(?:\\.\\./)?${escapeRegex(skill.source)}/`, 'gu'),
        `](../${skill.localName}/`
      );
    }
  }

  return restoreSegments(rendered, guarded.protectedEntries);
}

export function replaceWorkflowReferences(value: string): string {
  const guarded = protectSegments(value);
  let rendered = guarded.text;

  const prefixes = [
    ['${HOME}/', '${HOME}/.evcrate-vscode/'],
    ['$HOME/', '$HOME/.evcrate-vscode/'],
    ['~/', '~/.evcrate-vscode/'],
    ['./', './.evcrate-vscode/'],
    ['', '.evcrate-vscode/']
  ] as const;

  for (const [prefix, replacement] of prefixes) {
    rendered = rendered.replace(
      new RegExp(`${escapeRegex(prefix)}\\.claude/workflows/([A-Za-z0-9_-]+\\.md)`, 'gu'),
      `${replacement}evcrate/workflows/$1`
    );
  }

  return restoreSegments(rendered, guarded.protectedEntries);
}

export function replaceInstructionReferences(value: string): string {
  const guarded = protectSegments(value);
  let rendered = guarded.text;

  const prefixes = [
    ['${HOME}/.evcrate/source/', '${HOME}/.evcrate-vscode/'],
    ['$HOME/.evcrate/source/', '$HOME/.evcrate-vscode/'],
    ['~/.evcrate/source/', '~/.evcrate-vscode/'],
    ['./.evcrate/source/', './.evcrate-vscode/'],
    ['.evcrate/source/', '.evcrate-vscode/']
  ] as const;

  for (const [prefix, replacement] of prefixes) {
    rendered = rendered.replaceAll(
      `${prefix}CLAUDE.md`,
      `${replacement}com.github.copilot/rules/bootstrap.instructions.md`
    );
  }

  return restoreSegments(rendered, guarded.protectedEntries);
}

export function replaceHarnessPaths(value: string): string {
  const guarded = protectSegments(value);
  let rendered = guarded.text;

  for (const prefix of ['~', '$HOME', '${HOME}']) {
    for (const suffix of ['workflows', 'scripts', 'hooks', 'output-styles', 'skills']) {
      const target = suffix === 'skills'
        ? `${prefix}/.evcrate-vscode/skills`
        : `${prefix}/.evcrate-vscode/evcrate/${suffix}`;
      rendered = rendered.replaceAll(`${prefix}/.claude/${suffix}`, target);
    }
    rendered = rendered.replaceAll(`${prefix}/.claude`, `${prefix}/.evcrate-vscode`);
  }

  for (const suffix of ['workflows', 'scripts', 'hooks', 'output-styles', 'skills']) {
    const target = suffix === 'skills'
      ? '.evcrate-vscode/skills'
      : `.evcrate-vscode/evcrate/${suffix}`;
    rendered = rendered.replaceAll(`.claude/${suffix}`, target);
  }

  rendered = rendered.replace(/(?<![A-Za-z0-9_])\.claude(?=(?:[/\\'"`\)\]\}]|\s|$))/gu, '.evcrate-vscode');
  return restoreSegments(rendered, guarded.protectedEntries);
}

export function transformVscodePrompt(
  value: string,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): string {
  let result = renderCommandReferences(value, commandMap);
  result = replaceSkillReferences(result, skills);
  result = replaceWorkflowReferences(result);
  result = replaceInstructionReferences(result);
  result = replaceHarnessPaths(result);
  return result;
}
