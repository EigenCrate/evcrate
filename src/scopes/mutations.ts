import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalJson } from '../protocol/json.js';
import type { ImportCapability } from '../protocol/resource-payload-validation.js';
import { PERSISTED_TARGETS, type PersistedTarget } from '../protocol/validation.js';
import type {
  ScopeAssignment, ScopeAssignPayload, ScopeMutation, ScopeMutationPayload, ScopeMutationResultPayload
} from '../protocol/scope-payloads.js';
import type { InvocationContext } from '../context/invocation-context.js';
import { withLock } from '../filesystem/locking.js';
import { loadResourceRegistry } from '../registry/store.js';
import type { ResourceRecord } from '../registry/types.js';
import { scopeRoot, writeScopeDocument } from './schema.js';
import { loadScopeState, requireEffective, requireResource, scopeProjectId, type ScopeState } from './state.js';

const SCOPE_LOCK_NAME = 'scopes.lock';
export interface ScopeMutationHooks {
  readonly beforeWrite?: () => void;
  readonly afterWrite?: () => void;
}
function registryPath(context: InvocationContext): string { return join(context.packageRoot, '.evcrate', 'registry.json'); }
function conflict(): never { throw new ControlPlaneError('CAS_CONFLICT'); }
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function localAssignment(state: ScopeState, id: string): ScopeAssignment | null {
  return state.assignments.find((assignment) => assignment.resourceId === id) ?? null;
}
function compatibleTargets(record: ResourceRecord): readonly PersistedTarget[] {
  return Object.freeze(PERSISTED_TARGETS.filter((target) => record.compatibility[target]?.status !== 'unsupported'));
}
function validateBinding(record: ResourceRecord, assignment: ScopeAssignment): void {
  if (assignment.targets.some((target) => record.compatibility[target]?.status === undefined
    || record.compatibility[target]?.status === 'unsupported')) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  if (assignment.enabled && record.capabilities.some((capability) => !assignment.capabilityApprovals.includes(capability as ImportCapability))) {
    throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  }
}
function seedAssignment(record: ResourceRecord, enabled: boolean): ScopeAssignment {
  return { resourceId: record.id, enabled, targets: compatibleTargets(record), capabilityApprovals: [] };
}
export function scopeMutationCandidate(
  mutation: ScopeMutation, payload: ScopeMutationPayload, state: ScopeState, registry: ReturnType<typeof loadResourceRegistry>['document']
): { record: ResourceRecord; assignment: ScopeAssignment | null } {
  const id = payload.resourceId;
  const record = requireResource(registry, id);
  const current = localAssignment(state, id);
  if (mutation === 'scopes.assign') {
    const input = payload as ScopeAssignPayload;
    const assignment: ScopeAssignment = { resourceId: id, enabled: true, targets: input.targets, capabilityApprovals: input.capabilityApprovals };
    validateBinding(record, assignment);
    return { record, assignment };
  }
  if (mutation === 'scopes.remove') return { record, assignment: null };
  const inherited = requireEffective(state, id).effective;
  if (mutation === 'scopes.disable' && current === null && inherited === null) return { record, assignment: null };
  const base = current ?? inherited ?? seedAssignment(record, false);
  if (base.targets.length === 0) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  const assignment: ScopeAssignment = { ...base, enabled: mutation === 'scopes.enable' };
  validateBinding(record, assignment);
  return { record, assignment };
}
function replace(document: ScopeState['global']['document'], id: string, assignment: ScopeAssignment | null): ScopeState['global']['document'] {
  const values = document.assignments.filter(({ resourceId }) => resourceId !== id);
  const next = assignment === null ? values : [...values, assignment].sort((left, right) => left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0);
  return { ...document, revision: document.revision + 1, assignments: Object.freeze(next) };
}
export function mutateScopeUnlocked(
  context: InvocationContext, mutation: ScopeMutation, payload: ScopeMutationPayload, hooks?: ScopeMutationHooks
): ScopeMutationResultPayload {
  const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
  const projectId = scopeProjectId(context);
  let state = loadScopeState(context, registry.document, projectId);
  if (!same(payload.expectedRevision, state.revisionVector)) conflict();
  const current = localAssignment(state, payload.resourceId);
  const next = scopeMutationCandidate(mutation, payload, state, registry.document).assignment;
  const changed = !same(current, next);
  if (changed) {
    const snapshot = projectId === null ? state.global : state.project;
    if (snapshot === null) throw new ControlPlaneError('PATH_UNSAFE');
    const document = replace(snapshot.document, payload.resourceId, next);
    hooks?.beforeWrite?.();
    writeScopeDocument(context.packageRoot, document);
    hooks?.afterWrite?.();
    state = loadScopeState(context, registry.document, projectId);
  }
  const active = projectId === null ? state.global.document : state.project?.document;
  return {
    changed, mutation, scopeRevision: active?.revision ?? 0,
    revisionVector: state.revisionVector, assignment: localAssignment(state, payload.resourceId)
  };
}
export function applyScopeMutation(
  context: InvocationContext, mutation: ScopeMutation, payload: ScopeMutationPayload
): ScopeMutationResultPayload {
  return withLock(scopeRoot(context.packageRoot), SCOPE_LOCK_NAME, () => mutateScopeUnlocked(context, mutation, payload));
}
