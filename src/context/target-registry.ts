import { lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument, isPlainObject } from '../protocol/json.js';
import { normalizeTarget } from '../protocol/validation.js';
import type { PersistedTarget } from '../protocol/validation.js';

export interface HomeBinding {
  readonly localRoot: string;
  readonly homeRoot: string;
  readonly promotionOrder: number;
}

export interface TargetManifestContext {
  readonly id: PersistedTarget;
  readonly manifestPath: string;
  readonly outputRoots: readonly string[];
  readonly homeBindings: readonly HomeBinding[];
  readonly projectDocs: readonly string[];
  readonly sharedJson: Readonly<Record<string, unknown>> | null;
}

export interface TargetRegistry {
  readonly registryPath: string;
  readonly targets: ReadonlyMap<PersistedTarget, TargetManifestContext>;
}

const REGISTRY_SCHEMA_VERSION = 2;
const RELATIVE_SEGMENT = /^[^/\\]+$/u;
const RESERVED_SEGMENTS = new Set(['.git', '.gitignore', '.gitmodules', '.gitattributes', '.github', '.hg', '.svn']);
const SENSITIVE_SEGMENT = /(?:secret|credential|password|token|private[-_]?key)/iu;

function invalid(): never {
  throw new ControlPlaneError('PROTOCOL_INVALID');
}

function normalizedRelative(value: unknown): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || isAbsolute(value)) invalid();
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..'
    || RESERVED_SEGMENTS.has(part) || SENSITIVE_SEGMENT.test(part)
    || /^\.env(?:\.|$)/u.test(part) || !RELATIVE_SEGMENT.test(part))) invalid();
  return parts.join('/');
}

function noSymlinkPath(value: string): void {
  const parts = value.split(sep);
  let current = parts[0] === '' ? sep : parts[0];
  for (const part of parts.slice(current === sep ? 1 : 0)) {
    if (!part) continue;
    current = current === sep ? join(current, part) : join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw new ControlPlaneError('PATH_UNSAFE');
    }
  }
}

function contained(root: string, value: string): string {
  const candidate = join(root, value);
  const escaped = relative(root, candidate);
  if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) invalid();
  noSymlinkPath(candidate);
  return candidate;
}

function readObject(path: string): Record<string, unknown> {
  try {
    noSymlinkPath(path);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
    const parsed = parseJsonDocument(readFileSync(path), 64 * 1024);
    if (!isPlainObject(parsed)) invalid();
    return parsed;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) invalid();
  return value.map(normalizedRelative);
}

function loadManifest(id: PersistedTarget, manifestPath: string): TargetManifestContext {
  const data = readObject(manifestPath);
  if (data.schema_version !== REGISTRY_SCHEMA_VERSION || data.name !== id) invalid();
  const rootsValue = data.output_roots ?? (
    typeof data.output_root === 'string'
      ? [data.output_root, ...(Array.isArray(data.additional_roots) ? data.additional_roots : [])]
      : undefined
  );
  const outputRoots = textList(rootsValue);
  if (outputRoots.length === 0 || new Set(outputRoots).size !== outputRoots.length) invalid();
  const policy = data.home_policy;
  if (!isPlainObject(policy) || !isPlainObject(policy.bindings)) invalid();
  const promotionOrder = policy.promotion_order;
  if (!Number.isSafeInteger(promotionOrder) || (promotionOrder as number) < 0) invalid();
  const bindings = Object.entries(policy.bindings).map(([localRoot, homeRoot]) => {
    if (!outputRoots.includes(localRoot)) invalid();
    return {
      localRoot: normalizedRelative(localRoot),
      homeRoot: normalizedRelative(homeRoot),
      promotionOrder: promotionOrder as number
    };
  });
  if (bindings.length !== outputRoots.length) invalid();
  const projectDocs = textList(data.project_docs ?? []);
  if (projectDocs.some((document) => document.includes('/'))) invalid();
  const sharedJson = data.shared_json === undefined ? null : data.shared_json;
  if (sharedJson !== null && !isPlainObject(sharedJson)) invalid();
  return Object.freeze({
    id, manifestPath, outputRoots: Object.freeze(outputRoots),
    homeBindings: Object.freeze(bindings), projectDocs: Object.freeze(projectDocs),
    sharedJson: sharedJson as Readonly<Record<string, unknown>> | null
  });
}

export function loadTargetRegistry(registryPath: string): TargetRegistry {
  const registry = readObject(registryPath);
  if (registry.schema_version !== REGISTRY_SCHEMA_VERSION || !isPlainObject(registry.targets)) invalid();
  const targetRoot = dirname(registryPath);
  const entries = Object.entries(registry.targets);
  if (entries.length === 0) invalid();
  const targets = new Map<PersistedTarget, TargetManifestContext>();
  for (const [rawName, rawPath] of entries) {
    let id: PersistedTarget;
    try { id = normalizeTarget(rawName); } catch { invalid(); }
    if (id !== rawName || typeof rawPath !== 'string') invalid();
    const relativeManifest = normalizedRelative(rawPath);
    if (relativeManifest !== `${id}/manifest.json`) invalid();
    const manifestPath = contained(targetRoot, relativeManifest);
    const manifest = loadManifest(id, manifestPath);
    if (targets.has(id)) invalid();
    targets.set(id, manifest);
  }
  return Object.freeze({ registryPath, targets });
}

export function loadSelectedTargets(
  registryOrPath: TargetRegistry | string,
  requested: readonly string[] = []
): readonly TargetManifestContext[] {
  const registry = typeof registryOrPath === 'string' ? loadTargetRegistry(registryOrPath) : registryOrPath;
  const normalized = requested.map((value) => normalizeTarget(value));
  if (new Set(normalized).size !== normalized.length) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  const wanted = normalized.length === 0 ? new Set(registry.targets.keys()) : new Set(normalized);
  for (const id of wanted) if (!registry.targets.has(id)) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  return Object.freeze([...registry.targets.entries()]
    .filter(([id]) => wanted.has(id))
    .map(([, manifest]) => manifest));
}

export const TARGET_REGISTRY_SCHEMA_VERSION = 2;
