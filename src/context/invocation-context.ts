import { existsSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { pathOverlaps } from '../filesystem/paths.js';
import { validateProjectId } from '../protocol/validation.js';
import {
  HomePathOptions, resolveHomeRoot, resolveProjectRoot, resolveSafePath, resolveStateRoot
} from './path-resolution.js';
import {
  HomeBinding, loadSelectedTargets, loadTargetRegistry, TargetManifestContext
} from './target-registry.js';
import type {
  ProjectDescriptor, ProjectDirectoryDescriptor, ProjectDocumentDescriptor, ResourceRootMap
} from '../manifests/types.js';
import type { PersistedTarget } from '../protocol/validation.js';
import {
  canonicalProjectRoot, resolvePublicationProjectIdentity, type PublicationProjectIdentity
} from '../scopes/identity.js';

export interface InvocationContextOptions extends HomePathOptions {
  readonly packageRoot?: string;
  readonly source?: string;
  readonly stateHome?: string;
  readonly projectId?: string;
  readonly projectRoot?: string;
  readonly targets?: readonly string[];
}

export interface SelectedTargetContext {
  readonly id: PersistedTarget;
  readonly manifestPath: string;
  readonly outputRoots: readonly string[];
  readonly generatedRoots: readonly string[];
  readonly homeBindings: readonly HomeBinding[];
  readonly projectDocs: readonly string[];
  readonly projectDirectoryDescriptors: readonly ProjectDirectoryDescriptor[];
  readonly projectDocumentDescriptors: readonly ProjectDocumentDescriptor[];
  readonly projectDescriptors: readonly ProjectDescriptor[];
  readonly projectDirectoryBindings: readonly ProjectDirectoryDescriptor[];
  readonly projectDocumentBindings: readonly ProjectDocumentDescriptor[];
  readonly sharedJson: Readonly<Record<string, unknown>> | null;
}

export interface InvocationContext {
  readonly packageRoot: string;
  readonly canonicalHarnessRoot: string;
  readonly canonicalSourceRoot: string;
  readonly controllerRoot: string;
  readonly registryPath: string;
  readonly resourceRoots: ResourceRootMap;
  readonly selectedTargets: readonly SelectedTargetContext[];
  readonly selectedTargetIds: readonly PersistedTarget[];
  readonly targetManifestPaths: readonly string[];
  readonly generatedRoots: readonly string[];
  readonly homeBindings: readonly HomeBinding[];
  readonly projectDirectoryDescriptors: readonly ProjectDirectoryDescriptor[];
  readonly projectDocumentDescriptors: readonly ProjectDocumentDescriptor[];
  readonly projectDescriptors: readonly ProjectDescriptor[];
  readonly projectDirectoryBindings: readonly ProjectDirectoryDescriptor[];
  readonly projectDocumentBindings: readonly ProjectDocumentDescriptor[];
  readonly homeRoot: string;
  readonly stateRoot: string;
  readonly projectRoot: string;
  readonly projectId: string | null;
}

function defaultPackageRoot(options: InvocationContextOptions): string {
  if (options.packageRoot) return options.packageRoot;
  if (options.source) {
    const canonical = resolveSafePath(options.source, options.cwd ?? process.cwd());
    return dirname(dirname(dirname(canonical)));
  }
  const cwd = resolveSafePath(options.cwd ?? process.cwd());
  if (existsSync(join(cwd, '.evcrate', 'targets', 'manifest.json'))) return cwd;
  return resolveSafePath(join(__dirname, '..', '..'));
}

function assertDirectory(path: string): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }
}

export function assertNoDescriptorOverlap(
  descriptors: readonly (ProjectDirectoryDescriptor | ProjectDocumentDescriptor)[]
): void {
  for (let i = 0; i < descriptors.length; i += 1) {
    const left = descriptors[i];
    for (let j = i + 1; j < descriptors.length; j += 1) {
      const right = descriptors[j];
      if (pathOverlaps(left.relativeDestination, right.relativeDestination)) {
        throw new ControlPlaneError('PROTOCOL_INVALID');
      }
    }
  }
}

function targetContext(manifest: TargetManifestContext, sourceParent: string, homeRoot: string): SelectedTargetContext {
  const generatedRoots = manifest.outputRoots.map((root) => resolveSafePath(join(sourceParent, root)));
  const homeBindings = manifest.homeBindings.map((binding) => ({
    localRoot: resolveSafePath(join(sourceParent, binding.localRoot)),
    homeRoot: resolveSafePath(join(homeRoot, binding.homeRoot)),
    promotionOrder: binding.promotionOrder
  }));
  const projectDirectoryDescriptors: readonly ProjectDirectoryDescriptor[] = Object.freeze(
    manifest.outputRoots.map((root, index) => {
      const source = resolveSafePath(join(sourceParent, root));
      return Object.freeze({
        kind: 'directory' as const,
        targetId: manifest.id,
        localSource: source,
        generatedSource: source,
        relativeDestination: root,
        declarationIndex: index
      });
    })
  );
  const projectDocumentDescriptors: readonly ProjectDocumentDescriptor[] = Object.freeze(
    manifest.projectDocs.map((doc, index) => {
      const source = resolveSafePath(join(sourceParent, doc));
      return Object.freeze({
        kind: 'document' as const,
        targetId: manifest.id,
        localSource: source,
        generatedSource: source,
        relativeDestination: doc,
        declarationIndex: index
      });
    })
  );
  const projectDescriptors: readonly ProjectDescriptor[] = Object.freeze([
    ...projectDirectoryDescriptors,
    ...projectDocumentDescriptors
  ]);
  assertNoDescriptorOverlap(projectDescriptors);
  return Object.freeze({
    id: manifest.id,
    manifestPath: manifest.manifestPath,
    outputRoots: manifest.outputRoots,
    generatedRoots: Object.freeze(generatedRoots),
    homeBindings: Object.freeze(homeBindings),
    projectDocs: manifest.projectDocs,
    projectDirectoryDescriptors,
    projectDocumentDescriptors,
    projectDescriptors,
    projectDirectoryBindings: projectDirectoryDescriptors,
    projectDocumentBindings: projectDocumentDescriptors,
    sharedJson: manifest.sharedJson
  });
}

export function resolveInvocationContext(options: InvocationContextOptions = {}): InvocationContext {
  const packageRoot = resolveSafePath(defaultPackageRoot(options), options.cwd ?? process.cwd());
  const canonicalHarnessRoot = resolveSafePath(
    options.source ?? join(packageRoot, '.evcrate', 'source', '.claude'), options.cwd ?? process.cwd()
  );
  assertDirectory(canonicalHarnessRoot);
  const sourceParent = dirname(canonicalHarnessRoot);
  const controllerRoot = resolveSafePath(join(packageRoot, '.evcrate', 'source', '.evcrate', 'bin'));
  const registryPath = resolveSafePath(join(packageRoot, '.evcrate', 'targets', 'manifest.json'));
  const homeRoot = resolveHomeRoot(options);
  const stateRoot = resolveStateRoot({ ...options, home: homeRoot });
  const projectRoot = resolveProjectRoot({ projectRoot: options.projectRoot, cwd: options.cwd });
  const projectId = options.projectId === undefined ? null : validateProjectId(options.projectId);
  const registry = loadTargetRegistry(registryPath);
  const manifests = loadSelectedTargets(registry, options.targets ?? []);
  const selectedTargets = manifests.map((manifest) => targetContext(manifest, sourceParent, homeRoot));
  const generatedRoots = selectedTargets.flatMap((target) => target.generatedRoots);
  const homeBindings = selectedTargets.flatMap((target) => target.homeBindings);
  const projectDirectoryDescriptors = Object.freeze(
    selectedTargets.flatMap((target) => target.projectDirectoryDescriptors)
  );
  const projectDocumentDescriptors = Object.freeze(
    selectedTargets.flatMap((target) => target.projectDocumentDescriptors)
  );
  const projectDescriptors = Object.freeze(
    selectedTargets.flatMap((target) => target.projectDescriptors)
  );
  assertNoDescriptorOverlap(projectDescriptors);
  return Object.freeze({
    packageRoot,
    canonicalHarnessRoot,
    canonicalSourceRoot: canonicalHarnessRoot,
    controllerRoot,
    registryPath,
    resourceRoots: registry.resourceRoots,
    selectedTargets: Object.freeze(selectedTargets),
    selectedTargetIds: Object.freeze(selectedTargets.map(({ id }) => id)),
    targetManifestPaths: Object.freeze(selectedTargets.map(({ manifestPath }) => manifestPath)),
    generatedRoots: Object.freeze(generatedRoots),
    homeBindings: Object.freeze(homeBindings),
    projectDirectoryDescriptors,
    projectDocumentDescriptors,
    projectDescriptors,
    projectDirectoryBindings: projectDirectoryDescriptors,
    projectDocumentBindings: projectDocumentDescriptors,
    homeRoot,
    stateRoot,
    projectRoot,
    projectId
  });
}

export function resolvePublicationProjectContext(
  context: InvocationContext | { readonly projectRoot: string }
): PublicationProjectIdentity {
  return resolvePublicationProjectIdentity(context.projectRoot);
}

export { loadTargetRegistry, loadSelectedTargets } from './target-registry.js';
export { canonicalProjectRoot, resolvePublicationProjectIdentity } from '../scopes/identity.js';
export type { PublicationProjectIdentity } from '../scopes/identity.js';
export type { ProjectDirectoryDescriptor, ProjectDocumentDescriptor, ProjectDescriptor } from '../manifests/types.js';
