import { chmodSync, copyFileSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertNoSymlinkAncestors } from '../filesystem/paths.js';

/**
 * Copies a directory or file recursively into a staged directory, preserving
 * directory structure and POSIX executable permissions.
 */
export function copyStagedTree(source: string, destination: string): void {
  assertNoSymlinkAncestors(source);
  const stat = lstatSync(source, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) copyStagedTree(join(source, entry), join(destination, entry));
  } else if (stat.isFile()) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    if (process.platform !== 'win32' && ((stat.mode & 0o111) !== 0 || source.endsWith('.sh'))) {
      try {
        chmodSync(destination, (lstatSync(destination).mode & 0o777) | 0o111);
      } catch (error) {
        throw new ControlPlaneError(
          'PUBLICATION_FAILED',
          `Failed to set executable mode on staged file ${destination}: ${(error as Error).message}`
        );
      }
    }
  }
}

/**
 * Traverses an output root or project doc in stage, attributing each contained file
 * to 'baseline' ownership in the manifest.
 */
export function collectBaselineOwners(stagePath: string, rootName: string, owners: Map<string, string>): void {
  const fullRoot = join(stagePath, rootName);
  const stat = lstatSync(fullRoot, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isFile()) {
    owners.set(rootName, 'baseline');
    return;
  }
  const visit = (currentDir: string): void => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const full = join(currentDir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) owners.set(relative(stagePath, full).split('\\').join('/'), 'baseline');
    }
  };
  visit(fullRoot);
}
