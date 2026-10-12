import {
  isPlainObject
} from './runtime-contracts.js';
import {
  CANONICAL_TIERS,
  resolveEffectiveActorBinding,
  type CanonicalModelTier,
  type CatalogModelDescriptor,
  type EffectiveActorBindingResult,
  type VscodeModelBindingsV1
} from './binding-contracts.js';

export interface ActorIntentRecord {
  readonly mode: 'tier' | 'inherit';
  readonly tier: CanonicalModelTier | null;
}

export interface InventoryResolutionResult {
  readonly actors: Readonly<Record<string, EffectiveActorBindingResult>>;
  readonly contributedCount: number;
  readonly withheldCount: number;
  readonly withheldReasons: Readonly<Record<string, string>>;
}

export function parseActorCanonicalTier(rawIntent: unknown): { readonly ok: true; readonly tier: CanonicalModelTier | null } | { readonly ok: false; readonly reason: string } {
  if (rawIntent === undefined) {
    return Object.freeze({ ok: true, tier: null });
  }
  if (!isPlainObject(rawIntent)) {
    return Object.freeze({ ok: false, reason: 'INVALID_INTENT_OBJECT' });
  }
  const mode = rawIntent.mode;
  const tier = rawIntent.tier;
  if (mode === 'inherit') {
    if (tier !== null && tier !== undefined) {
      return Object.freeze({ ok: false, reason: 'INHERIT_WITH_TIER' });
    }
    return Object.freeze({ ok: true, tier: null });
  }
  if (mode === 'tier') {
    if (typeof tier !== 'string' || !Object.hasOwn(CANONICAL_TIERS, tier)) {
      return Object.freeze({ ok: false, reason: 'UNKNOWN_TIER' });
    }
    return Object.freeze({ ok: true, tier: tier as CanonicalModelTier });
  }
  return Object.freeze({ ok: false, reason: 'UNKNOWN_INTENT_MODE' });
}

export function resolveInventoryBindings(input: {
  readonly manifestActors: Readonly<Record<string, { readonly intent?: unknown }>>;
  readonly rootBindings: VscodeModelBindingsV1 | null;
  readonly userBindings: VscodeModelBindingsV1 | null;
  readonly catalog: readonly CatalogModelDescriptor[];
}): InventoryResolutionResult {
  const { manifestActors, rootBindings, userBindings, catalog } = input;
  const actorsResult: Record<string, EffectiveActorBindingResult> = {};
  const withheldReasons: Record<string, string> = {};
  let contributedCount = 0;
  let withheldCount = 0;

  for (const [actorId, actorEntry] of Object.entries(manifestActors)) {
    const rawIntent = isPlainObject(actorEntry) ? actorEntry.intent : undefined;
    const tierResult = parseActorCanonicalTier(rawIntent);
    if (!tierResult.ok) {
      const result: EffectiveActorBindingResult = Object.freeze({
        actorId,
        canonicalTier: null,
        effectiveSource: 'unresolved',
        selectedModel: null,
        renderedSelector: null,
        status: 'withheld',
        reason: tierResult.reason
      });
      actorsResult[actorId] = result;
      withheldReasons[actorId] = tierResult.reason;
      withheldCount++;
      continue;
    }

    const effective = resolveEffectiveActorBinding({
      actorId,
      canonicalTier: tierResult.tier,
      rootBindings,
      userBindings,
      catalog
    });

    actorsResult[actorId] = effective;
    if (effective.status === 'contributed') {
      contributedCount++;
    } else {
      withheldCount++;
      if (effective.reason) {
        withheldReasons[actorId] = effective.reason;
      }
    }
  }

  return Object.freeze({
    actors: Object.freeze(actorsResult),
    contributedCount,
    withheldCount,
    withheldReasons: Object.freeze(withheldReasons)
  });
}
