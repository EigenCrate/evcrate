import { lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import {
  COMPLETE_TREE_HASH_LIMITS, completeTreeHash, hashBytes, readBoundedFile,
  isIgnoredArtifact, compareCanonicalPaths
} from '../filesystem/hashing.js';
import {
  assertNoSymlinkAncestors, assertOwnerControlledDirectory, assertOwnerOnlyFile,
  assertRealDirectory, containedPath, normalizeRelativePath
} from '../filesystem/paths.js';
import { parseJsonDocument, isPlainObject } from '../protocol/json.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import {
  MAX_PUBLICATION_STATE_BYTES, MAX_PUBLICATION_CHANGES, PUBLICATION_BINDING_ORDER,
  PUBLICATION_LOCAL_ROOTS, PUBLICATION_TARGET_BINDINGS
} from '../protocol/publication-payloads.js';

export const MAX_PUBLICATION_FILE_BYTES = COMPLETE_TREE_HASH_LIMITS.maxFileBytes;
export const PUBLICATION_TRAVERSAL_LIMITS = Object.freeze({
  maxFiles: COMPLETE_TREE_HASH_LIMITS.maxFiles,
  maxDirectories: COMPLETE_TREE_HASH_LIMITS.maxDirectories,
  maxBytes: 512 * 1024 * 1024,
  maxFileBytes: COMPLETE_TREE_HASH_LIMITS.maxFileBytes,
  maxDepth: COMPLETE_TREE_HASH_LIMITS.maxDepth,
  maxPathBytes: COMPLETE_TREE_HASH_LIMITS.maxPathBytes
});
export interface PublicationFile {
  readonly relativePath: string;
  readonly content: Uint8Array;
  readonly hash: string;
}
export interface PublicationNode {
  readonly present: boolean;
  readonly kind?: 'file' | 'directory';
  readonly device?: number;
  readonly inode?: number;
  readonly size?: number;
  readonly mode?: number;
  readonly hash?: string;
}
export interface PublicationNodeSnapshot extends PublicationNode {
  readonly present: boolean;
  readonly kind?: 'file' | 'directory';
  readonly device?: number;
  readonly inode?: number;
  readonly size?: number;
  readonly mode?: number;
  readonly hash?: string;
}

function fail(code: 'PATH_UNSAFE' | 'PUBLICATION_FAILED' | 'CAS_CONFLICT' = 'PUBLICATION_FAILED'): never {
  throw new ControlPlaneError(code);
}

function safeNumber(value: number | bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) fail();
  return result;
}

function nodeMetadata(
  stat: NonNullable<ReturnType<typeof lstatSync>>
): Pick<PublicationNode, 'device' | 'inode' | 'size' | 'mode'> {
  return Object.freeze({
    device: safeNumber(stat.dev), inode: safeNumber(stat.ino), size: safeNumber(stat.size),
    mode: Number(stat.mode) & 0o777
  });
}
function sameMetadata(
  left: Pick<PublicationNode, 'device' | 'inode' | 'size' | 'mode'>,
  right: Pick<PublicationNode, 'device' | 'inode' | 'size' | 'mode'>
): boolean {
  return left.device === right.device && left.inode === right.inode
    && left.size === right.size && left.mode === right.mode;
}

export function listPublicationFiles(root: string): readonly PublicationFile[] {
  assertNoSymlinkAncestors(root);
  assertRealDirectory(root);
  const files: PublicationFile[] = [];
  let bytes = 0;
  let directories = 1;
  let fileCount = 0;
  const visit = (directory: string, depth: number): void => {
    if (depth > PUBLICATION_TRAVERSAL_LIMITS.maxDepth) fail();
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true }).sort(
        (left, right) => compareCanonicalPaths(left.name, right.name)
      );
    } catch { fail(); }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = normalizeRelativePath(relative(root, path).split('\\').join('/'));
      if (Buffer.byteLength(relativePath, 'utf8') > PUBLICATION_TRAVERSAL_LIMITS.maxPathBytes) fail();
      if (isIgnoredArtifact(relativePath)) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) fail('PATH_UNSAFE');
      if (stat.isDirectory()) {
        if (++directories > PUBLICATION_TRAVERSAL_LIMITS.maxDirectories) fail();
        visit(path, depth + 1);
        continue;
      }
      const size = safeNumber(stat.size);
      if (++fileCount > PUBLICATION_TRAVERSAL_LIMITS.maxFiles
        || size > PUBLICATION_TRAVERSAL_LIMITS.maxFileBytes
        || bytes > PUBLICATION_TRAVERSAL_LIMITS.maxBytes - size) fail();
      bytes += size;
      const content = readBoundedFile(path, MAX_PUBLICATION_FILE_BYTES);
      files.push(Object.freeze({ relativePath, content, hash: hashBytes(content) }));
    }
  };
  visit(root, 0);
  return Object.freeze(files);
}
export function controllerTreeHash(root: string, source = false): string {
  let rootMode: number;
  try {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE');
    rootMode = source ? 0o700 : Number(stat.mode) & 0o777;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail();
  }
  const records = [{ relativePath: '', value: `d\0\0${rootMode}\n` },
    ...listPublicationFiles(root).map(({ relativePath, hash }) => ({ relativePath, value: `f\0${relativePath}\0${hash}\n` }))];
  try {
    const stat = lstatSync(join(root, 'evcrate-advisor'));
    if (stat.isSymbolicLink() || !stat.isFile()) fail('PATH_UNSAFE');
    records.push({ relativePath: 'evcrate-advisor\0mode', value: `m\0evcrate-advisor\0${source ? 0o755 : Number(stat.mode) & 0o777}\n` });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || source) {
      if (error instanceof ControlPlaneError) throw error;
      fail();
    }
  }
  return hashBytes(new TextEncoder().encode(records
    .sort((left, right) => compareCanonicalPaths(left.relativePath, right.relativePath))
    .map(({ value }) => value).join('')));
}

export function publicationNode(path: string): PublicationNode {
  assertNoSymlinkAncestors(path);
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { present: false };
    fail();
  }
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) fail('PATH_UNSAFE');
  const metadata = nodeMetadata(stat);
  const finalStat = (): NonNullable<ReturnType<typeof lstatSync>> => {
    try { return lstatSync(path) as NonNullable<ReturnType<typeof lstatSync>>; }
    catch { fail('CAS_CONFLICT'); }
  };
  if (stat.isDirectory()) {
    const final = finalStat();
    if (final.isSymbolicLink() || !final.isDirectory() || !sameMetadata(metadata, nodeMetadata(final))) {
      fail('CAS_CONFLICT');
    }
    return Object.freeze({ present: true, kind: 'directory', ...metadata });
  }
  const content = readBoundedFile(path, MAX_PUBLICATION_FILE_BYTES);
  const final = finalStat();
  if (final.isSymbolicLink() || !final.isFile() || !sameMetadata(metadata, nodeMetadata(final))) {
    fail('CAS_CONFLICT');
  }
  return Object.freeze({ present: true, kind: 'file', ...metadata, hash: hashBytes(content) });
}

export function publicationSnapshot(path: string, controller = false): PublicationNodeSnapshot {
  const node = publicationNode(path);
  if (!node.present) return Object.freeze({ present: false });
  const hash = node.kind === 'directory'
    ? controller ? controllerTreeHash(path) : completeTreeHash(path)
    : node.hash as string;
  const final = publicationNode(path);
  if (!final.present || final.kind !== node.kind || !sameMetadata(node, final)
    || (node.kind === 'file' && node.hash !== final.hash)
    || (node.kind === 'directory' && hash !== (
      controller ? controllerTreeHash(path) : completeTreeHash(path)))) fail('CAS_CONFLICT');
  return Object.freeze({ ...node, hash });
}

export function safePublicationChild(root: string, relativePath: string): string {
  return containedPath(root, relativePath);
}

export function validatePublicationAncestors(homeRoot: string, destination: string): void {
  const root = homeRoot;
  assertNoSymlinkAncestors(root);
  const resolvedRoot = root;
  const resolvedDestination = destination;
  const suffix = resolvedDestination === resolvedRoot ? '' : resolvedDestination.slice(`${resolvedRoot}/`.length);
  if (resolvedDestination !== resolvedRoot && !resolvedDestination.startsWith(`${resolvedRoot}/`)) fail('PATH_UNSAFE');
  let current = resolvedRoot;
  for (const part of suffix ? suffix.split('/') : []) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE');
      assertOwnerControlledDirectory(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      if (error instanceof ControlPlaneError) throw error;
      fail('PATH_UNSAFE');
    }
  }
}

const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
function markerRelease(value: unknown): string {
  if (typeof value !== 'string' || !RELEASE_ID_PATTERN.test(value)) fail();
  return value;
}
function markerRelative(value: unknown): string {
  try { return normalizeRelativePath(value); } catch { fail(); }
}
function markerManaged(value: unknown): void {
  if (!isPlainObject(value)) fail();
  for (const [root, paths] of Object.entries(value)) {
    if (!PUBLICATION_LOCAL_ROOTS.includes(root as typeof PUBLICATION_LOCAL_ROOTS[number]) || !Array.isArray(paths)) fail();
    const normalized = paths.map(markerRelative);
    if (new Set(normalized).size !== normalized.length) fail();
  }
}
function markerTargets(value: unknown): readonly PersistedTarget[] {
  if (!Array.isArray(value) || value.length === 0) fail();
  const result = value.map((entry) => normalizeTarget(entry));
  if (new Set(result).size !== result.length) fail();
  return Object.freeze(result);
}
function markerBindings(targets: readonly PersistedTarget[]): readonly string[] {
  const names = new Set<string>(['.evcrate/bin']);
  for (const target of targets) {
    const bindings = PUBLICATION_TARGET_BINDINGS[target];
    if (!bindings) fail();
    bindings.forEach((binding) => names.add(binding));
  }
  return Object.freeze(PUBLICATION_BINDING_ORDER.filter((binding) => names.has(binding)));
}
function validateTargetMarker(marker: Record<string, unknown>): void {
  const keys = ['schema_version', 'status', 'transaction_type', 'release_id', 'selected_targets', 'binding_order',
    'managed_paths', 'previous_managed_paths', 'build_manifest_path', 'build_manifest_digest', 'transaction_dir', 'retained_release_id'];
  if (Object.keys(marker).length !== keys.length || Object.keys(marker).some((key) => !keys.includes(key))
    || !['promoting', 'complete', 'recovered'].includes(String(marker.status))) fail();
  const release = markerRelease(marker.release_id);
  if (marker.transaction_dir !== `release-${release}`) fail();
  const targets = markerTargets(marker.selected_targets);
  const bindings = marker.binding_order;
  if (!Array.isArray(bindings) || bindings.length !== markerBindings(targets).length
    || bindings.some((value, index) => markerRelative(value) !== markerBindings(targets)[index])) fail();
  markerManaged(marker.managed_paths);
  markerManaged(marker.previous_managed_paths);
  if (!/^\.evcrate\/build-manifest(?:-[a-z]+)?\.json$/u.test(markerRelative(marker.build_manifest_path))) fail();
  if (typeof marker.build_manifest_digest !== 'string' || !/^[a-f0-9]{64}$/u.test(marker.build_manifest_digest)) fail();
  if (marker.retained_release_id !== null) markerRelease(marker.retained_release_id);
}
function validatePythonMarker(marker: Record<string, unknown>): void {
  const keys = ['schema_version', 'status', 'release_id', 'roots', 'managed_paths', 'previous_managed_paths',
    'operations', 'transaction_dir', 'recovery_action', 'retained_release_id'];
  if (Object.keys(marker).some((key) => !keys.includes(key))
    || !['none', 'in_progress', 'complete', 'recovered'].includes(String(marker.status))) fail();
  if (marker.status === 'none') return;
  const release = markerRelease(marker.release_id);
  if (typeof marker.transaction_dir !== 'string' || marker.transaction_dir !== `release-${release}`) fail();
  if (!isPlainObject(marker.roots) || !isPlainObject(marker.managed_paths)
    || !isPlainObject(marker.previous_managed_paths) || !Array.isArray(marker.operations)) fail();
  markerManaged(marker.managed_paths);
  markerManaged(marker.previous_managed_paths);
  for (const [root, details] of Object.entries(marker.roots)) {
    if (!PUBLICATION_LOCAL_ROOTS.includes(root as typeof PUBLICATION_LOCAL_ROOTS[number]) || !isPlainObject(details)) fail();
  }
  if (marker.operations.length > MAX_PUBLICATION_CHANGES) fail();
  for (const operation of marker.operations) {
    if (!isPlainObject(operation) || Object.keys(operation).some((key) => !['root', 'path', 'backup', 'kind'].includes(key))
      || typeof operation.root !== 'string' || !PUBLICATION_LOCAL_ROOTS.includes(operation.root as typeof PUBLICATION_LOCAL_ROOTS[number])
      || typeof operation.path !== 'string' || (operation.kind !== undefined && operation.kind !== 'file'
        && operation.kind !== 'directory') || (operation.kind === 'directory'
          && (operation.root !== '.evcrate/bin' || operation.path !== '.evcrate/bin'))) fail();
    markerRelative(operation.path);
    if (operation.backup !== null && operation.backup !== undefined && typeof operation.backup !== 'string') fail();
  }
  if (marker.recovery_action !== undefined
    && !['restored-completed-files', 'restored-interrupted-files', 'restored-interrupted-roots'].includes(String(marker.recovery_action))) fail();
  if (marker.retained_release_id !== undefined && marker.retained_release_id !== null) {
    markerRelease(marker.retained_release_id);
  }
}
function validatePublicationMarker(marker: Record<string, unknown>): void {
  if (marker.schema_version !== 1) fail();
  if (marker.transaction_type === 'target-publication') validateTargetMarker(marker);
  else if (marker.transaction_type === undefined) validatePythonMarker(marker);
  else fail();
}
export function readOptionalPublicationMarker(path: string): Record<string, unknown> | null {
  assertNoSymlinkAncestors(path);
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail();
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('PATH_UNSAFE');
  try {
    assertOwnerOnlyFile(path);
    const parsed = parseJsonDocument(
      readBoundedFile(path, MAX_PUBLICATION_STATE_BYTES), MAX_PUBLICATION_STATE_BYTES
    );
    if (!isPlainObject(parsed)) fail();
    validatePublicationMarker(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail();
  }
}
