import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { assertExactKeys } from '../protocol/validation.js';
import { assertNoSymlinkAncestors, assertOwnerOnlyDirectory, assertOwnerOnlyFile, containedPath } from '../filesystem/paths.js';
import { canonicalJsonBytes, readBoundedFile } from '../filesystem/hashing.js';
import { writeAtomicFile } from '../filesystem/atomic.js';
import { validateScopeAssignment, validateScopeKind, type ScopeAssignment, type ScopeKind } from '../protocol/scope-payloads.js';
import { validateProjectIdentity } from './identity.js';

export const SCOPE_SCHEMA_VERSION = 1;
export const MAX_SCOPE_BYTES = 256 * 1024;
export const MAX_SCOPE_ASSIGNMENTS = 10_000;
export interface ScopeDocument {
  readonly schema_version: 1;
  readonly scope: ScopeKind;
  readonly project_id?: string;
  readonly revision: number;
  readonly assignments: readonly ScopeAssignment[];
}
export interface ScopeSnapshot {
  readonly path: string;
  readonly document: ScopeDocument;
  readonly present: boolean;
}
function invalid(code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' | 'CAS_CONFLICT' = 'PROTOCOL_INVALID'): never { throw new ControlPlaneError(code); }
function sortedIds(values: readonly ScopeAssignment[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1].resourceId < value.resourceId);
}
function persistedAssignment(value: unknown): ScopeAssignment {
  if (!isPlainObject(value)) invalid();
  const raw = value as Record<string, unknown>;
  if (!Object.hasOwn(raw, 'resource_id') || !Object.hasOwn(raw, 'enabled')
    || !Object.hasOwn(raw, 'targets') || !Object.hasOwn(raw, 'capability_approvals')
    || Object.keys(raw).some((key) => !['resource_id', 'enabled', 'targets', 'capability_approvals'].includes(key))) invalid();
  return validateScopeAssignment({
    resourceId: raw.resource_id, enabled: raw.enabled, targets: raw.targets, capabilityApprovals: raw.capability_approvals
  });
}
function persisted(assignments: readonly ScopeAssignment[]): readonly Record<string, unknown>[] {
  return assignments.map((assignment) => ({
    resource_id: assignment.resourceId, enabled: assignment.enabled,
    targets: [...assignment.targets], capability_approvals: [...assignment.capabilityApprovals]
  }));
}
export function validateScopeDocument(value: unknown, expectedScope?: ScopeKind, expectedProjectId?: string): ScopeDocument {
  if (!isPlainObject(value)) invalid();
  const raw = value as Record<string, unknown>;
  const scope = validateScopeKind(raw.scope);
  const keys = scope === 'global' ? ['schema_version', 'scope', 'revision', 'assignments'] : ['schema_version', 'scope', 'project_id', 'revision', 'assignments'];
  try { assertExactKeys(raw, keys, 'PROTOCOL_INVALID'); } catch { invalid(); }
  if (raw.schema_version !== SCOPE_SCHEMA_VERSION || !Number.isSafeInteger(raw.revision)
    || (raw.revision as number) < 0 || !Array.isArray(raw.assignments)
    || raw.assignments.length > MAX_SCOPE_ASSIGNMENTS) invalid();
  if (expectedScope !== undefined && expectedScope !== scope) invalid();
  let project_id: string | undefined;
  if (scope === 'project') {
    project_id = validateProjectIdentity(raw.project_id);
    if (expectedProjectId !== undefined && project_id !== expectedProjectId) invalid('PATH_UNSAFE');
  } else if (expectedProjectId !== undefined) invalid();
  const assignments = raw.assignments.map(persistedAssignment);
  if (!sortedIds(assignments) || new Set(assignments.map(({ resourceId }) => resourceId)).size !== assignments.length) invalid();
  const document = scope === 'global'
    ? { schema_version: 1 as const, scope, revision: raw.revision as number, assignments: Object.freeze(assignments) }
    : { schema_version: 1 as const, scope, project_id, revision: raw.revision as number, assignments: Object.freeze(assignments) };
  return Object.freeze(document);
}
export function emptyScopeDocument(scope: ScopeKind, projectId?: string): ScopeDocument {
  if (scope === 'global') return Object.freeze({ schema_version: 1, scope, revision: 0, assignments: Object.freeze([]) });
  if (projectId === undefined) invalid();
  return Object.freeze({ schema_version: 1, scope, project_id: validateProjectIdentity(projectId), revision: 0, assignments: Object.freeze([]) });
}
export function scopeRoot(packageRoot: string): string { return resolve(join(packageRoot, '.evcrate', 'scopes')); }
export function scopePath(packageRoot: string, scope: ScopeKind, projectId?: string): string {
  const root = scopeRoot(packageRoot);
  if (scope === 'global') return containedPath(root, 'global.json');
  if (projectId === undefined) invalid();
  return containedPath(root, join('projects', `${validateProjectIdentity(projectId)}.json`));
}
function ensureDirectory(path: string): void {
  assertNoSymlinkAncestors(path);
  try { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); assertOwnerOnlyDirectory(path); }
  catch (error) { if (error instanceof ControlPlaneError) throw error; invalid('PATH_UNSAFE'); }
}
export function readScopeDocument(packageRoot: string, scope: ScopeKind, projectId?: string): ScopeSnapshot {
  const normalizedScope = validateScopeKind(scope);
  const identity = normalizedScope === 'project' ? validateProjectIdentity(projectId) : undefined;
  const path = scopePath(packageRoot, normalizedScope, identity);
  try {
    lstatSync(path);
    const initial = assertOwnerOnlyFile(path);
    assertOwnerOnlyDirectory(resolve(path, '..'));
    const document = validateScopeDocument(parseJsonDocument(readBoundedFile(path, MAX_SCOPE_BYTES), MAX_SCOPE_BYTES), normalizedScope, identity);
    const final = assertOwnerOnlyFile(path);
    if (Number(initial.dev) !== Number(final.dev) || Number(initial.ino) !== Number(final.ino)
      || Number(initial.size) !== Number(final.size) || (Number(initial.mode) & 0o777) !== (Number(final.mode) & 0o777)) {
      invalid('PATH_UNSAFE');
    }
    return Object.freeze({ path, document, present: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze({ path, document: emptyScopeDocument(normalizedScope, identity), present: false });
    if (error instanceof ControlPlaneError) throw error;
    invalid();
  }
}
export function writeScopeDocument(packageRoot: string, documentValue: ScopeDocument): ScopeSnapshot {
  const persistedValue = {
    schema_version: 1, scope: documentValue.scope,
    ...(documentValue.project_id === undefined ? {} : { project_id: documentValue.project_id }),
    revision: documentValue.revision, assignments: persisted(documentValue.assignments)
  };
  const document = validateScopeDocument(persistedValue, documentValue.scope, documentValue.project_id);
  const path = scopePath(packageRoot, document.scope, document.project_id);
  const bytes = canonicalJsonBytes({
    schema_version: 1, scope: document.scope,
    ...(document.project_id === undefined ? {} : { project_id: document.project_id }),
    revision: document.revision, assignments: persisted(document.assignments)
  });
  if (bytes.byteLength > MAX_SCOPE_BYTES) invalid();
  const existing = readScopeDocument(packageRoot, document.scope, document.project_id);
  if (existing.present && document.revision <= existing.document.revision) {
    if (document.revision === existing.document.revision
      && Buffer.from(bytes).equals(Buffer.from(readBoundedFile(path, MAX_SCOPE_BYTES)))) return existing;
    invalid('CAS_CONFLICT');
  }
  ensureDirectory(scopeRoot(packageRoot));
  if (document.scope === 'project') ensureDirectory(resolve(path, '..'));
  writeAtomicFile(path, bytes, 0o600);
  return Object.freeze({ path, document, present: true });
}
