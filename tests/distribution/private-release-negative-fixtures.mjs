import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

import releaseContract from '../../scripts/release/release-contract.cjs';
import { validateInventoryPath } from '../../scripts/release/path-policy.cjs';
import { extractSpecifiersFromAst } from '../../scripts/release/ast-scanner.cjs';
import { buildReleaseArchives } from '../../scripts/release/archive-writers.cjs';
import { createTarArchive } from '../../scripts/release/tar-writer.cjs';
import { verifyTarArchive } from '../../scripts/release/tar-verifier.cjs';
import { createZipArchive } from '../../scripts/release/zip-writer.cjs';
import { verifyZipArchive } from '../../scripts/release/zip-verifier.cjs';

test('negative fixtures: module specifiers and AST scanner', () => {
  assert.throws(() => extractSpecifiersFromAst('f.js', 'require(x);'), /Non-literal require/u);
  assert.throws(() => extractSpecifiersFromAst('f.js', 'import(x);'), /Non-literal dynamic import/u);
  assert.throws(() => extractSpecifiersFromAst('f.js', 'const x = "pi-code-graph";'), /Forbidden reference/u);
  assert.throws(() => extractSpecifiersFromAst('f.js', 'process.dlopen();'), /Native addon loader dlopen/u);
});

test('negative fixtures: path policy and inventory collisions', () => {
  assert.throws(() => validateInventoryPath('plans/secret.md'), /Confidential path/u);
  assert.throws(() => validateInventoryPath('foo/.env'), /secret file/u);
  assert.throws(() => validateInventoryPath('foo/../bar'), /traversal/u);
  assert.throws(() => validateInventoryPath('CON.txt'), /DOS device/u);
  assert.throws(() => validateInventoryPath('dir/COM1'), /DOS device/u);
  assert.throws(() => validateInventoryPath('sub/file:stream'), /alternate data stream/u);

  const data = Buffer.from('abc');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-neg-'));

  try {
    // Duplicate path
    assert.throws(
      () => buildReleaseArchives({
        records: [
          { path: 'a.txt', size: 3, mode: 0o644, sha256: hash, data },
          { path: 'a.txt', size: 3, mode: 0o644, sha256: hash, data }
        ],
        outputDir: tmp,
        version: '1.0.0',
        metadataGenerator: () => ({})
      }),
      /Duplicate path/u
    );

    // Case-fold collision
    assert.throws(
      () => buildReleaseArchives({
        records: [
          { path: 'file.txt', size: 3, mode: 0o644, sha256: hash, data },
          { path: 'FILE.TXT', size: 3, mode: 0o644, sha256: hash, data }
        ],
        outputDir: tmp,
        version: '1.0.0',
        metadataGenerator: () => ({})
      }),
      /Case-fold collision/u
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('negative fixtures: tar verification rejects corrupted checksum, truncation, and bad typeflag', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-tar-neg-'));
  const data = Buffer.from('test content\n');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const records = [{ path: 'test.txt', size: data.length, mode: 0o644, sha256: hash, data }];
  const tarPath = join(tmp, 'test.tar.gz');

  try {
    createTarArchive(records, tarPath);

    // Bad expected SHA-256
    assert.throws(
      () => verifyTarArchive(tarPath, [{ ...records[0], sha256: '0'.repeat(64) }]),
      /SHA-256 mismatch/u
    );

    // Truncated tar archive
    const rawTar = zlib.gunzipSync(readFileSync(tarPath));
    const truncatedTar = rawTar.subarray(0, 512 + 10);
    const truncPath = join(tmp, 'trunc.tar.gz');
    writeFileSync(truncPath, zlib.gzipSync(truncatedTar));
    assert.throws(
      () => verifyTarArchive(truncPath, records),
      /Truncated tar payload|Archive truncated/u
    );

    // Corrupted checksum in header
    const badChecksumTar = Buffer.from(rawTar);
    badChecksumTar[150] ^= 0x01;
    const badChkPath = join(tmp, 'badchk.tar.gz');
    writeFileSync(badChkPath, zlib.gzipSync(badChecksumTar));
    assert.throws(
      () => verifyTarArchive(badChkPath, records),
      /Invalid tar header checksum/u
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('negative fixtures: zip verification rejects tampered bytes, local mismatch, and trailing comments', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-zip-neg-'));
  const data = Buffer.from('zip content\n');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const records = [{ path: 'test.txt', size: data.length, mode: 0o644, sha256: hash, data }];
  const zipPath = join(tmp, 'test.zip');

  try {
    createZipArchive(records, zipPath);

    // Trailing data/comment rejected
    const zipBytes = readFileSync(zipPath);
    const withTrailing = Buffer.concat([zipBytes, Buffer.from('evil')]);
    const trailPath = join(tmp, 'trail.zip');
    writeFileSync(trailPath, withTrailing);
    assert.throws(
      () => verifyZipArchive(trailPath, records),
      /EOCD not found at exact end/u
    );

    // Corrupted compressed payload fails CRC
    const tampered = Buffer.from(zipBytes);
    tampered[tampered.length - 35] ^= 0x55;
    const tampPath = join(tmp, 'tamp.zip');
    writeFileSync(tampPath, tampered);
    assert.throws(
      () => verifyZipArchive(tampPath, records)
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('negative fixtures: rollback on failure leaves zero destination files', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-rollback-test-'));
  const data = Buffer.from('sample\n');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const records = [{ path: 'sample.txt', size: data.length, mode: 0o644, sha256: hash, data }];

  try {
    // metadataGenerator throws error -> promotion aborted and rolled back
    assert.throws(
      () => buildReleaseArchives({
        records,
        outputDir: tmp,
        version: '1.0.0',
        metadataGenerator: () => {
          throw new Error('Injected metadata failure');
        }
      }),
      /Injected metadata failure/u
    );

    // Destination directory must have zero files
    const remaining = readdirSync(tmp);
    assert.deepEqual(remaining, [], 'Rollback must leave zero destination files on failure');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
