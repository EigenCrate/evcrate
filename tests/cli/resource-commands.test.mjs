import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createResourceRequest, main, parseArguments } from '../../dist/index.js';
import { createPhase6Fixture, writeSource, closePhase6Fixture } from '../resource-fixture.mjs';

function outputCapture() {
  const values = [];
  return { values, output: { isTTY: false, write: (value) => values.push(value) } };
}
function envelope(context) {
  const target = context.selectedTargets[0];
  return {
    canonicalSourceRoot: context.canonicalSourceRoot, targetManifestPath: target.manifestPath,
    generatedRoot: target.generatedRoots[0], homeRoot: target.homeBindings[0].homeRoot,
    stateRoot: context.stateRoot, projectId: 'global', projectRoot: context.projectRoot, target: 'claude'
  };
}
function runtime(fixture, capture) {
  return { packageRoot: fixture.root, cwd: fixture.root, output: capture.output };
}
function args(fixture, action = []) {
  return ['--json', '--target', 'claude', '--home', fixture.home, '--state-home', fixture.state, ...action];
}
function last(capture) { return JSON.parse(capture.values.at(-1)); }

test('resources list/get and imports preview/apply use the same CLI envelope', async () => {
  const fixture = createPhase6Fixture();
  try {
    const capture = outputCapture();
    const listCode = await main(['resources', 'list', ...args(fixture, ['--kind', 'agent', '--limit', '1'])], runtime(fixture, capture));
    const list = last(capture);
    assert.equal(listCode, 0);
    assert.equal(list.status, 'ok');
    assert.deepEqual(list.payload.resources.map(({ id }) => id), ['agent:agents/alpha.md']);
    const getCode = await main(['resources', 'get', ...args(fixture, ['--id', 'agent:agents/alpha.md'])], runtime(fixture, capture));
    const get = last(capture);
    assert.equal(getCode, 0);
    assert.equal(get.payload.resource.id, 'agent:agents/alpha.md');
    const source = writeSource(fixture, 'cli-agent.md', '# CLI agent\n');
    const previewCode = await main(['imports', 'preview', ...args(fixture, [
      '--kind', 'agent', '--import-source', source, '--destination', 'cli-agent.md', '--provenance', 'cli-test'
    ])], runtime(fixture, capture));
    const preview = last(capture);
    assert.equal(previewCode, 0);
    assert.equal(preview.status, 'preview');
    assert.equal(preview.payload.resource.id, 'agent:agents/cli-agent.md');
    const applyCode = await main(['imports', 'apply', ...args(fixture, ['--preview-token', preview.payload.token])], runtime(fixture, capture));
    const applied = last(capture);
    assert.equal(applyCode, 0);
    assert.equal(applied.status, 'applied');
    assert.equal(applied.payload.changed, true);
    const replayCode = await main(['imports', 'apply', ...args(fixture, ['--preview-token', preview.payload.token])], runtime(fixture, capture));
    const replay = last(capture);
    assert.equal(replayCode, 4);
    assert.equal(replay.status, 'error');
    assert.equal(replay.error.code, 'CAS_CONFLICT');
    assert.equal(JSON.stringify(replay).includes(fixture.root), false);
  } finally { closePhase6Fixture(fixture); }
});

test('request-file dispatch validates the bound resource context', async () => {
  const fixture = createPhase6Fixture();
  try {
    const context = fixture.context();
    const requestPath = join(fixture.root, 'resource-request.json');
    const request = createResourceRequest('file-list', 'resources.list', envelope(context), {
      filters: { kind: 'workflow' }, cursor: null, limit: 50
    });
    writeFileSync(requestPath, `${JSON.stringify(request)}\n`);
    const capture = outputCapture();
    const code = await main([
      '--request-file', requestPath, '--json', '--target', 'claude', '--home', fixture.home, '--state-home', fixture.state
    ], runtime(fixture, capture));
    const result = last(capture);
    assert.equal(code, 0);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.payload.resources.map(({ id }) => id), ['workflow:workflows/release.md']);
  } finally { closePhase6Fixture(fixture); }
});

test('CLI parser keeps Phase 6 options bounded and explicit', () => {
  const invocation = parseArguments(['imports', 'preview', '--kind', 'agent', '--import-source', '/tmp/a.md', '--destination', 'a.md', '--provenance', 'p', '--approve-capability', 'script-execution', '--expiry', '900']);
  assert.deepEqual(invocation.command, { kind: 'imports', action: 'preview' });
  assert.equal(invocation.options.importSource, '/tmp/a.md');
  assert.deepEqual(invocation.options.approveCapabilities, ['script-execution']);
  assert.equal(invocation.options.expirySeconds, '900');
  assert.throws(() => parseArguments(['resources', 'get', '--id', 'agent:agents/a.md', '--id', 'agent:agents/b.md']), { code: 'USAGE_INVALID' });
});
