import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalJson, decodeUtf8, parseJsonDocument, normalizeTarget, PERSISTED_TARGETS,
  RESOURCE_OPERATIONS, ADVISOR_BACKENDS, safePath, validateResourceRequest, validateResourceResult,
  validateAdvisorPolicy, validateAdvisorSettingsRequest, validateAdvisorSettingsResult,
  canonicalAdvisorPolicyDigest, bindPreviewMetadata,
  createSettingsGetResult, createSettingsApplyResult, createSettingsConflictResult,
  createSettingsRecoveryResult, validateDiagnosticRequest, validateDiagnosticResult, createResourceRequest,
  validateResourceRequestPayload, validateResourceResultPayload, validateScopeRequestPayload,
  validateScopeResultPayload, validateScopeRevisionVector, validatePublishRequestPayload,
  validatePublishDryRunResultPayload, validatePublishApplyResultPayload, validateRecoverRequestPayload,
  validateRecoverResultPayload, PUBLICATION_BINDING_ORDER,
  CHECKPOINT_PROTOCOL_V2, CHECKPOINT_VERSION_V2, RESULT_PROTOCOL_V2, RESULT_VERSION_V2,
  CONTROLLER_PROTOCOL_V2, CONTROLLER_VERSION_V2, HISTORY_PROTOCOL_V1, HISTORY_VERSION_V1,
  validateCheckpointV2, validateResultV2, validateEnvelopeV2, validateHistoryExecutionV1,
  validateHistoryOutcomeV1, AdvisorContractError
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
  const parsed = parseJsonDocument('{"protocol":"evcrate-advisor-diagnostic","protocolVersion":1,"requestId":"r","operation":"qualify","__proto__":"x"}');
  assert.equal(Object.hasOwn(parsed, '__proto__'), true);
  assert.throws(() => validateDiagnosticRequest(parsed));
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
  assert.deepEqual(validateAdvisorSettingsRequest(contractFixtures.settings), contractFixtures.settings);
  assert.deepEqual(validateDiagnosticRequest(contractFixtures.diagnostic), contractFixtures.diagnostic);
  for (const result of contractFixtures.resourceResults) {
    assert.deepEqual(validateResourceResult(result), result);
  }
  for (const result of contractFixtures.settingsResults) {
    assert.deepEqual(validateAdvisorSettingsResult(result), result);
  }
  assert.deepEqual(validateDiagnosticResult(contractFixtures.diagnosticResult), contractFixtures.diagnosticResult);
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
  for (const request of negativeProxyFixtures.settings) assert.throws(() => validateAdvisorSettingsRequest(request));
  for (const request of negativeProxyFixtures.diagnostic) assert.throws(() => validateDiagnosticRequest(request));
});

test('stable exit bands and mutation boundaries stay explicit', () => {
  for (const [code, exitCode] of [
    ['OK', 0], ['PROTOCOL_INVALID', 2], ['VALIDATION_INVALID', 3],
    ['CAS_CONFLICT', 4], ['PUBLICATION_FAILED', 5], ['INTERNAL_ERROR', 6]
  ]) {
    assert.equal(exitCodeForError(new ControlPlaneError(code)), exitCode);
  }
  const minimum = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'm', effort: 'low' },
      backup: { backend: 'omp', model: 'm', effort: 'low' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 1000, warn_every_ms: 1000 },
    history: { retention_days: 1, max_bytes: 1048576 }
  };
  const maximum = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'm', effort: 'low' },
      backup: { backend: 'omp', model: 'm', effort: 'low' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 3600000, warn_every_ms: 3600000 },
    history: { retention_days: 365, max_bytes: 1073741824 }
  };
  assert.doesNotThrow(() => validateAdvisorPolicy(minimum));
  assert.doesNotThrow(() => validateAdvisorPolicy(maximum));
  assert.throws(() => validateAdvisorPolicy({ ...minimum, wait: { ...minimum.wait, warn_after_ms: 999 } }));
  assert.throws(() => validateAdvisorPolicy({ ...maximum, wait: { ...maximum.wait, warn_after_ms: 3600001 } }));
  assert.throws(() => createResourceRequest('oversized', 'version', context, { value: 'x'.repeat(65536) }));
});

test('resource context and exact envelope reject counsel proxy fields', () => {
  const request = createResourceRequest('r2', 'resources.list', { ...context, target: 'omp' }, { filters: {}, cursor: null, limit: 50 });
  assert.equal(request.context.target, 'omp');
  assert.throws(() => validateResourceRequest({ ...request, question: 'counsel' }));
  assert.throws(() => validateResourceRequest({ ...request, payload: { backend: 'codex' } }));
});

test('settings validates complete policy and diagnostic stays distinct', () => {
  const policy = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
  assert.deepEqual(validateAdvisorPolicy(policy), policy);
  assert.throws(() => validateAdvisorPolicy({ version: 2, advisor: { primary: { backend: 'codex' } } }));
  assert.throws(() => validateAdvisorPolicy({ ...policy, credential: 'secret' }));
  assert.throws(() => validateAdvisorSettingsRequest({ protocol: 'evcrate-advisor-settings', protocolVersion: 1, requestId: 'r3', operation: 'preview', payload: { policy: { ...policy, recommendation: 'x' }, currentRevision: { kind: 'present', identity: 'x' }, destination: '/x' } }));
  assert.deepEqual(validateDiagnosticRequest({ protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1, requestId: 'r4', operation: 'qualify' }).operation, 'qualify');
  assert.throws(() => validateDiagnosticRequest({ protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1, requestId: 'r4', operation: 'qualify', question: 'x' }));
});

test('diagnostic result exposes only correlated qualification data', () => {
  const result = validateDiagnosticResult({
    protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1, requestId: 'r5', status: 'QUALIFIED',
    target: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    probes: { version: { status: 'passed', value: '1.0.0' }, auth: { status: 'passed' }, capabilities: { status: 'passed', model: 'gpt-5.6-sol', effort: 'high', noninteractive: true, session: 'isolated', tools: 'none', output: 'json' } }
  });
  assert.equal(result.status, 'QUALIFIED');
  assert.throws(() => validateDiagnosticResult({ ...result, recommendation: 'use codex' }));
  assert.throws(() => validateDiagnosticResult({
    ...result, target: { ...result.target, model: 'other-model' }
  }));
  assert.throws(() => validateDiagnosticResult({
    ...result, probes: {
      ...result.probes,
      capabilities: { ...result.probes.capabilities, effort: 'low' }
    }
  }));
  assert.throws(() => validateDiagnosticResult({
    ...result, target: { ...result.target, backend: 'copilot' }
  }));
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

test('settings previews enforce revision correlation and bounded lifetime', () => {
  const preview = contractFixtures.settingsResults.find(({ status }) => status === 'PREVIEW');
  assert.ok(preview);
  assert.throws(() => validateAdvisorSettingsResult({
    ...preview, currentRevision: { kind: 'present', identity: 'absent' }
  }));
  assert.throws(() => validateAdvisorSettingsResult({
    ...preview, expiresAt: preview.issuedAt + 900001
  }));
  const get = contractFixtures.settingsResults.find(({ status, operation, policy }) =>
    status === 'OK' && operation === 'get' && policy !== null);
  assert.ok(get);
  assert.throws(() => validateAdvisorSettingsResult({
    ...get, mode: { kind: 'create', mode: 0o600 }
  }));
});

test('settings request size and preview binder stay document-bound', () => {
  const request = validateAdvisorSettingsRequest(contractFixtures.settings);
  const preview = contractFixtures.settingsResults.find(({ status }) => status === 'PREVIEW');
  assert.ok(preview);
  const digest = canonicalAdvisorPolicyDigest(request.payload.policy);
  assert.equal(digest, preview.intendedDigest);
  assert.deepEqual(bindPreviewMetadata(
    request, preview.token, preview.expiresAt, preview.currentRevision, digest,
    preview.destination, preview.issuedAt
  ), preview);
  assert.throws(() => bindPreviewMetadata(
    request, preview.token, preview.expiresAt,
    { kind: 'present', identity: 'sha256:other' }, digest, preview.destination, preview.issuedAt
  ));
  assert.throws(() => bindPreviewMetadata(
    request, preview.token, preview.expiresAt, preview.currentRevision, 'a'.repeat(64),
    preview.destination, preview.issuedAt
  ));
  assert.throws(() => validateAdvisorSettingsRequest({
    ...contractFixtures.settings,
    payload: { ...contractFixtures.settings.payload, destination: `/${'x'.repeat(70_000)}` }
  }), (error) => error.code === 'PROTOCOL_INVALID');
});

test('settings result factories require matching request operations', () => {
  const getRequest = validateAdvisorSettingsRequest({
    protocol: 'evcrate-advisor-settings', protocolVersion: 1, requestId: 'factory-get',
    operation: 'get', payload: {}
  });
  const previewRequest = validateAdvisorSettingsRequest(contractFixtures.settings);
  const absent = { kind: 'absent', identity: 'absent' };
  const present = { kind: 'present', identity: 'sha256:factory' };
  const recovery = { kind: 'none', identity: 'none' };
  assert.doesNotThrow(() => createSettingsGetResult(getRequest, null, absent));
  assert.throws(() => createSettingsGetResult(previewRequest, null, absent));
  assert.throws(() => createSettingsApplyResult(getRequest, present, recovery));
  assert.throws(() => createSettingsConflictResult(getRequest, present, present));
  assert.throws(() => createSettingsRecoveryResult(getRequest, present, recovery));
  assert.equal(Object.isFrozen(PERSISTED_TARGETS), true);
  assert.equal(Object.isFrozen(RESOURCE_OPERATIONS), true);
  assert.equal(Object.isFrozen(ADVISOR_BACKENDS), true);
});

test('diagnostic failures use the stable routing error catalog', () => {
  const failure = {
    protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1, requestId: null,
    status: 'FAILED', target: null,
    probes: {
      version: { status: 'not-run' }, auth: { status: 'not-run' },
      capabilities: { status: 'not-run' }
    },
    error: {
      code: 'ROUTE_POLICY_REQUIRED', category: 'config',
      action: 'Create ~/.evcrate/advisor-routing.json with one version 1 advisor target.',
      message: 'Global advisor policy is required'
    }
  };
  assert.deepEqual(validateDiagnosticResult(failure), failure);
  assert.throws(() => validateDiagnosticResult({
    ...failure, error: { ...failure.error, action: 'unsafe action' }
  }));
  assert.throws(() => validateDiagnosticResult({
    ...failure, probes: {
      version: { status: 'not-run' }, auth: { status: 'passed' },
      capabilities: { status: 'not-run' }
    }
  }));
  assert.throws(() => validateDiagnosticResult({
    ...failure, probes: {
      version: { status: 'passed', value: '1.0.0' }, auth: { status: 'passed' },
      capabilities: { status: 'passed' }
    }
  }));
  assert.throws(() => validateDiagnosticResult({
    ...failure, question: 'not counsel'
  }), (error) => error.code === 'DIAGNOSTIC_INVALID');
});
test('Phase 8 publication payloads enforce scope, phase order, identity, and empty recovery', () => {
  assert.deepEqual([...PUBLICATION_BINDING_ORDER], [
    '.evcrate/bin', '.gemini', '.agents', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot', '.evcrate-vscode'
  ]);
  assert.deepEqual(validatePublishRequestPayload({
    scope: 'home', selectedTargets: ['agy']
  }), { scope: 'home', selectedTargets: ['antigravity'] });
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
      { phase: 'shared', scope: 'home', selectedTargets: [], bindingOrder: ['.evcrate/bin'], changes: [] },
      { phase: 'harness', scope: 'home', selectedTargets: ['omp'], bindingOrder: ['.omp'], changes: [change] }
    ]
  };
  assert.deepEqual(validatePublishDryRunResultPayload(dryRun), dryRun);
  const applied = {
    ...dryRun,
    phases: dryRun.phases.map((phase) => ({
      ...phase, status: 'committed', releaseId: 'release-1', retainedReleaseId: null
    }))
  };
  assert.deepEqual(validatePublishApplyResultPayload(applied), applied);
  const incompleteApply = {
    ...dryRun,
    phases: [
      { ...dryRun.phases[0], status: 'failed', releaseId: null, retainedReleaseId: null },
      { ...dryRun.phases[1], status: 'not-started', releaseId: null, retainedReleaseId: null }
    ]
  };
  assert.throws(() => validatePublishApplyResultPayload(incompleteApply));
  const partialPayload = {
    scope: 'project', projectIdentity: 'c'.repeat(64),
    buildManifestPath: '.evcrate/build-manifest-omp.json', buildManifestDigest: 'd'.repeat(64),
    phases: [
      { ...dryRun.phases[0], status: 'committed', releaseId: 'shared-release', retainedReleaseId: null },
      { ...dryRun.phases[1], scope: 'project', status: 'failed', releaseId: null, retainedReleaseId: null }
    ]
  };
  assert.throws(() => validatePublishApplyResultPayload(partialPayload));
  const partialResult = validateResourceResult({
    protocol: 'evcrate-resource-control', protocolVersion: 1, requestId: 'partial-1',
    operation: 'publish.apply', status: 'partial', payload: partialPayload,
    error: {
      code: 'PUBLICATION_FAILED', category: 'publication',
      action: 'Repair the publication state before retrying.', message: 'Publication failed'
    }
  });
  assert.equal(partialResult.status, 'partial');
  assert.deepEqual(partialResult.payload, partialPayload);
  const generatedDotfile = {
    ...dryRun,
    phases: [dryRun.phases[0], {
      ...dryRun.phases[1], changes: [{ ...change, path: '.omp/agent/skills/example/.gitignore' }]
    }]
  };
  assert.doesNotThrow(() => validatePublishDryRunResultPayload(generatedDotfile));
  assert.throws(() => validatePublishDryRunResultPayload({
    ...dryRun,
    phases: [dryRun.phases[0], {
      ...dryRun.phases[1], changes: [{ ...change, path: '.omp/.env.production' }]
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
    phases: [dryRun.phases[0], { ...dryRun.phases[1], bindingOrder: ['.omp', '.evcrate/bin'] }]
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

test('Phase 1 portable advisor contract runtime exports and public shapes', () => {
  assert.equal(CHECKPOINT_PROTOCOL_V2, 'evcrate-advisor-checkpoint');
  assert.equal(CHECKPOINT_VERSION_V2, 2);
  assert.equal(RESULT_PROTOCOL_V2, 'evcrate-advisor-result');
  assert.equal(RESULT_VERSION_V2, 2);
  assert.equal(CONTROLLER_PROTOCOL_V2, 'evcrate-advisor-controller');
  assert.equal(CONTROLLER_VERSION_V2, 2);
  assert.equal(HISTORY_PROTOCOL_V1, 'evcrate-advisor-history');
  assert.equal(HISTORY_VERSION_V1, 1);
  assert.equal(typeof validateCheckpointV2, 'function');
  assert.equal(typeof validateResultV2, 'function');
  assert.equal(typeof validateEnvelopeV2, 'function');
  assert.equal(typeof validateHistoryExecutionV1, 'function');
  assert.equal(typeof validateHistoryOutcomeV1, 'function');
  assert.equal(typeof AdvisorContractError, 'function');
});
