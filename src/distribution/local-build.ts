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

export function runLocalBuild(
  packageRoot: string,
  selectedTargets: readonly PersistedTarget[] = PERSISTED_TARGETS
): VerifiedCurrentBuild {
  const stage = createStagedRoot(packageRoot, '.evcrate-build-');
  try {
    const result = assembleLocalStage(packageRoot, stage, selectedTargets);
    const pairs: PromotionPair[] = [];

    for (const [name, stagedPath] of result.stagedOutputs) {
      if (name === '.evcrate') continue;
      const localPath = result.localOutputs.get(name)!;
      pairs.push({ source: stagedPath, destination: localPath });
    }

    pairs.unshift({ source: result.stagedManifestPath, destination: result.manifestPath });

    promoteTransaction(pairs, { stageRoot: stage, lockRoot: join(packageRoot, '.evcrate-publish-state') });
    const manifest = readBuildManifest(result.manifestPath);
    return Object.freeze({
      manifestPath: result.manifestPath,
      manifest,
      selectedManifests: result.selectedManifests,
      outputPaths: Object.freeze(Object.fromEntries(result.localOutputs))
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

export async function runLocalDistribution(
  action: 'build' | 'check' | 'publish' | 'all' | 'recover',
  context: InvocationContext,
  options: PublicationOptions = {}
): Promise<{ readonly action: string; readonly engine: 'typescript' }> {
  switch (action) {
    case 'build':
      runLocalBuild(context.packageRoot, context.selectedTargetIds);
      return { action: 'build', engine: 'typescript' };
    case 'check':
      runLocalCheck(context.packageRoot, context.selectedTargetIds);
      return { action: 'check', engine: 'typescript' };
    case 'publish':
      publishApply(context, options);
      return { action: 'publish', engine: 'typescript' };
    case 'all':
      runLocalBuild(context.packageRoot, context.selectedTargetIds);
      publishApply(context, options);
      return { action: 'all', engine: 'typescript' };
    case 'recover':
      recoverPublication(context);
      return { action: 'recover', engine: 'typescript' };
  }
}
