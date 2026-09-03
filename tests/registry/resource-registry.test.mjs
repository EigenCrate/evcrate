import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ControlPlaneError, PERSISTED_TARGETS, getResource, listResources, loadResourceRegistry,
  resourceDocumentBytes, scanCanonicalResources, upsertResource, validateRegistryDocument, validateResourceRecord
} from '../../dist/index.js';
import {
  RESOURCE_ROOTS, createPhase6Fixture, closePhase6Fixture
} from '../resource-fixture.mjs';

function codeOf(callback) {
  try { callback(); } catch (error) { return error.code; }
  return undefined;
}

test('registry scans declared granularities with deterministic compatibility', () => {
  const fixture = createPhase6Fixture();
  try {
    const registry = loadResourceRegistry(fixture.registryPath, fixture.canonical, RESOURCE_ROOTS);
    assert.equal(registry.document.schema_version, 1);
    assert.equal(registry.document.revision, 1);
    assert.deepEqual(registry.document.resources.map(({ id }) => id), [
      'agent:agents/alpha.md', 'agent:agents/beta.md', 'command:commands/nested/deploy.md',
      'hook:hooks/notes.txt', 'hook:hooks/notify.sh', 'skill:skills/kit', 'workflow:workflows/release.md'
    ]);
    const hook = getResource(registry.document, 'hook:hooks/notify.sh');
    assert.deepEqual(hook.capabilities, ['hook-execution', 'script-execution']);
    assert.deepEqual(Object.keys(hook.compatibility).sort(), [...PERSISTED_TARGETS].sort());
    assert.equal(hook.compatibility.claude.status, 'native');
    assert.equal(hook.compatibility.codex.status, 'needsAdapter');
    const rescanned = scanCanonicalResources(fixture.canonical, RESOURCE_ROOTS, registry.document.resources);
    assert.deepEqual(Buffer.from(resourceDocumentBytes({ ...registry.document, resources: rescanned })), Buffer.from(resourceDocumentBytes(registry.document)));
  } finally { closePhase6Fixture(fixture); }
});

test('resource queries page after filters without unstable ordering', () => {
  const fixture = createPhase6Fixture();
  try {
    const registry = loadResourceRegistry(fixture.registryPath, fixture.canonical, RESOURCE_ROOTS);
    const first = listResources(registry.document, {}, null, 2);
    assert.deepEqual(first.resources.map(({ id }) => id), ['agent:agents/alpha.md', 'agent:agents/beta.md']);
    assert.equal(first.nextCursor, 'agent:agents/beta.md');
    const second = listResources(registry.document, {}, first.nextCursor, 2);
    assert.deepEqual(second.resources.map(({ id }) => id), ['command:commands/nested/deploy.md', 'hook:hooks/notes.txt']);
    const scripts = listResources(registry.document, { status: 'needsAdapter', target: 'codex' }, null, 100);
    assert.equal(scripts.resources.length, registry.document.resources.length);
    const skills = listResources(registry.document, { kind: 'skill' }, null, 100);
    assert.deepEqual(skills.resources.map(({ id }) => id), ['skill:skills/kit']);
    assert.equal(codeOf(() => getResource(registry.document, 'agent:agents/missing.md')), 'CAPABILITY_UNSUPPORTED');
  } finally { closePhase6Fixture(fixture); }
});

test('registry records and scanner reject tampering and unsupported links', () => {
  const fixture = createPhase6Fixture();
  try {
    const recordFixture = JSON.parse(readFileSync(new URL('../fixtures/resource-registry-v1/record.json', import.meta.url), 'utf8'));
    assert.deepEqual(validateResourceRecord(recordFixture), recordFixture);
    assert.doesNotThrow(() => validateRegistryDocument({ schema_version: 1, revision: 1, resources: [recordFixture] }));
    writeFileSync(join(fixture.canonical, 'agents', 'unsupported.txt'), 'ignored\n');
    assert.equal(scanCanonicalResources(fixture.canonical, RESOURCE_ROOTS).some(({ id }) => id.endsWith('unsupported.txt')), false);
    mkdirSync(join(fixture.canonical, 'commands', '.git'), { recursive: true });
    writeFileSync(join(fixture.canonical, 'commands', '.git', 'hidden.md'), '# hidden\n');
    assert.equal(scanCanonicalResources(fixture.canonical, RESOURCE_ROOTS).some(({ id }) => id.includes('.git')), false);
    symlinkSync(join(fixture.canonical, 'agents', 'alpha.md'), join(fixture.canonical, 'agents', 'link.md'));
    assert.equal(codeOf(() => scanCanonicalResources(fixture.canonical, RESOURCE_ROOTS)), 'PATH_UNSAFE');
    closePhase6Fixture(fixture);
    const changed = createPhase6Fixture();
    try {
      writeFileSync(join(changed.canonical, 'agents', 'alpha.md'), '# changed\n');
      assert.equal(codeOf(() => loadResourceRegistry(changed.registryPath, changed.canonical, RESOURCE_ROOTS)), 'CAS_CONFLICT');
    } finally { closePhase6Fixture(changed); }
  } finally {
    try { closePhase6Fixture(fixture); } catch (error) { if (!(error instanceof ControlPlaneError)) throw error; }
  }
});
test('empty registries cannot shadow an existing canonical resource tree', () => {
  const fixture = createPhase6Fixture();
  try {
    writeFileSync(fixture.registryPath, '{"schema_version":1,"revision":0,"resources":[]}\n');
    assert.equal(codeOf(() => loadResourceRegistry(fixture.registryPath, fixture.canonical, RESOURCE_ROOTS)), 'CAS_CONFLICT');
  } finally { closePhase6Fixture(fixture); }
});

test('canonical scans reject over-deep trees before resource discovery', () => {
  const fixture = createPhase6Fixture();
  try {
    let path = join(fixture.canonical, 'commands');
    for (let index = 0; index < 33; index += 1) {
      path = join(path, `level-${index}`);
      mkdirSync(path);
    }
    writeFileSync(join(path, 'deep.md'), '# deep\n');
    assert.equal(codeOf(() => scanCanonicalResources(fixture.canonical, RESOURCE_ROOTS)), 'PATH_UNSAFE');
  } finally { closePhase6Fixture(fixture); }
});

test('registry ordering and cursors use Unicode code-point order', () => {
  const base = JSON.parse(readFileSync(new URL('../fixtures/resource-registry-v1/record.json', import.meta.url), 'utf8'));
  const bmp = { ...base, id: `agent:agents/${String.fromCodePoint(0xe000)}.md`, source_path: `agents/${String.fromCodePoint(0xe000)}.md` };
  const astral = { ...base, id: `agent:agents/${String.fromCodePoint(0x1f600)}.md`, source_path: `agents/${String.fromCodePoint(0x1f600)}.md` };
  const first = upsertResource({ schema_version: 1, revision: 0, resources: [] }, bmp);
  const document = upsertResource(first, astral);
  assert.deepEqual(document.resources.map(({ id }) => id), [bmp.id, astral.id]);
  assert.deepEqual(listResources(document, {}, bmp.id, 10).resources.map(({ id }) => id), [astral.id]);
  assert.doesNotThrow(() => resourceDocumentBytes(document));
});
