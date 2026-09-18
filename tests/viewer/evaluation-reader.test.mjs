import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAX_EVALUATION_FILE_BYTES } from '../../dist/protocol/advisor-evaluation.js';
import {
  readEvaluationFileHandle,
  selectAndReadEvaluationFiles
} from '../../viewer/src/io/evaluation-reader.js';
import { FakeFileHandle } from './fake-file-system.mjs';

const sha256 = async (str) => crypto.createHash('sha256').update(str).digest('hex');
const fixDir = path.resolve('tests/fixtures/advisor-evaluations');
const validMixedRaw = fs.readFileSync(path.join(fixDir, 'valid-mixed.json'), 'utf8');

test('evaluation-reader: reads valid evaluation document', async () => {
  const file = new FakeFileHandle('eval.json', validMixedRaw);
  const res = await readEvaluationFileHandle(file, sha256);
  assert.equal(res.status, 'EVALUATION_READY');
  assert.notEqual(res.document, undefined);
  assert.equal(res.fileName, 'eval.json');
  assert.equal(res.document.evaluation_id, 'eval-valid-mixed-001');
});

test('evaluation-reader: handles oversized evaluation file and buffer', async () => {
  const bigFile = new FakeFileHandle('eval.json', 'x', MAX_EVALUATION_FILE_BYTES + 1);
  const res = await readEvaluationFileHandle(bigFile, sha256);
  assert.equal(res.status, 'EVALUATION_OVERSIZED');
});

test('evaluation-reader: handles invalid JSON and UTF-8 errors', async () => {
  const badJson = new FakeFileHandle('eval.json', '{ bad json');
  const res = await readEvaluationFileHandle(badJson, sha256);
  assert.equal(res.status, 'EVALUATION_INVALID_JSON');
});

test('evaluation-reader: handles unsupported protocol version', async () => {
  const badVer = JSON.parse(validMixedRaw);
  badVer.version = 99;
  const file = new FakeFileHandle('eval.json', JSON.stringify(badVer));
  const res = await readEvaluationFileHandle(file, sha256);
  assert.equal(res.status, 'EVALUATION_UNSUPPORTED_VERSION');
  assert.equal(res.issueCode, 'CONTRACT_VERSION_UNSUPPORTED');
});

test('evaluation-reader: handles digest mismatch', async () => {
  const mismatch = JSON.parse(validMixedRaw);
  mismatch.rubric_digest = '0'.repeat(64);
  const file = new FakeFileHandle('eval.json', JSON.stringify(mismatch));
  const res = await readEvaluationFileHandle(file, sha256);
  assert.equal(res.status, 'EVALUATION_DIGEST_MISMATCH');
  assert.equal(res.issueCode, 'CONTRACT_DIGEST_MISMATCH');
});

test('evaluation-reader: handles invalid schema and contract violations', async () => {
  const invalid = JSON.parse(validMixedRaw);
  invalid.cases[0].observations.pop(); // observation count mismatch
  const file = new FakeFileHandle('eval.json', JSON.stringify(invalid));
  const res = await readEvaluationFileHandle(file, sha256);
  assert.equal(res.status, 'EVALUATION_INVALID');
});

test('evaluation-reader: handles permission denial and read failures', async () => {
  const deniedFile = new FakeFileHandle('eval.json', validMixedRaw);
  deniedFile._permission = 'denied';
  const deniedRes = await readEvaluationFileHandle(deniedFile, sha256);
  assert.equal(deniedRes.status, 'EVALUATION_PERMISSION_DENIED');

  const failFile = new FakeFileHandle('eval.json', validMixedRaw);
  failFile._throwOnGetFile = true;
  const failRes = await readEvaluationFileHandle(failFile, sha256);
  assert.equal(failRes.status, 'EVALUATION_READ_FAILED');

  const failBufFile = new FakeFileHandle('eval.json', validMixedRaw);
  failBufFile._throwOnArrayBuffer = true;
  const failBufRes = await readEvaluationFileHandle(failBufFile, sha256);
  assert.equal(failBufRes.status, 'EVALUATION_READ_FAILED');
});

test('evaluation-reader: selectAndReadEvaluationFiles handles environment without picker or cancelled picker', async () => {
  // Without globalThis.showOpenFilePicker
  const oldPicker = globalThis.showOpenFilePicker;
  delete globalThis.showOpenFilePicker;
  try {
    const res = await selectAndReadEvaluationFiles(sha256);
    assert.equal(res.length, 1);
    assert.equal(res[0].status, 'EVALUATION_SELECTION_CANCELLED');
  } finally {
    globalThis.showOpenFilePicker = oldPicker;
  }

  // With picker throwing AbortError (cancellation)
  globalThis.showOpenFilePicker = async () => {
    const err = new Error('User cancelled');
    err.name = 'AbortError';
    throw err;
  };
  try {
    const res = await selectAndReadEvaluationFiles(sha256);
    assert.equal(res.length, 1);
    assert.equal(res[0].status, 'EVALUATION_SELECTION_CANCELLED');
  } finally {
    globalThis.showOpenFilePicker = oldPicker;
  }
});
