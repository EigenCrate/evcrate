import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalJson } from '../protocol/json.js';
import { assertNoSymlinkAncestors, assertRealDirectory, assertRegularFile, normalizeRelativePath } from './paths.js';

export const IGNORED_ARTIFACT_DIRECTORIES = Object.freeze(new Set(['node_modules', '__pycache__']));
export const IGNORED_SOURCE_DIRECTORIES = Object.freeze(new Set(['dist']));
export const IGNORED_ARTIFACT_FILES = Object.freeze(new Set(['.coverage']));
export const IGNORED_ARTIFACT_SUFFIXES = Object.freeze(new Set(['.pyc', '.pyo']));
export const IGNORED_TREE_FILES = Object.freeze(new Set(['.gitignore']));
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
function unsafe(): never {
  throw new ControlPlaneError('PATH_UNSAFE');
}

function parts(value: string): readonly string[] {
  return value.split(/[\\/]/u).filter(Boolean);
}

export function isIgnoredArtifact(value: string): boolean {
  const pathParts = parts(value);
  const name = pathParts.at(-1) ?? '';
  const suffix = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  return pathParts.some((part) => IGNORED_ARTIFACT_DIRECTORIES.has(part))
    || IGNORED_ARTIFACT_FILES.has(name) || IGNORED_ARTIFACT_SUFFIXES.has(suffix);
}

export function isIgnoredSource(value: string): boolean {
  return isIgnoredArtifact(value) || parts(value).some((part) => IGNORED_SOURCE_DIRECTORIES.has(part));
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalJson(value)}\n`);
}

export function hashBytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashFile(path: string): string {
  assertNoSymlinkAncestors(path);
  const stat = assertRegularFile(path);
  const descriptor = openSync(path, constants.O_RDONLY | NO_FOLLOW);
  const digest = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    const opened = fstatSync(descriptor);
    if (Number(opened.dev) !== Number(stat.dev) || Number(opened.ino) !== Number(stat.ino)
      || Number(opened.size) !== Number(stat.size)) {
      unsafe();
    }
    let offset = 0;
    while (offset < opened.size) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.byteLength, opened.size - offset), offset);
      if (count === 0) unsafe();
      digest.update(buffer.subarray(0, count));
      offset += count;
    }
    const final = fstatSync(descriptor);
    if (Number(final.dev) !== Number(opened.dev) || Number(final.ino) !== Number(opened.ino)
      || Number(final.size) !== Number(opened.size)) {
      unsafe();
    }
    return digest.digest('hex');
  } finally {
    closeSync(descriptor);
  }
}
export function hashFileWithMode(path: string): string {
  const initial = assertRegularFile(path);
  const digest = hashFile(path);
  const final = assertRegularFile(path);
  if (Number(initial.dev) !== Number(final.dev) || Number(initial.ino) !== Number(final.ino)
    || Number(initial.size) !== Number(final.size) || (Number(initial.mode) & 0o777) !== (Number(final.mode) & 0o777)) unsafe();
  return hashBytes(new TextEncoder().encode(`f\0${Number(initial.mode) & 0o777}\0${digest}\n`));
}
export function readBoundedFile(path: string, maxBytes: number): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid byte limit');
  assertNoSymlinkAncestors(path);
  const initial = assertRegularFile(path);
  if (Number(initial.size) > maxBytes) throw new RangeError('File is oversized');
  const descriptor = openSync(path, constants.O_RDONLY | NO_FOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (Number(opened.dev) !== Number(initial.dev) || Number(opened.ino) !== Number(initial.ino)
      || Number(opened.size) !== Number(initial.size) || Number(opened.size) > maxBytes) unsafe();
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) unsafe();
      offset += count;
    }
    const final = fstatSync(descriptor);
    if (Number(final.dev) !== Number(opened.dev) || Number(final.ino) !== Number(opened.ino)
      || Number(final.size) !== Number(opened.size)) unsafe();
    return Uint8Array.from(bytes);
  } finally {
    closeSync(descriptor);
  }
}

export function compareCanonicalPaths(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) as number);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) as number);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function hashRecords(records: readonly string[]): string {
  const digest = createHash('sha256');
  for (const record of records) digest.update(record, 'utf8');
  return digest.digest('hex');
}

function collectTree(root: string, sourceMode: boolean): string[] {
  assertNoSymlinkAncestors(root);
  assertRealDirectory(root);
  const records: Array<{ path: string; value: string }> = [];
  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareCanonicalPaths(left.name, right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).split('\\').join('/');
      if ((sourceMode ? isIgnoredSource : isIgnoredArtifact)(relativePath)) continue;
      if (IGNORED_TREE_FILES.has(entry.name)) continue;
      const normalized = normalizeRelativePath(relativePath);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) unsafe();
      if (stat.isDirectory()) {
        records.push({ path: normalized, value: `d\0${normalized}\n` });
        visit(path);
      } else if (stat.isFile()) {
        records.push({ path: normalized, value: `f\0${normalized}\0${hashFile(path)}\n` });
      } else unsafe();
    }
  };
  visit(root);
  return records.sort((left, right) => compareCanonicalPaths(left.path, right.path)).map(({ value }) => value);
}

export function treeHash(root: string): string {
  return hashRecords(collectTree(root, false));
}

export function sourceTreeHash(root: string): string {
  return hashRecords(collectTree(root, true));
}
export interface CompleteTreeHashLimits {
  readonly maxFiles: number; readonly maxDirectories: number; readonly maxBytes: number;
  readonly maxFileBytes: number; readonly maxDepth: number; readonly maxPathBytes: number;
}
export const COMPLETE_TREE_HASH_LIMITS: CompleteTreeHashLimits = Object.freeze({
  maxFiles: 100_000, maxDirectories: 100_000, maxBytes: 256 * 1024 * 1024,
  maxFileBytes: 16 * 1024 * 1024, maxDepth: 32, maxPathBytes: 4096
});
export function completeTreeHash(root: string, limits: CompleteTreeHashLimits = COMPLETE_TREE_HASH_LIMITS): string {
  assertNoSymlinkAncestors(root);
  const rootStat = assertRealDirectory(root);
  let files = 0; let directories = 1; let bytes = 0;
  const records: Array<{ path: string; value: string }> = [{ path: '', value: `d\0\0${Number(rootStat.mode) & 0o777}\n` }];
  const visit = (directory: string, depth: number): void => {
    if (depth > limits.maxDepth) unsafe();
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareCanonicalPaths(left.name, right.name)); }
    catch { unsafe(); }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = normalizeRelativePath(relative(root, path).split('\\').join('/'));
      if (Buffer.byteLength(relativePath, 'utf8') > limits.maxPathBytes) unsafe();
      if (IGNORED_TREE_FILES.has(entry.name)) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) unsafe();
      if (stat.isDirectory()) {
        if (++directories > limits.maxDirectories) unsafe();
        records.push({ path: relativePath, value: `d\0${relativePath}\0${Number(stat.mode) & 0o777}\n` });
        visit(path, depth + 1);
      } else {
        const size = Number(stat.size);
        if (++files > limits.maxFiles || size > limits.maxFileBytes || bytes > limits.maxBytes - size) unsafe();
        bytes += size;
        records.push({ path: relativePath, value: `f\0${relativePath}\0${hashFileWithMode(path)}\n` });
      }
    }
  };
  visit(root, 0);
  return hashRecords(records.sort((left, right) => compareCanonicalPaths(left.path, right.path)).map(({ value }) => value));
}

