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

function comparePaths(left: string, right: string): number {
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
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => comparePaths(left.name, right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).split('\\').join('/');
      if ((sourceMode ? isIgnoredSource : isIgnoredArtifact)(relativePath)) continue;
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
  return records.sort((left, right) => comparePaths(left.path, right.path)).map(({ value }) => value);
}

export function treeHash(root: string): string {
  return hashRecords(collectTree(root, false));
}

export function sourceTreeHash(root: string): string {
  return hashRecords(collectTree(root, true));
}

