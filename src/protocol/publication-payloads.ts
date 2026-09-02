import type { JsonValue } from './json.js';
import {
  assertExactKeys, assertSafeBoundedJson, boundedText, normalizeTarget,
  validateOpaque, type PersistedTarget
} from './validation.js';
import { normalizeRelativePath } from '../filesystem/paths.js';
import {
  asPayloadObject, invalidResourcePayload, validateHash, validateTargetList
} from './resource-payload-validation.js';

export const PUBLICATION_CHANGE_ACTIONS = Object.freeze([
  'create', 'update', 'delete', 'preserve', 'merge-create', 'merge-update', 'noop', 'conflict'
] as const);
export type PublicationChangeAction = typeof PUBLICATION_CHANGE_ACTIONS[number];
export type PublicationTarget = PersistedTarget | 'advisor-controller';

export const PUBLICATION_BINDING_ORDER = Object.freeze([
  '.evcrate/bin', '.gemini', '.agents', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot'
] as const);
export const PUBLICATION_TARGET_BINDINGS = Object.freeze({
  gemini: Object.freeze(['.gemini']),
  codex: Object.freeze(['.agents', '.codex']),
  pi: Object.freeze(['.pi']),
  antigravity: Object.freeze(['.gemini/config']),
  omp: Object.freeze(['.omp']),
  claude: Object.freeze(['.claude']),
  copilot: Object.freeze(['.copilot'])
} as const);
export const PUBLICATION_LOCAL_ROOTS = Object.freeze([
  '.evcrate/bin', '.gemini', '.agents', '.codex', '.antigravity', '.pi', '.omp', '.claude', '.copilot'
] as const);
export const MAX_PUBLICATION_RESULT_BYTES = 2 * 1024 * 1024;
export const MAX_PUBLICATION_STATE_BYTES = 16 * 1024 * 1024;
export const PUBLICATION_TARGET_LOCAL_ROOTS = Object.freeze({
  gemini: Object.freeze(['.gemini']),
  codex: Object.freeze(['.agents', '.codex']),
  pi: Object.freeze(['.pi']),
  antigravity: Object.freeze(['.antigravity']),
  omp: Object.freeze(['.omp']),
  claude: Object.freeze(['.claude']),
  copilot: Object.freeze(['.copilot'])
} as const);
export const MAX_PUBLICATION_CHANGES = 10_000;
export const MAX_PUBLICATION_BINDINGS = PUBLICATION_BINDING_ORDER.length;
export const MAX_PUBLICATION_RELEASE_ID_BYTES = 256;

export interface PublishRequestPayload {
  readonly selectedTargets: readonly PersistedTarget[];
}
export interface RecoverRequestPayload {
  readonly releaseId: string | null;
}
export type PublicationRequestPayload = PublishRequestPayload | RecoverRequestPayload;

export interface PublicationChange {
  readonly target: PublicationTarget;
  readonly path: string;
  readonly action: PublicationChangeAction;
  readonly beforeHash: string | null;
  readonly intendedHash: string | null;
}
export interface PublishDryRunResultPayload {
  readonly buildManifestPath: string;
  readonly buildManifestDigest: string;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly bindingOrder: readonly string[];
  readonly changes: readonly PublicationChange[];
}
export interface PublishApplyResultPayload extends PublishDryRunResultPayload {
  readonly releaseId: string;
  readonly retainedReleaseId: string | null;
}
export interface RecoverResultPayload {
  readonly releaseId: string | null;
  readonly action: 'none' | 'rolled-back' | 'finalized';
  readonly selectedTargets: readonly PersistedTarget[];
  readonly bindingOrder: readonly string[];
}
const FORBIDDEN_METADATA_SEGMENTS = new Set(['.git', '.gitmodules', '.gitattributes', '.github', '.gitlab', '.hg', '.svn']);
function relativeMetadataPath(value: unknown): string {
  const path = normalizeRelativePath(boundedText(value, 4096, 'metadata path'));
  if (path.split('/').some((segment) => FORBIDDEN_METADATA_SEGMENTS.has(segment)
    || segment === '.env' || (segment.startsWith('.env.') && segment !== '.env.example'))) invalidResourcePayload();
  return path;
}
function nullableHash(value: unknown): string | null {
  return value === null ? null : validateHash(value);
}
function bindingOrder(value: unknown, allowEmpty = false): readonly string[] {
  if (allowEmpty && Array.isArray(value) && value.length === 0) return Object.freeze([]);
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PUBLICATION_BINDINGS) invalidResourcePayload();
  const result = value.map(relativeMetadataPath);
  let priorIndex = -1;
  for (const path of result) {
    const index = PUBLICATION_BINDING_ORDER.indexOf(path as typeof PUBLICATION_BINDING_ORDER[number]);
    if (index < 0 || index <= priorIndex) invalidResourcePayload();
    priorIndex = index;
  }
  return Object.freeze(result);
}
function targetList(value: unknown, allowEmpty = false): readonly PersistedTarget[] {
  if (allowEmpty && Array.isArray(value) && value.length === 0) return Object.freeze([]);
  return validateTargetList(value);
}
function target(value: unknown): PublicationTarget {
  return value === 'advisor-controller' ? value : normalizeTarget(value);
}
function changes(value: unknown): readonly PublicationChange[] {
  if (!Array.isArray(value) || value.length > MAX_PUBLICATION_CHANGES) invalidResourcePayload();
  const result = value.map((entry): PublicationChange => {
    const raw = asPayloadObject(entry);
    assertExactKeys(raw, ['target', 'path', 'action', 'beforeHash', 'intendedHash']);
    if (typeof raw.action !== 'string' || !PUBLICATION_CHANGE_ACTIONS.includes(raw.action as PublicationChangeAction)) invalidResourcePayload();
    return Object.freeze({
      target: target(raw.target), path: relativeMetadataPath(raw.path),
      action: raw.action as PublicationChangeAction,
      beforeHash: nullableHash(raw.beforeHash), intendedHash: nullableHash(raw.intendedHash)
    });
  });
  return Object.freeze(result);
}
export function validatePublishRequestPayload(value: unknown): PublishRequestPayload {
  assertSafeBoundedJson(value);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['selectedTargets']);
  return Object.freeze({ selectedTargets: validateTargetList(raw.selectedTargets) });
}
export function validateRecoverRequestPayload(value: unknown): RecoverRequestPayload {
  assertSafeBoundedJson(value);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['releaseId']);
  return Object.freeze({
    releaseId: raw.releaseId === null ? null : validateOpaque(raw.releaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'release id')
  });
}
export function validatePublishDryRunResultPayload(value: unknown): PublishDryRunResultPayload {
  assertSafeBoundedJson(value, MAX_PUBLICATION_RESULT_BYTES);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['buildManifestPath', 'buildManifestDigest', 'selectedTargets', 'bindingOrder', 'changes']);
  return Object.freeze({
    buildManifestPath: relativeMetadataPath(raw.buildManifestPath), buildManifestDigest: validateHash(raw.buildManifestDigest),
    selectedTargets: validateTargetList(raw.selectedTargets), bindingOrder: bindingOrder(raw.bindingOrder), changes: changes(raw.changes)
  });
}
export function validatePublishApplyResultPayload(value: unknown): PublishApplyResultPayload {
  assertSafeBoundedJson(value, MAX_PUBLICATION_RESULT_BYTES);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['releaseId', 'buildManifestPath', 'buildManifestDigest', 'selectedTargets', 'bindingOrder', 'changes', 'retainedReleaseId']);
  const base = validatePublishDryRunResultPayload({
    buildManifestPath: raw.buildManifestPath, buildManifestDigest: raw.buildManifestDigest,
    selectedTargets: raw.selectedTargets, bindingOrder: raw.bindingOrder, changes: raw.changes
  });
  return Object.freeze({
    ...base, releaseId: validateOpaque(raw.releaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'release id'),
    retainedReleaseId: raw.retainedReleaseId === null
      ? null : validateOpaque(raw.retainedReleaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'retained release id')
  });
}
export function validateRecoverResultPayload(value: unknown): RecoverResultPayload {
  assertSafeBoundedJson(value);
  const raw = asPayloadObject(value);
  assertExactKeys(raw, ['releaseId', 'action', 'selectedTargets', 'bindingOrder']);
  if (raw.action !== 'none' && raw.action !== 'rolled-back' && raw.action !== 'finalized') invalidResourcePayload();
  const action = raw.action;
  const releaseId = raw.releaseId === null ? null : validateOpaque(raw.releaseId, MAX_PUBLICATION_RELEASE_ID_BYTES, 'release id');
  const isNone = action === 'none';
  if ((isNone && releaseId !== null) || (!isNone && releaseId === null)) invalidResourcePayload();
  return Object.freeze({
    releaseId,
    action,
    selectedTargets: targetList(raw.selectedTargets, isNone),
    bindingOrder: bindingOrder(raw.bindingOrder, isNone)
  });
}

export function validatePublicationRequestPayload(operation: string, value: unknown): JsonValue {
  if (operation === 'publish.dry-run' || operation === 'publish.apply') return validatePublishRequestPayload(value) as unknown as JsonValue;
  if (operation === 'recover') return validateRecoverRequestPayload(value) as unknown as JsonValue;
  invalidResourcePayload();
}
export function validatePublicationResultPayload(operation: string, value: unknown): JsonValue {
  if (operation === 'publish.dry-run') return validatePublishDryRunResultPayload(value) as unknown as JsonValue;
  if (operation === 'publish.apply') return validatePublishApplyResultPayload(value) as unknown as JsonValue;
  if (operation === 'recover') return validateRecoverResultPayload(value) as unknown as JsonValue;
  invalidResourcePayload();
}

