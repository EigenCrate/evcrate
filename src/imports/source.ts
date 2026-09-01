import { chmodSync, lstatSync, mkdirSync, readdirSync, type Dirent, type Stats } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { hashBytes, readBoundedFile, COMPLETE_TREE_HASH_LIMITS, compareCanonicalPaths } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, containedPath, normalizeRelativePath, isContained } from '../filesystem/paths.js';
import { writeAtomicProjectionFile } from '../filesystem/atomic.js';
import { boundedText } from '../protocol/validation.js';
import { validateSourcePath, isSensitivePathSegment, type ImportCapability } from '../protocol/resource-payload-validation.js';
import type { ResourceKind } from '../manifests/types.js';

export const MAX_IMPORT_FILES = 1000;
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_IMPORT_DEPTH = 32;
export const MAX_IMPORT_PATH_BYTES = 4096;
const SCRIPT_SUFFIX = /\.(?:bash|cjs|fish|js|mjs|pl|ps1|rb|sh|zsh)$/iu;
const MAX_IMPORT_DIRECTORIES = 100_000;
export interface ImportSourceEntry { readonly path: string; readonly bytes: Uint8Array; readonly mode: number; }
export interface ImportSourceDirectory { readonly path: string; readonly mode: number; }
export interface ImportSource {
  readonly absolutePath: string;
  readonly kind: ResourceKind;
  readonly directory: boolean;
  readonly mode: number;
  readonly hash: string;
  readonly identity: string;
  readonly files: readonly ImportSourceEntry[];
  readonly directories: readonly ImportSourceDirectory[];
  readonly capabilities: readonly ImportCapability[];
}
export interface ImportSourceOptions { readonly cwd?: string; readonly protectedRoots?: readonly string[]; }

function unsafe(): never { throw new ControlPlaneError('PATH_UNSAFE'); }
function comparePaths(left: string, right: string): number { return compareCanonicalPaths(left, right); }
function stableMode(stat: Stats): number {
  const mode = Number(stat.mode) & 0o777;
  if ((mode & 0o022) !== 0) unsafe();
  return mode;
}
function stableIdentity(stat: Stats): string {
  return `${Number(stat.dev)}:${Number(stat.ino)}:${Number(stat.size)}:${Number(stat.mode) & 0o777}`;
}
function entry(path: string): Stats {
  let stat: Stats;
  try { stat = lstatSync(path); } catch { return unsafe(); }
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) return unsafe();
  stableMode(stat);
  return stat;
}
function readFile(path: string, initial: Stats): Uint8Array {
  let bytes: Uint8Array;
  try { bytes = readBoundedFile(path, MAX_IMPORT_FILE_BYTES); } catch { return unsafe(); }
  const final = entry(path);
  if (Number(final.dev) !== Number(initial.dev) || Number(final.ino) !== Number(initial.ino)
    || Number(final.size) !== Number(initial.size) || (Number(final.mode) & 0o777) !== (Number(initial.mode) & 0o777)) unsafe();
  return Uint8Array.from(bytes);
}
function shebang(bytes: Uint8Array): boolean { return bytes.length > 1 && bytes[0] === 0x23 && bytes[1] === 0x21; }
function capabilityFor(path: string, stat: Stats, bytes: Uint8Array): boolean {
  return (Number(stat.mode) & 0o111) !== 0 || SCRIPT_SUFFIX.test(path) || shebang(bytes);
}
function protectedPath(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => resolve(root) === path || isContained(root, path));
}
function validateDestinationKind(kind: ResourceKind, destination: string): string {
  const normalized = normalizeRelativePath(boundedText(destination, MAX_IMPORT_PATH_BYTES, 'destination'));
  if (normalized.split('/').some(isSensitivePathSegment)) unsafe();
  const parts = normalized.split('/');
  if (kind === 'skill' || kind === 'hook' || kind === 'agent' || kind === 'workflow') {
    if (parts.length !== 1) unsafe();
  }
  if ((kind === 'agent' || kind === 'workflow' || kind === 'command') && !normalized.endsWith('.md')) unsafe();
  return normalized;
}
export function canonicalImportDestination(
  canonicalRoot: string, resourceRoot: string, kind: ResourceKind, destination: string
): string {
  const relativeRoot = normalizeRelativePath(resourceRoot);
  const relativeDestination = validateDestinationKind(kind, destination);
  return containedPath(canonicalRoot, `${relativeRoot}/${relativeDestination}`);
}
function hashTree(rootMode: number, directories: readonly ImportSourceDirectory[], files: readonly ImportSourceEntry[]): string {
  const records = [
    `d\0\0${rootMode}\n`,
    ...directories.map(({ path, mode }) => `d\0${path}\0${mode}\n`),
    ...files.map(({ path, bytes, mode }) => `f\0${path}\0${mode}\0${hashBytes(bytes)}\n`)
  ].sort(comparePaths);
  return hashBytes(new TextEncoder().encode(records.join('')));
}
function singleFileHash(bytes: Uint8Array, mode: number): string {
  return hashBytes(new TextEncoder().encode(`f\0${mode}\0${hashBytes(bytes)}\n`));
}
function list(path: string): Dirent[] {
  try { return readdirSync(path, { withFileTypes: true }).sort((left, right) => comparePaths(left.name, right.name)); }
  catch { return unsafe(); }
}
export function readImportSource(sourcePath: string, kind: ResourceKind, options: ImportSourceOptions = {}): ImportSource {
  const validated = validateSourcePath(sourcePath);
  const absolutePath = resolve(options.cwd ?? process.cwd(), validated);
  assertNoSymlinkAncestors(absolutePath);
  if (protectedPath(absolutePath, options.protectedRoots ?? [])
    || absolutePath.split(/[\\/]/u).some(isSensitivePathSegment)) unsafe();
  const root = entry(absolutePath);
  if (kind === 'skill' && (!root.isDirectory() || !entry(join(absolutePath, 'SKILL.md')).isFile())) unsafe();
  if ((kind === 'agent' || kind === 'workflow' || kind === 'command') && (!root.isFile() || !absolutePath.endsWith('.md'))) unsafe();
  const files: ImportSourceEntry[] = [];
  const directories: ImportSourceDirectory[] = [];
  const capabilities = new Set<ImportCapability>();
  if (kind === 'hook') capabilities.add('hook-execution');
  let totalBytes = 0; let directoryCount = root.isDirectory() ? 1 : 0;
  const visit = (current: string, depth: number, relativeRoot: string): void => {
    if (depth > MAX_IMPORT_DEPTH) unsafe();
    for (const child of list(current)) {
      if (isSensitivePathSegment(child.name)) unsafe();
      const childPath = join(current, child.name);
      const childRelative = relativeRoot ? `${relativeRoot}/${child.name}` : child.name;
      if (Buffer.byteLength(childRelative, 'utf8') > MAX_IMPORT_PATH_BYTES) unsafe();
      const stat = entry(childPath);
      if (stat.isDirectory()) {
        if (++directoryCount > MAX_IMPORT_DIRECTORIES) unsafe();
        directories.push({ path: childRelative, mode: stableMode(stat) });
        visit(childPath, depth + 1, childRelative);
        continue;
      }
      if (files.length >= MAX_IMPORT_FILES || Number(stat.size) > MAX_IMPORT_FILE_BYTES
        || totalBytes > MAX_IMPORT_BYTES - Number(stat.size)) unsafe();
      const bytes = readFile(childPath, stat);
      if (capabilityFor(childPath, stat, bytes)) capabilities.add('script-execution');
      files.push({ path: childRelative, bytes, mode: Number(stat.mode) & 0o777 });
      totalBytes += bytes.byteLength;
    }
  };
  if (root.isDirectory()) visit(absolutePath, 0, '');
  else {
    const bytes = readFile(absolutePath, root);
    if (capabilityFor(absolutePath, root, bytes)) capabilities.add('script-execution');
    files.push({ path: '', bytes, mode: Number(root.mode) & 0o777 });
    totalBytes = bytes.byteLength;
  }
  if (kind === 'skill' && !files.some(({ path }) => path === 'SKILL.md')) unsafe();
  const hash = root.isDirectory() ? hashTree(Number(root.mode) & 0o777, directories, files) : singleFileHash(files[0].bytes, Number(root.mode) & 0o777);
  return Object.freeze({
    absolutePath, kind, directory: root.isDirectory(), mode: stableMode(root), hash,
    identity: stableIdentity(root), files: Object.freeze(files), directories: Object.freeze(directories),
    capabilities: Object.freeze(['hook-execution', 'script-execution'].filter((value) => capabilities.has(value as ImportCapability)) as ImportCapability[])
  });
}
function mkdir(path: string, mode: number): void {
  try { mkdirSync(path, { recursive: false, mode }); if (process.platform !== 'win32') chmodSync(path, mode); }
  catch { unsafe(); }
}
function existingNode(path: string): Stats | null {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) unsafe();
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return unsafe();
  }
}
function materializeFiles(root: string, files: readonly ImportSourceEntry[]): void {
  for (const file of files) writeAtomicProjectionFile(file.path ? containedPath(root, file.path) : root, file.bytes, file.mode);
}
export function materializeImportSource(source: ImportSource, destination: string): void {
  assertNoSymlinkAncestors(destination);
  if (existingNode(destination)) throw new ControlPlaneError('CAS_CONFLICT');
  if (source.directory) {
    mkdir(destination, source.mode);
    for (const directory of source.directories) mkdir(containedPath(destination, directory.path), directory.mode);
    materializeFiles(destination, source.files);
  } else {
    const parent = dirname(destination);
    assertNoSymlinkAncestors(parent);
    materializeFiles(parent, [{ ...source.files[0], path: source.files[0].path ? source.files[0].path : destination.split('/').at(-1) ?? '' }]);
  }
}
export function copyTreeBounded(source: string, destination: string): void {
  assertNoSymlinkAncestors(source);
  assertNoSymlinkAncestors(destination);
  const root = entry(source);
  if (!root.isDirectory()) unsafe();
  mkdir(destination, stableMode(root));
  let files = 0; let bytes = 0; let directories = 1;
  const visit = (current: string, target: string, depth: number): void => {
    if (depth > COMPLETE_TREE_HASH_LIMITS.maxDepth) unsafe();
    for (const child of list(current)) {
      const sourcePath = join(current, child.name);
      const targetPath = join(target, child.name);
      const relativePath = relative(source, sourcePath).split('\\').join('/');
      if (Buffer.byteLength(relativePath, 'utf8') > COMPLETE_TREE_HASH_LIMITS.maxPathBytes) unsafe();
      const stat = entry(sourcePath);
      if (stat.isDirectory()) {
        if (++directories > COMPLETE_TREE_HASH_LIMITS.maxDirectories) unsafe();
        mkdir(targetPath, stableMode(stat)); visit(sourcePath, targetPath, depth + 1); continue;
      }
      const size = Number(stat.size);
      if (++files > COMPLETE_TREE_HASH_LIMITS.maxFiles || size > COMPLETE_TREE_HASH_LIMITS.maxFileBytes
        || bytes > COMPLETE_TREE_HASH_LIMITS.maxBytes - size) unsafe();
      writeAtomicProjectionFile(targetPath, readFile(sourcePath, stat), Number(stat.mode) & 0o777);
      bytes += size;
    }
  };
  visit(source, destination, 0);
}
export { validateDestinationKind };
