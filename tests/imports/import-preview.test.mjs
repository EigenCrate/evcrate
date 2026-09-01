import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAndHashProjections, canonicalImportDestination, copyTreeBounded, createResourceHandler, createResourceRequest, loadSelectedManifests,
  loadTargetManifestRegistry, validateResourceResult
} from '../../dist/index.js';
import { createPhase6Fixture, writeSource, closePhase6Fixture } from '../phase6-fixture.mjs';

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
function previewRequest(context, sourcePath, kind, destination, approvals = []) {
  return createResourceRequest('preview-1', 'imports.preview', envelope(context), {
    sourcePath, kind, destination, provenance: 'test-import', selectedTargets: ['claude'],
    capabilityApprovals: approvals, expiresInSeconds: 300
  });
}

test('preview is non-mutating, bounded, and stores owner-only replay state', () => {
  const fixture = createPhase6Fixture();
  try {
    const source = writeSource(fixture, 'preview-agent.md', '# Imported agent\n');
    const context = fixture.context();
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    const beforeCanonical = readFileSync(fixture.registryPath);
    const beforeSource = readFileSync(join(fixture.canonical, 'agents', 'alpha.md'));
    const result = validateResourceResult(handler.handle(previewRequest(context, source, 'agent', 'imported.md'), context));
    assert.equal(result.status, 'preview');
    assert.equal(result.payload.change, 'create');
    assert.equal(result.payload.resource.id, 'agent:agents/imported.md');
    assert.equal(JSON.stringify(result).includes(fixture.root), false);
    assert.deepEqual(readFileSync(fixture.registryPath), beforeCanonical);
    assert.deepEqual(readFileSync(join(fixture.canonical, 'agents', 'alpha.md')), beforeSource);
    const token = result.payload.token;
    const tokenPath = join(context.stateRoot, 'import-previews', `${token}.json`);
    assert.equal(existsSync(tokenPath), true);
    assert.equal(statSync(tokenPath).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(tokenPath, 'utf8')).source_path, source);
  } finally { closePhase6Fixture(fixture); }
});

test('script and hook capabilities require explicit approvals', () => {
  const fixture = createPhase6Fixture();
  try {
    const context = fixture.context();
    const script = writeSource(fixture, 'approved.md', '#!/bin/sh\necho approved\n', 0o755);
    const handler = createResourceHandler({ now: () => 1_700_000_000_000 });
    assert.equal(codeOf(() => handler.handle(previewRequest(context, script, 'agent', 'approved.md'), context)), 'CAPABILITY_UNSUPPORTED');
    const approved = validateResourceResult(handler.handle(
      previewRequest(context, script, 'agent', 'approved.md', ['script-execution']), context
    ));
    assert.deepEqual(approved.payload.capabilityApprovals, ['script-execution']);
    const hookDirectory = join(fixture.root, 'incoming', 'hook-dir');
    mkdirSync(hookDirectory, { recursive: true });
    writeFileSync(join(hookDirectory, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 });
    assert.equal(codeOf(() => handler.handle(previewRequest(context, hookDirectory, 'hook', 'imported-hook'), context)), 'CAPABILITY_UNSUPPORTED');
    const hook = validateResourceResult(handler.handle(
      previewRequest(context, hookDirectory, 'hook', 'imported-hook', ['hook-execution', 'script-execution']), context
    ));
    assert.deepEqual(hook.payload.capabilityApprovals, ['hook-execution', 'script-execution']);
  } finally { closePhase6Fixture(fixture); }
});

test('preview rejects unsupported formats, traversal, generated trees, and policy paths', () => {
  const fixture = createPhase6Fixture();
  try {
    const context = fixture.context();
    const handler = createResourceHandler();
    const bad = writeSource(fixture, 'unsupported.txt', 'not an agent\n');
    assert.equal(codeOf(() => handler.handle(previewRequest(context, bad, 'agent', 'bad.md'), context)), 'PATH_UNSAFE');
    const secret = writeSource(fixture, 'secret.md', 'should not import\n');
    assert.equal(codeOf(() => handler.handle(previewRequest(context, secret, 'agent', 'secret.md'), context)), 'VALIDATION_INVALID');
    const metadata = join(fixture.root, 'outside', '.git', 'config.md');
    mkdirSync(join(metadata, '..'), { recursive: true });
    writeFileSync(metadata, '# metadata\n');
    assert.equal(codeOf(() => handler.handle(previewRequest(context, metadata, 'agent', 'metadata.md'), context)), 'VALIDATION_INVALID');
    assert.equal(codeOf(() => createResourceRequest('bad', 'imports.preview', envelope(context), {
      sourcePath: bad, kind: 'agent', destination: '../escape.md', provenance: 'test-import',
      selectedTargets: ['claude'], capabilityApprovals: [], expiresInSeconds: 300
    })), 'VALIDATION_INVALID');
    const generated = join(fixture.root, '.evcrate', 'source', '.omp');
    mkdirSync(generated, { recursive: true });
    writeFileSync(join(generated, 'generated.md'), '# generated\n');
    assert.equal(codeOf(() => handler.handle(previewRequest(context, join(generated, 'generated.md'), 'agent', 'generated.md'), context)), 'VALIDATION_INVALID');
    mkdirSync(context.homeRoot, { recursive: true });
    writeFileSync(join(context.homeRoot, 'home.md'), '# home\\n');
    assert.equal(codeOf(() => handler.handle(previewRequest(context, join(context.homeRoot, 'home.md'), 'agent', 'home.md'), context)), 'PATH_UNSAFE');
  } finally { closePhase6Fixture(fixture); }
});
test('unsupported adapter compatibility fails closed before projection execution', () => {
  const fixture = createPhase6Fixture();
  try {
    const context = fixture.context();
    const manifests = loadSelectedManifests(loadTargetManifestRegistry(context.registryPath), ['claude']);
    const unsupported = { id: 'claude', compatibility: { skill: { status: 'unsupported', reason: 'test' } }, build() {}, validate() {} };
    assert.equal(codeOf(() => buildAndHashProjections(
      manifests, new Map([['claude', unsupported]]), fixture.canonical, fixture.root, 'skill'
    )), 'CAPABILITY_UNSUPPORTED');
  } finally { closePhase6Fixture(fixture); }
});
test('canonical staging rejects over-deep trees before copying', () => {
  const fixture = createPhase6Fixture();
  try {
    let path = join(fixture.canonical, 'commands');
    for (let index = 0; index < 33; index += 1) {
      path = join(path, `copy-level-${index}`);
      mkdirSync(path);
    }
    assert.equal(codeOf(() => copyTreeBounded(fixture.canonical, join(fixture.root, 'copy'))), 'PATH_UNSAFE');
  } finally { closePhase6Fixture(fixture); }
});
test('imports reject unmanaged type collisions without deleting existing content', () => {
  const fixture = createPhase6Fixture();
  try {
    const context = fixture.context();
    assert.equal(codeOf(() => canonicalImportDestination(
      fixture.canonical, 'agents', 'agent', 'a'.repeat(4097)
    )), 'VALIDATION_INVALID');
    const handler = createResourceHandler();
    const incomingFile = writeSource(fixture, 'collision-agent.md', '# incoming\n');
    const unmanagedDirectory = join(fixture.canonical, 'agents', 'collision.md');
    mkdirSync(join(unmanagedDirectory, 'nested'), { recursive: true });
    const sentinel = join(unmanagedDirectory, 'nested', 'sentinel.txt');
    writeFileSync(sentinel, 'preserve\n');
    assert.equal(codeOf(() => handler.handle(
      previewRequest(context, incomingFile, 'agent', 'collision.md'), context
    )), 'CAS_CONFLICT');
    assert.equal(readFileSync(sentinel, 'utf8'), 'preserve\n');
    const incomingSkill = join(fixture.root, 'incoming', 'collision-skill');
    mkdirSync(incomingSkill, { recursive: true });
    writeFileSync(join(incomingSkill, 'SKILL.md'), '# incoming skill\n');
    const unmanagedFile = join(fixture.canonical, 'skills', 'collision-skill');
    writeFileSync(unmanagedFile, 'preserve skill\n');
    assert.equal(codeOf(() => handler.handle(
      previewRequest(context, incomingSkill, 'skill', 'collision-skill'), context
    )), 'CAS_CONFLICT');
    assert.equal(readFileSync(unmanagedFile, 'utf8'), 'preserve skill\n');
  } finally { closePhase6Fixture(fixture); }
});
