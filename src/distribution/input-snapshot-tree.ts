import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { compareCanonicalPaths, hashFile, isIgnoredArtifact } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, assertRealDirectory, normalizeRelativePath } from '../filesystem/paths.js';
import { copyStagedTree } from './local-staging-fs.js';

/** Validate boundary entries before filtering; never inspect excluded descendants. */
export function visitSnapshotInputs(
  root: string,
  visit: (full: string, path: string, directory: boolean) => void
): void {
  assertNoSymlinkAncestors(root);
  assertRealDirectory(root);
  const walk = (directory: string, prefix: string): void => {
    const entries = readdirSync(directory).sort(compareCanonicalPaths);
    for (const name of entries) {
      const path = normalizeRelativePath(prefix ? `${prefix}/${name}` : name);
      const full = join(directory, name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new ControlPlaneError('PATH_UNSAFE');
      }
      if (isIgnoredArtifact(path)) continue;
      visit(full, path, stat.isDirectory());
      if (stat.isDirectory()) walk(full, path);
    }
  };
  walk(root, '');
}

/** Unlike manifest treeHash, freshness includes consumed .gitignore bytes. */
export function canonicalInputHash(root: string): string {
  const digest = createHash('sha256');
  visitSnapshotInputs(root, (full, path, directory) => {
    digest.update(directory ? `d\0${path}\n` : `f\0${path}\0${hashFile(full)}\n`);
  });
  return digest.digest('hex');
}

export function copyCanonicalInputs(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  visitSnapshotInputs(source, (full, path, directory) => {
    const target = join(destination, path);
    if (directory) mkdirSync(target, { recursive: true });
    else copyStagedTree(full, target);
  });
}

/** Only executable JS belongs to the compiled control-plane runtime identity. */
export function compiledRuntimeHash(root: string): string {
  const digest = createHash('sha256');
  visitSnapshotInputs(root, (full, path, directory) => {
    if (!directory && path.endsWith('.js')) digest.update(`f\0${path}\0${hashFile(full)}\n`);
  });
  return digest.digest('hex');
}

export function copyCompiledRuntime(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  visitSnapshotInputs(source, (full, path, directory) => {
    if (!directory && path.endsWith('.js')) copyStagedTree(full, join(destination, path));
  });
}
