import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createResourceHandler, createResourceRequest, loadResourceRegistry, validateResourceResult
} from '../../dist/index.js';
import { RESOURCE_ROOTS, createPhase6Fixture, writeSource, closePhase6Fixture } from '../resource-fixture.mjs';

function codeOf(callback) {
  try { callback(); } catch (error) { return error.code; }
  return undefined;
}
function envelope(context) {
  const target = context.selectedTargets[0];
  return {
    canonicalSourceRoot: context.canonicalSourceRoot, targetManifestPath: target.manifestPath,
    generatedRoot: target.generatedRoots[0], homeRoot: target.homeBindings[0].homeRoot,
    stateRoot: context.stateRoot, projectId: 'global', projectRoot: context.projectRoot, target: 'claude'
  };
}
function previewRequest(context, sourcePath, destination, expiry = 300) {
  return createResourceRequest('apply-preview', 'imports.preview', envelope(context), {
    sourcePath, kind: 'agent', destination, provenance: 'apply-test', selectedTargets: ['claude'],
    capabilityApprovals: [], expiresInSeconds: expiry
  });
}
function applyRequest(context, token) {
  return createResourceRequest('apply-request', 'imports.apply', envelope(context), { previewToken: token });
}
function preview(handler, context, sourcePath, destination, expiry = 300) {
  return validateResourceResult(handler.handle(previewRequest(context, sourcePath, destination, expiry), context));
}

test('apply promotes canonical source and registry as one consumed transaction', () => {
  const fixture = createPhase6Fixture();
  try {
    const context = fixture.context();
    const generatedPath = join(fixture.root, '.evcrate', 'source', '.omp', 'generated.md');
    const controllerPath = join(fixture.root, '.evcrate', 'source', '.evcrate', 'bin', 'controller');
    const homePath = join(fixture.home, '.claude', 'preserved');
    mkdirSync(join(generatedPath, '..'), { recursive: true });
    mkdirSync(join(controllerPath, '..'), { recursive: true });
    mkdirSync(join(homePath, '..'), { recursive: true });
    writeFileSync(generatedPath, 'generated' + String.fromCharCode(10));
    writeFileSync(controllerPath, 'controller' + String.fromCharCode(10));
    writeFileSync(homePath, 'home' + String.fromCharCode(10));
    const manifestPath = context.selectedTargets[0].manifestPath;
    const beforeManifest = readFileSync(manifestPath);
    const beforeGenerated = readFileSync(generatedPath);
    const beforeController = readFileSync(controllerPath);
    const beforeHome = readFileSync(homePath);
    const source = writeSource(fixture, 'new-agent.md', '# New agent' + String.fromCharCode(10));
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const planned = preview(handler, context, source, 'new-agent.md');
    const tokenPath = join(context.stateRoot, 'import-previews', `${planned.payload.token}.json`);
    const applied = validateResourceResult(handler.handle(applyRequest(context, planned.payload.token), context));
    assert.equal(applied.status, 'applied');
    assert.equal(applied.payload.changed, true);
    assert.equal(applied.payload.change, 'create');
    assert.equal(applied.payload.registryRevision, 2);
    assert.equal(readFileSync(join(fixture.canonical, 'agents', 'new-agent.md'), 'utf8'), '# New agent' + String.fromCharCode(10));
    const registry = loadResourceRegistry(fixture.registryPath, fixture.canonical, RESOURCE_ROOTS);
    assert.equal(registry.document.revision, 2);
    assert.equal(registry.document.resources.some(({ id }) => id === 'agent:agents/new-agent.md'), true);
    assert.deepEqual(readFileSync(manifestPath), beforeManifest);
    assert.deepEqual(readFileSync(generatedPath), beforeGenerated);
    assert.deepEqual(readFileSync(controllerPath), beforeController);
    assert.deepEqual(readFileSync(homePath), beforeHome);
    assert.equal(existsSync(tokenPath), false);
    assert.equal(codeOf(() => handler.handle(applyRequest(context, planned.payload.token), context)), 'CAS_CONFLICT');
  } finally { closePhase6Fixture(fixture); }
});

test('identical re-import is unchanged and consumes its preview without revision churn', () => {
  const fixture = createPhase6Fixture();
  try {
    const context = fixture.context();
    const source = writeSource(fixture, 'same-agent.md', '# Same agent\n');
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const first = preview(handler, context, source, 'same-agent.md');
    validateResourceResult(handler.handle(applyRequest(context, first.payload.token), context));
    const beforeRegistry = readFileSync(fixture.registryPath);
    const second = preview(handler, context, source, 'same-agent.md');
    assert.equal(second.payload.change, 'unchanged');
    const result = validateResourceResult(handler.handle(applyRequest(context, second.payload.token), context));
    assert.equal(result.payload.changed, false);
    assert.equal(result.payload.change, 'unchanged');
    assert.deepEqual(readFileSync(fixture.registryPath), beforeRegistry);
    assert.equal(loadResourceRegistry(fixture.registryPath, fixture.canonical, RESOURCE_ROOTS).document.revision, 2);
  } finally { closePhase6Fixture(fixture); }
});

test('stale source, canonical, manifest, and expiry bindings conflict before mutation', () => {
  const fixture = createPhase6Fixture();
  try {
    const source = writeSource(fixture, 'stale-agent.md', '# original\n');
    const context = fixture.context();
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const staleSource = preview(handler, context, source, 'stale-source.md');
    const beforeRegistry = readFileSync(fixture.registryPath);
    writeFileSync(source, '# changed\n');
    assert.equal(codeOf(() => handler.handle(applyRequest(context, staleSource.payload.token), context)), 'CAS_CONFLICT');
    assert.equal(existsSync(join(fixture.canonical, 'agents', 'stale-source.md')), false);
    assert.deepEqual(readFileSync(fixture.registryPath), beforeRegistry);
    const concurrent = preview(handler, context, source, 'stale-canonical.md');
    writeFileSync(join(fixture.canonical, 'agents', 'concurrent.md'), '# concurrent\n');
    assert.equal(codeOf(() => handler.handle(applyRequest(context, concurrent.payload.token), context)), 'CAS_CONFLICT');
    unlinkSync(join(fixture.canonical, 'agents', 'concurrent.md'));
    assert.deepEqual(readFileSync(fixture.registryPath), beforeRegistry);
    const ignoredArtifact = join(fixture.canonical, 'ignored.pyc');
    writeFileSync(ignoredArtifact, 'ignored\n');
    assert.equal(codeOf(() => handler.handle(applyRequest(context, concurrent.payload.token), context)), 'CAS_CONFLICT');
    unlinkSync(ignoredArtifact);
    if (process.platform !== 'win32') {
      const modeChanged = join(fixture.canonical, 'agents', 'alpha.md');
      chmodSync(modeChanged, 0o600);
      assert.equal(codeOf(() => handler.handle(applyRequest(context, concurrent.payload.token), context)), 'CAS_CONFLICT');
      chmodSync(modeChanged, 0o644);
    }
    const manifest = preview(handler, context, source, 'stale-manifest.md');
    writeFileSync(fixture.root + '/.evcrate/targets/manifest.json', `${readFileSync(fixture.root + '/.evcrate/targets/manifest.json', 'utf8')}\n`);
    assert.equal(codeOf(() => handler.handle(applyRequest(context, manifest.payload.token), context)), 'CAS_CONFLICT');
    const expiring = preview(handler, context, source, 'expired.md', 1);
    const expiredHandler = createResourceHandler({ now: () => 1_700_000_001_002 });
    assert.equal(codeOf(() => expiredHandler.handle(applyRequest(context, expiring.payload.token), context)), 'CAS_CONFLICT');
  } finally { closePhase6Fixture(fixture); }
});
