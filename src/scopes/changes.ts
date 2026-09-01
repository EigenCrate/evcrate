import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalJson } from '../protocol/json.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type {
  ChangesApplyResultPayload, ChangesPreviewPayload, ChangesPreviewResultPayload,
  EffectiveScopeAssignment, ScopeAssignment, ScopeMutation, ScopeMutationPayload,
  ScopeRevisionVector
} from '../protocol/scope-payloads.js';
import { withLock } from '../filesystem/locking.js';
import { loadResourceRegistry } from '../registry/store.js';
import { compareCanonicalPaths } from '../filesystem/hashing.js';
import { effectiveAssignmentFor, loadScopeState, scopeProjectId } from './state.js';
import { scopeChangeHashes } from './hashes.js';
import {
  consumeScopeChangePreview, loadScopeChangePreview, saveScopeChangePreview,
  scopeChangeExpired, type ScopeChangeTokenRecord
} from './change-store.js';
import { emptyScopeDocument, scopeRoot } from './schema.js';
import { scopeMutationCandidate, mutateScopeUnlocked, type ScopeMutationHooks } from './mutations.js';
const LOCK_NAME = 'scopes.lock';

function registryPath(context: InvocationContext): string { return join(context.packageRoot, '.evcrate', 'registry.json'); }
function conflict(): never { throw new ControlPlaneError('CAS_CONFLICT'); }
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function revisionEqual(left: ScopeRevisionVector, right: ScopeRevisionVector): boolean { return same(left, right); }
function localAssignment(assignments: readonly ScopeAssignment[], id: string): ScopeAssignment | null {
  return assignments.find((assignment) => assignment.resourceId === id) ?? null;
}
function simulatedDocument(
  state: ReturnType<typeof loadScopeState>, id: string, assignment: ScopeAssignment | null
): { global: Parameters<typeof effectiveAssignmentFor>[1]; project: Parameters<typeof effectiveAssignmentFor>[2] } {
  const projectId = state.projectId;
  const active = projectId === null ? state.global.document : state.project?.document ?? emptyScopeDocument('project', projectId);
  const assignments = active.assignments.filter((entry) => entry.resourceId !== id);
  const nextAssignments = assignment === null ? assignments : [...assignments, assignment].sort((left, right) => compareCanonicalPaths(left.resourceId, right.resourceId));
  const next = { ...active, assignments: Object.freeze(nextAssignments) };
  return projectId === null ? { global: next, project: null } : { global: state.global.document, project: next };
}
function afterAssignment(state: ReturnType<typeof loadScopeState>, id: string, assignment: ScopeAssignment | null): EffectiveScopeAssignment {
  const simulated = simulatedDocument(state, id, assignment);
  return effectiveAssignmentFor(id, simulated.global, simulated.project, state.projectId !== null);
}
function assertExpected(payload: ScopeMutationPayload, state: ReturnType<typeof loadScopeState>): void {
  if (!revisionEqual(payload.expectedRevision, state.revisionVector)) conflict();
}
function hashEqual(left: ReturnType<typeof scopeChangeHashes>, right: ChangesPreviewResultPayload): boolean {
  return left.canonicalSourceHash === right.canonicalSourceHash
    && left.targetRegistryHash === right.targetRegistryHash
    && same(left.selectedTargets, right.selectedTargets)
    && same(left.targetManifestHashes, right.targetManifestHashes)
    && same(left.adapterHashes, right.adapterHashes) && same(left.outputHashes, right.outputHashes);
}
export interface ScopeChangeApplyOptions { readonly mutationHooks?: ScopeMutationHooks; }

export function previewScopeChange(
  context: InvocationContext, input: ChangesPreviewPayload, now = Date.now()
): ChangesPreviewResultPayload {
  return withLock(scopeRoot(context.packageRoot), LOCK_NAME, () => {
    if (!Number.isSafeInteger(now)) throw new ControlPlaneError('VALIDATION_INVALID');
    const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
    const state = loadScopeState(context, registry.document);
    assertExpected(input.payload, state);
    const candidate = scopeMutationCandidate(input.mutation, input.payload, state, registry.document).assignment;
    const before = state.effective.find(({ resourceId }) => resourceId === input.payload.resourceId) ?? null;
    const after = afterAssignment(state, input.payload.resourceId, candidate);
    const expiresAt = now + input.expiresInSeconds * 1000;
    const hashes = scopeChangeHashes(context);
    const result: ChangesPreviewResultPayload = {
      token: randomBytes(32).toString('hex'), expiresAt, mutation: input.mutation,
      expectedRevision: input.payload.expectedRevision, revisionVector: state.revisionVector,
      selectedTargets: hashes.selectedTargets, canonicalSourceHash: hashes.canonicalSourceHash,
      targetRegistryHash: hashes.targetRegistryHash, targetManifestHashes: hashes.targetManifestHashes,
      adapterHashes: hashes.adapterHashes, outputHashes: hashes.outputHashes, before, after
    };
    const record: ScopeChangeTokenRecord = Object.freeze({
      schema_version: 1, operation: 'changes.preview', token: result.token,
      projectId: state.projectId, mutationPayload: input.payload, result
    });
    saveScopeChangePreview(context.stateRoot, record);
    return result;
  });
}
export function applyScopeChange(
  context: InvocationContext, token: string, now = Date.now(), options: ScopeChangeApplyOptions = {}
): ChangesApplyResultPayload {
  return withLock(scopeRoot(context.packageRoot), LOCK_NAME, () => {
    const record = loadScopeChangePreview(context.stateRoot, token);
    if (scopeChangeExpired(record, now) || record.projectId !== scopeProjectId(context)) conflict();
    const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
    const state = loadScopeState(context, registry.document, record.projectId);
    if (!revisionEqual(record.result.expectedRevision, state.revisionVector)) conflict();
    if (!hashEqual(scopeChangeHashes(context), record.result)) conflict();
    const applied = mutateScopeUnlocked(context, record.result.mutation, record.mutationPayload, options.mutationHooks);
    // The committed revision is the durable replay barrier if cleanup fails.
    consumeScopeChangePreview(context.stateRoot, token);
    return applied;
  });
}
