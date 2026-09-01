import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { completeTreeHash, hashBytes, hashFile, hashFileWithMode, sourceTreeHash } from '../filesystem/hashing.js';
import { loadSelectedManifests } from '../manifests/registry.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { PersistedTarget } from '../protocol/validation.js';
import { normalizeRelativePath } from '../filesystem/paths.js';
function pathHash(path: string): string {
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return hashBytes(new TextEncoder().encode('absent\0'));
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new ControlPlaneError('PATH_UNSAFE');
  const mode = Number(stat.mode) & 0o777;
  let content: string;
  try { content = stat.isDirectory() ? completeTreeHash(path) : hashFileWithMode(path); }
  catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  let final: ReturnType<typeof lstatSync>;
  try { final = lstatSync(path); } catch { throw new ControlPlaneError('PATH_UNSAFE'); }
  if (final.isSymbolicLink() || final.dev !== stat.dev || final.ino !== stat.ino
    || final.size !== stat.size || (Number(final.mode) & 0o777) !== mode) {
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  return hashBytes(new TextEncoder().encode(`${stat.isDirectory() ? 'directory' : 'file'}\0${mode}\0${content}\n`));
}
export interface ScopeChangeHashes {
  readonly selectedTargets: readonly PersistedTarget[];
  readonly canonicalSourceHash: string;
  readonly targetRegistryHash: string;
  readonly targetManifestHashes: Readonly<Record<string, string>>;
  readonly adapterHashes: Readonly<Record<string, string>>;
  readonly outputHashes: Readonly<Record<string, string>>;
}
export function scopeChangeHashes(context: InvocationContext): ScopeChangeHashes {
  const selectedTargets = [...context.selectedTargetIds];
  if (!selectedTargets.length) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  const manifests = loadSelectedManifests(context.registryPath, selectedTargets);
  const targetManifestHashes: Record<string, string> = {};
  const adapterHashes: Record<string, string> = {};
  const outputHashes: Record<string, string> = {};
  for (const manifest of manifests) {
    targetManifestHashes[`${manifest.id}/manifest.json`] = hashFile(manifest.manifestPath);
    for (const path of [manifest.adapter, ...manifest.adapterSources].filter((value): value is string => value !== null)) {
      const normalized = normalizeRelativePath(path);
      adapterHashes[normalized] = hashFile(join(context.packageRoot, normalized));
    }
    for (const root of manifest.outputRoots) {
      const target = context.selectedTargets.find(({ id }) => id === manifest.id);
      if (!target) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
      const path = target.generatedRoots[manifest.outputRoots.indexOf(root)];
      outputHashes[`${manifest.id}/${root}`] = pathHash(path);
    }
  }
  return Object.freeze({
    selectedTargets: Object.freeze(selectedTargets), canonicalSourceHash: sourceTreeHash(context.canonicalSourceRoot),
    targetRegistryHash: hashFile(context.registryPath), targetManifestHashes: Object.freeze(targetManifestHashes),
    adapterHashes: Object.freeze(adapterHashes), outputHashes: Object.freeze(outputHashes)
  });
}
