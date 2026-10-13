import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { writeProjectionFile } from '../adapters/projection-utils.js';
import type { ProjectionBuildContext } from '../adapters/types.js';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { hashBytes, readBoundedFile } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, assertRealDirectory, containedPath } from '../filesystem/paths.js';
import type { TargetManifest } from '../manifests/types.js';

interface StagedFileRecord {
  readonly bytes: Uint8Array;
  readonly executable: boolean;
}

/**
 * Merges declared, validated target overlay artifacts from the snapshotted target directory
 * into the target build context stage before projection validation.
 *
 * For VS Code, artifacts from `.evcrate/targets/vscode/files/` are staged under `.evcrate-vscode/`.
 */
export function mergeTargetOverlayArtifacts(
  manifest: TargetManifest,
  context: ProjectionBuildContext
): void {
  if (manifest.id !== 'vscode' || manifest.overlayRoot === null) {
    return;
  }

  assertNoSymlinkAncestors(manifest.overlayRoot);
  assertRealDirectory(manifest.overlayRoot);
  if (basename(manifest.overlayRoot) !== 'files') {
    throw new ControlPlaneError('PATH_UNSAFE');
  }

  const declaredSet = new Set(manifest.ownedPaths);
  const foundUnderOverlay: string[] = [];

  const scanDir = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new ControlPlaneError('PATH_UNSAFE');
      }
      if (entry.isDirectory()) {
        scanDir(full, rel);
      } else if (entry.isFile()) {
        const ownedPath = `files/${rel}`;
        foundUnderOverlay.push(ownedPath);
        if (!declaredSet.has(ownedPath)) {
          throw new ControlPlaneError('PATH_UNSAFE', `Undeclared file in overlay: ${rel}`);
        }
      } else {
        throw new ControlPlaneError('PATH_UNSAFE');
      }
    }
  };
  scanDir(manifest.overlayRoot, '');

  for (const owned of manifest.ownedPaths) {
    if (!foundUnderOverlay.includes(owned)) {
      throw new ControlPlaneError('VALIDATION_INVALID', `Declared owned path missing: ${owned}`);
    }
  }

  // Verify all required companion files are declared for VS Code
  const descOwned = 'files/evcrate/companion/package.json';
  const receiptOwned = 'files/evcrate/companion/source-receipt.json';
  const vsixOwned = manifest.ownedPaths.find((p) => p.startsWith('files/evcrate/companion/evcrate-model-bindings-') && p.endsWith('.vsix'));

  if (!manifest.ownedPaths.includes(descOwned) || !manifest.ownedPaths.includes(receiptOwned) || !vsixOwned) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'All required companion files must be declared in owned_paths');
  }

  // Read all overlay files once into memory to eliminate TOCTOU race condition
  const loadedFiles = new Map<string, StagedFileRecord>();
  for (const owned of manifest.ownedPaths) {
    if (!owned.startsWith('files/')) {
      throw new ControlPlaneError('PATH_UNSAFE');
    }
    const source = containedPath(manifest.sourceRoot, owned, true);
    assertNoSymlinkAncestors(source);

    const stat = lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new ControlPlaneError('PATH_UNSAFE');
    }

    const bytes = readBoundedFile(source, 16 * 1024 * 1024);

    const after = lstatSync(source);
    if (after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size) {
      throw new ControlPlaneError('PATH_UNSAFE');
    }

    loadedFiles.set(owned, { bytes, executable: (stat.mode & 0o111) !== 0 });
  }

  // Validate companion descriptor, VSIX, and source receipt integrity from loaded bytes
  const descRecord = loadedFiles.get(descOwned);
  if (!descRecord) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Missing companion descriptor in loaded files');
  }
  let descObj: Record<string, unknown>;
  try {
    descObj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(descRecord.bytes));
  } catch {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Corrupt companion descriptor JSON');
  }
  if (descObj.schema !== 'evcrate-vscode-companion-descriptor-v1' || typeof descObj.vsixSha256 !== 'string' || typeof descObj.version !== 'string') {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Invalid companion descriptor schema');
  }

  const expectedVsixRel = `evcrate/companion/evcrate-model-bindings-${descObj.version}.vsix`;
  if (descObj.vsixRelativePath !== expectedVsixRel || vsixOwned !== `files/${expectedVsixRel}`) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'VSIX relative path does not match descriptor version');
  }

  const vsixRecord = loadedFiles.get(vsixOwned);
  if (!vsixRecord) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Missing companion VSIX in loaded files');
  }
  const actualVsixHash = hashBytes(vsixRecord.bytes);
  if (actualVsixHash !== descObj.vsixSha256) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Tampered companion VSIX: hash mismatch with descriptor');
  }

  const receiptRecord = loadedFiles.get(receiptOwned);
  if (!receiptRecord) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Missing companion receipt in loaded files');
  }
  let receiptObj: Record<string, unknown>;
  try {
    receiptObj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptRecord.bytes));
  } catch {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Corrupt companion receipt JSON');
  }
  if (receiptObj.buildIdentity !== descObj.buildIdentity || receiptObj.version !== descObj.version) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Companion descriptor buildIdentity or version mismatches receipt');
  }

  // Stage loaded bytes atomically and check collisions
  for (const [owned, { bytes, executable }] of loadedFiles) {
    const destination = `${manifest.outputRoots[0]}/${owned.slice('files/'.length)}`;
    const fullDest = context.stagePath(destination);
    if (existsSync(fullDest)) {
      throw new ControlPlaneError('PATH_UNSAFE', `Overlay destination collision: ${destination}`);
    }
    writeProjectionFile(context, destination, bytes, executable);
  }
}
