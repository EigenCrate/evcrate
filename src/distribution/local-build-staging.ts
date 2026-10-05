import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { getProjectionAdapter } from '../adapters/registry.js';
import { vscodeAdapter } from '../adapters/vscode/index.js';
import { createProjectionBuildContext } from '../adapters/types.js';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createStagedRoot, writeAtomicFile, type StagedRoot } from '../filesystem/atomic.js';
import { hashFile, treeHash } from '../filesystem/hashing.js';
import { ADVISOR_CONTROLLER_FILES, controllerHashes, validateAdvisorControllerProjection } from '../manifests/controller.js';
import { loadSelectedManifests, loadTargetManifestRegistry, manifestAdapterHashes, manifestSourceHashes } from '../manifests/registry.js';
import type { TargetManifest, TargetManifestRegistry } from '../manifests/types.js';
import { PERSISTED_TARGETS, normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import {
  deriveManifestView,
  type DerivedManifestView,
  type SharedBuildInputs,
  type TargetBuildFacts
} from './manifest-view-derivation.js';
import { collectBaselineOwners, copyStagedTree } from './local-staging-fs.js';

export {
  buildTargetPolicies,
  deriveManifestView,
  type DerivedManifestView,
  type SharedBuildInputs,
  type TargetBuildFacts
} from './manifest-view-derivation.js';
export {
  assertLiveInputsUnchanged,
  prepareInputSnapshot,
  type InputSnapshotHashes,
  type InputSnapshotResult
} from './input-snapshot.js';
import { resolveBuildJobs } from './build-jobs.js';
import { prepareInputSnapshot, type InputSnapshotHashes } from './input-snapshot.js';
import { TargetWorkerPool } from './worker-pool.js';
const LEGACY_LOCAL_ROOTS = Object.freeze([
  '.claude', '.gemini', '.antigravity', '.codex', '.agents', '.pi', '.omp', '.copilot', '.evcrate-vscode'
] as const);

export function assertLegacyRootClean(packageRoot: string): void {
  for (const root of LEGACY_LOCAL_ROOTS) {
    if (existsSync(join(packageRoot, root))) throw new ControlPlaneError('PATH_UNSAFE');
  }
}

export interface StagedManifestEntry {
  readonly target: PersistedTarget | 'aggregate';
  readonly manifestPath: string;
  readonly stagedManifestPath: string;
  readonly manifestData: Uint8Array;
}

export interface AssembleStageOptions {
  readonly emitAllManifests?: boolean;
  readonly jobs?: number | string | undefined;
  readonly workerScriptPath?: string;
}

export interface StagedBuildResult {
  readonly manifestPath: string;
  readonly stagedManifestPath: string;
  readonly manifestData: Uint8Array;
  readonly stagedOutputs: ReadonlyMap<string, string>;
  readonly localOutputs: ReadonlyMap<string, string>;
  readonly selectedManifests: readonly TargetManifest[];
  readonly allStagedManifests?: readonly StagedManifestEntry[];
  readonly snapshotHashes?: InputSnapshotHashes;
}


export function prepareSharedBuildInputs(packageRoot: string): SharedBuildInputs {
  assertLegacyRootClean(packageRoot);
  const sourceRoot = join(packageRoot, '.evcrate', 'source');
  const canonicalHarnessRoot = join(sourceRoot, '.claude');
  const registryPath = join(packageRoot, '.evcrate', 'targets', 'manifest.json');
  const registry = loadTargetManifestRegistry(registryPath);
  const controllerBinSource = join(sourceRoot, '.evcrate', 'bin');
  const cHashes = controllerHashes(controllerBinSource);
  const targetsRegistryPath = join(packageRoot, '.evcrate', 'targets');
  const targetsRegistryHash = existsSync(targetsRegistryPath) ? treeHash(targetsRegistryPath) : undefined;

  return {
    packageRoot,
    sourceRoot,
    canonicalHarnessRoot,
    canonicalClaudeHash: treeHash(canonicalHarnessRoot),
    claudeMdHash: hashFile(join(sourceRoot, 'CLAUDE.md')),
    registryPath,
    registry,
    controllerBinSource,
    controllerHashes: cHashes,
    targetsRegistryHash,
    runtimeRoot: join(packageRoot, 'dist')
  };
}

export function stageAdvisorController(
  sourceBin: string,
  stageBin: string
): Record<string, unknown> {
  mkdirSync(stageBin, { recursive: true });
  for (const entry of ADVISOR_CONTROLLER_FILES) {
    const src = join(sourceBin, entry);
    const dst = join(stageBin, entry);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    if (entry === 'evcrate-advisor' && process.platform !== 'win32') {
      try {
        chmodSync(dst, (lstatSync(dst).mode & 0o777) | 0o111);
      } catch (error) {
        throw new ControlPlaneError(
          'PUBLICATION_FAILED',
          `Failed to set executable mode on staged advisor controller ${dst}: ${(error as Error).message}`
        );
      }
    }
  }
  return validateAdvisorControllerProjection(sourceBin, stageBin);
}

export function buildAndStageTarget(
  manifest: TargetManifest,
  shared: SharedBuildInputs,
  stagePath: string
): TargetBuildFacts {
  const targetStage = createStagedRoot(shared.packageRoot, `.evcrate-target-${manifest.id}-`);
  try {
    const adapter = manifest.id === 'vscode' ? vscodeAdapter : getProjectionAdapter(manifest.id);
    const buildContext = createProjectionBuildContext(manifest, shared.canonicalHarnessRoot, targetStage);
    adapter.build(buildContext);
    const validation = adapter.validate(buildContext);
    if (!validation.valid) throw new ControlPlaneError('VALIDATION_INVALID');
    for (const root of manifest.outputRoots) copyStagedTree(join(targetStage.path, root), join(stagePath, root));
    for (const doc of manifest.projectDocs) copyStagedTree(join(targetStage.path, doc), join(stagePath, doc));
  } finally {
    targetStage.cleanup();
  }

  const owners = new Map<string, string>();
  const stagedOutputRoots: Record<string, string> = {};
  const stagedOutputs = new Map<string, string>();
  const localOutputs = new Map<string, string>();

  for (const root of manifest.outputRoots) {
    const staged = join(stagePath, root);
    const local = join(shared.sourceRoot, root);
    stagedOutputRoots[root] = staged;
    stagedOutputs.set(root, staged);
    localOutputs.set(root, local);
    collectBaselineOwners(stagePath, root, owners);
  }
  for (const doc of manifest.projectDocs) {
    const staged = join(stagePath, doc);
    const local = join(shared.sourceRoot, doc);
    stagedOutputRoots[doc] = staged;
    stagedOutputs.set(doc, staged);
    localOutputs.set(doc, local);
    collectBaselineOwners(stagePath, doc, owners);
  }

  return {
    manifest,
    stagedOutputRoots,
    stagedOutputs,
    localOutputs,
    owners,
    adapterHashes: manifestAdapterHashes([manifest], shared.packageRoot),
    sourceHashes: manifestSourceHashes([manifest])
  };
}

export async function assembleLocalStage(
  packageRoot: string,
  stage: StagedRoot,
  selectedTargets: readonly PersistedTarget[] = PERSISTED_TARGETS,
  options: AssembleStageOptions = {}
): Promise<StagedBuildResult> {
  assertLegacyRootClean(packageRoot);
  const { shared, snapshotStage, snapshotHashes } = prepareInputSnapshot(packageRoot);
  try {
    const manifests = loadSelectedManifests(shared.registry, selectedTargets);
    const stagePath = stage.path;

    const effectiveJobs = resolveBuildJobs({
      explicitJobs: options.jobs,
      targetCount: selectedTargets.length
    });

    let targetFacts: TargetBuildFacts[];
    if (effectiveJobs <= 1) {
      targetFacts = [];
      for (const manifest of manifests) {
        targetFacts.push(buildAndStageTarget(manifest, shared, stagePath));
      }
    } else {
      const pool = new TargetWorkerPool({
        jobs: effectiveJobs,
        packageRoot,
        sharedInputs: shared,
        stagePath,
        workerScriptPath: options.workerScriptPath
      });
      targetFacts = await pool.run(selectedTargets);
    }

    const stageBin = join(stagePath, '.evcrate', 'bin');
    const controllerMetadata = stageAdvisorController(shared.controllerBinSource, stageBin);

    const liveSourceRoot = join(packageRoot, '.evcrate', 'source');
    const stagedOutputs = new Map<string, string>([['.evcrate', join(stagePath, '.evcrate')]]);
    const localOutputs = new Map<string, string>([['.evcrate', join(liveSourceRoot, '.evcrate')]]);
    for (const fact of targetFacts) {
      for (const [key, val] of fact.stagedOutputs) stagedOutputs.set(key, val);
      for (const [key] of fact.localOutputs) localOutputs.set(key, join(liveSourceRoot, key));
    }

    if (options.emitAllManifests) {
      if (manifests.length !== shared.registry.targets.size) {
        throw new ControlPlaneError('PROTOCOL_INVALID');
      }

      // Derive all 9 manifest views in memory BEFORE writing manifest files into stagePath/.evcrate
      const singleViews = targetFacts.map((fact) =>
        deriveManifestView([fact], shared, stagePath, controllerMetadata, fact.manifest.id)
      );
      const aggregateView = deriveManifestView(targetFacts, shared, stagePath, controllerMetadata);

      // Now write all 9 manifest files atomically into stagePath
      for (const singleView of singleViews) {
        mkdirSync(dirname(singleView.stagedManifestPath), { recursive: true });
        writeAtomicFile(singleView.stagedManifestPath, singleView.manifestData);
      }
      mkdirSync(dirname(aggregateView.stagedManifestPath), { recursive: true });
      writeAtomicFile(aggregateView.stagedManifestPath, aggregateView.manifestData);

      const allStagedManifests: StagedManifestEntry[] = [
        {
          target: 'aggregate',
          manifestPath: aggregateView.manifestPath,
          stagedManifestPath: aggregateView.stagedManifestPath,
          manifestData: aggregateView.manifestData
        },
        ...singleViews.map((view, i) => ({
          target: normalizeTarget(targetFacts[i].manifest.id),
          manifestPath: view.manifestPath,
          stagedManifestPath: view.stagedManifestPath,
          manifestData: view.manifestData
        }))
      ];

      return {
        manifestPath: aggregateView.manifestPath,
        stagedManifestPath: aggregateView.stagedManifestPath,
        manifestData: aggregateView.manifestData,
        stagedOutputs,
        localOutputs,
        selectedManifests: manifests,
        allStagedManifests,
        snapshotHashes
      };
    }

    const view = deriveManifestView(
      targetFacts,
      shared,
      stagePath,
      controllerMetadata,
      selectedTargets.length === 1 ? selectedTargets[0] : undefined
    );
    mkdirSync(dirname(view.stagedManifestPath), { recursive: true });
    writeAtomicFile(view.stagedManifestPath, view.manifestData);

    return {
      manifestPath: view.manifestPath,
      stagedManifestPath: view.stagedManifestPath,
      manifestData: view.manifestData,
      stagedOutputs,
      localOutputs,
      selectedManifests: manifests,
      snapshotHashes
    };
  } finally {
    try {
      snapshotStage.cleanup();
    } catch {
      // Best effort
    }
  }
}
