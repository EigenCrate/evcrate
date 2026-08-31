import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertStagedRoot } from '../filesystem/atomic.js';
import { containedPath, normalizeRelativePath } from '../filesystem/paths.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import { createResourceGraph, type ResourceGraph, type ResourceGraphOptions } from './resource-graph.js';
import type { StagedRoot } from '../filesystem/atomic.js';
import type { TargetManifest } from '../manifests/types.js';

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
