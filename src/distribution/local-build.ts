import { existsSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createStagedRoot } from '../filesystem/atomic.js';
import { withPublishLock } from '../filesystem/locking.js';
import { hashBytes, hashFile, treeHash } from '../filesystem/hashing.js';
import { readBuildManifest } from './manifest.js';
import type { VerifiedCurrentBuild } from './build-resolution.js';
import { assembleLocalStage } from './local-build-staging.js';
import { promoteTransaction, type PromotionPair } from './promotion.js';
import { publishApply, recoverPublication, type PublicationOptions } from './publication.js';
import { PERSISTED_TARGETS, type PersistedTarget } from '../protocol/validation.js';
import type {
  PublishApplyResultPayload, PublishRequestPayload, PublicationRequestPayload, RecoverRequestPayload, RecoverResultPayload
} from '../protocol/publication-payloads.js';
import type { InvocationContext } from '../context/invocation-context.js';
export { assertLegacyRootClean } from './local-build-staging.js';

function isSamePathTree(staged: string, local: string): boolean {
  if (!existsSync(staged) || !existsSync(local)) return !existsSync(staged) && !existsSync(local);
  const statStaged = lstatSync(staged);
  const statLocal = lstatSync(local);
  if (statStaged.isDirectory() !== statLocal.isDirectory()) return false;
  if (statStaged.isFile()) {
    return hashFile(staged) === hashFile(local);
  }
  return treeHash(staged) === treeHash(local);
}

export interface LocalBuildOptions {
  readonly emitAllManifests?: boolean;
}

export interface VerifiedAllManifestsBuild {
  readonly aggregateBuild: VerifiedCurrentBuild;
  readonly targetBuilds: ReadonlyMap<PersistedTarget, VerifiedCurrentBuild>;
  readonly allManifestPaths: readonly string[];
}

export function runLocalBuild(
  packageRoot: string,
  selectedTargets: readonly PersistedTarget[] = PERSISTED_TARGETS,
  options: LocalBuildOptions = {}
): VerifiedCurrentBuild {
  const stage = createStagedRoot(packageRoot, '.evcrate-build-');
  try {
    const result = assembleLocalStage(packageRoot, stage, selectedTargets, {
      emitAllManifests: options.emitAllManifests
    });
    const pairs: PromotionPair[] = [];

    for (const [name, stagedPath] of result.stagedOutputs) {
      if (name === '.evcrate') continue;
      const localPath = result.localOutputs.get(name)!;
      pairs.push({ source: stagedPath, destination: localPath });
    }

    if (result.allStagedManifests && result.allStagedManifests.length > 0) {
      for (const entry of result.allStagedManifests) {
        pairs.push({ source: entry.stagedManifestPath, destination: entry.manifestPath });
      }
    } else {
      pairs.unshift({ source: result.stagedManifestPath, destination: result.manifestPath });
    }

    promoteTransaction(pairs, { stageRoot: stage, lockRoot: join(packageRoot, '.evcrate-publish-state') });
    const manifest = readBuildManifest(result.manifestPath);
    return Object.freeze({
      manifestPath: result.manifestPath,
      manifest,
      manifestDigest: hashBytes(result.manifestData),
      selectedManifests: result.selectedManifests,
      outputPaths: Object.freeze(Object.fromEntries(result.localOutputs))
    });
  } finally {
    stage.cleanup();
  }
}

export function runAllManifestsBuild(packageRoot: string): VerifiedAllManifestsBuild {
  const stage = createStagedRoot(packageRoot, '.evcrate-build-');
  try {
    const result = assembleLocalStage(packageRoot, stage, PERSISTED_TARGETS, {
      emitAllManifests: true
    });
    const pairs: PromotionPair[] = [];

    for (const [name, stagedPath] of result.stagedOutputs) {
      if (name === '.evcrate') continue;
      const localPath = result.localOutputs.get(name)!;
      pairs.push({ source: stagedPath, destination: localPath });
    }

    for (const entry of result.allStagedManifests!) {
      pairs.push({ source: entry.stagedManifestPath, destination: entry.manifestPath });
    }

    promoteTransaction(pairs, { stageRoot: stage, lockRoot: join(packageRoot, '.evcrate-publish-state') });

    const aggregateManifest = readBuildManifest(result.manifestPath);
    const aggregateBuild: VerifiedCurrentBuild = Object.freeze({
      manifestPath: result.manifestPath,
      manifest: aggregateManifest,
      manifestDigest: hashBytes(result.manifestData),
      selectedManifests: result.selectedManifests,
      outputPaths: Object.freeze(Object.fromEntries(result.localOutputs))
    });

    const targetBuilds = new Map<PersistedTarget, VerifiedCurrentBuild>();
    for (const entry of result.allStagedManifests!) {
      if (entry.target === 'aggregate') continue;
      const targetManifest = readBuildManifest(entry.manifestPath);
      const manifestDef = result.selectedManifests.find((s) => s.id === entry.target)!;
      const targetOutputs: Record<string, string> = {
        '.evcrate': join(packageRoot, '.evcrate', 'source', '.evcrate')
      };
      for (const root of manifestDef.outputRoots) {
        targetOutputs[root] = join(packageRoot, '.evcrate', 'source', root);
      }
      for (const doc of manifestDef.projectDocs) {
        targetOutputs[doc] = join(packageRoot, '.evcrate', 'source', doc);
      }
      targetBuilds.set(entry.target, Object.freeze({
        manifestPath: entry.manifestPath,
        manifest: targetManifest,
        manifestDigest: hashBytes(entry.manifestData),
        selectedManifests: Object.freeze([manifestDef]),
        outputPaths: Object.freeze(targetOutputs)
      }));
    }

    return Object.freeze({
      aggregateBuild,
      targetBuilds,
      allManifestPaths: Object.freeze(result.allStagedManifests!.map((m) => m.manifestPath))
    });
  } finally {
    stage.cleanup();
  }
}

export function runLocalCheck(
  packageRoot: string,
  selectedTargets: readonly PersistedTarget[] = PERSISTED_TARGETS
): void {
  const stage = createStagedRoot(packageRoot, '.evcrate-check-');
  try {
    assembleLocalStage(packageRoot, stage, selectedTargets);
  } finally {
    stage.cleanup();
  }
}

type LocalDistributionOutcome =
  | { readonly action: 'build' | 'check'; readonly engine: 'typescript' }
  | { readonly action: 'publish' | 'all'; readonly engine: 'typescript'; readonly payload: PublishApplyResultPayload }
  | { readonly action: 'recover'; readonly engine: 'typescript'; readonly payload: RecoverResultPayload };

function publishRequest(
  context: InvocationContext, request: PublicationRequestPayload | undefined
): PublishRequestPayload {
  if (request !== undefined && !('selectedTargets' in request)) throw new ControlPlaneError('PROTOCOL_INVALID');
  return request ?? { scope: 'home', selectedTargets: context.selectedTargetIds };
}
function recoverRequest(
  request: PublicationRequestPayload | undefined
): RecoverRequestPayload {
  if (request !== undefined && !('releaseId' in request)) throw new ControlPlaneError('PROTOCOL_INVALID');
  return request ?? { scope: 'home', projectIdentity: null, releaseId: null };
}

export async function runLocalDistribution(
  action: 'build' | 'check' | 'publish' | 'all' | 'recover',
  context: InvocationContext,
  options: PublicationOptions = {},
  request?: PublicationRequestPayload
): Promise<LocalDistributionOutcome> {
  switch (action) {
    case 'build':
      runLocalBuild(context.packageRoot, context.selectedTargetIds);
      return { action: 'build', engine: 'typescript' };
    case 'check':
      runLocalCheck(context.packageRoot, context.selectedTargetIds);
      return { action: 'check', engine: 'typescript' };
    case 'publish':
      return { action: 'publish', engine: 'typescript', payload: publishApply(context, options, publishRequest(context, request)) };
    case 'all':
      runLocalBuild(context.packageRoot, context.selectedTargetIds);
      return { action: 'all', engine: 'typescript', payload: publishApply(context, options, publishRequest(context, request)) };
    case 'recover':
      return { action: 'recover', engine: 'typescript', payload: recoverPublication(context, recoverRequest(request)) };
  }
}
