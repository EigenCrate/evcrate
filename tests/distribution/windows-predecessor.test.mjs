import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';


import { buildWindowsTestReleaseSet } from '../installers/fixtures/windows-release-fixture.mjs';
import {
  BOOTSTRAP_VERSION,
  BOOTSTRAP_TAG,
  BOOTSTRAP_COMMIT,
  BOOTSTRAP_KIND,
  QUALIFIED_KIND,
  resolvePredecessorPlan,
  filterStableReleases
} from '../../scripts/release/predecessor-resolver-core.mjs';
import { prepareWindowsPredecessor } from '../../scripts/release/prepare-windows-predecessor.mjs';
import { makeMockRelease } from './windows-predecessor-mock-releases.mjs';


test('WRQ-022: filterStableReleases correctly filters drafts, prereleases, and inspects labels', () => {
  const rDraft = makeMockRelease('1.0.0', { draft: true, qualified: true });
  const rPre = makeMockRelease('1.1.0-rc.1', { prerelease: true, qualified: true });
  const rInvalid = { tag_name: 'invalid', assets: [] };
  const rDeferred = makeMockRelease('1.2.0', { deferred: true });
  const rQual = makeMockRelease('1.3.0', { qualified: true });

  const stable = filterStableReleases([rDraft, rPre, rInvalid, rDeferred, rQual]);
  assert.equal(stable.length, 2);
  assert.equal(stable[0].version, '1.2.0');
  assert.equal(stable[0].isQualified, false);
  assert.equal(stable[1].version, '1.3.0');
  assert.equal(stable[1].isQualified, true);

  const rDup = makeMockRelease('1.4.0', { qualified: true, duplicateLabel: true });
  assert.throws(
    () => filterStableReleases([rDup]),
    /Duplicate asset label/u
  );
});

test('WRQ-023: resolvePredecessorPlan enforces irreversible state transition and candidate version ordering', () => {
  // 1. No releases -> bootstrap
  const planEmpty = resolvePredecessorPlan({ releases: [], candidateVersion: '1.1.0' });
  assert.equal(planEmpty.mode, 'bootstrap');
  assert.equal(planEmpty.bootstrap.version, BOOTSTRAP_VERSION);

  // Candidate <= bootstrap throws
  assert.throws(
    () => resolvePredecessorPlan({ releases: [], candidateVersion: '1.0.0' }),
    /Candidate version "1.0.0" must be greater than bootstrap version "1.0.0"/u
  );
  assert.throws(
    () => resolvePredecessorPlan({ releases: [], candidateVersion: '0.9.0' }),
    /Candidate version "0.9.0" must be greater than bootstrap version "1.0.0"/u
  );

  // 2. Only deferred (unqualified) releases -> bootstrap
  const rDef1 = makeMockRelease('1.1.0', { deferred: true });
  const rDef2 = makeMockRelease('1.2.0', { deferred: true });
  const planDef = resolvePredecessorPlan({ releases: [rDef1, rDef2], candidateVersion: '1.3.0' });
  assert.equal(planDef.mode, 'bootstrap');

  // 3. Qualified release exists -> qualified mode
  const rQual1 = makeMockRelease('1.3.0', { qualified: true });
  const planQual = resolvePredecessorPlan({ releases: [rDef1, rDef2, rQual1], candidateVersion: '1.4.0' });
  assert.equal(planQual.mode, 'qualified');
  assert.equal(planQual.release.version, '1.3.0');

  // Candidate <= latest qualified throws
  assert.throws(
    () => resolvePredecessorPlan({ releases: [rQual1], candidateVersion: '1.3.0' }),
    /Candidate version "1.3.0" must be greater than predecessor version "1.3.0"/u
  );

  // 4. Irreversible: older is qualified, latest stable is unqualified -> FAILS CLOSED
  const rUnqualNewer = makeMockRelease('1.4.0', { deferred: true });
  assert.throws(
    () => resolvePredecessorPlan({ releases: [rQual1, rUnqualNewer], candidateVersion: '1.5.0' }),
    /Fail-closed: once qualification history exists, latest stable must qualify/u
  );

  // 5. Missing asset on qualified release throws
  const rMissingMeta = makeMockRelease('1.5.0', { qualified: true, missingAsset: 'metadata' });
  assert.throws(
    () => resolvePredecessorPlan({ releases: [rMissingMeta], candidateVersion: '1.6.0' }),
    /Missing release metadata asset/u
  );
});

test('WRQ-058 & prepareWindowsPredecessor: bootstrap mode builds exact 4 files and passes verification', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-boot-'));
  try {
    const result = await prepareWindowsPredecessor({
      candidateVersion: '2.0.0',
      outputDir: tmp,
      releases: []
    });

    assert.equal(result.kind, BOOTSTRAP_KIND);
    assert.equal(result.version, BOOTSTRAP_VERSION);
    assert.equal(result.tag, BOOTSTRAP_TAG);
    assert.equal(result.sourceCommit, BOOTSTRAP_COMMIT);
    assert.equal(result.files.length, 4);

    const onDiskFiles = fs.readdirSync(tmp).sort();
    assert.deepEqual(onDiskFiles, [
      `evcrate-v${BOOTSTRAP_VERSION}-windows-x64.zip`,
      `evcrate-v${BOOTSTRAP_VERSION}-windows-x64.zip.sha256`,
      `evcrate-v${BOOTSTRAP_VERSION}.release.json`,
      'install.ps1'
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('WRQ-058 & prepareWindowsPredecessor: qualified release downloads, verifies, and promotes exact 4 files', async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-source-fixture-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-dest-'));

  try {
    const version = '2.1.0';
    buildWindowsTestReleaseSet({ outputDir: fixtureDir, version });
    const mockRelease = makeMockRelease(version, { qualified: true });

    // Injected downloadFn copies from fixtureDir simulating network download
    const downloadFn = async (asset, destPath) => {
      const src = path.join(fixtureDir, asset.name);
      fs.copyFileSync(src, destPath);
    };

    const result = await prepareWindowsPredecessor({
      candidateVersion: '2.2.0',
      outputDir: outDir,
      releases: [mockRelease],
      downloadFn
    });

    assert.equal(result.kind, QUALIFIED_KIND);
    assert.equal(result.version, version);
    assert.equal(result.tag, `v${version}`);
    assert.equal(result.files.length, 4);

    // Verify tamper in download causes fail-closed without leaving partial output
    const outDirTamper = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-tamper-'));
    try {
      const tamperDownloadFn = async (asset, destPath) => {
        const src = path.join(fixtureDir, asset.name);
        fs.copyFileSync(src, destPath);
        if (asset.name.endsWith('.zip')) {
          const raw = fs.readFileSync(destPath);
          raw[raw.length - 1] ^= 0xff;
          fs.writeFileSync(destPath, raw);
        }
      };

      await assert.rejects(
        () => prepareWindowsPredecessor({
          candidateVersion: '2.2.0',
          outputDir: outDirTamper,
          releases: [mockRelease],
          downloadFn: tamperDownloadFn
        }),
        /Windows archive SHA-256 mismatch/u
      );

      // Verify no partial files left in outputDir
      const remainingFiles = fs.readdirSync(outDirTamper);
      assert.equal(remainingFiles.length, 0, 'No partial predecessor files should remain after failure');
    } finally {
      fs.rmSync(outDirTamper, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
