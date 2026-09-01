import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument } from '../protocol/json.js';
import { assertExactKeys, assertSafeBoundedJson, boundedText, validateOpaque } from '../protocol/validation.js';
import { canonicalJsonBytes, readBoundedFile } from '../filesystem/hashing.js';
import { removePath, writeAtomicFile } from '../filesystem/atomic.js';
import { assertOwnerOnlyFile, containedPath } from '../filesystem/paths.js';
import {
  asPayloadObject, validateApprovals, validateDestination, validateHash, validateHashRecordMap,
  validateProvenance, validateResourceChange, validateResourceKind, validateResourceRecord,
  validateResourceRevision, validateTargetList, validateToken, type ImportCapability, type ResourceChange
} from '../protocol/resource-payload-validation.js';
import type { ResourceKind } from '../manifests/types.js';
import type { ResourceRecord } from '../registry/types.js';

const TOKEN_KEYS = Object.freeze([
  'schema_version', 'operation', 'token', 'source_path', 'source_identity', 'expires_at', 'kind', 'destination',
  'provenance', 'capability_approvals', 'source_hash', 'registry_revision', 'registry_file_revision',
  'current_canonical_hash', 'prospective_canonical_hash', 'selected_targets', 'target_registry_hash',
  'target_manifest_hashes', 'adapter_hashes', 'output_hashes', 'change', 'resource'
] as const);
const MAX_TOKEN_BYTES = 128 * 1024;

export interface ImportPreviewTokenRecord {
  readonly schema_version: 1;
  readonly operation: 'imports.preview';
  readonly token: string;
  readonly sourcePath: string;
  readonly sourceIdentity: string;
  readonly expiresAt: number;
  readonly kind: ResourceKind;
  readonly destination: string;
  readonly provenance: string;
  readonly capabilityApprovals: readonly ImportCapability[];
  readonly sourceHash: string;
  readonly registryRevision: number;
  readonly registryFileRevision: { readonly kind: 'present' | 'absent'; readonly identity: string };
  readonly currentCanonicalHash: string;
  readonly prospectiveCanonicalHash: string;
  readonly selectedTargets: readonly string[];
  readonly targetRegistryHash: string;
  readonly targetManifestHashes: Readonly<Record<string, string>>;
  readonly adapterHashes: Readonly<Record<string, string>>;
  readonly outputHashes: Readonly<Record<string, string>>;
  readonly change: ResourceChange;
  readonly resource: ResourceRecord;
}
function conflict(): never { throw new ControlPlaneError('CAS_CONFLICT'); }
function tokenPath(stateRoot: string, token: string): string {
  const value = validateToken(token);
  return containedPath(stateRoot, join('import-previews', `${value}.json`));
}
function jsonRecord(record: ImportPreviewTokenRecord): Record<string, unknown> {
  return {
    schema_version: 1, operation: 'imports.preview', token: record.token, source_path: record.sourcePath,
    source_identity: record.sourceIdentity, expires_at: record.expiresAt, kind: record.kind,
    destination: record.destination, provenance: record.provenance, capability_approvals: [...record.capabilityApprovals],
    source_hash: record.sourceHash, registry_revision: record.registryRevision, registry_file_revision: record.registryFileRevision,
    current_canonical_hash: record.currentCanonicalHash, prospective_canonical_hash: record.prospectiveCanonicalHash,
    selected_targets: [...record.selectedTargets], target_registry_hash: record.targetRegistryHash,
    target_manifest_hashes: record.targetManifestHashes, adapter_hashes: record.adapterHashes, output_hashes: record.outputHashes,
    change: record.change, resource: record.resource
  };
}
function parseRecord(value: unknown): ImportPreviewTokenRecord {
  const raw = asPayloadObject(value);
  assertExactKeys(raw, TOKEN_KEYS);
  if (raw.schema_version !== 1 || raw.operation !== 'imports.preview') conflict();
  if (typeof raw.expires_at !== 'number' || !Number.isSafeInteger(raw.expires_at) || raw.expires_at <= 0) conflict();
  const sourcePath = boundedText(raw.source_path, 4096, 'source path');
  if (!sourcePath.startsWith('/') || sourcePath.includes('\\') || sourcePath.includes('\0')) conflict();
  const record: ImportPreviewTokenRecord = {
    schema_version: 1, operation: 'imports.preview', token: validateToken(raw.token), sourcePath,
    sourceIdentity: validateOpaque(raw.source_identity, 256, 'source identity'), expiresAt: raw.expires_at,
    kind: validateResourceKind(raw.kind), destination: validateDestination(raw.destination), provenance: validateProvenance(raw.provenance),
    capabilityApprovals: validateApprovals(raw.capability_approvals), sourceHash: validateHash(raw.source_hash),
    registryRevision: nonNegative(raw.registry_revision), registryFileRevision: validateResourceRevision(raw.registry_file_revision),
    currentCanonicalHash: validateHash(raw.current_canonical_hash), prospectiveCanonicalHash: validateHash(raw.prospective_canonical_hash),
    selectedTargets: validateTargetList(raw.selected_targets), targetRegistryHash: validateHash(raw.target_registry_hash),
    targetManifestHashes: validateHashRecordMap(raw.target_manifest_hashes), adapterHashes: validateHashRecordMap(raw.adapter_hashes),
    outputHashes: validateHashRecordMap(raw.output_hashes), change: validateResourceChange(raw.change), resource: validateResourceRecord(raw.resource)
  };
  if (record.resource.id !== `${record.kind}:${record.resource.source_path}`) conflict();
  assertSafeBoundedJson(jsonRecord(record), MAX_TOKEN_BYTES);
  return Object.freeze(record);
}
function nonNegative(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) conflict();
  return value as number;
}
export function saveImportPreview(stateRoot: string, record: ImportPreviewTokenRecord): void {
  const path = tokenPath(stateRoot, record.token);
  assertSafeBoundedJson(jsonRecord(record), MAX_TOKEN_BYTES);
  writeAtomicFile(path, canonicalJsonBytes(jsonRecord(record)), 0o600);
}
export function loadImportPreview(stateRoot: string, token: string): ImportPreviewTokenRecord {
  const path = tokenPath(stateRoot, token);
  try {
    assertOwnerOnlyFile(path);
    const initial = lstatSync(path);
    const record = parseRecord(parseJsonDocument(readBoundedFile(path, MAX_TOKEN_BYTES)));
    const final = assertOwnerOnlyFile(path);
    if (Number(initial.dev) !== Number(final.dev) || Number(initial.ino) !== Number(final.ino)
      || Number(initial.size) !== Number(final.size)) conflict();
    if (record.token !== token) conflict();
    return record;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
}
export function consumeImportPreview(stateRoot: string, token: string): void {
  const path = tokenPath(stateRoot, token);
  try { assertOwnerOnlyFile(path); removePath(path); }
  catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
}
export function importPreviewExpired(record: ImportPreviewTokenRecord, now = Date.now()): boolean {
  if (!Number.isSafeInteger(now)) throw new ControlPlaneError('VALIDATION_INVALID');
  return now >= record.expiresAt;
}
