import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, type JsonValue } from './json.js';
import {
  assertExactKeys, assertSafeBoundedJson, boundedText, normalizeTarget, rejectCredentialKeys,
  rejectCounselFields, validateOpaque, type PersistedTarget
} from './validation.js';
import { normalizeRelativePath } from '../filesystem/paths.js';
import {
  RESOURCE_COMPATIBILITY_STATUSES, RESOURCE_KINDS, type ResourceCompatibilityStatus, type ResourceKind
} from '../manifests/types.js';
import { PERSISTED_TARGETS } from './validation.js';
import type { RegistryCompatibility, ResourceRecord } from '../registry/types.js';

export const IMPORT_CAPABILITIES = Object.freeze(['hook-execution', 'script-execution'] as const);
export type ImportCapability = typeof IMPORT_CAPABILITIES[number];
export const CHANGE_TYPES = ['create', 'update', 'unchanged'] as const;
export type ResourceChange = typeof CHANGE_TYPES[number];
const HASH = /^[a-f0-9]{64}$/u;
const TOKEN = /^[a-f0-9]{64}$/u;
const SENSITIVE_PATH_SEGMENT = /^(?:\.env(?:\..*)?$|\.git$|\.evcrate$|node_modules$|__pycache__$|.*(?:secret|credential|password|token|private[-_]?key).*)$/iu;
export function isSensitivePathSegment(value: string): boolean { return SENSITIVE_PATH_SEGMENT.test(value); }
export function invalidResourcePayload(): never {
  throw new ControlPlaneError('VALIDATION_INVALID');
}
export function asPayloadObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : invalidResourcePayload();
}
export function validateResourceKind(value: unknown): ResourceKind {
  if (typeof value !== 'string' || !RESOURCE_KINDS.includes(value as ResourceKind)) invalidResourcePayload();
  return value as ResourceKind;
}
export function validateCompatibilityStatus(value: unknown): ResourceCompatibilityStatus {
  if (typeof value !== 'string' || !RESOURCE_COMPATIBILITY_STATUSES.includes(value as ResourceCompatibilityStatus)) invalidResourcePayload();
  return value as ResourceCompatibilityStatus;
}
export function validatePositiveInteger(value: unknown, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > max) invalidResourcePayload();
  return value as number;
}
export function validateNonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalidResourcePayload();
  return value as number;
}
export function validateHash(value: unknown): string {
  if (typeof value !== 'string' || !HASH.test(value)) invalidResourcePayload();
  return value;
}
export function validateToken(value: unknown): string {
  if (typeof value !== 'string' || !TOKEN.test(value)) invalidResourcePayload();
  return value;
}
export function validateSourcePath(value: unknown): string {
  const path = boundedText(value, 4096, 'source path');
  if (path.includes('\\') || path.includes('\0')) invalidResourcePayload();
  const parts = path.split('/');
  const start = path.startsWith('/') ? 1 : 0;
  if (parts.slice(start).some((part, index) => !part || part === '.' || part === '..'
    || (start === 0 && index === 0 && part.endsWith(':')) || isSensitivePathSegment(part))) invalidResourcePayload();
  return path;
}
export function validateProvenance(value: unknown): string {
  const result = boundedText(value, 256, 'provenance');
  if (result.includes('/') || result.includes('\\')) invalidResourcePayload();
  return result;
}
export function validateDestination(value: unknown): string {
  try {
    const path = normalizeRelativePath(boundedText(value, 4096, 'destination'));
    if (path.split('/').some(isSensitivePathSegment)) invalidResourcePayload();
    return path;
  } catch { return invalidResourcePayload(); }
}
export function validateTargetList(value: unknown): readonly PersistedTarget[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > PERSISTED_TARGETS.length) invalidResourcePayload();
  const normalized = value.map((entry) => normalizeTarget(entry));
  if (new Set(normalized).size !== normalized.length) invalidResourcePayload();
  return Object.freeze(normalized as PersistedTarget[]);
}
export function validateApprovals(value: unknown): readonly ImportCapability[] {
  if (!Array.isArray(value) || value.length > IMPORT_CAPABILITIES.length
    || value.some((entry) => typeof entry !== 'string' || !IMPORT_CAPABILITIES.includes(entry as ImportCapability))) invalidResourcePayload();
  if (new Set(value).size !== value.length) invalidResourcePayload();
  return Object.freeze(IMPORT_CAPABILITIES.filter((capability) => value.includes(capability)));
}
export function validateResourceId(value: unknown): string {
  const id = boundedText(value, 4096, 'resource id');
  const separator = id.indexOf(':');
  if (separator <= 0) invalidResourcePayload();
  const resourceKind = validateResourceKind(id.slice(0, separator));
  const sourcePath = validateDestination(id.slice(separator + 1));
  if (id !== `${resourceKind}:${sourcePath}`) invalidResourcePayload();
  return id;
}
export function validateResourceRevision(value: unknown): { kind: 'present' | 'absent'; identity: string } {
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['kind', 'identity']);
  if (raw.kind !== 'present' && raw.kind !== 'absent') invalidResourcePayload();
  const identity = validateOpaque(raw.identity, 256, 'registry file revision');
  if ((raw.kind === 'absent') !== (identity === 'absent')) invalidResourcePayload();
  return { kind: raw.kind, identity };
}
export function validateCompatibility(value: unknown): RegistryCompatibility {
  const raw = asPayloadObject(value);
  if (Object.keys(raw).length !== PERSISTED_TARGETS.length || PERSISTED_TARGETS.some((target) => !Object.hasOwn(raw, target))) invalidResourcePayload();
  const result: Record<PersistedTarget, { status: ResourceCompatibilityStatus; reason?: string }> = {} as Record<PersistedTarget, { status: ResourceCompatibilityStatus; reason?: string }>;
  for (const target of PERSISTED_TARGETS) {
    const entry = asPayloadObject(raw[target]);
    if (!Object.hasOwn(entry, 'status') || Object.keys(entry).some((key) => key !== 'status' && key !== 'reason')) invalidResourcePayload();
    const valueStatus = validateCompatibilityStatus(entry.status);
    const reason = entry.reason === undefined ? undefined : boundedText(entry.reason, 256, 'compatibility reason');
    if (valueStatus === 'unsupported' && reason === undefined) invalidResourcePayload();
    result[target] = reason === undefined ? { status: valueStatus } : { status: valueStatus, reason };
  }
  return Object.freeze(result);
}
export function validateResourceRecord(value: unknown): ResourceRecord {
  const raw = asPayloadObject(value);
  const allowed = ['id', 'kind', 'source_path', 'content_hash', 'origin', 'compatibility', 'capabilities', 'model_metadata', 'revision'];
  const required = ['id', 'kind', 'source_path', 'content_hash', 'origin', 'compatibility', 'capabilities', 'revision'];
  if (Object.keys(raw).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(raw, key))) invalidResourcePayload();
  const resourceKind = validateResourceKind(raw.kind);
  const sourcePath = validateDestination(raw.source_path);
  const id = validateResourceId(raw.id);
  if (id !== `${resourceKind}:${sourcePath}`) invalidResourcePayload();
  const origin = validateProvenance(raw.origin);
  if (!Array.isArray(raw.capabilities) || raw.capabilities.length > IMPORT_CAPABILITIES.length
    || raw.capabilities.some((entry) => typeof entry !== 'string' || !IMPORT_CAPABILITIES.includes(entry as ImportCapability))
    || new Set(raw.capabilities).size !== raw.capabilities.length) invalidResourcePayload();
  const recordRevision = validatePositiveInteger(raw.revision, Number.MAX_SAFE_INTEGER);
  let modelMetadata: JsonValue | undefined;
  if (raw.model_metadata !== undefined) {
    if (!isPlainObject(raw.model_metadata)) invalidResourcePayload();
    assertSafeBoundedJson(raw.model_metadata, 4096);
    rejectCredentialKeys(raw.model_metadata);
    rejectCounselFields(raw.model_metadata);
    modelMetadata = raw.model_metadata as JsonValue;
  }
  const base = {
    id, kind: resourceKind, source_path: sourcePath, content_hash: validateHash(raw.content_hash), origin,
    compatibility: validateCompatibility(raw.compatibility), capabilities: Object.freeze([...raw.capabilities] as string[]), revision: recordRevision
  };
  const result = modelMetadata === undefined ? base : { ...base, model_metadata: modelMetadata };
  return Object.freeze(result);
}
export function validateHashRecordMap(value: unknown): Readonly<Record<string, string>> {
  const raw = asPayloadObject(value);
  const result: Record<string, string> = {};
  for (const [key, valueHash] of Object.entries(raw)) result[validateDestination(key)] = validateHash(valueHash);
  return Object.freeze(result);
}
export function validateResourceChange(value: unknown): ResourceChange {
  if (typeof value !== 'string' || !CHANGE_TYPES.includes(value as ResourceChange)) invalidResourcePayload();
  return value as ResourceChange;
}
