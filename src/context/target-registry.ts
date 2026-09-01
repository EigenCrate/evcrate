import { ControlPlaneError } from '../errors/control-plane-error.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import {
  loadSelectedManifests, loadTargetManifestRegistry
} from '../manifests/registry.js';
import type { ResourceRootMap } from '../manifests/types.js';
import type { TargetManifest } from '../manifests/types.js';
export interface HomeBinding {
  readonly localRoot: string;
  readonly homeRoot: string;
  readonly promotionOrder: number;
}

export interface TargetManifestContext extends Omit<TargetManifest, 'id' | 'sharedJson'> {
  readonly id: PersistedTarget;
  readonly homeBindings: readonly HomeBinding[];
  readonly sharedJson: Readonly<Record<string, unknown>> | null;
}

export interface TargetRegistry {
  readonly registryPath: string;
  readonly targets: ReadonlyMap<PersistedTarget, TargetManifestContext>;
  readonly resourceRoots: ResourceRootMap;
}

function contextManifest(manifest: TargetManifest, id = manifest.id as PersistedTarget): TargetManifestContext {
  const homeBindings = Object.entries(manifest.homePolicy.bindings).map(([localRoot, homeRoot]) => ({
    localRoot,
    homeRoot,
    promotionOrder: manifest.homePolicy.promotionOrder
  }));
  const sharedJson = manifest.sharedJson === null ? null : Object.freeze({
    schema: manifest.sharedJson.schema,
    destination: manifest.sharedJson.destination,
    fragment: manifest.sharedJson.fragment,
    managed_keys: [...manifest.sharedJson.managedKeys]
  });
  return Object.freeze({
    ...manifest,
    id,
    homeBindings: Object.freeze(homeBindings),
    sharedJson
  });
}

export function loadTargetRegistry(registryPath: string): TargetRegistry {
  const registry = loadTargetManifestRegistry(registryPath);
  const targets = new Map<PersistedTarget, TargetManifestContext>();
  for (const [id, manifest] of registry.targets) targets.set(id, contextManifest(manifest));
  return Object.freeze({ registryPath, targets, resourceRoots: registry.resourceRoots });
}

export function loadSelectedTargets(
  registryOrPath: TargetRegistry | string,
  requested: readonly string[] = []
): readonly TargetManifestContext[] {
  if (typeof registryOrPath === 'string') {
    return loadSelectedManifests(registryOrPath, requested).map((manifest) => contextManifest(manifest));
  }
  const normalized = requested.map((value) => normalizeTarget(value));
  if (new Set(normalized).size !== normalized.length) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  const wanted = normalized.length === 0 ? new Set(registryOrPath.targets.keys()) : new Set(normalized);
  for (const id of wanted) if (!registryOrPath.targets.has(id)) {
    throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  }
  return Object.freeze([...registryOrPath.targets.entries()]
    .filter(([id]) => wanted.has(id)).map(([, manifest]) => manifest));
}

export const TARGET_REGISTRY_SCHEMA_VERSION = 2;
