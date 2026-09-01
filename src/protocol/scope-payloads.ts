import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, type JsonValue } from './json.js';
import {
  assertExactKeys, assertSafeBoundedJson, boundedText,
  rejectCredentialKeys, rejectCounselFields, type PersistedTarget
} from './validation.js';
import {
  validateApprovals, validateHash, validateHashRecordMap,
  validateNonNegativeInteger, validateResourceId, validateTargetList, validateToken,
  type ImportCapability
} from './resource-payload-validation.js';
export const SCOPE_KINDS = Object.freeze(['global', 'project'] as const);
export type ScopeKind = typeof SCOPE_KINDS[number];
export const SCOPE_MUTATIONS = Object.freeze([
  'scopes.assign', 'scopes.remove', 'scopes.enable', 'scopes.disable'
] as const);
export type ScopeMutation = typeof SCOPE_MUTATIONS[number];
export const SCOPE_CHANGE_EXPIRY_SECONDS = 300, MAX_SCOPE_CHANGE_EXPIRY_SECONDS = 900;
export interface ScopeRevisionVector {
  readonly registryRevision: number;
  readonly globalScopeRevision: number;
  readonly projectScopeRevision: number | null;
}
export interface ScopeAssignment {
  readonly resourceId: string;
  readonly enabled: boolean;
  readonly targets: readonly PersistedTarget[];
  readonly capabilityApprovals: readonly ImportCapability[];
}
export interface ScopeListPayload { readonly [key: string]: never; }
export interface ScopeGetPayload { readonly id: string; }
export interface ScopeAssignPayload extends ScopeAssignmentInput { readonly expectedRevision: ScopeRevisionVector; }
export interface ScopeTogglePayload { readonly resourceId: string; readonly expectedRevision: ScopeRevisionVector; }
export interface ScopeAssignmentInput {
  readonly resourceId: string;
  readonly targets: readonly PersistedTarget[];
  readonly capabilityApprovals: readonly ImportCapability[];
}
export type ScopeMutationPayload = ScopeAssignPayload | ScopeTogglePayload;
export interface ChangesPreviewPayload {
  readonly mutation: ScopeMutation;
  readonly payload: ScopeMutationPayload;
  readonly expiresInSeconds: number;
}
export interface ChangesApplyPayload { readonly previewToken: string; }
export interface EffectiveScopeAssignment {
  readonly resourceId: string;
  readonly declared: ScopeAssignment | null;
  readonly effective: ScopeAssignment | null;
  readonly source: 'project' | 'global' | 'inherited' | 'disabled' | 'absent';
}
export interface ScopeListResultPayload {
  readonly scope: ScopeKind;
  readonly projectId: string | null;
  readonly revisionVector: ScopeRevisionVector;
  readonly assignments: readonly ScopeAssignment[];
  readonly effective: readonly EffectiveScopeAssignment[];
}
export interface ScopeGetResultPayload extends ScopeListResultPayload {
  readonly assignment: EffectiveScopeAssignment | null;
}
export interface ScopeMutationResultPayload {
  readonly changed: boolean;
  readonly mutation: ScopeMutation;
  readonly scopeRevision: number;
  readonly revisionVector: ScopeRevisionVector;
  readonly assignment: ScopeAssignment | null;
}
export interface ChangesPreviewResultPayload {
  readonly token: string;
  readonly expiresAt: number;
  readonly mutation: ScopeMutation;
  readonly expectedRevision: ScopeRevisionVector;
  readonly revisionVector: ScopeRevisionVector;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly canonicalSourceHash: string;
  readonly targetRegistryHash: string;
  readonly targetManifestHashes: Readonly<Record<string, string>>;
  readonly adapterHashes: Readonly<Record<string, string>>;
  readonly outputHashes: Readonly<Record<string, string>>;
  readonly before: EffectiveScopeAssignment | null;
  readonly after: EffectiveScopeAssignment | null;
}
export interface ChangesApplyResultPayload {
  readonly changed: boolean;
  readonly mutation: ScopeMutation;
  readonly scopeRevision: number;
  readonly revisionVector: ScopeRevisionVector;
  readonly assignment: ScopeAssignment | null;
}

function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function positive(value: unknown, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > max) return invalid();
  return value as number;
}
function nonNegative(value: unknown): number { return validateNonNegativeInteger(value); }
function object(value: unknown): Record<string, unknown> { return isPlainObject(value) ? value : invalid(); }

export function validateScopeKind(value: unknown): ScopeKind {
  if (typeof value !== 'string' || !SCOPE_KINDS.includes(value as ScopeKind)) return invalid();
  return value as ScopeKind;
}
export function validateScopeRevisionVector(value: unknown): ScopeRevisionVector {
  const raw = object(value);
  assertExactKeys(raw, ['registryRevision', 'globalScopeRevision', 'projectScopeRevision']);
  return {
    registryRevision: nonNegative(raw.registryRevision),
    globalScopeRevision: nonNegative(raw.globalScopeRevision),
    projectScopeRevision: raw.projectScopeRevision === null ? null : nonNegative(raw.projectScopeRevision)
  };
}
export function validateScopeAssignment(value: unknown): ScopeAssignment {
  const raw = object(value);
  assertExactKeys(raw, ['resourceId', 'enabled', 'targets', 'capabilityApprovals']);
  if (typeof raw.enabled !== 'boolean') return invalid();
  return {
    resourceId: validateResourceId(raw.resourceId), enabled: raw.enabled,
    targets: validateTargetList(raw.targets), capabilityApprovals: validateApprovals(raw.capabilityApprovals)
  };
}
function validateInput(value: unknown): ScopeAssignmentInput {
  const raw = object(value);
  assertExactKeys(raw, ['resourceId', 'targets', 'capabilityApprovals']);
  return { resourceId: validateResourceId(raw.resourceId), targets: validateTargetList(raw.targets), capabilityApprovals: validateApprovals(raw.capabilityApprovals) };
}
function validateToggle(value: unknown): ScopeTogglePayload {
  const raw = object(value);
  assertExactKeys(raw, ['resourceId', 'expectedRevision']);
  return { resourceId: validateResourceId(raw.resourceId), expectedRevision: validateScopeRevisionVector(raw.expectedRevision) };
}
export function validateScopeMutationPayload(operation: ScopeMutation, value: unknown): ScopeMutationPayload {
  const raw = object(value);
  if (operation === 'scopes.assign') {
    assertExactKeys(raw, ['resourceId', 'targets', 'capabilityApprovals', 'expectedRevision']);
    return { ...validateInput({ resourceId: raw.resourceId, targets: raw.targets, capabilityApprovals: raw.capabilityApprovals }), expectedRevision: validateScopeRevisionVector(raw.expectedRevision) };
  }
  return validateToggle(raw);
}
export function validateChangesPreviewPayload(value: unknown): ChangesPreviewPayload {
  const raw = object(value);
  assertExactKeys(raw, ['mutation', 'payload', 'expiresInSeconds']);
  if (!SCOPE_MUTATIONS.includes(raw.mutation as ScopeMutation)) return invalid();
  assertSafeBoundedJson(raw.payload); rejectCredentialKeys(raw.payload); rejectCounselFields(raw.payload);
  return { mutation: raw.mutation as ScopeMutation, payload: validateScopeMutationPayload(raw.mutation as ScopeMutation, raw.payload), expiresInSeconds: positive(raw.expiresInSeconds, MAX_SCOPE_CHANGE_EXPIRY_SECONDS) };
}
export function validateChangesApplyPayload(value: unknown): ChangesApplyPayload {
  const raw = object(value); assertExactKeys(raw, ['previewToken']);
  return { previewToken: validateToken(raw.previewToken) };
}
export function validateScopeRequestPayload(operation: string, value: unknown): JsonValue {
  const raw = object(value);
  if (operation === 'scopes.list') { assertExactKeys(raw, []); return {}; }
  if (operation === 'scopes.get') { assertExactKeys(raw, ['id']); return { id: validateResourceId(raw.id) }; }
  if (SCOPE_MUTATIONS.includes(operation as ScopeMutation)) return validateScopeMutationPayload(operation as ScopeMutation, raw) as unknown as JsonValue;
  if (operation === 'changes.preview') return validateChangesPreviewPayload(raw) as unknown as JsonValue;
  if (operation === 'changes.apply') return validateChangesApplyPayload(raw) as unknown as JsonValue;
  assertSafeBoundedJson(value); return value as JsonValue;
}
function validateEffective(value: unknown): EffectiveScopeAssignment {
  const raw = object(value); assertExactKeys(raw, ['resourceId', 'declared', 'effective', 'source']);
  const source = raw.source;
  if (!['project', 'global', 'inherited', 'disabled', 'absent'].includes(source as string)) return invalid();
  return { resourceId: validateResourceId(raw.resourceId), declared: raw.declared === null ? null : validateScopeAssignment(raw.declared), effective: raw.effective === null ? null : validateScopeAssignment(raw.effective), source: source as EffectiveScopeAssignment['source'] };
}
function validateScopeProjectId(value: unknown): string {
  const id = boundedText(value, 128, 'project id');
  if (!/^[a-f0-9]{64}$/u.test(id)) return invalid();
  return id;
}
function validateRevisionAndScope(raw: Record<string, unknown>): { scope: ScopeKind; projectId: string | null; revisionVector: ScopeRevisionVector; assignments: readonly ScopeAssignment[]; effective: readonly EffectiveScopeAssignment[] } {
  const scope = validateScopeKind(raw.scope); const projectId = raw.projectId === null ? null : validateScopeProjectId(raw.projectId);
  if ((scope === 'global') !== (projectId === null)) return invalid();
  if (!Array.isArray(raw.assignments) || !Array.isArray(raw.effective)) return invalid();
  const assignments = raw.assignments.map(validateScopeAssignment);
  const effective = raw.effective.map(validateEffective);
  return { scope, projectId, revisionVector: validateScopeRevisionVector(raw.revisionVector), assignments, effective };
}
export function validateScopeResultPayload(operation: string, value: unknown): JsonValue {
  const raw = object(value);
  if (operation === 'scopes.list') { assertExactKeys(raw, ['scope', 'projectId', 'revisionVector', 'assignments', 'effective']); return validateRevisionAndScope(raw) as unknown as JsonValue; }
  if (operation === 'scopes.get') { assertExactKeys(raw, ['scope', 'projectId', 'revisionVector', 'assignments', 'effective', 'assignment']); const base = validateRevisionAndScope(raw); return { ...base, assignment: raw.assignment === null ? null : validateEffective(raw.assignment) } as unknown as JsonValue; }
  if (SCOPE_MUTATIONS.includes(operation as ScopeMutation)) {
    assertExactKeys(raw, ['changed', 'mutation', 'scopeRevision', 'revisionVector', 'assignment']);
    if (typeof raw.changed !== 'boolean' || raw.mutation !== operation) return invalid();
    return { changed: raw.changed, mutation: operation, scopeRevision: nonNegative(raw.scopeRevision), revisionVector: validateScopeRevisionVector(raw.revisionVector), assignment: raw.assignment === null ? null : validateScopeAssignment(raw.assignment) } as unknown as JsonValue;
  }
  if (operation === 'changes.preview') {
    assertExactKeys(raw, ['token', 'expiresAt', 'mutation', 'expectedRevision', 'revisionVector', 'selectedTargets', 'canonicalSourceHash', 'targetRegistryHash', 'targetManifestHashes', 'adapterHashes', 'outputHashes', 'before', 'after']);
    if (!Number.isSafeInteger(raw.expiresAt) || (raw.expiresAt as number) <= 0 || !SCOPE_MUTATIONS.includes(raw.mutation as ScopeMutation)) return invalid();
    return { ...raw, token: validateToken(raw.token), expiresAt: raw.expiresAt, mutation: raw.mutation, expectedRevision: validateScopeRevisionVector(raw.expectedRevision), revisionVector: validateScopeRevisionVector(raw.revisionVector), selectedTargets: validateTargetList(raw.selectedTargets), canonicalSourceHash: validateHash(raw.canonicalSourceHash), targetRegistryHash: validateHash(raw.targetRegistryHash), targetManifestHashes: validateHashRecordMap(raw.targetManifestHashes), adapterHashes: validateHashRecordMap(raw.adapterHashes), outputHashes: validateHashRecordMap(raw.outputHashes), before: raw.before === null ? null : validateEffective(raw.before), after: raw.after === null ? null : validateEffective(raw.after) } as unknown as JsonValue;
  }
  if (operation === 'changes.apply') {
    assertExactKeys(raw, ['changed', 'mutation', 'scopeRevision', 'revisionVector', 'assignment']);
    if (typeof raw.changed !== 'boolean' || !SCOPE_MUTATIONS.includes(raw.mutation as ScopeMutation)) return invalid();
    return { changed: raw.changed, mutation: raw.mutation, scopeRevision: nonNegative(raw.scopeRevision), revisionVector: validateScopeRevisionVector(raw.revisionVector), assignment: raw.assignment === null ? null : validateScopeAssignment(raw.assignment) } as unknown as JsonValue;
  }
  assertSafeBoundedJson(value); return value as JsonValue;
}
export { validateHashRecordMap };