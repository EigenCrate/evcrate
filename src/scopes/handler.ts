import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createResourceConflictResult, createResourceResult } from '../protocol/resource-control.js';
import type { ResourceRequest, ResourceResult } from '../protocol/resource-control.js';
import type {
  ChangesApplyPayload, ChangesPreviewPayload, ScopeGetPayload, ScopeListResultPayload,
  ScopeMutation, ScopeMutationPayload, ScopeMutationResultPayload, ScopeGetResultPayload,
  ScopeRevisionVector
} from '../protocol/scope-payloads.js';
import { validateScopeResultPayload } from '../protocol/scope-payloads.js';
import type { InvocationContext } from '../context/invocation-context.js';
import { loadResourceRegistry } from '../registry/store.js';
import { applyScopeChange, previewScopeChange } from './changes.js';
import { applyScopeMutation } from './mutations.js';
import { loadScopeChangePreview } from './change-store.js';
import { loadScopeState, requireEffective } from './state.js';

function registryPath(context: InvocationContext): string { return join(context.packageRoot, '.evcrate', 'registry.json'); }
function result(request: ResourceRequest, payload: unknown, status: 'ok' | 'preview' | 'applied'): ResourceResult {
  const checked = validateScopeResultPayload(request.operation, payload);
  return createResourceResult(request, checked, status);
}
function currentRevision(context: InvocationContext): ScopeRevisionVector {
  const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
  return loadScopeState(context, registry.document).revisionVector;
}
function expectedRevision(request: ResourceRequest, context: InvocationContext): ScopeRevisionVector | null {
  if (request.operation === 'changes.preview') {
    return (request.payload as unknown as ChangesPreviewPayload).payload.expectedRevision;
  }
  if (request.operation === 'changes.apply') {
    try { return loadScopeChangePreview(context.stateRoot, (request.payload as unknown as ChangesApplyPayload).previewToken).result.expectedRevision; }
    catch { return null; }
  }
  if (request.operation.startsWith('scopes.')) {
    return (request.payload as unknown as ScopeMutationPayload).expectedRevision;
  }
  return null;
}
function run(request: ResourceRequest, context: InvocationContext, action: () => ResourceResult): ResourceResult {
  try { return action(); }
  catch (error) {
    if (!(error instanceof ControlPlaneError) || error.code !== 'CAS_CONFLICT') throw error;
    const expected = expectedRevision(request, context);
    if (expected === null) throw error;
    try { return createResourceConflictResult(request, expected, currentRevision(context)); }
    catch { throw error; }
  }
}
function list(context: InvocationContext): ScopeListResultPayload {
  const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
  const state = loadScopeState(context, registry.document);
  return { scope: state.scope, projectId: state.projectId, revisionVector: state.revisionVector, assignments: state.assignments, effective: state.effective };
}
function get(context: InvocationContext, id: string): ScopeGetResultPayload {
  const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
  const state = loadScopeState(context, registry.document);
  return { scope: state.scope, projectId: state.projectId, revisionVector: state.revisionVector, assignments: state.assignments, effective: state.effective, assignment: requireEffective(state, id) };
}
export interface ScopeHandlerOptions { readonly now?: () => number; }
export function createScopeHandler(options: ScopeHandlerOptions = {}): (request: ResourceRequest, context: InvocationContext) => ResourceResult {
  const now = options.now ?? Date.now;
  return (request, context): ResourceResult => {
    if (request.operation === 'scopes.list') return result(request, list(context), 'ok');
    if (request.operation === 'scopes.get') return result(request, get(context, (request.payload as unknown as ScopeGetPayload).id), 'ok');
    if (request.operation.startsWith('scopes.')) {
      const mutation = request.operation as ScopeMutation;
      const payload = request.payload as unknown as ScopeMutationPayload;
      return run(request, context, () => {
        const value: ScopeMutationResultPayload = applyScopeMutation(context, mutation, payload);
        return result(request, value, 'applied');
      });
    }
    if (request.operation === 'changes.preview') {
      return run(request, context, () => {
        const value = previewScopeChange(context, request.payload as unknown as ChangesPreviewPayload, now());
        return result(request, value, 'preview');
      });
    }
    if (request.operation === 'changes.apply') {
      return run(request, context, () => {
        const value = applyScopeChange(context, (request.payload as unknown as ChangesApplyPayload).previewToken, now());
        return result(request, value, 'applied');
      });
    }
    throw new Error('unsupported scope operation');
  };
}
export const defaultScopeHandler = createScopeHandler();
