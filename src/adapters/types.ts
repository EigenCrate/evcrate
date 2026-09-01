import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertStagedRoot } from '../filesystem/atomic.js';
import { createResourceGraph, type ResourceGraph, type ResourceGraphOptions } from './resource-graph.js';
import type { StagedRoot } from '../filesystem/atomic.js';
import { containedPath, normalizeRelativePath } from '../filesystem/paths.js';
import { boundedText, normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import { RESOURCE_KINDS, type ResourceCompatibilityStatus, type ResourceKind, type TargetManifest } from '../manifests/types.js';

export type ProjectedFileKind = 'file' | 'directory';
export type ProjectionDiagnosticCode =
  | 'missing'
  | 'unexpected'
  | 'kind-mismatch'
  | 'bytes-mismatch'
  | 'hash-mismatch'
  | 'mode-mismatch'
  | 'unsafe';

export interface ProjectedFileDiagnostic {
  readonly path: string;
  readonly kind: ProjectedFileKind;
  readonly code: ProjectionDiagnosticCode;
  readonly expected?: string | number;
  readonly actual?: string | number;
}
export type ProjectionCompatibilityStatus = ResourceCompatibilityStatus;
export interface ProjectionCompatibilityEntry {
  readonly status: ProjectionCompatibilityStatus;
  readonly reason?: string;
}
export type ProjectionCompatibility = Readonly<Record<ResourceKind, ProjectionCompatibilityEntry>>;

function invalidCompatibility(): never {
  throw new ControlPlaneError('VALIDATION_INVALID');
}

export function normalizeProjectionCompatibility(value: unknown): ProjectionCompatibility {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return invalidCompatibility();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== RESOURCE_KINDS.length
    || RESOURCE_KINDS.some((kind) => !Object.hasOwn(raw, kind))) return invalidCompatibility();
  const result: Record<ResourceKind, ProjectionCompatibilityEntry> = {} as Record<ResourceKind, ProjectionCompatibilityEntry>;
  for (const kind of RESOURCE_KINDS) {
    const entry = raw[kind];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
      || Object.getPrototypeOf(entry) !== Object.prototype) return invalidCompatibility();
    const fields = entry as Record<string, unknown>;
    if (!Object.hasOwn(fields, 'status')
      || Object.keys(fields).some((key) => key !== 'status' && key !== 'reason')) return invalidCompatibility();
    const status = fields.status;
    if (status !== 'native' && status !== 'needsAdapter' && status !== 'unsupported') return invalidCompatibility();
    const reason = fields.reason === undefined ? undefined : boundedText(fields.reason, 256, 'compatibility reason');
    if (status === 'unsupported' && reason === undefined) return invalidCompatibility();
    result[kind] = Object.freeze(reason === undefined ? { status } : { status, reason });
  }
  return Object.freeze(result);
}


export interface ProjectionExpectedEntry {
  readonly path: string;
  readonly kind: ProjectedFileKind;
  readonly size?: number;
  readonly hash?: string;
  readonly mode?: number;
}

const PROJECTION_EXPECTATIONS = new WeakMap<object, Map<string, ProjectionExpectedEntry>>();

export function registerProjectionExpectation(
  context: ProjectionBuildContext,
  entry: ProjectionExpectedEntry
): void {
  const expectations = PROJECTION_EXPECTATIONS.get(context);
  if (!expectations) throw new ControlPlaneError('PATH_UNSAFE');
  expectations.set(entry.path, Object.freeze({ ...entry }));
}

export function projectionExpectations(context: ProjectionBuildContext): readonly ProjectionExpectedEntry[] {
  const expectations = PROJECTION_EXPECTATIONS.get(context);
  if (!expectations) throw new ControlPlaneError('PATH_UNSAFE');
  return Object.freeze([...expectations.values()].sort((left, right) => left.path.localeCompare(right.path)));
}

export interface ProjectionValidation {
  readonly target: PersistedTarget;
  readonly valid: boolean;
  readonly diagnostics: readonly ProjectedFileDiagnostic[];
}

export interface ProjectionBuildContext {
  readonly manifest: TargetManifest;
  readonly canonicalRoot: string;
  readonly stage: StagedRoot;
  readonly resources: ResourceGraph;
  /** Resolve a normalized output path without permitting stage escape. */
  readonly stagePath: (relativePath: string) => string;
}

/**
 * A projection has no publication, HOME, lock, controller, or backend capability.
 * Metadata remains in the validated schema-2 manifest; only its canonical ID is
 * declared here so adapters cannot create a second target registry.
 */
export interface ProjectionAdapter {
  readonly id: PersistedTarget;
  readonly compatibility: ProjectionCompatibility;
  readonly build: (context: ProjectionBuildContext) => void;
  readonly validate: (context: ProjectionBuildContext) => ProjectionValidation;
}

export function createProjectionBuildContext(
  manifest: TargetManifest,
  canonicalRoot: string,
  stage: StagedRoot,
  options: ResourceGraphOptions = {}
): ProjectionBuildContext {
  if (manifest === null || typeof manifest !== 'object' || typeof manifest.id !== 'string') {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  if (normalizeTarget(manifest.id) !== manifest.id || typeof canonicalRoot !== 'string'
    || !Array.isArray(manifest.outputRoots) || !Array.isArray(manifest.projectDocs)
    || manifest.outputRoots.length === 0) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  const outputRoots = Object.freeze(manifest.outputRoots.map((path) => normalizeRelativePath(path)));
  const projectDocs = Object.freeze(manifest.projectDocs.map((path) => normalizeRelativePath(path)));
  const stagePath = (relativePath: string): string => {
    const name = normalizeRelativePath(relativePath);
    const authorized = outputRoots.some((root) => name === root || name.startsWith(`${root}/`))
      || projectDocs.includes(name);
    if (!authorized) throw new ControlPlaneError('PATH_UNSAFE');
    return containedPath(stage.path, name);
  };
  assertStagedRoot(stage);
  const resources = createResourceGraph(canonicalRoot, options);
  const context = Object.freeze({
    manifest,
    canonicalRoot: resources.root,
    stage,
    resources,
    stagePath
  });
  PROJECTION_EXPECTATIONS.set(context, new Map());
  for (const root of outputRoots) registerProjectionExpectation(context, { path: root, kind: 'directory' });
  return context;
}
