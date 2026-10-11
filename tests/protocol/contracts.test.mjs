import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalJson, decodeUtf8, parseJsonDocument, normalizeTarget, PERSISTED_TARGETS,
  RESOURCE_OPERATIONS, safePath, validateResourceRequest, validateResourceResult, createResourceRequest,
  validateResourceRequestPayload, validateResourceResultPayload, validateScopeRequestPayload,
  validateScopeResultPayload, validateScopeRevisionVector, validatePublishRequestPayload,
  validatePublishDryRunResultPayload, validatePublishApplyResultPayload, validateRecoverRequestPayload,
  validateRecoverResultPayload, publicationStateLayout
} from '../../dist/protocol/index.js';
import { ControlPlaneError, exitCodeForError, serializeControlPlaneError } from '../../dist/errors/index.js';

const context = {
  canonicalSourceRoot: '/s', targetManifestPath: '/m', generatedRoot: '/g', homeRoot: '/h',
  stateRoot: '/state', projectId: 'p1', projectRoot: '/project', target: 'agy'
};
const contractFixtures = JSON.parse(readFileSync(
  new URL('../fixtures/control-plane-v1/contracts.json', import.meta.url), 'utf8'
));
const negativeProxyFixtures = JSON.parse(readFileSync(
  new URL('../fixtures/control-plane-v1/negative-proxy.json', import.meta.url), 'utf8'
));
const resourceV1Fixtures = JSON.parse(readFileSync(
  new URL('../fixtures/resource-registry-v1/payloads.json', import.meta.url), 'utf8'
));

test('canonical JSON sorts objects, preserves arrays, omits undefined object fields', () => {
  assert.equal(canonicalJson({ z: 1, a: { d: 2, b: 1 }, list: [3, 2] }), '{"a":{"b":1,"d":2},"list":[3,2],"z":1}');
  assert.equal(canonicalJson({ present: true, omitted: undefined }), '{"present":true}');
});
test('canonical JSON matches Python float notation and code-point key order', () => {
  const parsed = parseJsonDocument('{"z":1.0,"neg":-0.0,"large":1e16,"tiny":1e-5}');
  assert.equal(canonicalJson(parsed), '{"large":1e+16,"neg":-0.0,"tiny":1e-05,"z":1.0}');
  assert.equal(canonicalJson({
    a: 3, [String.fromCodePoint(0xe000)]: 2, [String.fromCodePoint(0x10000)]: 1
  }), '{"a":3,"":2,"𐀀":1}');
  assert.equal(canonicalJson({ largeFloat: 1e16, hugeFloat: 1e20 }), '{"hugeFloat":1e+20,"largeFloat":1e+16}');
  assert.equal(canonicalJson(parseJsonDocument('{"integer":9007199254740993}')), '{"integer":9007199254740993}');
});
test('canonical JSON and parser reject unpaired surrogates and primitive roots', () => {
  assert.throws(() => canonicalJson({ value: '\ud800' }));
  assert.throws(() => canonicalJson({ value: '\udc00' }));
  assert.throws(() => parseJsonDocument('{"value":"\\uD800"}'));
  assert.doesNotThrow(() => parseJsonDocument('{"value":"\\uD83D\\uDE00"}'));
  assert.throws(() => parseJsonDocument('1.0'));
  assert.throws(() => parseJsonDocument('-0.0'));
});

test('bounded UTF-8, strict whitespace, duplicate, and depth checks fail closed', () => {
  assert.equal(decodeUtf8(new TextEncoder().encode('hé')), 'hé');
  assert.throws(() => decodeUtf8(Uint8Array.from([0xc3, 0x28])));
  assert.throws(() => parseJsonDocument('{"a":1,"a":2}'));
  assert.throws(() => parseJsonDocument('{"a":'.padEnd(70_000, ' ') + '1}'));
  for (const whitespace of ['\u00a0', '\u000b', '\u000c', '\ufeff']) {
    assert.throws(() => parseJsonDocument(`${whitespace}{"a":1}`));
  }
  const parsed = parseJsonDocument('{"protocol":"evcrate-resource-control","protocolVersion":1,"requestId":"r","operation":"version","__proto__":"x"}');
  assert.equal(Object.hasOwn(parsed, '__proto__'), true);
  assert.throws(() => validateResourceRequest(parsed));
});

test('target alias normalizes only at input boundary', () => {
  assert.equal(normalizeTarget('agy'), 'antigravity');
  assert.throws(() => normalizeTarget('unknown'));
  const request = createResourceRequest('r1', 'version', context, {});
  assert.equal(request.context.target, 'antigravity');
});

test('contract fixtures cover all persisted targets and result states', () => {
  for (const target of PERSISTED_TARGETS) {
    const request = createResourceRequest(`target-${target}`, 'version', { ...context, target }, {});
    assert.equal(request.context.target, target);
  }
  assert.deepEqual(validateResourceRequest(contractFixtures.resource), contractFixtures.resource);
  for (const result of contractFixtures.resourceResults) {
    assert.deepEqual(validateResourceResult(result), result);
  }
});
test('Phase 6 payload fixtures preserve exact request and token contracts', () => {
  for (const [operation, payload] of [
    ['resources.list', resourceV1Fixtures.list],
    ['resources.get', resourceV1Fixtures.get],
    ['imports.preview', resourceV1Fixtures.preview],
    ['imports.apply', resourceV1Fixtures.apply]
  ]) {
    assert.deepEqual(validateResourceRequestPayload(operation, payload), payload);
  }
  assert.throws(() => validateResourceRequestPayload('resources.list', { ...resourceV1Fixtures.list, extra: true }));
  assert.throws(() => validateResourceRequestPayload('imports.apply', { previewToken: 'opaque-token' }));
  assert.throws(() => validateResourceRequestPayload('imports.preview', {
    ...resourceV1Fixtures.preview, destination: 'a'.repeat(4097)
  }));
  const preview = contractFixtures.resourceResults.find(({ operation }) => operation === 'imports.preview');
  assert.ok(preview);
  assert.deepEqual(validateResourceResultPayload('imports.preview', preview.payload), preview.payload);
});

test('scope revisions are explicit and mutable model operations stay unsupported', () => {
  const vector = { registryRevision: 4, globalScopeRevision: 2, projectScopeRevision: 1 };
  assert.deepEqual(validateScopeRevisionVector(vector), vector);
  assert.throws(() => validateScopeRevisionVector({ ...vector, extra: true }));
  const version = createResourceRequest('scope-contract', 'version', context, {});
  assert.throws(() => validateResourceRequest({ ...version, operation: 'models.set' }), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => validateScopeRequestPayload('scopes.assign', {
    resourceId: 'agent:agents/a.md', targets: ['claude'], capabilityApprovals: [],
    expectedRevision: vector, unexpected: true
  }));
});

test('proxy fixture matrix rejects counsel fields in every control-plane family', () => {
  for (const request of negativeProxyFixtures.resource) assert.throws(() => validateResourceRequest(request));
});

test('stable exit bands and mutation boundaries stay explicit', () => {
  for (const [code, exitCode] of [
    ['OK', 0], ['PROTOCOL_INVALID', 2], ['VALIDATION_INVALID', 3],
    ['CAS_CONFLICT', 4], ['PUBLICATION_FAILED', 5], ['INTERNAL_ERROR', 6]
  ]) {
    assert.equal(exitCodeForError(new ControlPlaneError(code)), exitCode);
  }
  assert.throws(() => createResourceRequest('oversized', 'version', context, { value: 'x'.repeat(65536) }));
});

test('resource context and exact envelope reject counsel proxy fields', () => {
  const request = createResourceRequest('r2', 'resources.list', { ...context, target: 'omp' }, { filters: {}, cursor: null, limit: 50 });
  assert.equal(request.context.target, 'omp');
  assert.throws(() => validateResourceRequest({ ...request, question: 'counsel' }));
  assert.throws(() => validateResourceRequest({ ...request, payload: { backend: 'codex' } }));
});


test('stable error mapping has no path or secret fields', () => {
  const error = new ControlPlaneError('CAS_CONFLICT');
  assert.equal(exitCodeForError(error), 4);
  assert.deepEqual(Object.keys(serializeControlPlaneError(error)).sort(), ['action', 'category', 'code', 'message'].sort());
  assert.equal(exitCodeForError(new Error('raw stderr /secret')), 6);
  assert.equal(new ControlPlaneError('toString').code, 'INTERNAL_ERROR');
  assert.equal(new ControlPlaneError('__proto__').code, 'INTERNAL_ERROR');
});

test('canonical JSON rejects escaped controls and nested array overflow', () => {
  assert.throws(() => parseJsonDocument('"\\u0001"'));
  assert.throws(() => canonicalJson({ value: '\u007f' }));
  let nested = [];
  for (let index = 0; index < 18; index += 1) nested = [nested];
  assert.throws(() => canonicalJson(nested));
});

test('safe paths and resource results reject traversal, metadata, protocol, and credentials', () => {
  const foreignPath = process.platform === 'win32' ? 'C:workspace' : 'C:/workspace';
  for (const unsafe of ['relative', '/workspace/./source', '/workspace//source', '/workspace/../source',
    foreignPath, '/workspace/.git/config', '/workspace/.env']) {
    assert.throws(() => safePath(unsafe));
  }
  assert.equal(safePath('/'), '/');
  const result = contractFixtures.resourceResults[0];
  assert.throws(() => validateResourceResult({ ...result, protocolVersion: 2 }));
  assert.throws(() => validateResourceResult({ ...result, payload: { token: 'opaque' } }));
});

test('public protocol target and operation inventories are immutable', () => {
  assert.equal(Object.isFrozen(PERSISTED_TARGETS), true);
  assert.equal(Object.isFrozen(RESOURCE_OPERATIONS), true);
});

test('Phase 8 publication payloads enforce scope, phase order, identity, and empty recovery', () => {
  assert.deepEqual(validatePublishRequestPayload({
    scope: 'home', selectedTargets: ['agy']
  }), { scope: 'home', selectedTargets: ['antigravity'] });
  assert.throws(() => validatePublishRequestPayload({
    scope: 'home', selectedTargets: ['gemini']
  }), (error) => error.code === 'CAPABILITY_UNSUPPORTED');
  assert.deepEqual(validateRecoverRequestPayload({
    scope: 'home', projectIdentity: null, releaseId: 'release-1'
  }), { scope: 'home', projectIdentity: null, releaseId: 'release-1' });
  const change = {
    target: 'omp', path: '.omp/agent/alpha.md', action: 'create',
    beforeHash: null, intendedHash: 'a'.repeat(64)
  };
  const dryRun = {
    scope: 'home', projectIdentity: null,
    buildManifestPath: '.evcrate/build-manifest-omp.json', buildManifestDigest: 'b'.repeat(64),
    phases: [
      { phase: 'harness', scope: 'home', selectedTargets: ['omp'], bindingOrder: ['.omp'], changes: [change] }
    ]
  };
  assert.deepEqual(validatePublishDryRunResultPayload(dryRun), dryRun);
  const dryRunWithLeftovers = {
    ...dryRun,
    legacyLeftovers: [{ target: 'omp', path: 'commands/cmd-code.md', kind: 'command' }]
  };
  assert.deepEqual(validatePublishDryRunResultPayload(dryRunWithLeftovers), dryRunWithLeftovers);
  const nativeCopilotProject = {
    ...dryRun, scope: 'project', projectIdentity: 'c'.repeat(64),
    phases: [{
      phase: 'harness', scope: 'project', selectedTargets: ['copilot'],
      bindingOrder: ['.copilot', '.github/copilot-instructions.md'],
      changes: [{ ...change, target: 'copilot', path: '.github/copilot-instructions.md' }]
    }]
  };
  assert.deepEqual(validatePublishDryRunResultPayload(nativeCopilotProject), nativeCopilotProject);
  assert.throws(() => validatePublishDryRunResultPayload({
    ...nativeCopilotProject,
    phases: [{
      ...nativeCopilotProject.phases[0],
      changes: [{ ...change, target: 'copilot', path: '.github/workflows/execute.yml' }]
    }]
  }));
  const applied = {
    ...dryRun,
    phases: dryRun.phases.map((phase) => ({
      ...phase, status: 'committed', releaseId: 'release-1', retainedReleaseId: null
    }))
  };
  assert.deepEqual(validatePublishApplyResultPayload(applied), applied);
  const incompleteApply = {
    ...dryRun,
    phases: [{ ...dryRun.phases[0], status: 'failed', releaseId: null, retainedReleaseId: null }]
  };
  assert.throws(() => validatePublishApplyResultPayload(incompleteApply));
  const generatedDotfile = {
    ...dryRun,
    phases: [{
      ...dryRun.phases[0], changes: [{ ...change, path: '.omp/agent/skills/example/.gitignore' }]
    }]
  };
  assert.doesNotThrow(() => validatePublishDryRunResultPayload(generatedDotfile));
  assert.throws(() => validatePublishDryRunResultPayload({
    ...dryRun,
    phases: [{
      ...dryRun.phases[0], changes: [{ ...change, path: '.omp/.env.production' }]
    }]
  }));
  const none = { scope: 'home', projectIdentity: null, action: 'none', phases: [] };
  assert.deepEqual(validateRecoverResultPayload(none), none);
  const rolledBack = {
    scope: 'home', projectIdentity: null, action: 'recovered',
    phases: [
      { phase: 'shared', scope: 'home', releaseId: 'release-1', action: 'rolled-back', selectedTargets: [], bindingOrder: ['.evcrate/bin'] },
      { phase: 'harness', scope: 'home', releaseId: 'release-1', action: 'rolled-back', selectedTargets: ['omp'], bindingOrder: ['.omp'] }
    ]
  };
  assert.deepEqual(validateRecoverResultPayload(rolledBack), rolledBack);
  assert.throws(() => validateRecoverResultPayload({
    ...rolledBack,
    phases: [rolledBack.phases[0], { ...rolledBack.phases[1], releaseId: 'release-2' }]
  }));
  assert.throws(() => validateRecoverResultPayload({
    ...rolledBack,
    phases: [rolledBack.phases[0], { ...rolledBack.phases[1], action: 'finalized' }]
  }));
  assert.throws(() => validatePublishDryRunResultPayload({
    ...dryRun,
    phases: [{ ...dryRun.phases[0], bindingOrder: ['.omp', '.evcrate/bin'] }]
  }));
  assert.throws(() => validateRecoverResultPayload({
    ...none, phases: [rolledBack.phases[0]]
  }));
  assert.throws(() => validateRecoverResultPayload({
    ...rolledBack, phases: [rolledBack.phases[0], { ...rolledBack.phases[1], selectedTargets: [] }]
  }));
  assert.throws(() => validateRecoverResultPayload({
    ...rolledBack, phases: [rolledBack.phases[0], { ...rolledBack.phases[1], bindingOrder: [] }]
  }));
});

test('publicationStateLayout validates current and predecessor historical HOME layouts and enforces shared flag', () => {
  // 1. Current-generation historical shared HOME Codex layout includes .evcrate/bin and .agents/skills
  const curCodex = publicationStateLayout(['.evcrate/bin', '.agents/skills', '.codex'], ['codex'], 'home', true);
  assert.equal(curCodex.generation, 'current');
  assert.deepEqual(curCodex.bindingOrder, ['.evcrate/bin', '.agents/skills', '.codex']);

  // 2. Current-generation historical shared HOME OMP layout includes .evcrate/bin and .omp
  const curOmp = publicationStateLayout(['.evcrate/bin', '.omp'], ['omp'], 'home', true);
  assert.equal(curOmp.generation, 'current');
  assert.deepEqual(curOmp.bindingOrder, ['.evcrate/bin', '.omp']);

  // 3. Predecessor-generation historical shared HOME Codex layout includes .evcrate/bin and .agents
  const predCodex = publicationStateLayout(['.evcrate/bin', '.agents', '.codex'], ['codex'], 'home', true);
  assert.equal(predCodex.generation, 'predecessor');
  assert.deepEqual(predCodex.bindingOrder, ['.evcrate/bin', '.agents', '.codex']);

  // 4. Current-generation unshared HOME Codex layout excludes .evcrate/bin
  const newCodex = publicationStateLayout(['.agents/skills', '.codex'], ['codex'], 'home', false);
  assert.equal(newCodex.generation, 'current');
  assert.deepEqual(newCodex.bindingOrder, ['.agents/skills', '.codex']);

  // 5. Unshared HOME layout rejects .evcrate/bin
  assert.throws(() => publicationStateLayout(['.evcrate/bin', '.agents/skills', '.codex'], ['codex'], 'home', false));
});

