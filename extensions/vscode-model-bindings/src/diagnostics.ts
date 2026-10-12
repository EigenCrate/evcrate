import {
  ACTOR_ID_PATTERN,
  CompanionContractError,
  STORAGE_AND_SOURCE_BOUNDS,
  VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1
} from './runtime-contracts.js';
import {
  type CatalogModelDescriptor,
  type EffectiveActorBindingResult,
  type VscodeModelBindingsV1
} from './binding-contracts.js';
import { resolveInventoryBindings } from './binding-resolver.js';
import {
  validateRuntimeDiagnosticsV1,
  type VscodeRuntimeDiagnosticsV1
} from './diagnostics-contracts.js';
import {
  CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE,
  formatStorageCleanupGuidance
} from './storage-accounting.js';

export { CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE };

export const CACHED_SELECTION_RESELECTION_GUIDANCE =
  'Provider refresh updates contributed inventory and newly discovered actors. Already-selected cached chat agents may execute a previous model until you explicitly reselect the agent in the chat picker or reload the window (Developer: Reload Window).' as const;

export interface BuildRuntimeDiagnosticsInput {
  readonly rootIdentity: string | null;
  readonly authority: 'local-file' | 'unsupported-remote';
  readonly instanceUuid: string;
  readonly generationId: number;
  readonly baseStorageFsPath?: string | null;
  readonly bindingRevision?: number;
  readonly catalogRevision?: number;
  readonly templateInventorySha256?: string | null;
  readonly manifestActors?: Readonly<Record<string, { readonly intent?: unknown }>> | null;
  readonly rootBindings?: VscodeModelBindingsV1 | null;
  readonly userBindings?: VscodeModelBindingsV1 | null;
  readonly catalog?: readonly CatalogModelDescriptor[] | null;
  readonly publishedActorIds?: ReadonlySet<string> | readonly string[] | null;
  readonly withheldReasons?: Readonly<Record<string, string>> | null;
  readonly hostObservedModels?: Readonly<Record<string, string | null>> | null;
  readonly setupOrInvalidationReason?: string | null;
  readonly storageExhausted?: boolean;
  readonly corruptBindingsError?: string | null;
}

export interface RuntimeDiagnosticsReport {
  readonly diagnostics: VscodeRuntimeDiagnosticsV1;
  readonly generationId: number;
  readonly rootBindingRevision: number;
  readonly userBindingRevision: number;
  readonly contributedActors: readonly string[];
  readonly withheldActors: readonly string[];
  readonly removedStoredActors: readonly string[];
  readonly setupOrInvalidationReason: string | null;
  readonly storageExhausted: boolean;
  readonly reselectionGuidance: string;
  readonly storageCleanupGuidance: string | null;
}

function sanitizeDiagnosticReason(raw: string): string {
  const cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F]/gu, ' ').trim();
  if (cleaned === '') return 'WITHHELD';
  return cleaned.length > 512 ? cleaned.slice(0, 512) : cleaned;
}

export function buildRuntimeDiagnosticsSnapshot(
  input: BuildRuntimeDiagnosticsInput
): RuntimeDiagnosticsReport {
  const manifestActors = input.manifestActors ?? {};
  const manifestKeys = Object.keys(manifestActors);
  if (manifestKeys.length > STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', 'Diagnostics actor count exceeds 512 bound');
  }

  const rootBindings = input.rootBindings ?? null;
  const userBindings = input.userBindings ?? null;
  const rootBindingRevision = rootBindings?.revision ?? 0;
  const userBindingRevision = userBindings?.revision ?? 0;
  const bindingRevision = input.bindingRevision ?? (rootBindingRevision * 1_000_000 + userBindingRevision);
  const catalogRevision = input.catalogRevision ?? 0;
  const storageExhausted = Boolean(
    input.storageExhausted || input.setupOrInvalidationReason === 'STORAGE_BUDGET_EXCEEDED'
  );
  const setupOrInvalidationReason = input.corruptBindingsError
    ? sanitizeDiagnosticReason(input.corruptBindingsError)
    : input.setupOrInvalidationReason
      ? sanitizeDiagnosticReason(input.setupOrInvalidationReason)
      : null;

  const inventoryRes = resolveInventoryBindings({
    manifestActors, rootBindings, userBindings, catalog: input.catalog ?? []
  });

  const publishedSet: ReadonlySet<string> | null = input.publishedActorIds
    ? (input.publishedActorIds instanceof Set ? input.publishedActorIds : new Set(input.publishedActorIds))
    : null;

  const actors: Record<string, EffectiveActorBindingResult & { readonly hostObservedModel: string | null }> = {};
  const contributedActors: string[] = [];
  const withheldActors: string[] = [];

  for (const actorId of manifestKeys.sort()) {
    if (!ACTOR_ID_PATTERN.test(actorId) || actorId.length > 64) continue;
    const base = inventoryRes.actors[actorId];
    if (!base) continue;
    const rawObserved = input.hostObservedModels?.[actorId];
    const hostObservedModel = typeof rawObserved === 'string' && rawObserved.trim() !== ''
      ? sanitizeDiagnosticReason(rawObserved)
      : null;

    const explicitWithheld = input.withheldReasons?.[actorId];
    const notPublished = publishedSet !== null && !publishedSet.has(actorId);
    const forceWithheldReason = explicitWithheld
      ?? (setupOrInvalidationReason !== null ? setupOrInvalidationReason : null)
      ?? (notPublished && base.status === 'contributed' ? 'PROVIDER_WITHHELD' : null);

    if (base.status === 'withheld' || forceWithheldReason !== null) {
      const reason = sanitizeDiagnosticReason(forceWithheldReason ?? base.reason ?? 'WITHHELD');
      actors[actorId] = Object.freeze({
        actorId, canonicalTier: base.canonicalTier, effectiveSource: base.effectiveSource,
        selectedModel: base.selectedModel, renderedSelector: null, hostObservedModel,
        status: 'withheld', reason
      });
      withheldActors.push(actorId);
    } else {
      actors[actorId] = Object.freeze({
        actorId, canonicalTier: base.canonicalTier, effectiveSource: base.effectiveSource,
        selectedModel: base.selectedModel, renderedSelector: base.renderedSelector,
        hostObservedModel, status: 'contributed'
      });
      contributedActors.push(actorId);
    }
  }

  const storedActorIds = new Set<string>([
    ...Object.keys(rootBindings?.actors ?? {}),
    ...Object.keys(userBindings?.actors ?? {})
  ]);
  const removedStoredActors: string[] = [];
  for (const storedId of [...storedActorIds].sort()) {
    if (Object.hasOwn(manifestActors, storedId)) continue;
    removedStoredActors.push(storedId);
    if (
      ACTOR_ID_PATTERN.test(storedId)
      && storedId.length <= 64
      && Object.keys(actors).length < STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot
    ) {
      const rootEntry = rootBindings?.actors[storedId];
      const userEntry = userBindings?.actors[storedId];
      const entry = rootEntry ?? userEntry;
      const selectedModel = entry?.kind === 'model' ? Object.freeze({ vendor: entry.vendor, id: entry.id }) : null;
      actors[storedId] = Object.freeze({
        actorId: storedId, canonicalTier: null, effectiveSource: rootEntry ? 'root.actor' : 'user.actor',
        selectedModel, renderedSelector: null, hostObservedModel: null, status: 'withheld',
        reason: setupOrInvalidationReason ?? 'ACTOR_REMOVED_FROM_MANIFEST'
      });
      withheldActors.push(storedId);
    }
  }

  const validatedDiagnostics = validateRuntimeDiagnosticsV1({
    schema: VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1,
    rootIdentity: input.authority === 'local-file' ? input.rootIdentity : null,
    authority: input.authority, instanceUuid: input.instanceUuid,
    bindingRevision, catalogRevision,
    templateInventorySha256: input.templateInventorySha256 ?? null,
    cachedSelectionNotice: CACHED_SELECTION_RESELECTION_GUIDANCE,
    actors
  });

  return Object.freeze({
    diagnostics: validatedDiagnostics,
    generationId: input.generationId,
    rootBindingRevision,
    userBindingRevision,
    contributedActors: Object.freeze(contributedActors),
    withheldActors: Object.freeze(withheldActors),
    removedStoredActors: Object.freeze(removedStoredActors),
    setupOrInvalidationReason,
    storageExhausted,
    reselectionGuidance: CACHED_SELECTION_RESELECTION_GUIDANCE,
    storageCleanupGuidance: storageExhausted ? formatStorageCleanupGuidance(input.baseStorageFsPath) : null
  });
}
