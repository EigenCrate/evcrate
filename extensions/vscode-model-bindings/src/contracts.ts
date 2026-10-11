import {
  ACTOR_ID_PATTERN, CompanionContractError, STORAGE_AND_SOURCE_BOUNDS, isPlainObject
} from './runtime-contracts.js';

export * from './runtime-contracts.js';
export * from './diagnostics-contracts.js';

export type CanonicalModelTier = 'opus' | 'sonnet' | 'haiku';
export const CANONICAL_TIERS: Record<CanonicalModelTier, true> = Object.freeze({ opus: true, sonnet: true, haiku: true });
export const VSCODE_BINDINGS_SCHEMA_V1 = 'evcrate-vscode-bindings-v1' as const;

export interface ModelIdentitySelection { readonly vendor: string; readonly id: string; }
export type ActorOverrideBinding =
  | { readonly kind: 'inherit' }
  | { readonly kind: 'model'; readonly vendor: string; readonly id: string };
export interface VscodeModelBindingsV1 {
  readonly schema: typeof VSCODE_BINDINGS_SCHEMA_V1;
  readonly revision: number;
  readonly tiers: Readonly<Partial<Record<CanonicalModelTier, ModelIdentitySelection>>>;
  readonly actors: Readonly<Record<string, ActorOverrideBinding>>;
}
export interface CatalogModelDescriptor {
  readonly vendor: string; readonly id: string; readonly name: string; readonly family?: string; readonly version?: string;
}
export type EffectiveBindingSource = 'root.actor' | 'user.actor' | 'canonical.inherit' | 'root.tier' | 'user.tier' | 'unresolved';
export interface EffectiveActorBindingResult {
  readonly actorId: string; readonly canonicalTier: CanonicalModelTier | null;
  readonly effectiveSource: EffectiveBindingSource; readonly selectedModel: ModelIdentitySelection | null;
  readonly renderedSelector: string | null; readonly status: 'contributed' | 'withheld'; readonly reason?: string;
}
export const EFFECTIVE_SOURCES: Record<EffectiveBindingSource, true> = {
  'root.actor': true, 'user.actor': true, 'canonical.inherit': true, 'root.tier': true, 'user.tier': true, unresolved: true
};

export function validateModelIdentity(raw: unknown, context: string): ModelIdentitySelection {
  if (!isPlainObject(raw) || Object.keys(raw).some((k) => k !== 'vendor' && k !== 'id')) {
    throw new CompanionContractError('CONTRACT_INVALID', `Invalid model identity in ${context}`);
  }
  if (typeof raw.vendor !== 'string' || raw.vendor.trim() === '' || raw.vendor.length > 128) {
    throw new CompanionContractError('CONTRACT_INVALID', `Invalid vendor in ${context}`);
  }
  if (typeof raw.id !== 'string' || raw.id.trim() === '' || raw.id.length > 256) {
    throw new CompanionContractError('CONTRACT_INVALID', `Invalid model id in ${context}`);
  }
  return Object.freeze({ vendor: raw.vendor, id: raw.id });
}

export function validateBindingsV1(input: unknown, rawByteLength?: number): VscodeModelBindingsV1 {
  if (rawByteLength !== undefined && (!Number.isSafeInteger(rawByteLength) || rawByteLength < 0)) {
    throw new CompanionContractError('CONTRACT_INVALID', 'rawByteLength must be a non-negative safe integer');
  }
  let bytes = rawByteLength;
  if (bytes === undefined) {
    try {
      bytes = new TextEncoder().encode(JSON.stringify(input ?? null)).byteLength;
    } catch {
      throw new CompanionContractError('CONTRACT_INVALID', 'Bindings input is not JSON-serializable');
    }
  }
  if (bytes > STORAGE_AND_SOURCE_BOUNDS.maxBindingsJsonBytes) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', 'Bindings JSON exceeds 64 KiB limit');
  }
  if (!isPlainObject(input)) throw new CompanionContractError('CONTRACT_INVALID', 'Bindings must be a plain object');
  if (input.schema !== VSCODE_BINDINGS_SCHEMA_V1) {
    throw new CompanionContractError('SCHEMA_UNSUPPORTED', `Unsupported bindings schema: ${String(input.schema)}`);
  }
  for (const key of Object.keys(input)) {
    if (key !== 'schema' && key !== 'revision' && key !== 'tiers' && key !== 'actors') {
      throw new CompanionContractError('CONTRACT_INVALID', `Unexpected bindings key "${key}"`);
    }
  }
  if (typeof input.revision !== 'number' || !Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new CompanionContractError('CONTRACT_INVALID', 'Bindings revision must be a positive integer');
  }
  if (!isPlainObject(input.tiers) || !isPlainObject(input.actors)) {
    throw new CompanionContractError('CONTRACT_INVALID', 'tiers and actors must be plain objects');
  }
  const tiers: Partial<Record<CanonicalModelTier, ModelIdentitySelection>> = {};
  for (const [tierKey, val] of Object.entries(input.tiers)) {
    if (!Object.hasOwn(CANONICAL_TIERS, tierKey)) {
      throw new CompanionContractError('CONTRACT_INVALID', `Unknown tier "${tierKey}"`);
    }
    tiers[tierKey as CanonicalModelTier] = validateModelIdentity(val, `tiers.${tierKey}`);
  }
  const actorKeys = Object.keys(input.actors);
  if (actorKeys.length > STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', 'Actor overrides exceed 512 limit');
  }
  const actors: Record<string, ActorOverrideBinding> = {};
  for (const [actorId, val] of Object.entries(input.actors)) {
    if (actorId.length > 64 || !ACTOR_ID_PATTERN.test(actorId) || !isPlainObject(val)) {
      throw new CompanionContractError('CONTRACT_INVALID', `Invalid actor binding "${actorId}"`);
    }
    if (val.kind === 'inherit' && Object.keys(val).length === 1) {
      actors[actorId] = Object.freeze({ kind: 'inherit' });
    } else if (val.kind === 'model' && Object.keys(val).every((k) => k === 'kind' || k === 'vendor' || k === 'id')) {
      const ident = validateModelIdentity({ vendor: val.vendor, id: val.id }, `actors.${actorId}`);
      actors[actorId] = Object.freeze({ kind: 'model', vendor: ident.vendor, id: ident.id });
    } else {
      throw new CompanionContractError('CONTRACT_INVALID', `Malformed actor override for "${actorId}"`);
    }
  }
  return Object.freeze({ schema: VSCODE_BINDINGS_SCHEMA_V1, revision: input.revision, tiers: Object.freeze(tiers), actors: Object.freeze(actors) });
}

export function formatCatalogSelector(model: Pick<CatalogModelDescriptor, 'vendor' | 'name'>): string {
  if (!model || typeof model.vendor !== 'string' || model.vendor.trim() === '' || typeof model.name !== 'string' || model.name.trim() === '') {
    throw new CompanionContractError('CONTRACT_INVALID', 'Catalog model must have non-empty name and vendor');
  }
  return `${model.name} (${model.vendor})`;
}

export function resolveCatalogModelSelector(
  catalog: readonly CatalogModelDescriptor[],
  vendor: string,
  id: string
): { readonly ok: true; readonly selector: string } | { readonly ok: false; readonly code: 'MODEL_NOT_FOUND' | 'SELECTOR_AMBIGUOUS'; readonly reason: string } {
  if (catalog.length > STORAGE_AND_SOURCE_BOUNDS.maxCatalogEntries) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', 'Catalog entries exceed 2048 bound');
  }
  const exact = catalog.filter((m) => m.vendor === vendor && m.id === id);
  if (exact.length === 0) {
    return Object.freeze({ ok: false, code: 'MODEL_NOT_FOUND', reason: `Catalog model (${vendor}, ${id}) not found` });
  }
  const chosen = exact[0];
  const colliding = catalog.filter((m) => m.vendor === chosen.vendor && m.name === chosen.name);
  const distinctIds = new Set(colliding.map((m) => m.id));
  if (distinctIds.size > 1) {
    return Object.freeze({
      ok: false, code: 'SELECTOR_AMBIGUOUS',
      reason: `Ambiguous selector "${chosen.name} (${chosen.vendor})" across IDs [${[...distinctIds].join(', ')}]`
    });
  }
  return Object.freeze({ ok: true, selector: formatCatalogSelector(chosen) });
}

export function resolveEffectiveActorBinding(input: {
  readonly actorId: string;
  readonly canonicalTier: CanonicalModelTier | null;
  readonly rootBindings: VscodeModelBindingsV1 | null;
  readonly userBindings: VscodeModelBindingsV1 | null;
  readonly catalog: readonly CatalogModelDescriptor[];
}): EffectiveActorBindingResult {
  const { actorId, canonicalTier, rootBindings, userBindings, catalog } = input;
  const resolveSelection = (sel: ModelIdentitySelection, source: EffectiveBindingSource): EffectiveActorBindingResult => {
    const res = resolveCatalogModelSelector(catalog, sel.vendor, sel.id);
    if (!res.ok) {
      return Object.freeze({ actorId, canonicalTier, effectiveSource: source, selectedModel: sel, renderedSelector: null, status: 'withheld', reason: res.code });
    }
    return Object.freeze({ actorId, canonicalTier, effectiveSource: source, selectedModel: sel, renderedSelector: res.selector, status: 'contributed' });
  };
  const rootActor = rootBindings?.actors[actorId];
  if (rootActor) {
    return rootActor.kind === 'inherit'
      ? Object.freeze({ actorId, canonicalTier, effectiveSource: 'root.actor', selectedModel: null, renderedSelector: null, status: 'contributed' })
      : resolveSelection({ vendor: rootActor.vendor, id: rootActor.id }, 'root.actor');
  }
  const userActor = userBindings?.actors[actorId];
  if (userActor) {
    return userActor.kind === 'inherit'
      ? Object.freeze({ actorId, canonicalTier, effectiveSource: 'user.actor', selectedModel: null, renderedSelector: null, status: 'contributed' })
      : resolveSelection({ vendor: userActor.vendor, id: userActor.id }, 'user.actor');
  }
  if (canonicalTier === null) {
    return Object.freeze({ actorId, canonicalTier: null, effectiveSource: 'canonical.inherit', selectedModel: null, renderedSelector: null, status: 'contributed' });
  }
  const rootTier = rootBindings?.tiers[canonicalTier];
  if (rootTier) return resolveSelection(rootTier, 'root.tier');
  const userTier = userBindings?.tiers[canonicalTier];
  if (userTier) return resolveSelection(userTier, 'user.tier');
  return Object.freeze({ actorId, canonicalTier, effectiveSource: 'unresolved', selectedModel: null, renderedSelector: null, status: 'withheld', reason: 'TIER_UNBOUND' });
}
