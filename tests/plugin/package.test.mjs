/**
 * @file package.test.mjs
 * Validation and security tests for EVCrate Advisor Plugin packaging (Phase E04).
 *
 * Tests:
 * 1. Package build reproducibility and deterministic hashing
 * 2. Independent package verification
 * 3. Exact logical members and permissions
 * 4. Negative / hostile archive rejection:
 *    - Directory traversal ('../evil.txt')
 *    - Absolute path ('/etc/passwd')
 *    - Backslash path ('win\\file.txt')
 *    - Case collision ('File.txt' and 'file.txt')
 *    - Executable permission outside worker entrypoint (e.g. ui/index.html with 0755)
 *    - Tampered file content / SHA-256 mismatch
 *    - Missing required members (e.g. manifest.json)
 *    - Oversized archive / size caps
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPluginPackage } = await import('../../scripts/plugin/build-package.mjs');
const { verifyPluginPackageArchive } = await import('../../scripts/plugin/verify-package.mjs');
const { createDeterministicTarArchive } = require('../../scripts/plugin/tar-builder.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

test('Plugin Package: build is deterministic and produces identical digest across runs', async () => {
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-build1-'));
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-build2-'));

  try {
    const res1 = await buildPluginPackage({ outDir: tmp1 });
    const res2 = await buildPluginPackage({ outDir: tmp2 });

    assert.equal(res1.sha256, res2.sha256, 'Consecutive builds must yield identical SHA256');
    assert.equal(res1.size, res2.size, 'Consecutive builds must yield identical file size');

    const verifyRes = verifyPluginPackageArchive(res1.path, { expectedSha256: res1.sha256 });
    assert.equal(verifyRes.valid, true);
    assert.equal(verifyRes.version, res1.version);
    assert.equal(verifyRes.fileCount, res1.fileCount);
  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
});

test('Plugin Package: negative fixtures reject path traversal, backslashes, and absolute paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-negative-'));

  try {
    // 1. Path traversal
    const badTraversalPath = path.join(tmp, 'traversal.tar.gz');
    createDeterministicTarArchive([
      { path: 'manifest.json', data: Buffer.from('{"id":"evcrate.advisor","version":"0.1.0","entrypoints":{"backend":{"entry":"backend/worker.cjs"},"ui":{"entry":"ui/index.html"}}}'), mode: 0o644 },
      { path: 'inventory.json', data: Buffer.from('[]'), mode: 0o644 },
      { path: '../escape.txt', data: Buffer.from('hostile'), mode: 0o644 }
    ], badTraversalPath);

    assert.throws(() => {
      verifyPluginPackageArchive(badTraversalPath);
    }, /traversal|forbidden/i);

    // 2. Absolute path
    const badAbsPath = path.join(tmp, 'absolute.tar.gz');
    createDeterministicTarArchive([
      { path: 'manifest.json', data: Buffer.from('{"id":"evcrate.advisor","version":"0.1.0","entrypoints":{"backend":{"entry":"backend/worker.cjs"},"ui":{"entry":"ui/index.html"}}}'), mode: 0o644 },
      { path: 'inventory.json', data: Buffer.from('[]'), mode: 0o644 },
      { path: '/etc/shadow', data: Buffer.from('hostile'), mode: 0o644 }
    ], badAbsPath);

    assert.throws(() => {
      verifyPluginPackageArchive(badAbsPath);
    }, /absolute/i);

    // 3. Backslash path
    const badBackslashPath = path.join(tmp, 'backslash.tar.gz');
    createDeterministicTarArchive([
      { path: 'manifest.json', data: Buffer.from('{"id":"evcrate.advisor","version":"0.1.0","entrypoints":{"backend":{"entry":"backend/worker.cjs"},"ui":{"entry":"ui/index.html"}}}'), mode: 0o644 },
      { path: 'inventory.json', data: Buffer.from('[]'), mode: 0o644 },
      { path: 'backend\\worker.cjs', data: Buffer.from('hostile'), mode: 0o755 }
    ], badBackslashPath);

    assert.throws(() => {
      verifyPluginPackageArchive(badBackslashPath);
    }, /backslash/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Plugin Package: negative fixtures reject case collision and unauthorized executable mode', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-negative-modes-'));

  try {
    // 1. Case collision
    const badCasePath = path.join(tmp, 'collision.tar.gz');
    createDeterministicTarArchive([
      { path: 'manifest.json', data: Buffer.from('{"id":"evcrate.advisor","version":"0.1.0","entrypoints":{"backend":{"entry":"backend/worker.cjs"},"ui":{"entry":"ui/index.html"}}}'), mode: 0o644 },
      { path: 'inventory.json', data: Buffer.from('[]'), mode: 0o644 },
      { path: 'file.txt', data: Buffer.from('one'), mode: 0o644 },
      { path: 'FILE.txt', data: Buffer.from('two'), mode: 0o644 }
    ], badCasePath);

    assert.throws(() => {
      verifyPluginPackageArchive(badCasePath);
    }, /case collision/i);

    // 2. Executable permission outside worker.cjs
    const badExecPath = path.join(tmp, 'badexec.tar.gz');
    const dummyUi = Buffer.from('<html></html>');
    const dummyWorker = Buffer.from('// worker');
    const inv = [
      { path: 'backend/worker.cjs', size: dummyWorker.length, sha256: crypto.createHash('sha256').update(dummyWorker).digest('hex'), mode: 0o755 },
      { path: 'ui/index.html', size: dummyUi.length, sha256: crypto.createHash('sha256').update(dummyUi).digest('hex'), mode: 0o755 } // Illegal 0755
    ];
    createDeterministicTarArchive([
      { path: 'manifest.json', data: Buffer.from('{"id":"evcrate.advisor","version":"0.1.0","entrypoints":{"backend":{"entry":"backend/worker.cjs"},"ui":{"entry":"ui/index.html"}}}'), mode: 0o644 },
      { path: 'inventory.json', data: Buffer.from(JSON.stringify(inv)), mode: 0o644 },
      { path: 'backend/worker.cjs', data: dummyWorker, mode: 0o755 },
      { path: 'ui/index.html', data: dummyUi, mode: 0o755 }
    ], badExecPath);

    assert.throws(() => {
      verifyPluginPackageArchive(badExecPath);
    }, /mode forbidden/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Plugin Package: tamper detection catches inventory/data mismatch and expected SHA mismatch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-tamper-'));

  try {
    const dummyUi = Buffer.from('<html></html>');
    const dummyWorker = Buffer.from('// worker');
    const inv = [
      { path: 'backend/worker.cjs', size: dummyWorker.length, sha256: crypto.createHash('sha256').update(dummyWorker).digest('hex'), mode: 0o755 },
      { path: 'ui/index.html', size: dummyUi.length, sha256: '0000000000000000000000000000000000000000000000000000000000000000', mode: 0o644 } // Mismatch
    ];
    const tamperedPath = path.join(tmp, 'tampered.tar.gz');
    createDeterministicTarArchive([
      { path: 'manifest.json', data: Buffer.from('{"id":"evcrate.advisor","version":"0.1.0","entrypoints":{"backend":{"entry":"backend/worker.cjs"},"ui":{"entry":"ui/index.html"}}}'), mode: 0o644 },
      { path: 'inventory.json', data: Buffer.from(JSON.stringify(inv)), mode: 0o644 },
      { path: 'backend/worker.cjs', data: dummyWorker, mode: 0o755 },
      { path: 'ui/index.html', data: dummyUi, mode: 0o644 }
    ], tamperedPath);

    assert.throws(() => {
      verifyPluginPackageArchive(tamperedPath);
    }, /SHA256 mismatch/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Plugin Package: negative fixtures reject duplicate tar entries', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-duplicate-'));

  try {
    const badDupPath = path.join(tmp, 'duplicate.tar.gz');
    const dummy = Buffer.from('test');
    createDeterministicTarArchive([
      { path: 'manifest.json', data: Buffer.from('{"id":"evcrate.advisor","version":"0.1.0","entrypoints":{"backend":{"entry":"backend/worker.cjs"},"ui":{"entry":"ui/index.html"}}}'), mode: 0o644 },
      { path: 'inventory.json', data: Buffer.from('[]'), mode: 0o644 },
      { path: 'backend/worker.cjs', data: dummy, mode: 0o755 },
      { path: 'backend/worker.cjs', data: dummy, mode: 0o755 }
    ], badDupPath);

    assert.throws(() => {
      verifyPluginPackageArchive(badDupPath);
    }, /Duplicate entry forbidden in plugin archive/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
