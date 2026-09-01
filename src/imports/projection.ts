import { lstatSync } from 'node:fs';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createStagedRoot, type StagedRoot } from '../filesystem/atomic.js';
import { containedPath } from '../filesystem/paths.js';
import { hashFile, treeHash } from '../filesystem/hashing.js';
import { createProjectionBuildContext, type ProjectionAdapter } from '../adapters/types.js';
import type { TargetManifest } from '../manifests/types.js';
import type { ResourceKind } from '../manifests/types.js';
import type { PersistedTarget } from '../protocol/validation.js';

export interface ProjectionRun {
  readonly outputHashes: Readonly<Record<string, string>>;
  readonly cleanup: () => void;
}
function unsafe(): never { throw new ControlPlaneError('PATH_UNSAFE'); }
function outputHash(stage: StagedRoot, manifest: TargetManifest, root: string): string {
  const path = containedPath(stage.path, root, true);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) return unsafe();
  return stat.isDirectory() ? treeHash(path) : hashFile(path);
}
function sorted(values: Record<string, string>): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(Object.entries(values).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));
}
export function buildAndHashProjections(
  manifests: readonly TargetManifest[], adapters: ReadonlyMap<PersistedTarget, ProjectionAdapter>,
  canonicalRoot: string, packageRoot: string, kind: ResourceKind
): ProjectionRun {
  const stages: StagedRoot[] = [];
  try {
    const outputHashes: Record<string, string> = {};
    for (const manifest of manifests) {
      const adapter = adapters.get(manifest.id as PersistedTarget);
      const compatibility = adapter?.compatibility[kind];
      if (!adapter || !compatibility || compatibility.status === 'unsupported') throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
      const stage = createStagedRoot(packageRoot, '.evcrate-import-output-');
      stages.push(stage);
      const build = createProjectionBuildContext(manifest, canonicalRoot, stage);
      adapter.build(build);
      const validation = adapter.validate(build);
      if (!validation.valid) throw new ControlPlaneError('VALIDATION_INVALID');
      for (const root of manifest.outputRoots) outputHashes[`${manifest.id}/${root}`] = outputHash(stage, manifest, root);
    }
    let closed = false;
    return Object.freeze({
      outputHashes: sorted(outputHashes),
      cleanup: () => {
        if (closed) return;
        closed = true;
        for (const stage of stages.splice(0).reverse()) stage.cleanup();
      }
    });
  } catch (error) {
    for (const stage of stages.reverse()) stage.cleanup();
    throw error;
  }
}
