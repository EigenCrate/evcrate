import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { promoteTransaction } from '../distribution/promotion.js';
import { completeTreeHash, hashFile } from '../filesystem/hashing.js';
import { snapshot } from '../distribution/promotion-recovery.js';
import { loadSelectedManifests, loadTargetManifestRegistry, manifestAdapterHashes } from '../manifests/registry.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { ImportApplyPayload, ImportApplyResultPayload } from '../protocol/resource-payloads.js';
import { requireProjectionAdapters } from '../adapters/registry.js';
import { buildAndHashProjections } from './projection.js';
import { readImportSource } from './source.js';
import { assertPreviewBinding, prepareImport } from './preview.js';
import {
  consumeImportPreview, importPreviewExpired, loadImportPreview, type ImportPreviewTokenRecord
} from './preview-store.js';
import { canonicalJson } from '../protocol/json.js';

function conflict(): never { throw new ControlPlaneError('CAS_CONFLICT'); }
function registryIdentity(path: string): { kind: 'present' | 'absent'; identity: string } {
  const value = snapshot(path, 'PATH_UNSAFE');
  if (!value.present) return { kind: 'absent', identity: 'absent' };
  return { kind: 'present', identity: `sha256:${value.digest}:${value.dev}:${value.ino}:${value.size}` };
}
function targetManifestHashes(manifests: readonly ReturnType<typeof loadSelectedManifests>[number][]): Record<string, string> {
  return Object.fromEntries(manifests.map((manifest) => [`${manifest.id}/manifest.json`, hashFile(manifest.manifestPath)]));
}
function assertDependencies(
  expected: ImportPreviewTokenRecord, context: InvocationContext, canonicalRoot: string,
  checkCanonical: 'current' | 'prospective' | 'staged-current' | 'staged', checkRegistry: boolean,
  manifestsOverride?: ReturnType<typeof loadSelectedManifests>
): void {
  const source = readImportSource(expected.sourcePath, expected.kind, {
    cwd: context.projectRoot,
    protectedRoots: [join(context.packageRoot, '.evcrate'), context.homeRoot, context.stateRoot]
  });
  if (source.hash !== expected.sourceHash || source.identity !== expected.sourceIdentity) conflict();
  if (checkCanonical === 'current' || checkCanonical === 'prospective' || checkCanonical === 'staged-current') {
    const canonicalHash = completeTreeHash(context.canonicalSourceRoot);
    if (canonicalHash !== (checkCanonical === 'current' || checkCanonical === 'staged-current'
      ? expected.currentCanonicalHash : expected.prospectiveCanonicalHash)) conflict();
  }
  if (checkCanonical === 'staged-current' || checkCanonical === 'staged') {
    if (completeTreeHash(canonicalRoot) !== expected.prospectiveCanonicalHash) conflict();
  }
  if (checkRegistry && canonicalJson(registryIdentity(join(context.packageRoot, '.evcrate', 'registry.json'))) !== canonicalJson(expected.registryFileRevision)) conflict();
  if (hashFile(context.registryPath) !== expected.targetRegistryHash) conflict();
  const manifests = manifestsOverride ?? loadSelectedManifests(loadTargetManifestRegistry(context.registryPath), expected.selectedTargets);
  if (canonicalJson(targetManifestHashes(manifests)) !== canonicalJson(expected.targetManifestHashes)) conflict();
  if (canonicalJson(manifestAdapterHashes(manifests, context.packageRoot)) !== canonicalJson(expected.adapterHashes)) conflict();
  const adapters = requireProjectionAdapters(expected.selectedTargets);
  const projections = buildAndHashProjections(manifests, adapters, canonicalRoot, context.packageRoot, expected.kind);
  try {
    if (canonicalJson(projections.outputHashes) !== canonicalJson(expected.outputHashes)) conflict();
  } finally { projections.cleanup(); }
}
function recompute(
  expected: ImportPreviewTokenRecord, context: InvocationContext, canonicalRoot: string,
  mode: 'current' | 'prospective' | 'staged-current' | 'staged', checkRegistry: boolean,
  manifests?: ReturnType<typeof loadSelectedManifests>
): void {
  try { assertDependencies(expected, context, canonicalRoot, mode, checkRegistry, manifests); }
  catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
}
export function applyImport(
  payload: ImportApplyPayload, context: InvocationContext, now = Date.now()
): ImportApplyResultPayload {
  const expected = loadImportPreview(context.stateRoot, payload.previewToken);
  if (importPreviewExpired(expected, now)) conflict();
  let prepared;
  try {
    prepared = prepareImport(expected, context, now);
    assertPreviewBinding(expected, prepared);
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
  try {
    if (prepared.result.change === 'unchanged') {
      recompute(expected, context, prepared.canonicalStage, 'staged-current', true, prepared.manifests);
      consumeImportPreview(context.stateRoot, expected.token);
      return { changed: false, change: 'unchanged', registryRevision: expected.registryRevision, resource: expected.resource };
    }
    recompute(expected, context, prepared.canonicalStage, 'staged-current', true, prepared.manifests);
    promoteTransaction([
      { source: prepared.canonicalStage, destination: context.canonicalSourceRoot },
      { source: prepared.registryStage, destination: prepared.registryPath }
    ], {
      stageRoot: prepared.stage, lockRoot: context.stateRoot, conflictCode: 'CAS_CONFLICT',
      hooks: {
        beforeBackup: (_pair, index) => recompute(expected, context, index === 0 ? prepared.canonicalStage : context.canonicalSourceRoot, index === 0 ? 'staged-current' : 'prospective', true, prepared.manifests),
        beforePromote: (_pair, index) => recompute(expected, context, index === 0 ? prepared.canonicalStage : context.canonicalSourceRoot, index === 0 ? 'staged' : 'prospective', index === 0, prepared.manifests)
      }
    });
    consumeImportPreview(context.stateRoot, expected.token);
    return { changed: true, change: prepared.result.change, registryRevision: prepared.plannedDocument.revision, resource: prepared.result.resource };
  } finally { prepared.cleanup(); }
}
