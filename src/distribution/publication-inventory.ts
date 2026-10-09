import { lstatSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import {
  COMPLETE_TREE_HASH_LIMITS, completeTreeHash, hashBytes, readBoundedFile,
  isIgnoredArtifact, compareCanonicalPaths
} from '../filesystem/hashing.js';
import {
  assertNoSymlinkAncestors, assertRealDirectory, assertRegularFile,
  containedPath, normalizeRelativePath
} from '../filesystem/paths.js';
import { parseJsonDocument, isPlainObject } from '../protocol/json.js';
import {
  MAX_PUBLICATION_STATE_BYTES, MAX_PUBLICATION_CHANGES, PUBLICATION_LOCAL_ROOTS,
  publicationStateTargets, publicationStateLayout, publicationStateOwnership, publicationFlatOwnership
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
  readonly hash?: string;
}
export interface PublicationNodeSnapshot extends PublicationNode {
  readonly present: boolean;
  readonly kind?: 'file' | 'directory';
  readonly device?: number;
  readonly inode?: number;
  readonly size?: number;
  readonly hash?: string;
}

function fail(code: 'PATH_UNSAFE' | 'PUBLICATION_FAILED' | 'CAS_CONFLICT' = 'PUBLICATION_FAILED', detail?: string): never {
  throw new ControlPlaneError(code, detail);
}

function safeNumber(value: number | bigint): number {
  const result = Number(value);
  if (typeof result !== 'number' || result < 0) fail();
  if (process.platform === 'win32' && Number.isFinite(result)) return result;
  if (!Number.isSafeInteger(result)) fail();
  return result;
}

function nodeMetadata(
  stat: NonNullable<ReturnType<typeof lstatSync>>
): Pick<PublicationNode, 'device' | 'inode' | 'size'> {
  return Object.freeze({
    device: safeNumber(stat.dev), inode: safeNumber(stat.ino), size: safeNumber(stat.size)
  });
}
function sameMetadata(
  left: Pick<PublicationNode, 'device' | 'inode' | 'size'>,
  right: Pick<PublicationNode, 'device' | 'inode' | 'size'>
): boolean {
  return left.device === right.device && left.inode === right.inode && left.size === right.size;
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
      files.push(Object.freeze({
        relativePath, content, hash: hashBytes(content)
      }));
    }
  };
  visit(root, 0);
  return Object.freeze(files);
}
export function controllerTreeHash(root: string): string {
  assertNoSymlinkAncestors(root);
  assertRealDirectory(root);
  const records = [
    { relativePath: '', value: 'd\0\n' },
    ...listPublicationFiles(root).map(({ relativePath, hash }) => ({
      relativePath, value: `f\0${relativePath}\0${hash}\n`
    }))
  ];
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
  const resolvedRoot = resolve(homeRoot);
  const resolvedDestination = resolve(destination);
  assertNoSymlinkAncestors(resolvedRoot);
  if (resolvedDestination === resolvedRoot) return;
  const suffix = relative(resolvedRoot, resolvedDestination);
  if (!suffix || suffix === '..' || suffix.startsWith(`..${sep}`) || suffix.startsWith('../') || isAbsolute(suffix)) {
    fail('PATH_UNSAFE', `destination "${resolvedDestination}" is outside home "${resolvedRoot}" (relative suffix: "${suffix}")`);
  }
  let current = resolvedRoot;
  for (const part of suffix.split(/[/\\]/u)) {
    if (!part) continue;
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE', `ancestor "${current}" is a symlink or not a directory`);
      assertRealDirectory(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      if (error instanceof ControlPlaneError) throw error;
      fail('PATH_UNSAFE', `stat failed on ancestor "${current}": ${(error as Error).message}`);
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
const V2_RECORD_KEYS = [
  'phase', 'scope', 'status', 'release_id', 'selected_targets', 'binding_order',
  'managed_paths', 'previous_managed_paths', 'build_manifest_path', 'build_manifest_digest',
  'transaction_dir', 'retained_release_id', 'destination_root', 'durable_state_root',
  'workspace_root', 'workspace_name', 'project_identity', 'retention'
] as const;
export function validatePublicationStateRecord(
  value: unknown, phase: 'shared' | 'harness', scope: 'home' | 'project'
): void {
  if (!isPlainObject(value)
    || Object.keys(value).length !== V2_RECORD_KEYS.length
    || Object.keys(value).some((key) => !V2_RECORD_KEYS.includes(key as never))
    || value.phase !== phase || value.scope !== scope
    || !['promoting', 'complete', 'recovered'].includes(String(value.status))) fail();
  const release = markerRelease(value.release_id);
  if (value.transaction_dir !== `release-${release}`) fail();
  try {
    const selected = publicationStateTargets(value.selected_targets, phase === 'shared');
    if (phase === 'shared' && selected.length !== 0) fail();
    const layout = publicationStateLayout(value.binding_order, selected, scope, phase === 'shared');
    const ownership = publicationStateOwnership(
      value.managed_paths, value.previous_managed_paths, selected, scope, layout.generation
    );
    if (phase === 'shared'
      && (Object.keys(ownership.managed).length !== 0 || Object.keys(ownership.previous).length !== 0)) fail();
  } catch { fail(); }
  if (!/^\.evcrate\/build-manifest(?:-[a-z]+)?\.json$/u.test(markerRelative(value.build_manifest_path))
    || typeof value.build_manifest_digest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value.build_manifest_digest)) fail();
  if (value.retained_release_id !== null && (scope === 'project' || typeof value.retained_release_id !== 'string')) fail();
  if (value.retained_release_id !== null) markerRelease(value.retained_release_id);
  if (typeof value.destination_root !== 'string' || resolve(value.destination_root) !== value.destination_root
    || typeof value.durable_state_root !== 'string' || resolve(value.durable_state_root) !== value.durable_state_root
    || typeof value.workspace_root !== 'string' || resolve(value.workspace_root) !== value.workspace_root
    || typeof value.workspace_name !== 'string'
    || value.workspace_name !== (scope === 'project' ? `.evcrate-publish-${release}` : `release-${release}`)
    || resolve(value.workspace_root) !== (scope === 'project'
      ? resolve(value.destination_root, value.workspace_name)
      : resolve(value.durable_state_root, value.transaction_dir))
    || (scope === 'home' && value.project_identity !== null)
    || (scope === 'project' && (typeof value.project_identity !== 'string'
      || !/^[a-f0-9]{64}$/u.test(value.project_identity)))
    || (scope === 'home' && value.retention !== 'bounded-one-home-release')
    || (scope === 'project' && value.retention !== 'none')) fail();
}
function validatePublicationMarkerV2(marker: Record<string, unknown>): void {
  const keys = ['schema_version', 'transaction_type', 'scope', 'records'];
  if (Object.keys(marker).length !== keys.length || Object.keys(marker).some((key) => !keys.includes(key))
    || marker.transaction_type !== 'target-publication'
    || (marker.scope !== 'home' && marker.scope !== 'project')
    || !isPlainObject(marker.records)) fail();
  const records = marker.records as Record<string, unknown>;
  if (marker.scope === 'home') {
    if (Object.keys(records).length !== 2 || !Object.hasOwn(records, 'shared')
      || !Object.hasOwn(records, 'harness')) fail();
    validatePublicationStateRecord(records.shared, 'shared', 'home');
    if (records.harness !== null) validatePublicationStateRecord(records.harness, 'harness', 'home');
    const harness = records.harness;
    if (harness !== null) {
      const shared = records.shared as Record<string, unknown>;
      for (const key of ['destination_root', 'durable_state_root', 'project_identity', 'retention']) {
        if (shared[key] !== (harness as Record<string, unknown>)[key]) fail();
      }
    }
    return;
  }
  if (Object.keys(records).length !== 1 || !Object.hasOwn(records, 'harness')) fail();
  validatePublicationStateRecord(records.harness, 'harness', 'project');
}
export function publicationMarkerRecord(
  marker: Record<string, unknown> | null, phase: 'shared' | 'harness'
): Record<string, unknown> | null {
  if (marker === null || marker.schema_version !== 2 || !isPlainObject(marker.records)) return null;
  const records = marker.records as Record<string, unknown>;
  const value = records[phase];
  return value === null || value === undefined ? null : isPlainObject(value) ? value : fail();
}
function validateTargetMarker(marker: Record<string, unknown>): void {
  const keys = ['schema_version', 'status', 'transaction_type', 'release_id', 'selected_targets', 'binding_order',
    'managed_paths', 'previous_managed_paths', 'build_manifest_path', 'build_manifest_digest', 'transaction_dir', 'retained_release_id'];
  if (Object.keys(marker).length !== keys.length || Object.keys(marker).some((key) => !keys.includes(key))
    || !['promoting', 'complete', 'recovered'].includes(String(marker.status))) fail();
  const release = markerRelease(marker.release_id);
  if (marker.transaction_dir !== `release-${release}`) fail();
  try {
    const selected = publicationStateTargets(marker.selected_targets, true);
    const layout = publicationStateLayout(marker.binding_order, selected, 'home', true);
    publicationFlatOwnership(marker.managed_paths, selected, 'home', layout.generation);
    publicationFlatOwnership(marker.previous_managed_paths, selected, 'home', layout.generation);
  } catch { fail(); }
  if (!/^\.evcrate\/build-manifest(?:-[a-z]+)?\.json$/u.test(markerRelative(marker.build_manifest_path))) fail();
  if (typeof marker.build_manifest_digest !== 'string' || !/^[a-f0-9]{64}$/u.test(marker.build_manifest_digest)) fail();
  if (marker.retained_release_id !== null) markerRelease(marker.retained_release_id);
}
function validateProjectMarker(marker: Record<string, unknown>): void {
  const keys = ['schema_version', 'status', 'transaction_type', 'release_id', 'selected_targets', 'binding_order',
    'managed_paths', 'previous_managed_paths', 'build_manifest_path', 'build_manifest_digest', 'transaction_dir',
    'retained_release_id', 'scope', 'destination_root', 'durable_state_root', 'workspace_root', 'workspace_name',
    'project_identity', 'retention'];
  if (Object.keys(marker).length !== keys.length || Object.keys(marker).some((key) => !keys.includes(key))
    || marker.scope !== 'project' || !['promoting', 'complete', 'recovered'].includes(String(marker.status))) fail();
  const release = markerRelease(marker.release_id);
  if (marker.transaction_dir !== `release-${release}`) fail();
  try {
    const selected = publicationStateTargets(marker.selected_targets);
    const layout = publicationStateLayout(marker.binding_order, selected, 'project');
    publicationFlatOwnership(marker.managed_paths, selected, 'project', layout.generation);
    publicationFlatOwnership(marker.previous_managed_paths, selected, 'project', layout.generation);
  } catch { fail(); }
  if (typeof marker.destination_root !== 'string' || resolve(marker.destination_root) !== marker.destination_root
    || typeof marker.durable_state_root !== 'string' || resolve(marker.durable_state_root) !== marker.durable_state_root
    || typeof marker.workspace_root !== 'string' || resolve(marker.workspace_root) !== marker.workspace_root
    || marker.workspace_name !== `.evcrate-publish-${release}`
    || typeof marker.project_identity !== 'string' || !/^[a-f0-9]{64}$/u.test(marker.project_identity)
    || marker.retention !== 'none' || marker.retained_release_id !== null) fail();
  if (typeof marker.build_manifest_digest !== 'string' || !/^[a-f0-9]{64}$/u.test(marker.build_manifest_digest)) fail();
  markerRelative(marker.build_manifest_path);
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
  if (marker.schema_version === 2) {
    validatePublicationMarkerV2(marker);
    return;
  }
  if (marker.schema_version !== 1) fail();
  if (marker.transaction_type === 'target-publication' && marker.scope === 'project') validateProjectMarker(marker);
  else if (marker.transaction_type === 'target-publication') validateTargetMarker(marker);
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
    assertRegularFile(path);
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
