import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  computeBrowserSha256,
  computeBrowserCheckpointDigest
} from '../../viewer/src/io/browser-digest.js';
import { makeCheckpoint } from '../fixtures/advisor-history/history-fixtures.mjs';
import { VALID_TASK_ID } from '../fixtures/advisor-history-browser/browser-fixtures.mjs';

test('browser-digest: computeBrowserSha256 matches Node crypto sha256', async () => {
  const text = 'Hello EVCrate Browser Digest';
  const expected = createHash('sha256').update(text, 'utf8').digest('hex');
  const actual = await computeBrowserSha256(text);
  assert.equal(actual, expected);

  const bytes = new TextEncoder().encode('Bytes payload');
  const expectedBytes = createHash('sha256').update(bytes).digest('hex');
  const actualBytes = await computeBrowserSha256(bytes);
  assert.equal(actualBytes, expectedBytes);
});

test('browser-digest: computeBrowserCheckpointDigest computes deterministic canonical hash', async () => {
  const cp = makeCheckpoint(VALID_TASK_ID, 'chk-browser-01');
  const expected = createHash('sha256').update(JSON.stringify(cp), 'utf8').digest('hex');
  const actual = await computeBrowserCheckpointDigest(cp);
  assert.equal(actual, expected);
  assert.match(actual, /^[0-9a-f]{64}$/);
});
