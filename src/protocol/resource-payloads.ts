import { assertExactKeys, assertSafeBoundedJson, normalizeTarget, type PersistedTarget } from './validation.js';
import type { JsonValue } from './json.js';
import type { ResourceCompatibilityStatus, ResourceKind } from '../manifests/types.js';
import type { ResourceRecord } from '../registry/types.js';
import {
  asPayloadObject, invalidResourcePayload, validateApprovals, validateCompatibilityStatus, validateDestination,
  validateHash, validateHashRecordMap, validateNonNegativeInteger, validateProvenance, validateResourceChange,
  validateResourceId, validateResourceKind, validateResourceRecord, validateResourceRevision, validateSourcePath,
  validateTargetList, validateToken, validatePositiveInteger, type ImportCapability, type ResourceChange
} from './resource-payload-validation.js';
import { validateScopeRequestPayload, validateScopeResultPayload } from './scope-payloads.js';
import { validatePublicationRequestPayload, validatePublicationResultPayload } from './publication-payloads.js';
export { IMPORT_CAPABILITIES, CHANGE_TYPES } from './resource-payload-validation.js';
export type { ImportCapability, ResourceChange } from './resource-payload-validation.js';

export const MAX_RESOURCE_LIST_LIMIT = 100;
export const DEFAULT_RESOURCE_LIST_LIMIT = 50;
export const DEFAULT_IMPORT_EXPIRY_SECONDS = 300;
export const MAX_IMPORT_EXPIRY_SECONDS = 900;

export interface ResourceListFilters {
  readonly kind?: ResourceKind;
  readonly target?: PersistedTarget;
  readonly status?: ResourceCompatibilityStatus;
}
export interface ResourceListPayload {
  readonly filters: ResourceListFilters;
  readonly cursor: string | null;
  readonly limit: number;
}
export interface ResourceGetPayload { readonly id: string; }
export interface ImportPreviewPayload {
  readonly sourcePath: string;
  readonly kind: ResourceKind;
  readonly destination: string;
  readonly provenance: string;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly capabilityApprovals: readonly ImportCapability[];
  readonly expiresInSeconds: number;
}
export interface ImportApplyPayload { readonly previewToken: string; }
export interface ResourceListResultPayload {
  readonly resources: readonly ResourceRecord[];
  readonly nextCursor: string | null;
  readonly registryRevision: number;
}
export interface ResourceGetResultPayload {
  readonly resource: ResourceRecord;
  readonly registryRevision: number;
}
export interface ImportPreviewResultPayload {
  readonly token: string;
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
  readonly selectedTargets: readonly PersistedTarget[];
  readonly targetRegistryHash: string;
  readonly targetManifestHashes: Readonly<Record<string, string>>;
  readonly adapterHashes: Readonly<Record<string, string>>;
  readonly outputHashes: Readonly<Record<string, string>>;
  readonly change: ResourceChange;
  readonly resource: ResourceRecord;
}
export interface ImportApplyResultPayload {
  readonly changed: boolean;
  readonly change: ResourceChange;
  readonly registryRevision: number;
  readonly resource: ResourceRecord;
}

function json(value: unknown): JsonValue {
  assertSafeBoundedJson(value);
  return value;
}
function validateListFilters(value: unknown): ResourceListFilters {
  const raw = asPayloadObject(value);
  if (Object.keys(raw).some((key) => !['kind', 'target', 'status'].includes(key))) invalidResourcePayload();
  let result: ResourceListFilters = {};
  if (raw.kind !== undefined) result = { ...result, kind: validateResourceKind(raw.kind) };
  if (raw.target !== undefined) result = { ...result, target: normalizeTarget(raw.target) };
  if (raw.status !== undefined) result = { ...result, status: validateCompatibilityStatus(raw.status) };
  return result;
}

export function validateResourceRequestPayload(operation: string, value: unknown): JsonValue {
  const raw = asPayloadObject(value);
  if (operation === 'resources.list') {
    assertExactKeys(raw, ['filters', 'cursor', 'limit']);
    return json({ filters: validateListFilters(raw.filters), cursor: raw.cursor === null ? null : validateResourceId(raw.cursor), limit: validatePositiveInteger(raw.limit, MAX_RESOURCE_LIST_LIMIT) });
  }
  if (operation === 'resources.get') {
    assertExactKeys(raw, ['id']);
    return json({ id: validateResourceId(raw.id) });
  }
  if (operation === 'imports.preview') {
    assertExactKeys(raw, ['sourcePath', 'kind', 'destination', 'provenance', 'selectedTargets', 'capabilityApprovals', 'expiresInSeconds']);
    return json({
      sourcePath: validateSourcePath(raw.sourcePath), kind: validateResourceKind(raw.kind), destination: validateDestination(raw.destination),
      provenance: validateProvenance(raw.provenance), selectedTargets: validateTargetList(raw.selectedTargets),
      capabilityApprovals: validateApprovals(raw.capabilityApprovals), expiresInSeconds: validatePositiveInteger(raw.expiresInSeconds, MAX_IMPORT_EXPIRY_SECONDS)
    });
  }
  if (operation === 'imports.apply') {
    assertExactKeys(raw, ['previewToken']);
    return json({ previewToken: validateToken(raw.previewToken) });
  }
  if (operation === 'publish.dry-run' || operation === 'publish.apply' || operation === 'recover') return validatePublicationRequestPayload(operation, value);
  if (operation.startsWith('scopes.') || operation.startsWith('changes.')) return validateScopeRequestPayload(operation, value);
  assertSafeBoundedJson(value);
  return value;
}

export function validateResourceResultPayload(operation: string, value: unknown): JsonValue {
  const raw = asPayloadObject(value);
  if (operation === 'resources.list') {
    assertExactKeys(raw, ['resources', 'nextCursor', 'registryRevision']);
    if (!Array.isArray(raw.resources)) invalidResourcePayload();
    return json({ resources: raw.resources.map(validateResourceRecord), nextCursor: raw.nextCursor === null ? null : validateResourceId(raw.nextCursor), registryRevision: validateNonNegativeInteger(raw.registryRevision) });
  }
  if (operation === 'resources.get') {
    assertExactKeys(raw, ['resource', 'registryRevision']);
    return json({ resource: validateResourceRecord(raw.resource), registryRevision: validateNonNegativeInteger(raw.registryRevision) });
  }
  if (operation === 'imports.preview') {
    assertExactKeys(raw, ['token', 'expiresAt', 'kind', 'destination', 'provenance', 'capabilityApprovals', 'sourceHash', 'registryRevision', 'registryFileRevision', 'currentCanonicalHash', 'prospectiveCanonicalHash', 'selectedTargets', 'targetRegistryHash', 'targetManifestHashes', 'adapterHashes', 'outputHashes', 'change', 'resource']);
    if (typeof raw.expiresAt !== 'number' || !Number.isSafeInteger(raw.expiresAt) || raw.expiresAt <= 0) invalidResourcePayload();
    return json({
      token: validateToken(raw.token), expiresAt: raw.expiresAt, kind: validateResourceKind(raw.kind), destination: validateDestination(raw.destination),
      provenance: validateProvenance(raw.provenance), capabilityApprovals: validateApprovals(raw.capabilityApprovals), sourceHash: validateHash(raw.sourceHash),
      registryRevision: validateNonNegativeInteger(raw.registryRevision), registryFileRevision: validateResourceRevision(raw.registryFileRevision),
      currentCanonicalHash: validateHash(raw.currentCanonicalHash), prospectiveCanonicalHash: validateHash(raw.prospectiveCanonicalHash),
      selectedTargets: validateTargetList(raw.selectedTargets), targetRegistryHash: validateHash(raw.targetRegistryHash),
      targetManifestHashes: validateHashRecordMap(raw.targetManifestHashes), adapterHashes: validateHashRecordMap(raw.adapterHashes),
      outputHashes: validateHashRecordMap(raw.outputHashes), change: validateResourceChange(raw.change), resource: validateResourceRecord(raw.resource)
    });
  }
  if (operation === 'imports.apply') {
    assertExactKeys(raw, ['changed', 'change', 'registryRevision', 'resource']);
    if (typeof raw.changed !== 'boolean') invalidResourcePayload();
    return json({ changed: raw.changed, change: validateResourceChange(raw.change), registryRevision: validateNonNegativeInteger(raw.registryRevision), resource: validateResourceRecord(raw.resource) });
  }
  if (operation === 'publish.dry-run' || operation === 'publish.apply' || operation === 'recover') return validatePublicationResultPayload(operation, value);
  if (operation.startsWith('scopes.') || operation.startsWith('changes.')) return validateScopeResultPayload(operation, value);
  assertSafeBoundedJson(value);
  return value;
}

export { validateResourceRecord, validateResourceKind, validateDestination, validateSourcePath } from './resource-payload-validation.js';
