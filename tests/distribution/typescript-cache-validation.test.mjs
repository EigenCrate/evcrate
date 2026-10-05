import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  toPosixPath,
  isStrictlyInside,
  cleanStaleOutputs,
  writeReceipt,
} from '../../scripts/typescript-build-receipt.mjs';

import {
  parseTsConfig,
  resolveConfigOutputs,
  isBuildInfoCorrupt,
  validateAndInvalidateCache,
} from '../../scripts/typescript-build-cache.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..', '..');

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'evcrate-ts-unit-'));
}

describe('TypeScript Cache & Receipt Unit Validation', () => {
  describe('Config & Output Resolution', () => {
    it('resolves root tsconfig.json output targets and cache paths', () => {
      const info = resolveConfigOutputs('tsconfig.json', packageRoot);
      assert.ok(info.expectedOutputs.length > 50);
      assert.ok(info.expectedOutputs.includes('dist/index.js'));
      assert.ok(info.expectedOutputs.includes('dist/index.d.ts'));
      assert.equal(info.relativeOutDir, 'dist');
      assert.equal(info.tsBuildInfoPath, join(packageRoot, '.cache', 'evcrate', 'tsconfig.tsbuildinfo'));
      assert.equal(info.receiptPath, join(packageRoot, '.cache', 'evcrate', 'tsconfig.tsbuildinfo.receipt.json'));
    });

    it('resolves tsconfig.advisor-runtime.json output targets and cache paths', () => {
      const info = resolveConfigOutputs('tsconfig.advisor-runtime.json', packageRoot);
      assert.ok(info.expectedOutputs.length > 0);
      assert.ok(info.expectedOutputs.some((p) => p.endsWith('advisor-contract-runtime.js')));
      assert.ok(info.expectedOutputs.some((p) => p.endsWith('advisor-metrics.js')));
      assert.ok(info.expectedOutputs.some((p) => p.endsWith('json.js')));
      assert.ok(info.expectedOutputs.some((p) => p.endsWith('canonical-json.js')));
      assert.equal(info.tsBuildInfoPath, join(packageRoot, '.cache', 'evcrate', 'tsconfig.advisor-runtime.tsbuildinfo'));
      assert.equal(info.receiptPath, join(packageRoot, '.cache', 'evcrate', 'tsconfig.advisor-runtime.tsbuildinfo.receipt.json'));
    });

    it('honors forwarded compiler CLI options such as --noEmit and --outDir', () => {
      const noEmitInfo = resolveConfigOutputs('tsconfig.advisor-runtime.json', packageRoot, ['--noEmit']);
      assert.equal(noEmitInfo.expectedOutputs.length, 0);
      assert.equal(noEmitInfo.parsed.options.noEmit, true);

      const outDirInfo = resolveConfigOutputs('tsconfig.advisor-runtime.json', packageRoot, ['--outDir', 'custom_output_dir']);
      assert.equal(outDirInfo.relativeOutDir, 'custom_output_dir');
      assert.ok(outDirInfo.expectedOutputs.every((p) => p.startsWith('custom_output_dir/')));
    });

    it('throws error when tsconfig does not exist', () => {
      assert.throws(() => parseTsConfig('missing-config.json', packageRoot), /Config file not found/);
    });
  });

  describe('Build Info Corruption & Output Invalidation', () => {
    let tempDir;
    before(() => { tempDir = makeTempDir(); });
    after(() => { if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true }); });

    it('detects healthy vs corrupt build info', () => {
      const missing = join(tempDir, 'missing.tsbuildinfo');
      assert.equal(isBuildInfoCorrupt(missing), false);

      const empty = join(tempDir, 'empty.tsbuildinfo');
      writeFileSync(empty, '', 'utf8');
      assert.equal(isBuildInfoCorrupt(empty), true);

      const invalid = join(tempDir, 'invalid.tsbuildinfo');
      writeFileSync(invalid, 'NOT_VALID_JSON{', 'utf8');
      assert.equal(isBuildInfoCorrupt(invalid), true);

      const healthy = join(tempDir, 'healthy.tsbuildinfo');
      writeFileSync(healthy, JSON.stringify({ version: '5.9.3' }), 'utf8');
      assert.equal(isBuildInfoCorrupt(healthy), false);
    });

    it('invalidates cache when an expected output is missing on disk', () => {
      const fakeCache = join(tempDir, 'cache.tsbuildinfo');
      writeFileSync(fakeCache, JSON.stringify({ version: '5.9.3' }), 'utf8');
      const fakeOutput = join(tempDir, 'out.js');
      const info = { tsBuildInfoPath: fakeCache, expectedOutputs: [toPosixPath(fakeOutput)] };

      const result = validateAndInvalidateCache(info, tempDir, { warn: () => {} });
      assert.equal(result.invalidated, true);
      assert.equal(existsSync(fakeCache), false);
    });
  });

  describe('Receipt Management & Safe Stale Output Cleanup', () => {
    let tempDir;
    before(() => { tempDir = makeTempDir(); });
    after(() => { if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true }); });

    it('isStrictlyInside accurately prevents path escaping', () => {
      const baseDir = join(tempDir, 'out');
      mkdirSync(baseDir, { recursive: true });

      assert.equal(isStrictlyInside(join(baseDir, 'file.js'), baseDir), true);
      assert.equal(isStrictlyInside(join(baseDir, 'sub', 'file.js'), baseDir), true);
      assert.equal(isStrictlyInside(baseDir, baseDir), false);
      assert.equal(isStrictlyInside(join(tempDir, 'file.js'), baseDir), false);
      assert.equal(isStrictlyInside('/etc/passwd', baseDir), false);
    });

    it('cleanStaleOutputs rejects directory traversal and unsafe receipt paths', () => {
      const outDir = join(tempDir, 'dist-safe');
      mkdirSync(outDir, { recursive: true });
      const outsideFile = join(tempDir, 'outside.txt');
      writeFileSync(outsideFile, 'keep me safe', 'utf8');

      const receiptPath = join(tempDir, 'unsafe.receipt.json');
      const fakeReceipt = {
        version: 1, config: 'tsconfig.json', outDir: 'dist-safe',
        outputs: ['../outside.txt', 'dist-safe/valid.js', '/absolute/path.js'],
      };
      writeFileSync(receiptPath, JSON.stringify(fakeReceipt), 'utf8');

      const { cleaned, errors } = cleanStaleOutputs(receiptPath, new Set(['dist-safe/valid.js']), outDir, tempDir);
      assert.equal(existsSync(outsideFile), true);
      assert.ok(errors.length >= 1);
      assert.equal(cleaned.length, 0);
    });

    it('cleanStaleOutputs cleanly removes only unreferenced compiler-owned outputs', () => {
      const outDir = join(tempDir, 'owned-dist');
      mkdirSync(outDir, { recursive: true });

      const staleFile = join(outDir, 'old-module.js');
      const activeFile = join(outDir, 'active-module.js');
      const unrelatedFile = join(outDir, 'user-custom.txt');
      writeFileSync(staleFile, 'stale', 'utf8');
      writeFileSync(activeFile, 'active', 'utf8');
      writeFileSync(unrelatedFile, 'unrelated', 'utf8');

      const receiptPath = join(tempDir, 'owned.receipt.json');
      writeReceipt(receiptPath, 'tsconfig.json', 'owned-dist', ['owned-dist/old-module.js', 'owned-dist/active-module.js'], tempDir);

      const currentOutputs = new Set(['owned-dist/active-module.js']);
      const { cleaned } = cleanStaleOutputs(receiptPath, currentOutputs, outDir, tempDir);

      assert.equal(cleaned.length, 1);
      assert.equal(cleaned[0], 'owned-dist/old-module.js');
      assert.equal(existsSync(staleFile), false);
      assert.equal(existsSync(activeFile), true);
      assert.equal(existsSync(unrelatedFile), true);
    });
  });
});
