import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assetVerification = require('../../scripts/release/asset-verification.cjs');

import { buildWindowsTestReleaseSet } from '../installers/fixtures/windows-release-fixture.mjs';

test('WRQ-021: buildWindowsTestReleaseSet produces deterministic byte-for-byte identical output across independent runs', () => {
  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-win-det-a-'));
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-win-det-b-'));

  try {
    const resultA = buildWindowsTestReleaseSet({ outputDir: tmpA, version: '1.0.0' });
    const resultB = buildWindowsTestReleaseSet({ outputDir: tmpB, version: '1.0.0' });

    assert.equal(resultA.files.length, 4);
    assert.equal(resultB.files.length, 4);

    for (let i = 0; i < 4; i += 1) {
      const fileA = resultA.files[i];
      const fileB = resultB.files[i];
      assert.equal(fileA.name, fileB.name);
      assert.equal(fileA.size, fileB.size);
      assert.equal(fileA.sha256, fileB.sha256);

      const bytesA = fs.readFileSync(path.join(tmpA, fileA.name));
      const bytesB = fs.readFileSync(path.join(tmpB, fileB.name));
      assert.ok(bytesA.equals(bytesB), `Bytes for ${fileA.name} must be byte-for-byte identical`);
    }

    const summary = assetVerification.verifyWindowsAssetSet({ dir: tmpA });
    assert.equal(summary.version, '1.0.0');
    assert.equal(summary.tag, 'v1.0.0');
    assert.equal(summary.sourceCommit, 'a'.repeat(40));
    assert.equal(summary.files.length, 4);
  } finally {
    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
  }
});
