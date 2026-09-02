import type { PersistedTarget } from '../protocol/validation.js';
export const RESOURCE_KINDS = Object.freeze(['skill', 'agent', 'workflow', 'command', 'hook'] as const);
export type ResourceKind = typeof RESOURCE_KINDS[number];
export type ResourceRootMap = Readonly<Record<ResourceKind, string>>;
export const RESOURCE_COMPATIBILITY_STATUSES = Object.freeze(['native', 'needsAdapter', 'unsupported'] as const);
export type ResourceCompatibilityStatus = typeof RESOURCE_COMPATIBILITY_STATUSES[number];


export interface PatchSpec {
  readonly source: string;
  readonly destination: string;
  readonly keys: readonly string[];
}

export interface SharedJsonSpec {
  readonly schema: 'pi-settings-v1' | 'managed-json-v1';
  readonly destination: string;
  readonly fragment: string;
  readonly managedKeys: readonly string[];
}

export const HOME_PUBLICATION_RULES = Object.freeze([
  'omp-agent-prefix',
  'codex-home-path-rewrite',
  'claude-skill-root-exclusion'
] as const);
export type HomePublicationRule = typeof HOME_PUBLICATION_RULES[number];

export interface HomePolicy {
  readonly bindings: Readonly<Record<string, string>>;
  readonly preservePaths: Readonly<Record<string, readonly string[]>>;
  readonly promotionOrder: number;
  readonly rejectUnmanagedCollisions: boolean;
  readonly publicationRules: readonly HomePublicationRule[];
  readonly [key: string]: unknown;
}

export interface TargetManifest {
  readonly id: string;
  readonly name: string;
  readonly manifestPath: string;
  readonly adapter: string | null;
  readonly adapterSources: readonly string[];
  readonly outputRoots: readonly string[];
  readonly ownedPaths: readonly string[];
  readonly patches: readonly PatchSpec[];
  readonly projectDocs: readonly string[];
  readonly homePolicy: HomePolicy;
  readonly sourceRoot: string;
  readonly overlayRoot: string | null;
  readonly sharedJson: SharedJsonSpec | null;
}

export interface TargetManifestRegistry {
  readonly registryPath: string;
  readonly targets: ReadonlyMap<PersistedTarget, TargetManifest>;
  readonly resourceRoots: ResourceRootMap;
}

export interface BuildManifest {
  readonly schema_version: 2;
  readonly source_hashes: Readonly<Record<string, string>>;
  readonly adapter_hashes: Readonly<Record<string, string>>;
  readonly controller_hashes: Readonly<Record<string, string>>;
  readonly owners: Readonly<Record<string, string>>;
  readonly output_hashes: Readonly<Record<string, string>>;
  readonly validation: Readonly<Record<string, unknown>>;
  readonly home_policy: Readonly<Record<string, unknown>>;
}
