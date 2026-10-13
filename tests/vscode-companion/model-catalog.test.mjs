import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCatalogEntry,
  buildCatalogSnapshot,
  queryChatModelCatalog
} from '../../.cache/evcrate/vscode-model-bindings-dist/model-catalog.js';

test('validateCatalogEntry validates and trims descriptor fields', () => {
  const valid = validateCatalogEntry({
    vendor: ' copilot ',
    id: ' claude-3.5-sonnet ',
    name: ' Claude 3.5 Sonnet ',
    family: ' claude-sonnet ',
    version: ' 20241022 '
  }, 0);
  assert.equal(valid.vendor, 'copilot');
  assert.equal(valid.id, 'claude-3.5-sonnet');
  assert.equal(valid.name, 'Claude 3.5 Sonnet');
  assert.equal(valid.family, 'claude-sonnet');
  assert.equal(valid.version, '20241022');
});

test('validateCatalogEntry rejects missing or oversized fields', () => {
  assert.throws(
    () => validateCatalogEntry(null, 0),
    (err) => err.code === 'CONTRACT_INVALID'
  );
  assert.throws(
    () => validateCatalogEntry({ vendor: '', id: 'model-1', name: 'Model 1' }, 0),
    (err) => err.code === 'CONTRACT_INVALID'
  );
  assert.throws(
    () => validateCatalogEntry({ vendor: 'v', id: '', name: 'Model 1' }, 0),
    (err) => err.code === 'CONTRACT_INVALID'
  );
  assert.throws(
    () => validateCatalogEntry({ vendor: 'v', id: 'id', name: '' }, 0),
    (err) => err.code === 'CONTRACT_INVALID'
  );
  assert.throws(
    () => validateCatalogEntry({ vendor: 'v'.repeat(129), id: 'id', name: 'n' }, 0),
    (err) => err.code === 'CONTRACT_INVALID'
  );
});

test('buildCatalogSnapshot handles sorting, deduplication, and bounds', () => {
  const models = [
    { vendor: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
    { vendor: 'anthropic', id: 'claude-sonnet', name: 'Claude 3.5 Sonnet' },
    { vendor: 'anthropic', id: 'claude-opus', name: 'Claude 3 Opus' },
    { vendor: 'openai', id: 'gpt-4o', name: 'GPT-4o' } // exact duplicate
  ];
  const snapshot = buildCatalogSnapshot(models, 1);
  assert.equal(snapshot.rawCount, 4);
  assert.equal(snapshot.models.length, 3);
  assert.equal(snapshot.models[0].vendor, 'anthropic');
  assert.equal(snapshot.models[0].name, 'Claude 3 Opus');
  assert.equal(snapshot.models[1].name, 'Claude 3.5 Sonnet');
  assert.equal(snapshot.models[2].vendor, 'openai');
  assert.equal(snapshot.ambiguousCount, 0);
});

test('buildCatalogSnapshot skips inconsistent duplicate and invalid entries without crashing', () => {
  const models = [
    { vendor: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
    { vendor: 'openai', id: 'gpt-4o', name: 'GPT-4o Inconsistent Name' },
    { vendor: '', id: 'bad-entry', name: 'Bad' }
  ];
  const snapshot = buildCatalogSnapshot(models, 1);
  assert.equal(snapshot.models.length, 1);
  assert.equal(snapshot.invalidCount, 2);
});

test('buildCatalogSnapshot marks colliding selectors as ambiguous without dropping', () => {
  const models = [
    { vendor: 'copilot', id: 'claude-3-5-sonnet-v1', name: 'Claude Sonnet' },
    { vendor: 'copilot', id: 'claude-3-5-sonnet-v2', name: 'Claude Sonnet' },
    { vendor: 'copilot', id: 'gpt-4o', name: 'GPT-4o' }
  ];
  const snapshot = buildCatalogSnapshot(models, 2);
  assert.equal(snapshot.models.length, 3);
  assert.equal(snapshot.ambiguousCount, 2);

  const ambiguous = snapshot.models.filter((m) => m.isAmbiguous);
  assert.equal(ambiguous.length, 2);
  assert.match(ambiguous[0].ambiguousReason, /Ambiguous selector "Claude Sonnet \(copilot\)"/);
  assert.match(ambiguous[1].ambiguousReason, /Ambiguous selector "Claude Sonnet \(copilot\)"/);

  const unique = snapshot.models.find((m) => m.id === 'gpt-4o');
  assert.equal(unique?.isAmbiguous, false);
});

test('buildCatalogSnapshot enforces max 2048 catalog bounds', () => {
  const oversized = Array.from({ length: 2049 }, (_, i) => ({
    vendor: 'v',
    id: `m-${i}`,
    name: `M ${i}`
  }));
  assert.throws(
    () => buildCatalogSnapshot(oversized),
    (err) => err.code === 'BOUNDS_EXCEEDED'
  );
});

test('queryChatModelCatalog queries language model API, deduplicates shared selectors, and filters non-tool models', async () => {
  const mockLm = {
    async selectChatModels() {
      return [
        { vendor: 'copilot', id: 'gpt-5.6-luna-a', name: 'GPT-5.6 Luna', capabilities: { supportsToolCalling: true } },
        { vendor: 'copilot', id: 'gpt-5.6-luna-b', name: 'GPT-5.6 Luna', capabilities: { supportsToolCalling: true } },
        { vendor: 'copilot', id: 'legacy-no-tools', name: 'Legacy No Tools', capabilities: { supportsToolCalling: false } }
      ];
    }
  };
  const snapshot = await queryChatModelCatalog(mockLm, 3);
  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.models.length, 1);
  assert.equal(snapshot.ambiguousCount, 0);
  assert.equal(snapshot.models[0].selector, 'GPT-5.6 Luna (copilot)');
  assert.equal(snapshot.models[0].isAmbiguous, false);
});
