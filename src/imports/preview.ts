import { randomBytes } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createStagedRoot, removePath, writeAtomicFile, type StagedRoot } from '../filesystem/atomic.js';
import { canonicalJson } from '../protocol/json.js';
import { completeTreeHash, hashFile } from '../filesystem/hashing.js';
import { containedPath } from '../filesystem/paths.js';
import { loadSelectedManifests, loadTargetManifestRegistry, manifestAdapterHashes } from '../manifests/registry.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { PersistedTarget } from '../protocol/validation.js';
import type { ImportPreviewPayload, ImportPreviewResultPayload } from '../protocol/resource-payloads.js';
import { requireProjectionAdapters } from '../adapters/registry.js';
import { buildAndHashProjections } from './projection.js';
import {
  canonicalImportDestination, copyTreeBounded, materializeImportSource, readImportSource
} from './source.js';
import {
  loadResourceRegistry, resourceDocumentHash, resourceDocumentBytes, upsertResource
} from '../registry/store.js';
import { scanCanonicalResources } from '../registry/scanner.js';
import type { RegistryDocument, ResourceRecord } from '../registry/types.js';
import type { ImportPreviewTokenRecord } from './preview-store.js';

export interface PreparedImport {
  readonly tokenRecord: ImportPreviewTokenRecord;
  readonly result: ImportPreviewResultPayload;
  readonly registryPath: string;
  readonly manifests: ReturnType<typeof loadSelectedManifests>;
  readonly stage: StagedRoot;
  readonly canonicalStage: string;
  readonly registryStage: string;
  readonly plannedDocument: RegistryDocument;
  readonly cleanup: () => void;
}
interface ImportSpec {
  readonly sourcePath: string;
  readonly kind: ImportPreviewPayload['kind'];
  readonly destination: string;
  readonly provenance: string;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly capabilityApprovals: ImportPreviewPayload['capabilityApprovals'];
  readonly expiresAt: number;
  readonly token: string;
}
function conflict(): never { throw new ControlPlaneError('CAS_CONFLICT'); }
function pathHash(path: string): string {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new ControlPlaneError('PATH_UNSAFE');
  return stat.isDirectory() ? completeTreeHash(path) : hashFile(path);
}
function resourcePath(context: InvocationContext): string { return join(context.packageRoot, '.evcrate', 'registry.json'); }
function protectedRoots(context: InvocationContext): readonly string[] {
  return Object.freeze([
    join(context.packageRoot, '.evcrate'), context.homeRoot, context.stateRoot,
    ...context.generatedRoots, ...context.homeBindings.map(({ homeRoot }) => homeRoot)
  ]);
}
function selectManifests(context: InvocationContext, ids: readonly PersistedTarget[]) {
  if (ids.some((id) => !context.selectedTargetIds.includes(id))) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  const targetRegistry = loadTargetManifestRegistry(context.registryPath);
  return loadSelectedManifests(targetRegistry, ids);
}
function targetHashes(manifests: readonly ReturnType<typeof loadSelectedManifests>[number][]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const manifest of manifests) result[`${manifest.id}/manifest.json`] = hashFile(manifest.manifestPath);
  return result;
}
function sameRecord(left: ResourceRecord, right: ResourceRecord): boolean { return canonicalJson(left) === canonicalJson(right); }
function importedRecord(
  scanned: ResourceRecord, existing: ResourceRecord | undefined, provenance: string
): ResourceRecord {
  if (existing && existing.origin !== provenance) throw new ControlPlaneError('CAS_CONFLICT');
  return Object.freeze({ ...scanned, origin: provenance, revision: existing?.content_hash === scanned.content_hash ? existing.revision : scanned.revision });
}
function changedDocument(document: RegistryDocument, resource: ResourceRecord, change: 'create' | 'update' | 'unchanged'): RegistryDocument {
  return change === 'unchanged' ? document : upsertResource(document, resource);
}
function specFrom(input: ImportPreviewPayload | ImportPreviewTokenRecord, now: number, token?: string): ImportSpec {
  const isToken = 'sourceIdentity' in input;
  const expiresAt = isToken ? input.expiresAt : now + input.expiresInSeconds * 1000;
  return {
    sourcePath: input.sourcePath, kind: input.kind, destination: input.destination, provenance: input.provenance,
    selectedTargets: input.selectedTargets as readonly PersistedTarget[], capabilityApprovals: input.capabilityApprovals,
    expiresAt, token: token ?? (isToken ? input.token : randomBytes(32).toString('hex'))
  };
}
function bindResult(record: ImportPreviewResultPayload): Record<string, unknown> {
  const { token: _token, ...bound } = record;
  return bound;
}
export function previewResultFromToken(record: ImportPreviewTokenRecord): ImportPreviewResultPayload {
  return {
    token: record.token, expiresAt: record.expiresAt, kind: record.kind, destination: record.destination,
    provenance: record.provenance, capabilityApprovals: record.capabilityApprovals, sourceHash: record.sourceHash,
    registryRevision: record.registryRevision, registryFileRevision: record.registryFileRevision,
    currentCanonicalHash: record.currentCanonicalHash, prospectiveCanonicalHash: record.prospectiveCanonicalHash,
    selectedTargets: record.selectedTargets as PersistedTarget[], targetRegistryHash: record.targetRegistryHash,
    targetManifestHashes: record.targetManifestHashes, adapterHashes: record.adapterHashes, outputHashes: record.outputHashes,
    change: record.change, resource: record.resource
  };
}
export function prepareImport(
  input: ImportPreviewPayload | ImportPreviewTokenRecord, context: InvocationContext, now = Date.now(), token?: string
): PreparedImport {
  const spec = specFrom(input, now, token);
  if (!Number.isSafeInteger(now) || now >= spec.expiresAt) throw new ControlPlaneError('CAS_CONFLICT');
  const registryPath = resourcePath(context);
  const current = loadResourceRegistry(registryPath, context.canonicalSourceRoot, context.resourceRoots);
  const manifests = selectManifests(context, spec.selectedTargets);
  const adapters = requireProjectionAdapters(spec.selectedTargets);
  const source = readImportSource(spec.sourcePath, spec.kind, { cwd: context.projectRoot, protectedRoots: protectedRoots(context) });
  for (const capability of source.capabilities) if (!spec.capabilityApprovals.includes(capability)) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  const destination = canonicalImportDestination(context.canonicalSourceRoot, context.resourceRoots[spec.kind], spec.kind, spec.destination);
  const relativeDestination = relative(context.canonicalSourceRoot, destination).split('\\').join('/');
  const resourceId = `${spec.kind}:${relativeDestination}`;
  const existing = current.document.resources.find((record) => record.id === resourceId);
  if (existing && existing.origin !== spec.provenance) conflict();
  const currentCanonicalHash = pathHash(context.canonicalSourceRoot);
  const stage = createStagedRoot(context.packageRoot, '.evcrate-import-');
  let projections: ReturnType<typeof buildAndHashProjections> | undefined;
  try {
    const canonicalStage = join(stage.path, 'canonical');
    copyTreeBounded(context.canonicalSourceRoot, canonicalStage);
    const stagedDestination = containedPath(canonicalStage, relativeDestination);
    if (existing) {
      let stat;
      try { stat = lstatSync(stagedDestination); } catch { conflict(); }
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || stat.isDirectory() !== source.directory) conflict();
      removePath(stagedDestination);
    }
    materializeImportSource(source, stagedDestination);
    const scanned = scanCanonicalResources(canonicalStage, context.resourceRoots, current.document.resources);
    const planned = scanned.find((record) => record.id === `${spec.kind}:${relativeDestination}`);
    if (!planned) throw new ControlPlaneError('VALIDATION_INVALID');
    const resource = importedRecord(planned, existing, spec.provenance);
    const change = existing === undefined ? 'create' : sameRecord(existing, resource) ? 'unchanged' : 'update';
    const plannedDocument = changedDocument(current.document, resource, change);
    projections = buildAndHashProjections(manifests, adapters, canonicalStage, context.packageRoot, spec.kind);
    const result: ImportPreviewResultPayload = {
      token: spec.token, expiresAt: spec.expiresAt, kind: spec.kind, destination: spec.destination, provenance: spec.provenance,
      capabilityApprovals: spec.capabilityApprovals, sourceHash: source.hash, registryRevision: current.document.revision,
      registryFileRevision: current.fileRevision, currentCanonicalHash, prospectiveCanonicalHash: pathHash(canonicalStage),
      selectedTargets: spec.selectedTargets, targetRegistryHash: hashFile(context.registryPath), targetManifestHashes: targetHashes(manifests),
      adapterHashes: manifestAdapterHashes(manifests, context.packageRoot), outputHashes: projections.outputHashes, change, resource
    };
    const tokenRecord: ImportPreviewTokenRecord = Object.freeze({
      schema_version: 1, operation: 'imports.preview', token: spec.token, sourcePath: source.absolutePath,
      sourceIdentity: source.identity, expiresAt: spec.expiresAt, kind: result.kind, destination: result.destination,
      provenance: result.provenance, capabilityApprovals: result.capabilityApprovals, sourceHash: result.sourceHash,
      registryRevision: result.registryRevision, registryFileRevision: result.registryFileRevision,
      currentCanonicalHash: result.currentCanonicalHash, prospectiveCanonicalHash: result.prospectiveCanonicalHash,
      selectedTargets: result.selectedTargets, targetRegistryHash: result.targetRegistryHash,
      targetManifestHashes: result.targetManifestHashes, adapterHashes: result.adapterHashes, outputHashes: result.outputHashes,
      change: result.change, resource: result.resource
    });
    const registryStage = join(stage.path, 'registry.json');
    writeAtomicFile(registryStage, resourceDocumentBytes(plannedDocument), 0o600);
    const cleanupProjections = projections.cleanup;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      cleanupProjections();
      stage.cleanup();
    };
    return Object.freeze({ tokenRecord, result, registryPath, manifests, stage, canonicalStage, registryStage, plannedDocument, cleanup });
  } catch (error) {
    projections?.cleanup();
    stage.cleanup();
    throw error;
  }
}
export function assertPreviewBinding(expected: ImportPreviewTokenRecord, actual: PreparedImport): void {
  if (expected.sourceIdentity !== actual.tokenRecord.sourceIdentity || canonicalJson(bindResult(previewResultFromToken(expected))) !== canonicalJson(bindResult(actual.result))) conflict();
}
export function plannedRegistryHash(document: RegistryDocument): string { return resourceDocumentHash(document); }
