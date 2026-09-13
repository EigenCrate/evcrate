import { dirname, join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { normalizeRelativePath } from '../filesystem/paths.js';
import type { HomePublicationRule, TargetManifest } from '../manifests/types.js';

export interface PublishedFile {
  readonly relativePath: string;
  readonly content: Uint8Array;
}

type CommandRewrite = (command: string) => string;

function fail(): never {
  throw new ControlPlaneError('PUBLICATION_FAILED');
}

function hasRule(manifest: TargetManifest, rule: HomePublicationRule): boolean {
  return manifest.homePolicy.publicationRules.includes(rule);
}

export function assertPublicationRules(manifest: TargetManifest): void {
  const rules = manifest.homePolicy.publicationRules;
  if (new Set(rules).size !== rules.length) fail();
  const ownerByRule: Readonly<Record<HomePublicationRule, string>> = {
    'omp-agent-prefix': 'omp',
    'codex-home-path-rewrite': 'codex',
    'claude-home-path-rewrite': 'claude',
    'gemini-home-path-rewrite': 'gemini',
    'antigravity-home-path-rewrite': 'antigravity',
    'copilot-home-path-rewrite': 'copilot',
    'claude-skill-root-exclusion': 'claude'
  };
  for (const rule of rules) if (ownerByRule[rule] !== manifest.name) fail();
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function rewriteProjectPath(
  command: string,
  variable: string,
  localRoot: string,
  destinationRoot: string
): string {
  const destination = shellQuote(destinationRoot);
  const forms = [
    `"$${variable}"/${localRoot}`,
    `"$${variable}/${localRoot}"`,
    `'$${variable}'/${localRoot}`,
    `$${variable}/${localRoot}`,
    `\${${variable}}/${localRoot}`
  ];
  return forms.reduce((result, form) => result.replaceAll(form, destination), command);
}

function rewriteCommands(value: unknown, rewrite: CommandRewrite): void {
  if (!Array.isArray(value)) fail();
  for (const group of value) {
    if (!isPlainObject(group)) fail();
    const entries = group.hooks;
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) fail();
    for (const hook of entries) {
      if (!isPlainObject(hook)) fail();
      if (hook.command !== undefined && typeof hook.command !== 'string') fail();
      if (typeof hook.command === 'string') hook.command = rewrite(hook.command);
    }
  }
}

function rewriteHookDocument(content: Uint8Array, rewrite: CommandRewrite, statusLine = false): Uint8Array {
  const parsed = parseJsonDocument(content);
  if (!isPlainObject(parsed)) fail();
  if (parsed.hooks !== undefined) {
    if (!isPlainObject(parsed.hooks)) fail();
    for (const groups of Object.values(parsed.hooks)) rewriteCommands(groups, rewrite);
  }
  if (statusLine && parsed.statusLine !== undefined) {
    if (!isPlainObject(parsed.statusLine)) fail();
    if (parsed.statusLine.command !== undefined && typeof parsed.statusLine.command !== 'string') fail();
    if (typeof parsed.statusLine.command === 'string') parsed.statusLine.command = rewrite(parsed.statusLine.command);
  }
  return new TextEncoder().encode(JSON.stringify(parsed, null, 2));
}

function rewriteClaudeSettings(content: Uint8Array, destinationRoot: string): Uint8Array {
  return rewriteHookDocument(content, (command) => rewriteProjectPath(command, 'CLAUDE_PROJECT_DIR', '.claude', destinationRoot), true);
}

function rewriteGeminiSettings(content: Uint8Array, destinationRoot: string): Uint8Array {
  return rewriteHookDocument(content, (command) => rewriteProjectPath(command, 'GEMINI_PROJECT_DIR', '.gemini', destinationRoot));
}

function rewriteAntigravityHooks(content: Uint8Array, destinationRoot: string): Uint8Array {
  return rewriteHookDocument(content, (command) => rewriteProjectPath(command, 'AGY_PROJECT_DIR', '.antigravity', destinationRoot));
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function rewriteCopilotCommand(command: string, destinationRoot: string, child: string): string {
  const marker = `path.resolve(root,'.copilot','evcrate',${child})`;
  const assignment = 'const root=process.env.COPILOT_PROJECT_DIR||process.cwd();';
  if (countOccurrences(command, marker) !== 1 || countOccurrences(command, assignment) !== 1) fail();
  return command.replace(assignment, `const root=${JSON.stringify(dirname(destinationRoot))};`);
}

function rewriteCopilotHooks(content: Uint8Array, destinationRoot: string): Uint8Array {
  const parsed = parseJsonDocument(content);
  if (!isPlainObject(parsed) || !isPlainObject(parsed.hooks)) fail();
  for (const groups of Object.values(parsed.hooks)) {
    if (!Array.isArray(groups)) fail();
    for (const entry of groups) {
      if (!isPlainObject(entry) || entry.type !== 'command' || typeof entry.command !== 'string') fail();
      entry.command = rewriteCopilotCommand(entry.command, destinationRoot, "'hooks','copilot-hook-bridge.cjs'");
    }
  }
  return new TextEncoder().encode(JSON.stringify(parsed));
}

function rewriteCopilotSettings(content: Uint8Array, destinationRoot: string): Uint8Array {
  const parsed = parseJsonDocument(content);
  if (!isPlainObject(parsed) || !isPlainObject(parsed.statusLine) || typeof parsed.statusLine.command !== 'string') fail();
  parsed.statusLine.command = rewriteCopilotCommand(
    parsed.statusLine.command,
    destinationRoot,
    "'statusline.cjs'"
  );
  return new TextEncoder().encode(JSON.stringify(parsed));
}

function codexHooks(content: Uint8Array, homeRoot: string): Uint8Array {
  return rewriteHookDocument(content, (command) => rewriteProjectPath(command, 'CODEX_PROJECT_DIR', '.codex', homeRoot));
}

function codexConfig(content: Uint8Array, homeRoot: string): Uint8Array {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  const assignments = [...text.matchAll(/^[ \t]*command[ \t]*=[ \t]*([^#\r\n]*?)[ \t]*(?:#.*)?$/gmu)];
  if (assignments.length !== 1 || assignments[0][1] !== JSON.stringify('.codex/bin/run-mcp-package.sh')) fail();
  const value = JSON.stringify(join(homeRoot, 'bin', 'run-mcp-package.sh').split('\\').join('/'));
  const start = assignments[0].index! + assignments[0][0].indexOf(assignments[0][1]);
  return new TextEncoder().encode(`${text.slice(0, start)}${value}${text.slice(start + assignments[0][1].length)}`);
}

export function mapPublicationPath(
  manifest: TargetManifest,
  relativePathValue: string
): string | null {
  const relativePath = normalizeRelativePath(relativePathValue);
  assertPublicationRules(manifest);
  if (hasRule(manifest, 'claude-skill-root-exclusion')
    && relativePath.startsWith('skills/') && relativePath.split('/').length === 2) return null;
  return hasRule(manifest, 'omp-agent-prefix') ? `agent/${relativePath}` : relativePath;
}

export function publishFile(
  manifest: TargetManifest,
  relativePathValue: string,
  content: Uint8Array,
  destinationRoot: string
): PublishedFile | null {
  const relativePath = mapPublicationPath(manifest, relativePathValue);
  if (relativePath === null) return null;
  try {
    let publishedContent = content;
    if (hasRule(manifest, 'claude-home-path-rewrite') && relativePath === 'settings.json') {
      publishedContent = rewriteClaudeSettings(content, destinationRoot);
    } else if (hasRule(manifest, 'codex-home-path-rewrite')) {
      if (relativePath === 'hooks.json') publishedContent = codexHooks(content, destinationRoot);
      if (relativePath === 'config.toml') publishedContent = codexConfig(content, destinationRoot);
    } else if (hasRule(manifest, 'gemini-home-path-rewrite') && relativePath === 'settings.json') {
      publishedContent = rewriteGeminiSettings(content, destinationRoot);
    } else if (hasRule(manifest, 'antigravity-home-path-rewrite') && relativePath === 'hooks.json') {
      publishedContent = rewriteAntigravityHooks(content, destinationRoot);
    } else if (hasRule(manifest, 'copilot-home-path-rewrite')) {
      if (relativePath === 'hooks/evcrate.json') publishedContent = rewriteCopilotHooks(content, destinationRoot);
      if (relativePath === 'evcrate/managed-settings.json') publishedContent = rewriteCopilotSettings(content, destinationRoot);
    }
    return Object.freeze({ relativePath, content: publishedContent });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail();
  }
}
