import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';
import { restoreIndexedTokens } from '../uri-restoration.js';

const URI_PATTERN = /(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/gu;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

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
  return restoreIndexedTokens(value, '__EVCRATE_VSCODE_URI_', saved);
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

  // Rewrite legacy docs token to qualified local development-rules workflow
  rendered = rendered.replace(
    /(?<![A-Za-z0-9_./~$\\{}-])\.\/docs\/development-rules\.md(?![A-Za-z0-9_/#?%+~$\\{}-]|\.[A-Za-z0-9_.-])/gu,
    './.evcrate-vscode/evcrate/workflows/development-rules.md'
  );

  // Append published-install fallback to local relative workflow references
  const localWorkflowPattern = /(?<![A-Za-z0-9_./~$\\{}-])(?<quote>`?)(?<path>(?:\.\/)?\.evcrate-vscode\/evcrate\/workflows\/(?<name>[A-Za-z0-9_-]+\.md))\k<quote>(?<closingParen>\)?)(?![A-Za-z0-9_/#?%+~$\\{}\x60-]|\.[A-Za-z0-9_.-])/gu;

  rendered = rendered.replace(localWorkflowPattern, (match, quote, path, name, closingParen, offset, whole) => {
    if (whole.startsWith(' if present; otherwise read ', offset + match.length)) return match;
    const q = quote || '';
    return `${q}${path}${q}${closingParen || ''} if present; otherwise read ${q}~/.evcrate-vscode/evcrate/workflows/${name}${q} (the published install)`;
  });

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
  let result = replaceCommandPaths(value, commandMap);
  result = replaceSkillReferences(result, skills);
  result = replaceWorkflowReferences(result);
  result = replaceInstructionReferences(result);
  result = replaceHarnessPaths(result);
  // Claude-native TodoWrite has no VS Code tool of that name; the model-facing tool is manage_todo_list.
  result = result.replace(/\bTodoWrite\b/gu, 'manage_todo_list');
  return result;
}
