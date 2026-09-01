import type { JsonValue } from '../protocol/json.js';
import type { PersistedTarget } from '../protocol/validation.js';
import type { ResourceCompatibilityStatus, ResourceKind } from '../manifests/types.js';

export interface RegistryCompatibilityEntry {
  readonly status: ResourceCompatibilityStatus;
  readonly reason?: string;
}
export type RegistryCompatibility = Readonly<Record<PersistedTarget, RegistryCompatibilityEntry>>;

export interface ResourceRecord {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly source_path: string;
  readonly content_hash: string;
  readonly origin: string;
  readonly compatibility: RegistryCompatibility;
  readonly capabilities: readonly string[];
  readonly model_metadata?: JsonValue;
  readonly revision: number;
}
export interface RegistryDocument {
  readonly schema_version: 1;
  readonly revision: number;
  readonly resources: readonly ResourceRecord[];
}
export interface RegistryFileRevision {
  readonly kind: 'present' | 'absent';
  readonly identity: string;
}
export interface ResourceRegistry {
  readonly path: string;
  readonly document: RegistryDocument;
  readonly fileRevision: RegistryFileRevision;
}
export interface ResourceQueryFilters {
  readonly kind?: ResourceKind;
  readonly target?: PersistedTarget;
  readonly status?: ResourceCompatibilityStatus;
}
