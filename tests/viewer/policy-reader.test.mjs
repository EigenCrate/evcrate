import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_POLICY_BYTES } from '../../viewer/src/io/history-scan-budget.js';
import { readPolicyFileHandle } from '../../viewer/src/io/policy-reader.js';
import { FakeFileHandle } from './fake-file-system.mjs';

test('policy-reader: reads valid v2 policy', async () => {
  const validV2 = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };

  const file = new FakeFileHandle('advisor-routing.json', JSON.stringify(validV2));
  const res = await readPolicyFileHandle(file);

  assert.equal(res.status, 'POLICY_READY');
  assert.equal(res.legacy, false);
  assert.equal(res.migrationRequired, false);
  assert.notEqual(res.policy, undefined);
  assert.equal(res.policy.version, 2);
});

test('policy-reader: detects legacy v1 policy requiring migration', async () => {
  const legacyV1 = {
    version: 1,
    advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 300000 }
  };

  const file = new FakeFileHandle('advisor-routing.json', JSON.stringify(legacyV1));
  const res = await readPolicyFileHandle(file);

  assert.equal(res.status, 'POLICY_MIGRATION_REQUIRED');
  assert.equal(res.legacy, true);
  assert.equal(res.migrationRequired, true);
  assert.notEqual(res.policy, undefined);
  assert.equal(res.policy.version, 1);
});

test('policy-reader: handles oversized policy, invalid JSON, unsupported version, and permission denial', async () => {
  const bigFile = new FakeFileHandle('policy.json', 'x'.repeat(MAX_POLICY_BYTES + 10));
  const bigRes = await readPolicyFileHandle(bigFile);
  assert.equal(bigRes.status, 'POLICY_OVERSIZED');

  const badJsonFile = new FakeFileHandle('policy.json', '{ bad');
  const badJsonRes = await readPolicyFileHandle(badJsonFile);
  assert.equal(badJsonRes.status, 'POLICY_INVALID_JSON');

  const badVerFile = new FakeFileHandle('policy.json', JSON.stringify({ version: 99 }));
  const badVerRes = await readPolicyFileHandle(badVerFile);
  assert.equal(badVerRes.status, 'POLICY_UNSUPPORTED_VERSION');

  const badSchemaFile = new FakeFileHandle('policy.json', JSON.stringify({ version: 2, advisor: {} }));
  const badSchemaRes = await readPolicyFileHandle(badSchemaFile);
  assert.equal(badSchemaRes.status, 'POLICY_INVALID');

  const deniedFile = new FakeFileHandle('policy.json', '{}');
  deniedFile._permission = 'denied';
  const deniedRes = await readPolicyFileHandle(deniedFile);
  assert.equal(deniedRes.status, 'POLICY_PERMISSION_DENIED');
});

test('policy-reader: handles prompt permission with granted request fallback', async () => {
  const validV2 = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
  const file = new FakeFileHandle('advisor-routing.json', JSON.stringify(validV2));
  file._permission = 'prompt';
  file.requestPermission = async () => 'granted';
  const res = await readPolicyFileHandle(file);
  assert.equal(res.status, 'POLICY_READY');
});

test('policy-reader: handles getFile failure and arrayBuffer failure as POLICY_READ_FAILED', async () => {
  const file1 = new FakeFileHandle('advisor-routing.json', '{}');
  file1._throwOnGetFile = true;
  const res1 = await readPolicyFileHandle(file1);
  assert.equal(res1.status, 'POLICY_READ_FAILED');

  const file2 = new FakeFileHandle('advisor-routing.json', '{}');
  file2._throwOnArrayBuffer = true;
  const res2 = await readPolicyFileHandle(file2);
  assert.equal(res2.status, 'POLICY_READ_FAILED');
});
