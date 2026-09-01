import { ControlPlaneError } from '../errors/control-plane-error.js';
import { normalizeTarget, PERSISTED_TARGETS, type PersistedTarget } from '../protocol/validation.js';
import { assertResourceGraph } from './resource-graph.js';
import { normalizeProjectionCompatibility, type ProjectionAdapter, type ProjectionBuildContext } from './types.js';

/** Schema order is owned by protocol/manifest validation and is not qualification order. */
export const PROJECTION_REGISTRY_ORDER = PERSISTED_TARGETS;
export const PROJECTION_QUALIFICATION_ORDER = Object.freeze([
  'claude', 'gemini', 'antigravity', 'codex', 'pi', 'omp', 'copilot'
] as const satisfies readonly PersistedTarget[]);

const adapters = new Map<PersistedTarget, ProjectionAdapter>();

function invalid(): never {
  throw new ControlPlaneError('VALIDATION_INVALID');
}

function adapterDefinition(value: ProjectionAdapter): ProjectionAdapter {
  if (value === null || typeof value !== 'object') return invalid();
  const keys = Object.keys(value);
  if (keys.length !== 4 || !keys.includes('id') || !keys.includes('compatibility')
    || !keys.includes('build') || !keys.includes('validate')) return invalid();
  if (typeof value.id !== 'string' || !PERSISTED_TARGETS.includes(value.id as PersistedTarget)
    || normalizeTarget(value.id) !== value.id || typeof value.build !== 'function'
    || typeof value.validate !== 'function') return invalid();
  const compatibility = normalizeProjectionCompatibility(value.compatibility);
  const build = value.build;
  const validate = value.validate;
  return Object.freeze({
    id: value.id,
    compatibility,
    build: (context: ProjectionBuildContext) => {
      assertResourceGraph(context.resources);
      build(context);
    },
    validate: (context: ProjectionBuildContext) => {
      assertResourceGraph(context.resources);
      return validate(context);
    }
  });
}

/** Register one real implementation; discovery and fallback adapters are forbidden. */
export function registerProjectionAdapter(value: ProjectionAdapter): void {
  const adapter = adapterDefinition(value);
  if (adapters.has(adapter.id)) invalid();
  adapters.set(adapter.id, adapter);
}

export function registerProjectionAdapters(values: readonly ProjectionAdapter[]): void {
  if (!Array.isArray(values)) invalid();
  for (const value of values) registerProjectionAdapter(value);
}

export function getProjectionAdapter(value: unknown): ProjectionAdapter {
  const target = normalizeTarget(value);
  const adapter = adapters.get(target);
  if (!adapter) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  return adapter;
}

/** Return registered implementations in persisted schema order, without placeholders. */
export function registeredProjectionAdapters(): ReadonlyMap<PersistedTarget, ProjectionAdapter> {
  const result = new Map<PersistedTarget, ProjectionAdapter>();
  for (const target of PROJECTION_REGISTRY_ORDER) {
    const adapter = adapters.get(target);
    if (adapter) result.set(target, adapter);
  }
  return result;
}

/** Require an exhaustive implementation set for an operation, in schema order. */
export function requireProjectionAdapters(
  requested: readonly string[] = [...PROJECTION_REGISTRY_ORDER]
): ReadonlyMap<PersistedTarget, ProjectionAdapter> {
  const normalized = requested.map((value) => normalizeTarget(value));
  if (new Set(normalized).size !== normalized.length) invalid();
  const result = new Map<PersistedTarget, ProjectionAdapter>();
  for (const target of PROJECTION_REGISTRY_ORDER) {
    if (!normalized.includes(target)) continue;
    result.set(target, getProjectionAdapter(target));
  }
  return result;
}
