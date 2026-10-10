import { join } from 'node:path';
import { treeHash } from '../filesystem/hashing.js';
import { buildManifestBytes } from '../manifests/registry.js';
import type { TargetManifest, TargetManifestRegistry } from '../manifests/types.js';
import type { PersistedTarget } from '../protocol/validation.js';

export interface SharedBuildInputs {
  readonly packageRoot: string;
  readonly sourceRoot: string;
  readonly canonicalHarnessRoot: string;
  readonly canonicalClaudeHash: string;
  readonly agentsMdHash: string;
  readonly registryPath: string;
  readonly registry: TargetManifestRegistry;
  readonly controllerBinSource: string;
  readonly controllerHashes: Readonly<Record<string, string>>;
  readonly targetsRegistryHash?: string;
  readonly runtimeRoot: string;
}

export interface TargetBuildFacts {
  readonly manifest: TargetManifest;
  readonly stagedOutputRoots: Readonly<Record<string, string>>;
  readonly stagedOutputs: ReadonlyMap<string, string>;
  readonly localOutputs: ReadonlyMap<string, string>;
  readonly owners: ReadonlyMap<string, string>;
  readonly adapterHashes: Readonly<Record<string, string>>;
  readonly sourceHashes: Readonly<Record<string, string>>;
}

export interface DerivedManifestView {
  readonly manifestPath: string;
  readonly stagedManifestPath: string;
  readonly manifestData: Uint8Array;
}

/**
 * Constructs the canonical home_policy dictionary for a set of target manifests,
 * always including the mandatory advisor-controller entry.
 */
export function buildTargetPolicies(manifests: readonly TargetManifest[]): Record<string, unknown> {
  const result: Record<string, unknown> = {
    'advisor-controller': {
      bindings: { '.evcrate/bin': '.evcrate/bin' },
      preserve_paths: {},
      promotion_order: 5
    }
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

/**
 * Derives a target-specific or aggregate manifest metadata view from pre-verified
 * target build facts and shared inputs without rebuilding projections.
 */
export function deriveManifestView(
  targetFactsList: readonly TargetBuildFacts[],
  shared: SharedBuildInputs,
  stagePath: string,
  controllerMetadata: Record<string, unknown>,
  forceTargetId?: PersistedTarget | string
): DerivedManifestView {
  const manifests = targetFactsList.map((fact) => fact.manifest);
  const allTargets = manifests.length === shared.registry.targets.size;

  const sourceHashes: Record<string, string> = {
    '.claude': shared.canonicalClaudeHash,
    'AGENTS.md': shared.agentsMdHash
  };
  for (const fact of targetFactsList) {
    Object.assign(sourceHashes, fact.sourceHashes);
  }
  if (allTargets) {
    sourceHashes['.evcrate/targets'] = shared.targetsRegistryHash ?? treeHash(join(shared.packageRoot, '.evcrate', 'targets'));
  }

  const adapterHashes: Record<string, string> = {};
  for (const fact of targetFactsList) {
    Object.assign(adapterHashes, fact.adapterHashes);
  }

  const ownersMap: Record<string, string> = {};
  for (const fact of targetFactsList) {
    for (const [key, owner] of fact.owners) {
      ownersMap[key] = owner;
    }
  }
  for (const key of Object.keys(shared.controllerHashes)) {
    ownersMap[key] = 'advisor-controller';
  }

  const stagedOutputRoots: Record<string, string> = {
    '.evcrate': join(stagePath, '.evcrate')
  };
  for (const fact of targetFactsList) {
    Object.assign(stagedOutputRoots, fact.stagedOutputRoots);
  }

  const manifestInputs = {
    sourceHashes,
    adapterHashes,
    controllerHashes: shared.controllerHashes,
    owners: ownersMap,
    outputRoots: stagedOutputRoots,
    homePolicy: buildTargetPolicies(manifests),
    validation: {
      complete: true,
      symlinks: 'rejected',
      target_registry: 'validated',
      advisor_controller: controllerMetadata
    }
  };

  const manifestData = buildManifestBytes(manifestInputs);
  const targetRelManifest = forceTargetId !== undefined
    ? `.evcrate/build-manifest-${forceTargetId}.json`
    : (targetFactsList.length === 1 && !allTargets)
      ? `.evcrate/build-manifest-${targetFactsList[0].manifest.id}.json`
      : '.evcrate/build-manifest.json';

  const manifestPath = join(shared.packageRoot, targetRelManifest);
  const stagedManifestPath = join(stagePath, targetRelManifest);

  return { manifestPath, stagedManifestPath, manifestData };
}
