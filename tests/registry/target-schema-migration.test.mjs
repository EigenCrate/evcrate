import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  PERSISTED_TARGETS,
  normalizeTarget
} from '../../dist/protocol/validation.js';
import {
  RESOURCE_REGISTRY_SCHEMA_VERSION,
  validateRegistryDocument,
  emptyRegistryDocument,
  readRegistryDocument,
  registryDocumentBytes
} from '../../dist/registry/schema.js';
import {
  readLegacyRegistryDocument,
  normalizeLegacyRecord,
  LEGACY_SCHEMA_1_TARGETS
} from '../../dist/registry/legacy-registry-reader.js';
import {
  loadResourceRegistry,
  upsertResource,
  getResource,
  listResources
} from '../../dist/registry/store.js';
import {
  loadTargetManifestRegistry
} from '../../dist/manifests/registry.js';
import {
  selectProjectionEngine,
  createQualifiedRecordMap
} from '../../dist/adapters/qualification.js';

test('schema-migration: accepts current names and rejects retired or unknown targets', () => {
  assert.equal(normalizeTarget('vscode'), 'vscode');
  assert.equal(normalizeTarget('agy'), 'antigravity');
  assert.throws(() => normalizeTarget('unknown-target'), (err) => err?.code === 'CAPABILITY_UNSUPPORTED');
  assert.throws(() => normalizeTarget('local'), (err) => err?.code === 'CAPABILITY_UNSUPPORTED');
  assert.throws(() => normalizeTarget('vscode-local'), (err) => err?.code === 'CAPABILITY_UNSUPPORTED');
  assert.throws(() => normalizeTarget('gemini'), (err) => err?.code === 'CAPABILITY_UNSUPPORTED');
});

test('schema-migration: legacy schema 1 records drop Gemini and add needsAdapter for vscode', () => {
  const legacyRecord = {
    id: 'skill:skills/sample',
    kind: 'skill',
    source_path: 'skills/sample',
    content_hash: 'a'.repeat(64),
    origin: 'user',
    compatibility: {
      claude: { status: 'native' },
      codex: { status: 'native' },
      gemini: { status: 'native' },
      antigravity: { status: 'native' },
      pi: { status: 'native' },
      omp: { status: 'native' },
      copilot: { status: 'native' }
    },
    capabilities: [],
    revision: 1
  };

  const normalized = normalizeLegacyRecord(legacyRecord);
  assert.equal(normalized.id, legacyRecord.id);
  assert.equal(Object.keys(normalized.compatibility).length, 7);
  assert.equal(Object.hasOwn(normalized.compatibility, 'gemini'), false);
  assert.equal(normalized.compatibility.vscode.status, 'needsAdapter');
  assert.equal(normalized.compatibility.vscode.reason, 'Local projection requires qualification');

  for (const target of LEGACY_SCHEMA_1_TARGETS) {
    if (target === 'gemini') continue;
    assert.deepEqual(normalized.compatibility[target], legacyRecord.compatibility[target]);
  }
  assert.deepEqual(Object.keys(normalized.compatibility), [...PERSISTED_TARGETS]);
  for (const retiredEntry of [null, {}, { status: 'unknown' }, { status: 'unsupported' }, { status: 'native', extra: true }, { status: 'native', reason: 5 }]) {
    assert.throws(
      () => normalizeLegacyRecord({ ...legacyRecord, compatibility: { ...legacyRecord.compatibility, gemini: retiredEntry } }),
      (err) => err?.code === 'PROTOCOL_INVALID'
    );
  }
});

test('schema-migration: complete historical schema 2 retires Gemini without changing other capabilities', () => {
  const compatibility = Object.fromEntries(PERSISTED_TARGETS.map((target) => [target, { status: 'native' }]));
  compatibility.vscode = { status: 'unsupported', reason: 'Fixture limitation' };
  const record = {
    id: 'skill:skills/sample', kind: 'skill', source_path: 'skills/sample',
    content_hash: 'a'.repeat(64), origin: 'user', capabilities: [], revision: 1,
    compatibility: { ...compatibility, gemini: { status: 'native' } },
  };
  const historical = { schema_version: 2, revision: 4, resources: [record] };
  const result = validateRegistryDocument(historical);
  assert.deepEqual(result.resources[0].compatibility, compatibility);
  assert.equal(historical.resources[0].compatibility.gemini.status, 'native');
  assert.equal(Object.hasOwn(JSON.parse(Buffer.from(registryDocumentBytes(result)).toString()).resources[0].compatibility, 'gemini'), false);
  for (const retired of [null, {}, { status: 'unknown' }, { status: 'unsupported' }, { status: 'native', extra: true }]) {
    assert.throws(() => validateRegistryDocument({
      ...historical, resources: [{ ...record, compatibility: { ...compatibility, gemini: retired } }],
    }), (error) => error?.code === 'PROTOCOL_INVALID');
  }
  const { vscode, ...partial } = record.compatibility;
  assert.throws(() => validateRegistryDocument({
    ...historical, resources: [{ ...record, compatibility: partial }],
  }), (error) => error?.code === 'PROTOCOL_INVALID');
});

test('schema-migration: schema 1 document containing vscode is rejected', () => {
  const taintedLegacyRecord = {
    id: 'skill:skills/sample',
    kind: 'skill',
    source_path: 'skills/sample',
    content_hash: 'a'.repeat(64),
    origin: 'user',
    compatibility: {
      claude: { status: 'native' },
      codex: { status: 'native' },
      gemini: { status: 'native' },
      antigravity: { status: 'native' },
      pi: { status: 'native' },
      omp: { status: 'native' },
      copilot: { status: 'native' },
      vscode: { status: 'native' }
    },
    capabilities: [],
    revision: 1
  };

  assert.throws(() => normalizeLegacyRecord(taintedLegacyRecord), (err) => err?.code === 'PROTOCOL_INVALID');

  const legacyDoc = {
    schema_version: 1,
    revision: 1,
    resources: [taintedLegacyRecord]
  };

  assert.throws(() => validateRegistryDocument(legacyDoc), (err) => err?.code === 'PROTOCOL_INVALID');
});

test('schema-migration: schema 1 document reads without disk writes and normalizes in-memory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-reg-test-'));
  try {
    const regFile = path.join(tmpDir, 'registry.json');
    const legacyDoc = {
      schema_version: 1,
      revision: 3,
      resources: [
        {
          id: 'agent:agents/test.md',
          kind: 'agent',
          source_path: 'agents/test.md',
          content_hash: 'b'.repeat(64),
          origin: 'fixture',
          compatibility: {
            claude: { status: 'native' },
            codex: { status: 'native' },
            gemini: { status: 'native' },
            antigravity: { status: 'native' },
            pi: { status: 'native' },
            omp: { status: 'native' },
            copilot: { status: 'native' }
          },
          capabilities: [],
          revision: 1
        }
      ]
    };

    const originalBytes = Buffer.from(JSON.stringify(legacyDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(regFile, originalBytes);

    // Read via readRegistryDocument
    const parsed = readRegistryDocument(regFile);
    assert.equal(parsed.schema_version, 2);
    assert.equal(parsed.revision, 3);
    assert.equal(parsed.resources.length, 1);
    assert.equal(parsed.resources[0].compatibility.vscode.status, 'needsAdapter');
    assert.equal(Object.hasOwn(parsed.resources[0].compatibility, 'gemini'), false);

    // Confirm file bytes on disk are completely untouched (read performs no mutation)
    const currentBytes = fs.readFileSync(regFile);
    assert.deepEqual(currentBytes, originalBytes);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('schema-migration: mutation upsert writes schema 2 document with all 7 current targets', () => {
  const baseDoc = {
    schema_version: 1,
    revision: 1,
    resources: [
      {
        id: 'agent:agents/first.md',
        kind: 'agent',
        source_path: 'agents/first.md',
        content_hash: 'c'.repeat(64),
        origin: 'user',
        compatibility: {
          claude: { status: 'native' },
          codex: { status: 'native' },
          gemini: { status: 'native' },
          antigravity: { status: 'native' },
          pi: { status: 'native' },
          omp: { status: 'native' },
          copilot: { status: 'native' }
        },
        capabilities: [],
        revision: 1
      }
    ]
  };

  const normalized = validateRegistryDocument(baseDoc);
  assert.equal(normalized.resources[0].compatibility.vscode.status, 'needsAdapter');

  // Upsert new resource
  const newRecord = {
    id: 'agent:agents/second.md',
    kind: 'agent',
    source_path: 'agents/second.md',
    content_hash: 'd'.repeat(64),
    origin: 'user',
    compatibility: {
      claude: { status: 'native' },
      codex: { status: 'native' },
      antigravity: { status: 'native' },
      pi: { status: 'native' },
      omp: { status: 'native' },
      copilot: { status: 'native' },
      vscode: { status: 'needsAdapter', reason: 'Local projection requires qualification' }
    },
    capabilities: [],
    revision: 1
  };

  const updated = upsertResource(normalized, newRecord);
  assert.equal(updated.schema_version, 2);
  assert.equal(updated.revision, 2);
  assert.equal(updated.resources.length, 2);

  // Serializing updated document produces valid schema 2 bytes
  const bytes = registryDocumentBytes(updated);
  const reRead = JSON.parse(Buffer.from(bytes).toString('utf8'));
  assert.equal(reRead.schema_version, 2);
  for (const record of reRead.resources) {
    assert.deepEqual(Object.keys(record.compatibility).sort(), [...PERSISTED_TARGETS].sort());
    assert.equal(Object.hasOwn(record.compatibility, 'gemini'), false);
  }
});

test('schema-migration: target manifest registry loads 7 targets including vscode', () => {
  const registryPath = path.resolve('.evcrate/targets/manifest.json');
  const targetRegistry = loadTargetManifestRegistry(registryPath);

  assert.equal(targetRegistry.targets.size, 7);
  assert.equal(targetRegistry.targets.has('gemini'), false);
  assert.ok(targetRegistry.targets.has('vscode'));

  const vscodeManifest = targetRegistry.targets.get('vscode');
  assert.equal(vscodeManifest.id, 'vscode');
  assert.equal(vscodeManifest.name, 'vscode');
  assert.deepEqual(vscodeManifest.outputRoots, ['.evcrate-vscode']);
  assert.equal(vscodeManifest.homePolicy.promotionOrder, 50);
  assert.equal(vscodeManifest.homePolicy.rejectUnmanagedCollisions, true);
  assert.deepEqual(vscodeManifest.homePolicy.bindings, { '.evcrate-vscode': '.evcrate-vscode' });
});

test('schema-migration: selectProjectionEngine guards vscode and rejects fallback to python-compatibility', () => {
  // Empty qualified records map
  const emptyMap = createQualifiedRecordMap(new Map());

  // Requesting existing target with 0 qualified records routes to python-compatibility
  const legacyEngine = selectProjectionEngine(['claude'], emptyMap);
  assert.equal(legacyEngine, 'python-compatibility');

  // Requesting vscode when unqualified must throw CAPABILITY_UNSUPPORTED
  assert.throws(
    () => selectProjectionEngine(['vscode'], emptyMap),
    (err) => err?.code === 'CAPABILITY_UNSUPPORTED'
  );

  // Requesting mixed targets containing vscode when unqualified must throw CAPABILITY_UNSUPPORTED
  assert.throws(
    () => selectProjectionEngine(['claude', 'vscode'], emptyMap),
    (err) => err?.code === 'CAPABILITY_UNSUPPORTED'
  );
});
