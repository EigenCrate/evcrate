import { renderHarness } from './text.js';
import { restoreIndexedTokens } from '../uri-restoration.js';

export interface NameMapEntry { source: string; sourceName: string; target: string; targetName: string; description?: string; descriptionSource?: string; argumentHint?: string }
export interface NameMap { readonly [key: string]: NameMapEntry }
export interface SimpleMap { readonly [key: string]: string }

const URI = /(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/gu;
function protect(value: string): { text: string; protected: [string, string][] } {
  const saved: [string, string][] = [];
  const text = value.replace(URI, (original) => {
    if (/^claude:(?!\/\/)/iu.test(original)) return original;
    const token = `__EVCRATE_COPILOT_URI_${saved.length}__`;
    saved.push([token, original]);
    return token;
  });
  return { text, protected: saved };
}
function restore(value: string, saved: readonly [string, string][]): string {
  return restoreIndexedTokens(value, '__EVCRATE_COPILOT_URI_', saved);
}

export function replaceCommandPaths(value: string, commandMap: NameMap): string {
  const guarded = protect(value);
  let rendered = guarded.text;
  for (const item of Object.values(commandMap).sort((a, b) => b.source.length - a.source.length)) {
    for (const [prefix, replacement] of [['${HOME}/', '${HOME}/.copilot/'], ['$HOME/', '$HOME/.copilot/'], ['~/', '~/.copilot/'], ['./', './.copilot/'], ['', '.copilot/']] as const) {
      rendered = rendered.replaceAll(`${prefix}.claude/commands/${item.source}`, `${replacement}${item.target}`);
    }
  }
  return restore(rendered, guarded.protected);
}

export function replaceKnownNames(value: string, skills: SimpleMap): string {
  const guarded = protect(value);
  let rendered = guarded.text;
  for (const [source, target] of Object.entries(skills).sort((a, b) => b[0].length - a[0].length)) {
    const escaped = escapeRegex(source);
    rendered = rendered.replace(new RegExp(String.raw`(?<![A-Za-z0-9_-])\x60${escaped}\x60`, 'giu'), `\`${target}\``);
    rendered = rendered.replace(new RegExp(String.raw`(skills?/)${escaped}(?=[/\s\x60)]|$)`, 'giu'), `$1${target}`);
  }
  for (const [source, target] of Object.entries(skills)) {
    rendered = rendered.replace(new RegExp(String.raw`(\]\((?:\.\./)+)${escapeRegex(source)}(?=/)`, 'giu'), `$1${target}`);
  }
  return restore(rendered, guarded.protected);
}

export function translatePrompt(value: string, commandMap: NameMap, skills: SimpleMap = {}): string {
  let rendered = replaceCommandPaths(value, commandMap);
  rendered = renderHarness(rendered);
  rendered = replaceKnownNames(rendered, skills);
  const guarded = protect(rendered);
  rendered = guarded.text;
  for (const [pattern, replacement] of [
    [/\bClaude Code CLI\b/gu, 'GitHub Copilot CLI'], [/\bclaude\.ai\/code\b/gu, 'GitHub Copilot CLI'],
    [/\bCLAUDE_PROJECT_DIR\b/gu, 'COPILOT_PROJECT_DIR'], [/\bCLAUDE_ENV_FILE\b/gu, 'COPILOT_ENV_FILE'],
    [/\bEVCRATE_CLAUDE_SETTINGS_DIR\b/gu, 'EVCRATE_COPILOT_SETTINGS_DIR'], [/\bCLAUDE_PLUGIN_ROOT\b/gu, 'COPILOT_PLUGIN_ROOT'],
    [/\bCLAUDE\.md\b/gu, 'copilot-instructions.md'], [/\bClaude Code\b/gu, 'GitHub Copilot CLI'], [/\bclaude-code\b/gu, 'copilot-cli'],
    [/\bAnthropic\b/gu, 'GitHub'], [/\bSkill tool\b/gu, 'Copilot skill'], [/\bTask tool\b/gu, 'agent tool'],
    [/\bAskUserQuestion tool\b/gu, 'user-input tool'], [/\bAskUserQuestion\b/gu, 'user input'], [/\bSlashCommands\b/gu, 'Copilot slash commands'],
    [/\bSlashCommand\b/gu, 'Copilot slash command'], [/\bclaude\b/gu, 'copilot'],
  ] as const) rendered = rendered.replace(pattern, replacement);
  rendered = rendered.replaceAll('Claude', 'Copilot');
  return restore(rendered, guarded.protected);
}

export function firstProseLine(body: string): string {
  for (const line of body.split('\n')) {
    const candidate = line.trim();
    if (candidate && !candidate.startsWith('#') && !candidate.startsWith('```') && !candidate.startsWith('<!--')) return candidate.replace(/\s+/gu, ' ').slice(0, 1024);
  }
  return 'EVCrate Copilot command';
}

export function yamlValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(String(value));
}
export function serializeSkill(fields: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const key of ['name', 'description', 'argument-hint', 'user-invocable', 'disable-model-invocation']) if (key in fields) lines.push(`${key}: ${yamlValue(fields[key])}`);
  lines.push('---', '', body.replace(/\r\n?/gu, '\n').replace(/\n+$/u, ''), '');
  return lines.join('\n');
}
export function commandBody(body: string, targetName: string, workflows: readonly string[]): string {
  const assets = workflows.map((name) => `- \`@evcrate/workflows/${name}\``).join('\n');
  return `## Invocation contract\n\nThe literal \`$ARGUMENTS\` is the exact raw text following \`/${targetName}\`. Do not split, normalize, or discard it before the canonical command parses it.\n\nRead the mandatory documentation ownership policy at \`@evcrate/workflows/documentation-management.md\`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions and activation-first ordering; load full mentoring only after resolved explicit or inherited mode.\n\n## Available workflow assets\n\n${assets}\n\n${body.replace(/^\s+/u, '')}`;
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); }
