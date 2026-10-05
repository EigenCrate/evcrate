import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createStagedRoot, type StagedRoot } from '../filesystem/atomic.js';
import { hashFile, treeHash } from '../filesystem/hashing.js';
import { controllerHashes, loadTargetManifestRegistry } from '../manifests/registry.js';
import type { SharedBuildInputs } from './manifest-view-derivation.js';
import { copyStagedTree } from './local-staging-fs.js';
import {
  canonicalInputHash, compiledRuntimeHash, copyCanonicalInputs, copyCompiledRuntime
} from './input-snapshot-tree.js';

// A cached parent cannot safely stage with a newly rebuilt runtime on disk.
const loadedRuntimeHash = compiledRuntimeHash(join(__dirname, '..'));

export interface InputSnapshotHashes {
  readonly canonicalClaudeHash: string;
  readonly canonicalInputHash: string;
  readonly compiledRuntimeHash: string;
  readonly claudeMdHash: string;
  readonly targetsRegistryHash?: string | undefined;
  readonly controllerHashes: Readonly<Record<string, string>>;
}

export interface InputSnapshotResult {
  readonly shared: SharedBuildInputs;
  readonly snapshotStage: StagedRoot;
  readonly snapshotHashes: InputSnapshotHashes;
}

export function prepareInputSnapshot(packageRoot: string): InputSnapshotResult {
  const sourceRoot = join(packageRoot, '.evcrate', 'source');
  const canonicalHarnessRoot = join(sourceRoot, '.claude');
  const controllerBinSource = join(sourceRoot, '.evcrate', 'bin');
  const targetsRegistryPath = join(packageRoot, '.evcrate', 'targets');
  const runtimeRoot = join(packageRoot, 'dist');
  const runtimeHash = compiledRuntimeHash(runtimeRoot);
  if (runtimeHash !== loadedRuntimeHash) {
    throw new ControlPlaneError('PUBLICATION_FAILED', 'Compiled runtime differs from loaded build code');
  }
  const canonicalIdentity = canonicalInputHash(canonicalHarnessRoot);

  // 1. Capture live hashes before copy
  const canonicalClaudeHash = treeHash(canonicalHarnessRoot);
  const claudeMdHash = hashFile(join(sourceRoot, 'CLAUDE.md'));
  const targetsRegistryHash = existsSync(targetsRegistryPath) ? treeHash(targetsRegistryPath) : undefined;
  const cHashes = controllerHashes(controllerBinSource);

  const snapshotHashes: InputSnapshotHashes = {
    canonicalClaudeHash,
    canonicalInputHash: canonicalIdentity,
    compiledRuntimeHash: runtimeHash,
    claudeMdHash,
    targetsRegistryHash,
    controllerHashes: cHashes
  };

  // 2. Create isolated snapshot stage
  const snapshotStage = createStagedRoot(packageRoot, '.evcrate-snapshot-');
  try {
    const snapSource = join(snapshotStage.path, '.evcrate', 'source');
    const snapClaude = join(snapSource, '.claude');
    const snapTargets = join(snapshotStage.path, '.evcrate', 'targets');
    const snapBin = join(snapSource, '.evcrate', 'bin');
    const snapRuntime = join(snapshotStage.path, 'dist');

    copyCanonicalInputs(canonicalHarnessRoot, snapClaude);
    copyFileSync(join(sourceRoot, 'CLAUDE.md'), join(snapSource, 'CLAUDE.md'));
    if (existsSync(targetsRegistryPath)) {
      copyStagedTree(targetsRegistryPath, snapTargets);
    }
    copyStagedTree(controllerBinSource, snapBin);
    copyCompiledRuntime(runtimeRoot, snapRuntime);

    // 3. Verify snapshot copy identity matches pre-copy hashes
    if (treeHash(snapClaude) !== canonicalClaudeHash) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'Snapshot canonical harness hash mismatch');
    }
    if (canonicalInputHash(snapClaude) !== canonicalIdentity) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'Snapshot consumed-input hash mismatch');
    }
    if (compiledRuntimeHash(snapRuntime) !== runtimeHash) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'Snapshot compiled runtime hash mismatch');
    }
    if (hashFile(join(snapSource, 'CLAUDE.md')) !== claudeMdHash) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'Snapshot CLAUDE.md hash mismatch');
    }
    if (targetsRegistryHash !== undefined && treeHash(snapTargets) !== targetsRegistryHash) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'Snapshot targets registry hash mismatch');
    }
    const snapControllerHashes = controllerHashes(snapBin);
    for (const [key, hash] of Object.entries(cHashes)) {
      if (snapControllerHashes[key] !== hash) {
        throw new ControlPlaneError('VALIDATION_INVALID', `Snapshot controller hash mismatch for ${key}`);
      }
    }

    const snapRegistryPath = join(snapTargets, 'manifest.json');
    const registry = loadTargetManifestRegistry(snapRegistryPath);

    const shared: SharedBuildInputs = {
      packageRoot,
      sourceRoot: snapSource,
      canonicalHarnessRoot: snapClaude,
      canonicalClaudeHash,
      claudeMdHash,
      registryPath: snapRegistryPath,
      registry,
      controllerBinSource: snapBin,
      controllerHashes: cHashes,
      targetsRegistryHash,
      runtimeRoot: snapRuntime
    };

    return { shared, snapshotStage, snapshotHashes };
  } catch (error) {
    try {
      snapshotStage.cleanup();
    } catch {
      // Best effort
    }
    throw error;
  }
}

export function assertLiveInputsUnchanged(packageRoot: string, expected: InputSnapshotHashes): void {
  const sourceRoot = join(packageRoot, '.evcrate', 'source');
  const canonicalHarnessRoot = join(sourceRoot, '.claude');
  const currentClaudeHash = canonicalInputHash(canonicalHarnessRoot);
  if (currentClaudeHash !== expected.canonicalInputHash) {
    throw new ControlPlaneError('PUBLICATION_FAILED', 'Canonical harness source modified during build');
  }
  if (compiledRuntimeHash(join(packageRoot, 'dist')) !== expected.compiledRuntimeHash) {
    throw new ControlPlaneError('PUBLICATION_FAILED', 'Compiled runtime modified during build');
  }

  const currentClaudeMdHash = hashFile(join(sourceRoot, 'CLAUDE.md'));
  if (currentClaudeMdHash !== expected.claudeMdHash) {
    throw new ControlPlaneError('PUBLICATION_FAILED', 'Source CLAUDE.md modified during build');
  }

  const targetsRegistryPath = join(packageRoot, '.evcrate', 'targets');
  if (expected.targetsRegistryHash !== undefined) {
    if (!existsSync(targetsRegistryPath) || treeHash(targetsRegistryPath) !== expected.targetsRegistryHash) {
      throw new ControlPlaneError('PUBLICATION_FAILED', 'Target registry modified during build');
    }
  }

  const controllerBinSource = join(sourceRoot, '.evcrate', 'bin');
  const currentControllerHashes = controllerHashes(controllerBinSource);
  for (const [key, hash] of Object.entries(expected.controllerHashes)) {
    if (currentControllerHashes[key] !== hash) {
      throw new ControlPlaneError('PUBLICATION_FAILED', `Advisor controller source modified during build for ${key}`);
    }
  }
}
