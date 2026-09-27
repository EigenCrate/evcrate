import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { getProjectionAdapter } from '../adapters/registry.js';
import { createProjectionBuildContext } from '../adapters/types.js';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createStagedRoot, writeAtomicFile, type StagedRoot } from '../filesystem/atomic.js';
import { hashFile, treeHash } from '../filesystem/hashing.js';
import { ADVISOR_CONTROLLER_FILES, controllerHashes, validateAdvisorControllerProjection } from '../manifests/controller.js';
import { loadSelectedManifests, loadTargetManifestRegistry, manifestAdapterHashes, manifestSourceHashes, buildManifestBytes } from '../manifests/registry.js';
import type { TargetManifest } from '../manifests/types.js';
import type { PersistedTarget } from '../protocol/validation.js';

const LEGACY_LOCAL_ROOTS = Object.freeze([
  '.claude', '.gemini', '.antigravity', '.codex', '.agents', '.pi', '.omp', '.copilot'
] as const);

export function assertLegacyRootClean(packageRoot: string): void {
  for (const root of LEGACY_LOCAL_ROOTS) {
    if (existsSync(join(packageRoot, root))) throw new ControlPlaneError('PATH_UNSAFE');
  }
}

export interface StagedBuildResult {
  readonly manifestPath: string;
  readonly stagedManifestPath: string;
  readonly manifestData: Uint8Array;
  readonly stagedOutputs: ReadonlyMap<string, string>;
  readonly localOutputs: ReadonlyMap<string, string>;
  readonly selectedManifests: readonly TargetManifest[];
}

function copyStagedTree(source: string, destination: string): void {
  if (!existsSync(source)) return;
  const stat = lstatSync(source);
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
        throw new ControlPlaneError('PUBLICATION_FAILED', `Failed to set executable mode on staged file ${destination}: ${(error as Error).message}`);
      }
    }
  }
}

function collectBaselineOwners(stagePath: string, rootName: string, owners: Map<string, string>): void {
  const fullRoot = join(stagePath, rootName);
  if (!existsSync(fullRoot)) return;
  const stat = lstatSync(fullRoot);
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

function buildTargetPolicies(manifests: readonly TargetManifest[]): Record<string, unknown> {
  const result: Record<string, unknown> = {
    'advisor-controller': { bindings: { '.evcrate/bin': '.evcrate/bin' }, preserve_paths: {}, promotion_order: 5 }
  };
  for (const manifest of manifests) {
    const policy = manifest.homePolicy;
    const value: Record<string, unknown> = {
      bindings: Object.fromEntries(Object.entries(policy.bindings).sort(([a], [b]) => a.localeCompare(b))),
      preserve_paths: Object.fromEntries(Object.entries(policy.preservePaths).map(([r, e]) => [r, [...e]])),
      promotion_order: policy.promotionOrder
    };
    if (policy.rejectUnmanagedCollisions) value.reject_unmanaged_collisions = true;
    if (policy.publicationRules.length) value.publication_rules = [...policy.publicationRules];
    result[manifest.name] = value;
  }
  return result;
}

export function assembleLocalStage(
  packageRoot: string,
  stage: StagedRoot,
  selectedTargets: readonly PersistedTarget[]
): StagedBuildResult {
  assertLegacyRootClean(packageRoot);
  const stagePath = stage.path;
  const sourceRoot = join(packageRoot, '.evcrate', 'source');
  const canonicalHarnessRoot = join(sourceRoot, '.claude');
  const registryPath = join(packageRoot, '.evcrate', 'targets', 'manifest.json');
  const registry = loadTargetManifestRegistry(registryPath);
  const manifests = loadSelectedManifests(registry, selectedTargets);

  for (const manifest of manifests) {
    const targetStage = createStagedRoot(packageRoot, `.evcrate-target-${manifest.id}-`);
    try {
      const adapter = getProjectionAdapter(manifest.id);
      const buildContext = createProjectionBuildContext(manifest, canonicalHarnessRoot, targetStage);
      adapter.build(buildContext);
      const validation = adapter.validate(buildContext);
      if (!validation.valid) throw new ControlPlaneError('VALIDATION_INVALID');
      for (const root of manifest.outputRoots) copyStagedTree(join(targetStage.path, root), join(stagePath, root));
      for (const doc of manifest.projectDocs) copyStagedTree(join(targetStage.path, doc), join(stagePath, doc));
    } finally {
      targetStage.cleanup();
    }
  }

  const sourceBin = join(sourceRoot, '.evcrate', 'bin');
  const stageBin = join(stagePath, '.evcrate', 'bin');
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
        throw new ControlPlaneError('PUBLICATION_FAILED', `Failed to set executable mode on staged advisor controller ${dst}: ${(error as Error).message}`);
      }
    }
  }
  const controllerMetadata = validateAdvisorControllerProjection(sourceBin, stageBin);

  const ownersMap = new Map<string, string>();
  const stagedOutputRoots: Record<string, string> = { '.evcrate': join(stagePath, '.evcrate') };
  const stagedOutputs = new Map<string, string>([['.evcrate', join(stagePath, '.evcrate')]]);
  const localOutputs = new Map<string, string>([['.evcrate', join(sourceRoot, '.evcrate')]]);

  for (const manifest of manifests) {
    for (const root of manifest.outputRoots) {
      stagedOutputRoots[root] = join(stagePath, root);
      stagedOutputs.set(root, join(stagePath, root));
      localOutputs.set(root, join(sourceRoot, root));
      collectBaselineOwners(stagePath, root, ownersMap);
    }
    for (const doc of manifest.projectDocs) {
      stagedOutputRoots[doc] = join(stagePath, doc);
      stagedOutputs.set(doc, join(stagePath, doc));
      localOutputs.set(doc, join(sourceRoot, doc));
      collectBaselineOwners(stagePath, doc, ownersMap);
    }
  }

  const cHashes = controllerHashes(sourceBin);
  for (const key of Object.keys(cHashes)) ownersMap.set(key, 'advisor-controller');

  const allTargets = manifests.length === registry.targets.size;
  const sourceHashes: Record<string, string> = {
    '.claude': treeHash(canonicalHarnessRoot),
    'CLAUDE.md': hashFile(join(sourceRoot, 'CLAUDE.md')),
    ...manifestSourceHashes(manifests)
  };
  if (allTargets) sourceHashes['.evcrate/targets'] = treeHash(join(packageRoot, '.evcrate', 'targets'));

  const manifestInputs = {
    sourceHashes,
    adapterHashes: manifestAdapterHashes(manifests, packageRoot),
    controllerHashes: cHashes,
    owners: Object.fromEntries(ownersMap),
    outputRoots: stagedOutputRoots,
    homePolicy: buildTargetPolicies(manifests),
    validation: { complete: true, symlinks: 'rejected', target_registry: 'validated', advisor_controller: controllerMetadata }
  };

  const manifestData = buildManifestBytes(manifestInputs);
  const targetRelManifest = selectedTargets.length === 1 ? `.evcrate/build-manifest-${selectedTargets[0]}.json` : '.evcrate/build-manifest.json';
  const manifestPath = join(packageRoot, targetRelManifest);
  const stagedManifestPath = join(stagePath, targetRelManifest);

  mkdirSync(dirname(stagedManifestPath), { recursive: true });
  writeAtomicFile(stagedManifestPath, manifestData);

  return { manifestPath, stagedManifestPath, manifestData, stagedOutputs, localOutputs, selectedManifests: manifests };
}
