import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { hashFile } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, assertRealDirectory } from '../filesystem/paths.js';
import type { TargetManifest } from '../manifests/types.js';
import { copyStagedTree } from './local-staging-fs.js';

/**
 * Validates the security, containment, and integrity of a child worker's staged target output,
 * then copies verified trees into the parent assembly stage.
 */
export function verifyAndCopyChildStage(
  childStagePath: string,
  containerDev: number,
  manifest: TargetManifest,
  outputHashes: Readonly<Record<string, string>>,
  destStagePath: string
): void {
  assertNoSymlinkAncestors(childStagePath);
  assertRealDirectory(childStagePath);

  const stageStat = lstatSync(childStagePath);
  if (Number(stageStat.dev) !== containerDev) {
    throw new ControlPlaneError('PATH_UNSAFE', 'Staged path device does not match container');
  }

  for (const [relPath, expectedHash] of Object.entries(outputHashes)) {
    const fullPath = join(childStagePath, relPath);
    if (!existsSync(fullPath)) {
      throw new ControlPlaneError('VALIDATION_INVALID', `Missing output file in stage: ${relPath}`);
    }
    const fileStat = lstatSync(fullPath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new ControlPlaneError('PATH_UNSAFE', `Unsafe output file in stage: ${relPath}`);
    }
    const actualHash = hashFile(fullPath);
    if (actualHash !== expectedHash) {
      throw new ControlPlaneError('VALIDATION_INVALID', `Hash mismatch for ${relPath}`);
    }
  }
  // Bidirectional verification: assert no extra unhashed files exist in child stage
  const actualFiles = new Set<string>();
  const scanActual = (fullPath: string): void => {
    if (!existsSync(fullPath)) return;
    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(fullPath)) {
        scanActual(join(fullPath, entry));
      }
    } else if (stat.isFile()) {
      const rel = relative(childStagePath, fullPath).split('\\').join('/');
      actualFiles.add(rel);
    }
  };

  for (const root of manifest.outputRoots) {
    scanActual(join(childStagePath, root));
  }
  for (const doc of manifest.projectDocs) {
    scanActual(join(childStagePath, doc));
  }

  for (const file of actualFiles) {
    if (!Object.prototype.hasOwnProperty.call(outputHashes, file)) {
      throw new ControlPlaneError('PATH_UNSAFE', `Extra unverified file in staged output: ${file}`);
    }
  }

  // Copy verified trees into destination assembly stage
  for (const root of manifest.outputRoots) {
    copyStagedTree(join(childStagePath, root), join(destStagePath, root));
  }
  for (const doc of manifest.projectDocs) {
    copyStagedTree(join(childStagePath, doc), join(destStagePath, doc));
  }
}
