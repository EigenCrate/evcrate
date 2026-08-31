import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBoundedRequestFile } from '../../dist/cli/request-file.js';

function fixtureRoot() {
  return mkdtempSync(join(tmpdir(), 'evcrate-request-file-'));
}

function errorCode(callback) {
  try {
    callback();
  } catch (error) {
    return error.code;
  }
  return undefined;
}

test('reads a valid request at the exact byte boundary', () => {
  const root = fixtureRoot();
  const requestPath = join(root, 'request.json');
  writeFileSync(requestPath, '{"x":"12345678"}');
  assert.equal(Buffer.byteLength('{"x":"12345678"}'), 16);
  assert.deepEqual(readBoundedRequestFile(requestPath, { maxBytes: 16 }), { x: '12345678' });
});

test('rejects missing files, directories, and symlinks as unsafe paths', () => {
  const root = fixtureRoot();
  const filePath = join(root, 'request.json');
  writeFileSync(filePath, '{}');
  const linkPath = join(root, 'request-link.json');
  symlinkSync(filePath, linkPath);
  assert.equal(errorCode(() => readBoundedRequestFile(join(root, 'missing.json'))), 'PATH_UNSAFE');
  assert.equal(errorCode(() => readBoundedRequestFile(root)), 'PATH_UNSAFE');
  assert.equal(errorCode(() => readBoundedRequestFile(linkPath)), 'PATH_UNSAFE');
});

test('rejects oversized and invalid UTF-8 request files', () => {
  const root = fixtureRoot();
  const oversizedPath = join(root, 'oversized.json');
  writeFileSync(oversizedPath, '{"value":"123456789"}');
  assert.equal(errorCode(() => readBoundedRequestFile(oversizedPath, { maxBytes: 16 })), 'PROTOCOL_INVALID');

  const invalidPath = join(root, 'invalid.json');
  writeFileSync(invalidPath, Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]));
  assert.equal(errorCode(() => readBoundedRequestFile(invalidPath)), 'PROTOCOL_INVALID');
});

test('rejects requests exceeding the bounded JSON depth', () => {
  const root = fixtureRoot();
  const requestPath = join(root, 'deep.json');
  writeFileSync(requestPath, `${'['.repeat(18)}0${']'.repeat(18)}`);
  assert.equal(errorCode(() => readBoundedRequestFile(requestPath)), 'PROTOCOL_INVALID');
});

test('rejects an unsupported custom maximum instead of allocating unbounded memory', () => {
  const root = fixtureRoot();
  const requestPath = join(root, 'request.json');
  writeFileSync(requestPath, '{}');
  assert.equal(errorCode(() => readBoundedRequestFile(requestPath, { maxBytes: 64 * 1024 + 1 })), 'PROTOCOL_INVALID');
});
