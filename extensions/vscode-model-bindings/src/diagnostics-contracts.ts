import {
  ACTOR_ID_PATTERN,
  CompanionContractError,
  SHA256_HEX,
  UUID_V4,
  VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1,
  isPlainObject,
  validateLocalRootUri
} from './runtime-contracts.js';
import {
  CANONICAL_TIERS,
  EFFECTIVE_SOURCES,
  validateModelIdentity,
  type CanonicalModelTier,
  type EffectiveActorBindingResult,
  type EffectiveBindingSource
} from './contracts.js';

export interface VscodeRuntimeDiagnosticsV1 {
  readonly schema: typeof VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1;
  readonly rootIdentity: string | null;
  readonly authority: 'local-file' | 'unsupported-remote';
  readonly instanceUuid: string;
  readonly bindingRevision: number;
  readonly catalogRevision: number;
  readonly templateInventorySha256: string | null;
  readonly cachedSelectionNotice: string;
  readonly actors: Readonly<Record<string, EffectiveActorBindingResult & { readonly hostObservedModel: string | null }>>;
}

const ALLOWED_TOP_KEYS: Record<string, true> = {
  schema: true,
  rootIdentity: true,
  authority: true,
  instanceUuid: true,
  bindingRevision: true,
  catalogRevision: true,
  templateInventorySha256: true,
  cachedSelectionNotice: true,
  actors: true
};

const ALLOWED_ACTOR_KEYS: Record<string, true> = {
  actorId: true,
  canonicalTier: true,
  effectiveSource: true,
  selectedModel: true,
  renderedSelector: true,
  hostObservedModel: true,
  status: true,
  reason: true
};

export function validateRuntimeDiagnosticsV1(input: unknown): VscodeRuntimeDiagnosticsV1 {
  if (!isPlainObject(input) || input.schema !== VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1) {
    throw new CompanionContractError('SCHEMA_UNSUPPORTED', 'Invalid runtime diagnostics schema');
  }
  if (Object.keys(input).some((k) => !Object.hasOwn(ALLOWED_TOP_KEYS, k))) {
    throw new CompanionContractError('CONTRACT_INVALID', 'Unexpected key in runtime diagnostics');
  }
  const rootIdentity = input.rootIdentity === null
    ? null
    : typeof input.rootIdentity === 'string'
      ? validateLocalRootUri(input.rootIdentity).rootIdentity
      : undefined;
  if (
    rootIdentity === undefined
    || (input.authority !== 'local-file' && input.authority !== 'unsupported-remote')
    || typeof input.instanceUuid !== 'string'
    || !UUID_V4.test(input.instanceUuid)
  ) {
    throw new CompanionContractError('CONTRACT_INVALID', 'Invalid diagnostics rootIdentity, authority, or instanceUuid');
  }
  if (
    typeof input.bindingRevision !== 'number'
    || !Number.isSafeInteger(input.bindingRevision)
    || input.bindingRevision < 0
    || typeof input.catalogRevision !== 'number'
    || !Number.isSafeInteger(input.catalogRevision)
    || input.catalogRevision < 0
  ) {
    throw new CompanionContractError('CONTRACT_INVALID', 'Invalid diagnostics revision numbers');
  }
  if (
    input.templateInventorySha256 !== null
    && (typeof input.templateInventorySha256 !== 'string' || !SHA256_HEX.test(input.templateInventorySha256))
  ) {
    throw new CompanionContractError('HASH_MISMATCH', 'Invalid diagnostics templateInventorySha256');
  }
  if (typeof input.cachedSelectionNotice !== 'string' || input.cachedSelectionNotice.trim() === '' || !isPlainObject(input.actors)) {
    throw new CompanionContractError('CONTRACT_INVALID', 'Invalid diagnostics cachedSelectionNotice or actors');
  }
  const actors: Record<string, EffectiveActorBindingResult & { readonly hostObservedModel: string | null }> = {};
  for (const [actorId, d] of Object.entries(input.actors)) {
    if (
      actorId.length > 64
      || !ACTOR_ID_PATTERN.test(actorId)
      || !isPlainObject(d)
      || Object.keys(d).some((k) => !Object.hasOwn(ALLOWED_ACTOR_KEYS, k))
    ) {
      throw new CompanionContractError('CONTRACT_INVALID', `Invalid actor diagnostic entry "${actorId}"`);
    }
    if (
      d.actorId !== actorId
      || !Object.hasOwn(EFFECTIVE_SOURCES, String(d.effectiveSource))
      || (d.canonicalTier !== null && !Object.hasOwn(CANONICAL_TIERS, String(d.canonicalTier)))
    ) {
      throw new CompanionContractError('CONTRACT_INVALID', `Invalid actorId, tier, or effectiveSource for "${actorId}"`);
    }
    if (
      !('hostObservedModel' in d)
      || (d.hostObservedModel !== null && (typeof d.hostObservedModel !== 'string' || d.hostObservedModel.trim() === ''))
    ) {
      throw new CompanionContractError('CONTRACT_INVALID', `Actor diagnostic "${actorId}" must separately label hostObservedModel`);
    }
    if (
      (d.renderedSelector !== null && (typeof d.renderedSelector !== 'string' || d.renderedSelector.trim() === ''))
      || (d.status !== 'contributed' && d.status !== 'withheld')
      || (d.reason !== undefined && (typeof d.reason !== 'string' || d.reason.trim() === ''))
    ) {
      throw new CompanionContractError('CONTRACT_INVALID', `Invalid selector, status, or reason for "${actorId}"`);
    }
    const selectedModel = d.selectedModel === null ? null : validateModelIdentity(d.selectedModel, `diagnostics.actors.${actorId}`);
    actors[actorId] = Object.freeze({
      actorId,
      canonicalTier: d.canonicalTier as CanonicalModelTier | null,
      effectiveSource: d.effectiveSource as EffectiveBindingSource,
      selectedModel,
      renderedSelector: d.renderedSelector as string | null,
      hostObservedModel: d.hostObservedModel as string | null,
      status: d.status as 'contributed' | 'withheld',
      ...(d.reason !== undefined ? { reason: d.reason as string } : {})
    });
  }
  return Object.freeze({
    schema: VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1,
    rootIdentity,
    authority: input.authority,
    instanceUuid: input.instanceUuid,
    bindingRevision: input.bindingRevision,
    catalogRevision: input.catalogRevision,
    templateInventorySha256: input.templateInventorySha256 as string | null,
    cachedSelectionNotice: input.cachedSelectionNotice,
    actors: Object.freeze(actors)
  });
}
