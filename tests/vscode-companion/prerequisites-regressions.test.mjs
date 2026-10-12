import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CompanionContractError,
  STORAGE_AND_SOURCE_BOUNDS,
  VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1,
  validateLocalRootUri,
  validateRuntimeDiagnosticsV1
} from '../../.cache/evcrate/vscode-model-bindings-dist/contracts.js';
import * as bindingContracts from '../../.cache/evcrate/vscode-model-bindings-dist/binding-contracts.js';

test('W-A: validateLocalRootUri produces idempotent rootIdentity across %, ?, #, spaces, Unicode, and Windows drives', () => {
  const cases = [
    { input: 'file:///a/x%3Fy', expectedPath: '/a/x?y', expectedIdentity: 'file:///a/x%3Fy' },
    { input: 'file:///a/x%23y', expectedPath: '/a/x#y', expectedIdentity: 'file:///a/x%23y' },
    { input: 'file:///a/50%25', expectedPath: '/a/50%', expectedIdentity: 'file:///a/50%25' },
    { input: 'file:///a/50%2525', expectedPath: '/a/50%25', expectedIdentity: 'file:///a/50%2525' },
    { input: { scheme: 'file', path: '/a/x?y#z' }, expectedPath: '/a/x?y#z', expectedIdentity: 'file:///a/x%3Fy%23z' },
    { input: { scheme: 'file', path: '/a/50%' }, expectedPath: '/a/50%', expectedIdentity: 'file:///a/50%25' },
    { input: 'file:///home/user/my%20dir', expectedPath: '/home/user/my dir', expectedIdentity: 'file:///home/user/my dir' },
    { input: { scheme: 'file', path: '/home/user/my dir' }, expectedPath: '/home/user/my dir', expectedIdentity: 'file:///home/user/my dir' },
    { input: 'file:///c:/Users/User%20Name/repo', expectedPath: '/c:/Users/User Name/repo', expectedIdentity: 'file:///c:/Users/User Name/repo' },
    { input: 'file:///C:/Users/Repo/', expectedPath: '/c:/Users/Repo', expectedIdentity: 'file:///c:/Users/Repo' },
    { input: { scheme: 'file', path: '/home/user/プロジェクト' }, expectedPath: '/home/user/プロジェクト', expectedIdentity: 'file:///home/user/プロジェクト' }
  ];

  for (const c of cases) {
    const first = validateLocalRootUri(c.input);
    assert.equal(first.path, c.expectedPath);
    assert.equal(first.rootIdentity, c.expectedIdentity);
    const second = validateLocalRootUri(first.rootIdentity);
    assert.equal(second.path, first.path);
    assert.equal(second.rootIdentity, first.rootIdentity);
  }

  // Reject literal and percent-encoded control characters
  assert.throws(() => validateLocalRootUri('file:///a/x%0Ay'), { code: 'PATH_UNSAFE' });
  assert.throws(() => validateLocalRootUri('file:///a/x%00y'), { code: 'PATH_UNSAFE' });
  assert.throws(() => validateLocalRootUri('file:///a/x%1Fy'), { code: 'PATH_UNSAFE' });
  assert.throws(() => validateLocalRootUri('file:///a/x%7Fy'), { code: 'PATH_UNSAFE' });
  assert.throws(() => validateLocalRootUri({ scheme: 'file', path: '/a/x\ny' }), { code: 'PATH_UNSAFE' });
  assert.throws(() => validateLocalRootUri({ scheme: 'file', path: '/a/x\0y' }), { code: 'PATH_UNSAFE' });
  assert.throws(() => validateLocalRootUri({ scheme: 'file', path: '/a/x\x7fy' }), { code: 'PATH_UNSAFE' });
});

test('W-B: binding-contracts leaf module provides core binding types without circular imports', () => {
  assert.equal(typeof bindingContracts.validateModelIdentity, 'function');
  assert.equal(typeof bindingContracts.validateBindingsV1, 'function');
  assert.equal(typeof bindingContracts.formatCatalogSelector, 'function');
  assert.equal(typeof bindingContracts.resolveCatalogModelSelector, 'function');
  assert.equal(typeof bindingContracts.resolveEffectiveActorBinding, 'function');
  assert.deepEqual(bindingContracts.CANONICAL_TIERS, { opus: true, sonnet: true, haiku: true });
});

test('W-C: validateRuntimeDiagnosticsV1 enforces <=512 actor bounds, string limits, and coherence', () => {
  const baseValidActor = {
    actorId: 'evc-planner',
    canonicalTier: 'opus',
    effectiveSource: 'canonical.inherit',
    selectedModel: null,
    renderedSelector: null,
    hostObservedModel: null,
    status: 'contributed'
  };

  const makeDiag = (actors, notice = 'Notice text') => ({
    schema: VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1,
    rootIdentity: 'file:///work/.evcrate-vscode',
    authority: 'local-file',
    instanceUuid: '11111111-2222-4333-8444-555555555555',
    bindingRevision: 1,
    catalogRevision: 1,
    templateInventorySha256: null,
    cachedSelectionNotice: notice,
    actors
  });

  // Valid inherited contribution without selector
  assert.doesNotThrow(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': baseValidActor })));

  // Notice string length > 2048 rejected
  assert.throws(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': baseValidActor }, 'x'.repeat(2049))), {
    code: 'CONTRACT_INVALID'
  });

  // Notice empty or whitespace rejected
  assert.throws(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': baseValidActor }, '   ')), {
    code: 'CONTRACT_INVALID'
  });

  // 512 actors accepted
  const maxActors = {};
  for (let i = 0; i < 512; i++) {
    const id = `evc-actor-${i}`;
    maxActors[id] = { ...baseValidActor, actorId: id };
  }
  assert.doesNotThrow(() => validateRuntimeDiagnosticsV1(makeDiag(maxActors)));

  // 513 actors rejected with BOUNDS_EXCEEDED
  const overActors = { ...maxActors, 'evc-actor-extra': { ...baseValidActor, actorId: 'evc-actor-extra' } };
  assert.throws(() => validateRuntimeDiagnosticsV1(makeDiag(overActors)), { code: 'BOUNDS_EXCEEDED' });

  // Withheld without reason rejected
  const withheldNoReason = {
    ...baseValidActor,
    status: 'withheld',
    effectiveSource: 'unresolved'
  };
  assert.throws(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': withheldNoReason })), {
    code: 'CONTRACT_INVALID'
  });

  // Withheld with renderedSelector rejected
  const withheldWithSelector = {
    ...baseValidActor,
    status: 'withheld',
    reason: 'MODEL_NOT_FOUND',
    renderedSelector: 'Some Model (vendor)'
  };
  assert.throws(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': withheldWithSelector })), {
    code: 'CONTRACT_INVALID'
  });

  // Withheld with reason and null selector accepted
  const withheldValid = {
    ...baseValidActor,
    status: 'withheld',
    reason: 'TIER_UNBOUND',
    renderedSelector: null
  };
  assert.doesNotThrow(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': withheldValid })));

  // Contributed with non-inherit source but null renderedSelector rejected
  const contributedBadSource = {
    ...baseValidActor,
    effectiveSource: 'root.tier',
    renderedSelector: null
  };
  assert.throws(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': contributedBadSource })), {
    code: 'CONTRACT_INVALID'
  });

  // Contributed with pinned renderedSelector accepted
  const contributedPinned = {
    ...baseValidActor,
    effectiveSource: 'root.tier',
    renderedSelector: 'Claude Sonnet (copilot)',
    selectedModel: { vendor: 'copilot', id: 'claude-sonnet' }
  };
  assert.doesNotThrow(() => validateRuntimeDiagnosticsV1(makeDiag({ 'evc-planner': contributedPinned })));
});
