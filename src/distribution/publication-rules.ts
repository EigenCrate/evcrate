import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { normalizeRelativePath } from '../filesystem/paths.js';
import type { HomePublicationRule, TargetManifest } from '../manifests/types.js';

export interface PublishedFile {
  readonly relativePath: string;
  readonly content: Uint8Array;
}

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
    'claude-skill-root-exclusion': 'claude'
  };
  for (const rule of rules) if (ownerByRule[rule] !== manifest.name) fail();
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function codexHooks(content: Uint8Array, homeRoot: string): Uint8Array {
  const parsed = parseJsonDocument(content);
  if (!isPlainObject(parsed)) fail();
  const hooks = parsed.hooks;
  if (hooks !== undefined) {
    if (!isPlainObject(hooks)) fail();
    for (const groups of Object.values(hooks)) {
      if (!Array.isArray(groups)) fail();
      for (const group of groups) {
        if (!isPlainObject(group)) fail();
        const entries = group.hooks;
        if (entries === undefined) continue;
        if (!Array.isArray(entries)) fail();
        for (const hook of entries) {
          if (!isPlainObject(hook)) fail();
          if (hook.command !== undefined && typeof hook.command !== 'string') fail();
          if (typeof hook.command === 'string') {
            hook.command = hook.command.replaceAll(
              '"$CODEX_PROJECT_DIR"/.codex/hooks',
              shellQuote(join(homeRoot, 'hooks').split('\\').join('/'))
            );
          }
        }
      }
    }
  }
  return new TextEncoder().encode(JSON.stringify(parsed, null, 2));
}

function codexConfig(content: Uint8Array, homeRoot: string): Uint8Array {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  const wrapper = JSON.stringify(join(homeRoot, 'bin', 'run-mcp-package.sh').split('\\').join('/'));
  return new TextEncoder().encode(text.replaceAll(
    /command\s*=\s*"\.codex\/bin\/run-mcp-package\.sh"/gu,
    `command = ${wrapper}`
  ));
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
    if (hasRule(manifest, 'codex-home-path-rewrite')) {
      if (relativePath === 'hooks.json') publishedContent = codexHooks(content, destinationRoot);
      if (relativePath === 'config.toml') publishedContent = codexConfig(content, destinationRoot);
    }
    return Object.freeze({ relativePath, content: publishedContent });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail();
  }
}

