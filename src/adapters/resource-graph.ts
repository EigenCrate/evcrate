import { lstatSync, readdirSync, type Dirent } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { hashBytes, isIgnoredArtifact, readBoundedFile } from '../filesystem/hashing.js';
import {
  assertNoSymlinkAncestors, assertOwnerControlledDirectory, containedPath, normalizeRelativePath
} from '../filesystem/paths.js';

export const MAX_RESOURCE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_RESOURCE_FILES = 100_000;
const MAX_RESOURCE_BYTES = 256 * 1024 * 1024;
const MAX_RESOURCE_DEPTH = 128;
const MAX_RESOURCE_PATH_BYTES = 4096;

export interface ResourceGraphFile {
  readonly path: string;
  readonly bytes: Readonly<Uint8Array>;
  readonly hash: string;
  readonly mode: number;
  readonly kind: 'file';
}

export interface ResourceGraph {
  readonly root: string;
  readonly files: readonly ResourceGraphFile[];
  readonly totalBytes: number;
}

export interface ResourceGraphOptions {
  readonly maxFileBytes?: number;
}

function fail(): never {
  throw new ControlPlaneError('PATH_UNSAFE');
}
export function assertResourceGraph(graph: ResourceGraph): void {
  if (graph === null || typeof graph !== 'object' || !Array.isArray(graph.files)
    || !Number.isSafeInteger(graph.totalBytes) || graph.totalBytes < 0) fail();
  let totalBytes = 0;
  for (const file of graph.files) {
    if (file === null || typeof file !== 'object' || file.kind !== 'file'
      || typeof file.path !== 'string' || !/^[^/]+(?:\/[^/]+)*$/u.test(file.path)
      || typeof file.hash !== 'string' || !/^[a-f0-9]{64}$/u.test(file.hash)
      || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777
      || !(file.bytes instanceof Uint8Array) || file.bytes.byteLength > MAX_RESOURCE_FILE_BYTES
      || totalBytes > MAX_RESOURCE_BYTES - file.bytes.byteLength
      || hashBytes(file.bytes) !== file.hash) fail();
    totalBytes += file.bytes.byteLength;
  }
  if (totalBytes !== graph.totalBytes) fail();
}

function comparePaths(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) as number);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) as number);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function maxFileBytes(options: ResourceGraphOptions): number {
  const limit = options.maxFileBytes ?? MAX_RESOURCE_FILE_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_RESOURCE_FILE_BYTES) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  return limit;
}

function readEntries(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true }).sort((left, right) => comparePaths(left.name, right.name));
  } catch {
    return fail();
  }
}

/** Build one deterministic, bounded inventory of canonical source files. */
export function createResourceGraph(canonicalRoot: string, options: ResourceGraphOptions = {}): ResourceGraph {
  const root = resolve(canonicalRoot);
  const limit = maxFileBytes(options);
  assertNoSymlinkAncestors(root);
  assertOwnerControlledDirectory(root);
  const files: ResourceGraphFile[] = [];
  let totalBytes = 0;

  const visit = (directory: string, depth: number): void => {
    if (depth > MAX_RESOURCE_DEPTH) fail();
    for (const entry of readEntries(directory)) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).split('\\').join('/');
      let normalized: string;
      try {
        normalized = normalizeRelativePath(relativePath);
        if (new TextEncoder().encode(normalized).byteLength > MAX_RESOURCE_PATH_BYTES) fail();
        containedPath(root, normalized, true);
      } catch (error) {
        if (error instanceof ControlPlaneError) throw error;
        fail();
      }
      let stat;
      try { stat = lstatSync(path); } catch { fail(); }
      if (stat.isSymbolicLink()) fail();
      if (stat.isDirectory()) {
        if (!isIgnoredArtifact(normalized)) visit(path, depth + 1);
        continue;
      }
      if (!stat.isFile()) fail();
      if (isIgnoredArtifact(normalized)) continue;
      const size = Number(stat.size);
      if (files.length >= MAX_RESOURCE_FILES || !Number.isSafeInteger(size) || size > limit
        || totalBytes > MAX_RESOURCE_BYTES - size) fail();
      let bytes: Uint8Array;
      try { bytes = readBoundedFile(path, limit); } catch (error) {
        if (error instanceof ControlPlaneError) throw error;
        fail();
      }
      let finalStat;
      try { finalStat = lstatSync(path); } catch { fail(); }
      if (finalStat.isSymbolicLink() || !finalStat.isFile()
        || Number(finalStat.dev) !== Number(stat.dev) || Number(finalStat.ino) !== Number(stat.ino)
        || Number(finalStat.size) !== size || (Number(finalStat.mode) & 0o777) !== (Number(stat.mode) & 0o777)) {
        fail();
      }
      const immutableBytes = Uint8Array.from(bytes);
      files.push(Object.freeze({
        path: normalized,
        bytes: immutableBytes,
        hash: hashBytes(immutableBytes),
        mode: Number(stat.mode) & 0o777,
        kind: 'file' as const
      }));
      totalBytes += immutableBytes.byteLength;
    }
  };

  visit(root, 0);
  files.sort((left, right) => comparePaths(left.path, right.path));
  return Object.freeze({ root, files: Object.freeze(files), totalBytes });
}
