import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseActorCanonicalTier,
  resolveInventoryBindings
} from '../../.cache/evcrate/vscode-model-bindings-dist/binding-resolver.js';
import {
  resolveEffectiveActorBinding
} from '../../.cache/evcrate/vscode-model-bindings-dist/binding-contracts.js';
const CATALOG = [
  { vendor: 'copilot', id: 'claude-3-opus', name: 'Claude 3 Opus' },
  { vendor: 'copilot', id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { vendor: 'copilot', id: 'claude-3-haiku', name: 'Claude 3 Haiku' },
  { vendor: 'custom', id: 'model-a', name: 'Special Model' },
  { vendor: 'custom', id: 'model-b', name: 'Special Model' }
];

test('parseActorCanonicalTier validates intent schema', () => {
  assert.deepEqual(parseActorCanonicalTier({ mode: 'inherit', tier: null }), { ok: true, tier: null });
  assert.deepEqual(parseActorCanonicalTier({ mode: 'tier', tier: 'opus' }), { ok: true, tier: 'opus' });
  assert.deepEqual(parseActorCanonicalTier({ mode: 'tier', tier: 'sonnet' }), { ok: true, tier: 'sonnet' });
  assert.deepEqual(parseActorCanonicalTier({ mode: 'tier', tier: 'haiku' }), { ok: true, tier: 'haiku' });

  assert.equal(parseActorCanonicalTier({ mode: 'inherit', tier: 'opus' }).ok, false);
  assert.equal(parseActorCanonicalTier({ mode: 'tier', tier: 'invalid' }).ok, false);
  assert.equal(parseActorCanonicalTier(null).ok, false);
  assert.equal(parseActorCanonicalTier('string').ok, false);
});
test('resolveEffectiveActorBinding enforces full precedence chain', () => {
  const rootBindings = {
    schema: 'evcrate-vscode-bindings-v1', revision: 1,
    tiers: { opus: { vendor: 'copilot', id: 'claude-3-opus' }, sonnet: { vendor: 'copilot', id: 'claude-3.5-sonnet' } },
    actors: {
      'evc-planner': { kind: 'model', vendor: 'copilot', id: 'claude-3-haiku' },
      'evc-brainstormer': { kind: 'inherit' }
    }
  };
  const userBindings = {
    schema: 'evcrate-vscode-bindings-v1', revision: 1,
    tiers: { opus: { vendor: 'copilot', id: 'claude-3.5-sonnet' }, haiku: { vendor: 'copilot', id: 'claude-3-haiku' } },
    actors: {
      'evc-planner': { kind: 'model', vendor: 'copilot', id: 'claude-3.5-sonnet' },
      'evc-tester': { kind: 'model', vendor: 'copilot', id: 'claude-3-opus' }
    }
  };
  // 1. root.actor override beats user.actor override and root tier
  const planner = resolveEffectiveActorBinding({
    actorId: 'evc-planner',
    canonicalTier: 'opus',
    rootBindings,
    userBindings,
    catalog: CATALOG
  });
  assert.equal(planner.effectiveSource, 'root.actor');
  assert.equal(planner.status, 'contributed');
  assert.equal(planner.renderedSelector, 'Claude 3 Haiku (copilot)');

  // 2. root.actor explicit inherit beats root tier
  const brainstormer = resolveEffectiveActorBinding({
    actorId: 'evc-brainstormer',
    canonicalTier: 'opus',
    rootBindings,
    userBindings,
    catalog: CATALOG
  });
  assert.equal(brainstormer.effectiveSource, 'root.actor');
  assert.equal(brainstormer.status, 'contributed');
  assert.equal(brainstormer.renderedSelector, null);

  // 3. user.actor override beats root.tier
  const tester = resolveEffectiveActorBinding({
    actorId: 'evc-tester',
    canonicalTier: 'sonnet',
    rootBindings,
    userBindings,
    catalog: CATALOG
  });
  assert.equal(tester.effectiveSource, 'user.actor');
  assert.equal(tester.status, 'contributed');
  assert.equal(tester.renderedSelector, 'Claude 3 Opus (copilot)');

  // 4. canonical.inherit bypasses tiers
  const designer = resolveEffectiveActorBinding({
    actorId: 'evc-ui-ux-designer',
    canonicalTier: null,
    rootBindings,
    userBindings,
    catalog: CATALOG
  });
  assert.equal(designer.effectiveSource, 'canonical.inherit');
  assert.equal(designer.status, 'contributed');
  assert.equal(designer.renderedSelector, null);

  // 5. root.tier beats user.tier
  const reviewer = resolveEffectiveActorBinding({
    actorId: 'evc-code-reviewer',
    canonicalTier: 'opus',
    rootBindings,
    userBindings,
    catalog: CATALOG
  });
  assert.equal(reviewer.effectiveSource, 'root.tier');
  assert.equal(reviewer.status, 'contributed');
  assert.equal(reviewer.renderedSelector, 'Claude 3 Opus (copilot)');

  // 6. user.tier used when root tier missing
  const scout = resolveEffectiveActorBinding({
    actorId: 'evc-scout',
    canonicalTier: 'haiku',
    rootBindings,
    userBindings,
    catalog: CATALOG
  });
  assert.equal(scout.effectiveSource, 'user.tier');
  assert.equal(scout.status, 'contributed');
  assert.equal(scout.renderedSelector, 'Claude 3 Haiku (copilot)');
});

test('resolveEffectiveActorBinding handles unbound, missing, and ambiguous models', () => {
  // Unbound tier
  const unbound = resolveEffectiveActorBinding({
    actorId: 'evc-scout',
    canonicalTier: 'haiku',
    rootBindings: null,
    userBindings: null,
    catalog: CATALOG
  });
  assert.equal(unbound.effectiveSource, 'unresolved');
  assert.equal(unbound.status, 'withheld');
  assert.equal(unbound.reason, 'TIER_UNBOUND');

  // Missing catalog model
  const missing = resolveEffectiveActorBinding({
    actorId: 'evc-scout',
    canonicalTier: 'haiku',
    rootBindings: {
      schema: 'evcrate-vscode-bindings-v1',
      revision: 1,
      tiers: { haiku: { vendor: 'copilot', id: 'nonexistent-model' } },
      actors: {}
    },
    userBindings: null,
    catalog: CATALOG
  });
  assert.equal(missing.status, 'withheld');
  assert.equal(missing.reason, 'MODEL_NOT_FOUND');

  // Ambiguous catalog model
  const ambiguous = resolveEffectiveActorBinding({
    actorId: 'evc-scout',
    canonicalTier: 'haiku',
    rootBindings: {
      schema: 'evcrate-vscode-bindings-v1',
      revision: 1,
      tiers: { haiku: { vendor: 'custom', id: 'model-a' } },
      actors: {}
    },
    userBindings: null,
    catalog: CATALOG
  });
  assert.equal(ambiguous.status, 'withheld');
  assert.equal(ambiguous.reason, 'SELECTOR_AMBIGUOUS');
});

test('resolveInventoryBindings resolves manifest actors into full inventory', () => {
  const manifestActors = {
    'evc-planner': { intent: { mode: 'tier', tier: 'opus' } },
    'evc-tester': { intent: { mode: 'tier', tier: 'sonnet' } },
    'evc-scout': { intent: { mode: 'tier', tier: 'haiku' } },
    'evc-ui-ux-designer': { intent: { mode: 'inherit', tier: null } }
  };

  const userBindings = {
    schema: 'evcrate-vscode-bindings-v1',
    revision: 1,
    tiers: {
      opus: { vendor: 'copilot', id: 'claude-3-opus' },
      sonnet: { vendor: 'copilot', id: 'claude-3.5-sonnet' }
    },
    actors: {}
  };

  const res = resolveInventoryBindings({
    manifestActors,
    rootBindings: null,
    userBindings,
    catalog: CATALOG
  });

  // opus and sonnet bound, inherit bound -> 3 contributed
  // haiku unbound -> 1 withheld
  assert.equal(res.contributedCount, 3);
  assert.equal(res.withheldCount, 1);
  assert.equal(res.actors['evc-planner'].status, 'contributed');
  assert.equal(res.actors['evc-tester'].status, 'contributed');
  assert.equal(res.actors['evc-ui-ux-designer'].status, 'contributed');
  assert.equal(res.actors['evc-scout'].status, 'withheld');
  assert.equal(res.withheldReasons['evc-scout'], 'TIER_UNBOUND');
});
