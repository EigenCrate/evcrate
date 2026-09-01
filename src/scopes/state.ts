import { ControlPlaneError } from '../errors/control-plane-error.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { RegistryDocument, ResourceRecord } from '../registry/types.js';
import {
  type EffectiveScopeAssignment, type ScopeAssignment,
  type ScopeKind, type ScopeRevisionVector
} from '../protocol/scope-payloads.js';
import { validateResourceId } from '../protocol/resource-payload-validation.js';
import { projectIdentity } from './identity.js';
import { readScopeDocument, type ScopeDocument, type ScopeSnapshot } from './schema.js';

export interface ScopeState {
  readonly scope: ScopeKind;
  readonly projectId: string | null;
  readonly global: ScopeSnapshot;
  readonly project: ScopeSnapshot | null;
  readonly revisionVector: ScopeRevisionVector;
  readonly assignments: readonly ScopeAssignment[];
  readonly effective: readonly EffectiveScopeAssignment[];
}
function unsupported(): never { throw new ControlPlaneError('CAPABILITY_UNSUPPORTED'); }
function find(assignments: readonly ScopeAssignment[], id: string): ScopeAssignment | null {
  return assignments.find((assignment) => assignment.resourceId === id) ?? null;
}
export function effectiveAssignmentFor(id: string, global: ScopeDocument, project: ScopeDocument | null, projectMode: boolean): EffectiveScopeAssignment {
  const globalAssignment = find(global.assignments, id);
  const projectAssignment = project === null ? null : find(project.assignments, id);
  if (projectAssignment !== null) {
    return projectAssignment.enabled
      ? { resourceId: id, declared: projectAssignment, effective: projectAssignment, source: 'project' }
      : { resourceId: id, declared: projectAssignment, effective: null, source: 'disabled' };
  }
  if (globalAssignment !== null) {
    if (!globalAssignment.enabled) return { resourceId: id, declared: globalAssignment, effective: null, source: 'disabled' };
    return { resourceId: id, declared: globalAssignment, effective: globalAssignment, source: projectMode ? 'inherited' : 'global' };
  }
  return { resourceId: id, declared: null, effective: null, source: 'absent' };
}
export function scopeProjectId(context: InvocationContext): string | null {
  if (context.projectId === 'global') return null;
  return projectIdentity(context.projectRoot);
}
export function loadScopeState(
  context: InvocationContext, registry: RegistryDocument, projectId = scopeProjectId(context)
): ScopeState {
  const global = readScopeDocument(context.packageRoot, 'global');
  const project = projectId === null ? null : readScopeDocument(context.packageRoot, 'project', projectId);
  const projectDocument = project?.document ?? null;
  const scope: ScopeKind = projectId === null ? 'global' : 'project';
  const assignments = projectDocument?.assignments ?? global.document.assignments;
  const effective = registry.resources.map(({ id }) => effectiveAssignmentFor(id, global.document, projectDocument, projectId !== null));
  return Object.freeze({
    scope, projectId, global, project,
    revisionVector: {
      registryRevision: registry.revision,
      globalScopeRevision: global.document.revision,
      projectScopeRevision: project?.present ? project.document.revision : null
    },
    assignments: Object.freeze([...assignments]), effective: Object.freeze(effective)
  });
}
export function requireEffective(state: ScopeState, idValue: unknown): EffectiveScopeAssignment {
  const id = validateResourceId(idValue);
  return state.effective.find((entry) => entry.resourceId === id) ?? unsupported();
}
export function requireResource(registry: RegistryDocument, idValue: unknown): ResourceRecord {
  const id = validateResourceId(idValue);
  return registry.resources.find((record) => record.id === id) ?? unsupported();
}
