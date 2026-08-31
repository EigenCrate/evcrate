import assert from 'node:assert/strict';
import {
  createQualifiedRecordMap,
  getProjectionAdapter,
  loadTargetManifestRegistry,
  qualifyProjectionAdapter,
  selectProjectionEngine,
} from '../../dist/index.js';
import { test } from 'node:test';
import { join } from 'node:path';

const registry = loadTargetManifestRegistry(join(process.cwd(), '.evcrate/targets/manifest.json'));
const hash = 'a'.repeat(64);
function input(target, currentEvidenceHash = hash) {
  const manifest = registry.targets.get(target);
  return {
    adapter: getProjectionAdapter(target),
    manifest,
    evidence: { version: 1, hash },
    validation: { target, valid: true, diagnostics: [] },
    currentEvidenceHash,
  };
}
function code(expected) {
  return (error) => error?.code === expected;
}

test('qualification records bind the registered adapter, manifest, evidence, and validation', () => {
  const record = qualifyProjectionAdapter(input('claude'));
  assert.equal(record.target, 'claude');
  assert.equal(record.adapter, undefined);
  assert.equal(record.evidence.hash, hash);
  assert.equal(record.validation.valid, true);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.evidence), true);
  const map = createQualifiedRecordMap([record]);
  assert.equal(map.size, 1);
  assert.equal(map.get('claude'), record);
  assert.equal(typeof map.set, 'undefined');
  assert.equal(selectProjectionEngine(['claude'], map), 'typescript');
  assert.throws(() => createQualifiedRecordMap([{ ...record }]), code('VALIDATION_INVALID'));
});

test('qualification rejects stale, duplicate, mixed, and failed evidence', () => {
  assert.throws(() => qualifyProjectionAdapter(input('claude', 'b'.repeat(64))), code('CAS_CONFLICT'));
  const record = qualifyProjectionAdapter(input('claude'));
  assert.throws(() => createQualifiedRecordMap([record, record]), code('VALIDATION_INVALID'));
  const map = createQualifiedRecordMap([record]);
  assert.equal(selectProjectionEngine(['gemini'], map), 'python-compatibility');
  assert.throws(() => selectProjectionEngine(['claude', 'gemini'], map), code('CAS_CONFLICT'));
  assert.throws(() => qualifyProjectionAdapter({
    ...input('claude'),
    validation: { target: 'claude', valid: false, diagnostics: [] },
  }), code('CAPABILITY_UNSUPPORTED'));
});

test('qualification requires a current CAS evidence hash', () => {
  const { currentEvidenceHash, ...withoutCurrentEvidence } = input('claude');
  assert.equal(typeof currentEvidenceHash, 'string');
  assert.throws(() => qualifyProjectionAdapter(withoutCurrentEvidence), code('VALIDATION_INVALID'));
});

test('qualification validates canonical target identity and evidence shape', () => {
  assert.throws(() => qualifyProjectionAdapter(input('agy')), code('VALIDATION_INVALID'));
  assert.throws(() => qualifyProjectionAdapter({
    ...input('claude'),
    evidence: { version: 2, hash },
  }), code('VALIDATION_INVALID'));
  assert.throws(() => qualifyProjectionAdapter({
    ...input('claude'),
    validation: { target: 'gemini', valid: true, diagnostics: [] },
  }), code('VALIDATION_INVALID'));
});
