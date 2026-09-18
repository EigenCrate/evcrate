import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryReader } from '../../viewer/src/io/history-reader.js';
import { FakeDirectoryHandle } from './fake-file-system.mjs';
import {
  VALID_PROJECT_ID,
  createValidSingleProjectTree
} from '../fixtures/advisor-history-browser/browser-fixtures.mjs';

test('history-reader: complete scan produces fresh snapshot and replace commit', async () => {
  const { root } = createValidSingleProjectTree();
  const reader = new HistoryReader();
  const result = await reader.scan(root);

  assert.equal(result.generation, 1);
  assert.equal(result.commit, 'replace');
  assert.notEqual(result.snapshot, undefined);
  assert.equal(result.snapshot.stale, false);
  assert.equal(result.snapshot.records.length, 1);
  assert.equal(result.scan.status, 'complete');
  assert.equal(result.scan.accepted_records, 1);
  assert.equal(result.scan.invalid_records, 0);
  assert.equal(result.scan.diagnostics.length, 0);
});

test('history-reader: complete_with_errors replaces snapshot and reports diagnostics', async () => {
  const { root, consultDir } = createValidSingleProjectTree();
  consultDir.addFile('unexpected.txt', 'ignored junk');

  const reader = new HistoryReader();
  const result = await reader.scan(root);

  assert.equal(result.commit, 'replace');
  assert.equal(result.scan.status, 'complete_with_errors');
  assert.equal(result.scan.diagnostics.length, 1);
  assert.equal(result.scan.diagnostics[0].code, 'UNEXPECTED_ENTRY');
});

test('history-reader: incomplete scan retains stale prior snapshot', async () => {
  const { root } = createValidSingleProjectTree();
  const reader = new HistoryReader();

  const firstResult = await reader.scan(root);
  assert.equal(firstResult.commit, 'replace');
  const priorSnapshot = firstResult.snapshot;

  const badRoot = new FakeDirectoryHandle(VALID_PROJECT_ID);
  badRoot._throwOnEntries = true;

  const secondResult = await reader.scan(badRoot, priorSnapshot);
  assert.equal(secondResult.commit, 'retain-stale');
  assert.notEqual(secondResult.snapshot, undefined);
  assert.equal(secondResult.snapshot.stale, true);
  assert.equal(secondResult.snapshot.records.length, 1);
  assert.equal(secondResult.scan.status, 'incomplete');
});

test('history-reader: cancellation retains prior snapshot and marks stale', async () => {
  const { root } = createValidSingleProjectTree();
  const reader = new HistoryReader();

  const firstResult = await reader.scan(root);
  const priorSnapshot = firstResult.snapshot;

  const scanPromise = reader.scan(root, priorSnapshot);
  reader.cancelActiveScan();
  const cancelledResult = await scanPromise;

  assert.equal(cancelledResult.commit, 'retain-stale');
  assert.equal(cancelledResult.snapshot.stale, true);
  assert.equal(cancelledResult.scan.diagnostics.some((d) => d.code === 'READ_CANCELLED'), true);
});

test('history-reader: generation race cancels older scan', async () => {
  const { root } = createValidSingleProjectTree();
  const reader = new HistoryReader();

  const scan1 = reader.scan(root);
  const scan2 = reader.scan(root);

  const [res1, res2] = await Promise.all([scan1, scan2]);
  assert.equal(res1.generation, 1);
  assert.equal(res1.commit, 'retain-stale');
  assert.equal(res2.generation, 2);
  assert.equal(res2.commit, 'replace');
});
