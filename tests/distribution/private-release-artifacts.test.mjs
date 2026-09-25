import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  symlinkSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
  statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

import releaseContract from '../../scripts/release/release-contract.cjs';
import { validateRuntimeClosure } from '../../scripts/release/runtime-closure.cjs';
import { buildReleaseArchives } from '../../scripts/release/archive-writers.cjs';
import { ADVISOR_CONTROLLER_FILES, PERSISTED_TARGETS } from '../../dist/index.js';
import assetVerification from '../../scripts/release/asset-verification.cjs';
import semanticReleaseAssetPrepare from '../../scripts/release/semantic-release-asset-prepare.cjs';

// Import negative fixtures suite so authoritative command runs all tests
import './private-release-negative-fixtures.mjs';

const packageRoot = process.cwd();

test('release-contract freezes schema, platforms, limits, and mutable path policy', () => {
  assert.equal(releaseContract.SCHEMA_ID, 'evcrate-private-release/v1');
  assert.deepEqual(releaseContract.SUPPORTED_PLATFORMS, ['linux-x64', 'windows-x64']);
  assert.equal(releaseContract.MAX_FILES, 100000);
  assert.equal(releaseContract.MAX_FILE_BYTES, 16 * 1024 * 1024);
  assert.equal(releaseContract.MAX_TOTAL_EXPANDED_BYTES, 512 * 1024 * 1024);

  assert.deepEqual(releaseContract.MUTABLE_PATHS, [
    '.evcrate/source/.claude/**',
    '.evcrate/registry.json',
    '.evcrate/scopes/**'
  ]);
});

test('sidecar serializer and strict parser enforce grammar <sha256>  <basename>\\n', () => {
  const hash = 'a'.repeat(64);
  const name = 'evcrate-v1.0.0-linux-x64.tar.gz';
  const serialized = releaseContract.serializeSidecar(hash, name);
  assert.equal(serialized, `${hash}  ${name}\n`);

  const parsed = releaseContract.parseSidecar(serialized, name);
  assert.equal(parsed.sha256, hash);
  assert.equal(parsed.basename, name);
});

test('runtime closure validator verifies current project with zero external dependencies', () => {
  const result = validateRuntimeClosure(packageRoot);
  assert.equal(result.valid, true);
  assert.ok(result.visitedCount > 50, `Expected many modules traversed, got ${result.visitedCount}`);
  assert.ok(result.visited.includes('dist/cli/evcrate.js'));
  assert.ok(result.visited.includes('dist/index.js'));
});

test('archive writers produce verified tar.gz, zip, sidecars, and metadata including empty files', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-arch-test-'));
  const data1 = Buffer.from('#!/usr/bin/env node\nconsole.log("cli");\n');
  const data2 = Buffer.from('{"name":"test"}\n');
  const emptyData = Buffer.alloc(0);
  const hash1 = crypto.createHash('sha256').update(data1).digest('hex');
  const hash2 = crypto.createHash('sha256').update(data2).digest('hex');
  const emptyHash = crypto.createHash('sha256').update(emptyData).digest('hex');

  const records = [
    { path: 'package.json', size: data2.length, mode: 0o644, sha256: hash2, data: data2 },
    { path: 'dist/cli/evcrate.js', size: data1.length, mode: 0o755, sha256: hash1, data: data1 },
    { path: 'empty.txt', size: 0, mode: 0o644, sha256: emptyHash, data: emptyData }
  ];

  const instData = Buffer.from('#!/bin/sh\necho install\n');
  const instHash = crypto.createHash('sha256').update(instData).digest('hex');
  const installers = [
    { name: 'install.sh', size: instData.length, sha256: instHash, data: instData },
    { name: 'install.ps1', size: instData.length, sha256: instHash, data: instData }
  ];

  const version = '9.9.9';
  const commit = 'd'.repeat(40);
  const hash = 'e'.repeat(64);

  try {
    const result = buildReleaseArchives({
      records,
      installers,
      outputDir: tmp,
      version,
      metadataGenerator: ({ inventoryDigest, platforms }) => ({
        schema: 'evcrate-private-release/v1',
        version,
        tag: `v${version}`,
        source_commit: commit,
        node_floor: '>=22.19.0',
        inventory_digest: inventoryDigest,
        build_manifest_digests: { all: hash },
        controller_closure_digest: hash,
        platforms,
        installers: {
          'install.sh': { name: 'install.sh', size: instData.length, sha256: instHash },
          'install.ps1': { name: 'install.ps1', size: instData.length, sha256: instHash }
        },
        mutable_paths: releaseContract.MUTABLE_PATHS
      })
    });

    assert.ok(result.inventoryDigest);
    assert.equal(result.platforms['linux-x64'].archive_name, `evcrate-v${version}-linux-x64.tar.gz`);
    assert.equal(result.platforms['windows-x64'].archive_name, `evcrate-v${version}-windows-x64.zip`);

    // Verify sidecars exist and match
    const linuxSidecar = readFileSync(join(tmp, `evcrate-v${version}-linux-x64.tar.gz.sha256`), 'utf8');
    const parsedLinuxSidecar = releaseContract.parseSidecar(linuxSidecar, `evcrate-v${version}-linux-x64.tar.gz`);
    assert.equal(parsedLinuxSidecar.sha256, result.platforms['linux-x64'].sha256);

    const winSidecar = readFileSync(join(tmp, `evcrate-v${version}-windows-x64.zip.sha256`), 'utf8');
    const parsedWinSidecar = releaseContract.parseSidecar(winSidecar, `evcrate-v${version}-windows-x64.zip`);
    assert.equal(parsedWinSidecar.sha256, result.platforms['windows-x64'].sha256);

    // Verify metadata exists and is valid
    const metaFile = JSON.parse(readFileSync(join(tmp, `evcrate-v${version}.release.json`), 'utf8'));
    assert.doesNotThrow(() => releaseContract.validateReleaseMetadata(metaFile));
    assert.equal(metaFile.inventory_digest, result.inventoryDigest);

    // Verify installers were linked
    assert.ok(existsSync(join(tmp, 'install.sh')));
    assert.ok(existsSync(join(tmp, 'install.ps1')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('packed artifact allowlist is Python-free, plan-free, test-free, and contains runtime assets', () => {
  const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  const match = packOutput.match(/^[{[]/m);
  const jsonIndex = match ? match.index : packOutput.search(/[[{]/);
  const parsed = JSON.parse(packOutput.slice(jsonIndex).trim());
  const [packMeta] = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const files = packMeta.files.map((f) => f.path);

  // Assert compiled JS is present
  assert.ok(files.includes('dist/cli/evcrate.js'), 'Must include dist/cli/evcrate.js');
  assert.ok(files.includes('dist/index.js'), 'Must include dist/index.js');
  assert.ok(files.includes('dist/index.d.ts'), 'Must include dist/index.d.ts');
  // Assert built standalone viewer is excluded from root package (clean cutover to independent plugin)
  assert.equal(files.some((f) => f.startsWith('viewer/dist/')), false, 'viewer/dist must be excluded from root package');


  // Assert authoritative controller files present (ADVISOR_CONTROLLER_FILES)
  for (const entry of ADVISOR_CONTROLLER_FILES) {
    const p = `.evcrate/source/.evcrate/bin/${entry}`;
    assert.ok(files.includes(p), `Missing controller file: ${p}`);
  }

  // Assert target manifests present
  for (const target of PERSISTED_TARGETS) {
    assert.ok(files.includes(`.evcrate/targets/${target}/manifest.json`), `Missing target manifest: ${target}`);
  }
  const targetManifestFiles = files.filter((file) => /^\.evcrate\/targets\/[^/]+\/manifest\.json$/u.test(file));
  assert.deepEqual(
    targetManifestFiles.sort(),
    PERSISTED_TARGETS.map((target) => `.evcrate/targets/${target}/manifest.json`).sort()
  );
  const controllerFiles = files
    .filter((file) => file.startsWith('.evcrate/source/.evcrate/bin/'))
    .map((file) => file.slice('.evcrate/source/.evcrate/bin/'.length))
    .sort();
  assert.deepEqual(controllerFiles, [...ADVISOR_CONTROLLER_FILES].sort());

  // Assert NO distribution, migration, adapter Python scripts and NO pycache/bytecode
  const forbiddenPython = files.filter((f) =>
    f.startsWith('distribution/') ||
    f.startsWith('distribute') ||
    f.startsWith('migrate_') ||
    f.startsWith('omp_adapter/') ||
    f.startsWith('copilot_adapter/') ||
    f.startsWith('pi_adapter/') ||
    f.includes('__pycache__') ||
    f.endsWith('.pyc') ||
    f.endsWith('.pyo')
  );
  assert.deepEqual(forbiddenPython, [], 'Packaged artifact must contain no distribution/migrator/adapter Python files or bytecode');

  // Assert no plans, no repo tests, no repo source, no node_modules
  assert.equal(files.some((f) => f.startsWith('plans/')), false, 'Must not contain plans/');
  assert.equal(files.some((f) => f.startsWith('tests/')), false, 'Must not contain tests/');
  assert.equal(files.some((f) => f.startsWith('src/')), false, 'Must not contain src/');
  assert.equal(files.some((f) => f.includes('node_modules')), false, 'Must not contain node_modules/');

  // Assert no viewer source, config, tests, or sourcemaps in package
  assert.equal(files.some((f) => f.startsWith('viewer/src/')), false, 'Must not contain viewer/src/');
  assert.equal(files.some((f) => f.startsWith('viewer/') && f.endsWith('.ts')), false, 'Must not contain viewer configs or TS files');
  assert.equal(files.some((f) => f.endsWith('.map')), false, 'Must not contain sourcemap files');

  // Assert registry-authorized skill resources remain present
  const registry = JSON.parse(readFileSync(join(packageRoot, '.evcrate', 'registry.json'), 'utf8'));
  assert.ok(registry.resources && registry.resources.length > 0);
  assert.ok(files.some((f) => f.includes('docx') && f.endsWith('.py')), 'Authorized skill script resources must be present');

  // Assert package.json metadata has private: true and no forbidden lifecycle hooks
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.publishConfig, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.scripts?.preinstall, undefined);
  assert.equal(pkg.scripts?.install, undefined);
  assert.equal(pkg.scripts?.postinstall, undefined);
  assert.equal(pkg.scripts?.prepare, undefined);
});

function createTestReleaseSet(dir, version = '9.9.9', commit = 'd'.repeat(40)) {
  const data1 = Buffer.from('#!/usr/bin/env node\nconsole.log("cli");\n');
  const data2 = Buffer.from('{"name":"test"}\n');
  const emptyData = Buffer.alloc(0);
  const hash1 = crypto.createHash('sha256').update(data1).digest('hex');
  const hash2 = crypto.createHash('sha256').update(data2).digest('hex');
  const emptyHash = crypto.createHash('sha256').update(emptyData).digest('hex');

  const records = [
    { path: 'package.json', size: data2.length, mode: 0o644, sha256: hash2, data: data2 },
    { path: 'dist/cli/evcrate.js', size: data1.length, mode: 0o755, sha256: hash1, data: data1 },
    { path: 'empty.txt', size: 0, mode: 0o644, sha256: emptyHash, data: emptyData }
  ];

  const instSh = Buffer.from('#!/bin/sh\necho install\n');
  const instPs1 = Buffer.from('# PowerShell install\nWrite-Host "install"\n');
  const instShHash = crypto.createHash('sha256').update(instSh).digest('hex');
  const instPs1Hash = crypto.createHash('sha256').update(instPs1).digest('hex');
  const installers = [
    { name: 'install.sh', size: instSh.length, sha256: instShHash, data: instSh },
    { name: 'install.ps1', size: instPs1.length, sha256: instPs1Hash, data: instPs1 }
  ];

  const hash = 'e'.repeat(64);
  const result = buildReleaseArchives({
    records,
    installers,
    outputDir: dir,
    version,
    metadataGenerator: ({ inventoryDigest, platforms }) => ({
      schema: 'evcrate-private-release/v1',
      version,
      tag: `v${version}`,
      source_commit: commit,
      node_floor: '>=22.19.0',
      inventory_digest: inventoryDigest,
      build_manifest_digests: { all: hash },
      controller_closure_digest: hash,
      platforms,
      installers: {
        'install.sh': { name: 'install.sh', size: instSh.length, sha256: instShHash },
        'install.ps1': { name: 'install.ps1', size: instPs1.length, sha256: instPs1Hash }
      },
      mutable_paths: releaseContract.MUTABLE_PATHS
    })
  });

  return { result, version, commit, instShHash, instPs1Hash };
}

function snapshotDirectory(dir) {
  const entries = readdirSync(dir).sort(releaseContract.compareCodePoints);
  const snapshot = {};
  for (const entry of entries) {
    const p = join(dir, entry);
    const stat = statSync(p);
    if (stat.isFile()) {
      const content = readFileSync(p);
      snapshot[entry] = {
        size: stat.size,
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        content
      };
    } else {
      snapshot[entry] = { isDir: stat.isDirectory() };
    }
  }
  return snapshot;
}

function assertDirectoryUnchanged(dir, beforeSnapshot) {
  const afterSnapshot = snapshotDirectory(dir);
  assert.deepEqual(
    Object.keys(afterSnapshot).sort(releaseContract.compareCodePoints),
    Object.keys(beforeSnapshot).sort(releaseContract.compareCodePoints),
    'Directory entries must match before and after'
  );
  for (const [name, before] of Object.entries(beforeSnapshot)) {
    const after = afterSnapshot[name];
    assert.equal(after.size, before.size, `File size for "${name}" must remain identical`);
    assert.equal(after.sha256, before.sha256, `File sha256 for "${name}" must remain identical`);
  }
}

test('WRQ-007: asset-verification module exports exact six functions and canonical names', () => {
  const expectedExports = [
    'getExpectedReleaseAssetNames',
    'main',
    'parseVerifierArgs',
    'sha256File',
    'verifyReleaseAssetSet',
    'verifyWindowsAssetSet'
  ];
  assert.deepEqual(Object.keys(assetVerification).sort(), expectedExports.sort());
  for (const fn of expectedExports) {
    assert.equal(typeof assetVerification[fn], 'function', `Export ${fn} must be a function`);
  }

  const version = '2.1.0';
  const releaseNames = assetVerification.getExpectedReleaseAssetNames(version);
  assert.equal(releaseNames.length, 7);
  assert.deepEqual(releaseNames, [
    `evcrate-v${version}-linux-x64.tar.gz`,
    `evcrate-v${version}-linux-x64.tar.gz.sha256`,
    `evcrate-v${version}.release.json`,
    `evcrate-v${version}-windows-x64.zip`,
    `evcrate-v${version}-windows-x64.zip.sha256`,
    'install.ps1',
    'install.sh'
  ].sort(releaseContract.compareCodePoints));

  // Verify sha256File helper matches crypto digest
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-hash-test-'));
  try {
    const testFile = join(tmp, 'test.bin');
    const payload = Buffer.from('hello streaming sha256 world');
    writeFileSync(testFile, payload);
    const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');
    const computed = assetVerification.sha256File(testFile);
    assert.equal(computed, expectedHash);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('WRQ-008: verifyReleaseAssetSet validates exact seven files, sidecars, metadata, hashes, and expectedHashes', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-vr-test-'));
  const version = '2.3.4';
  const commit = 'f'.repeat(40);
  try {
    createTestReleaseSet(tmp, version, commit);

    // 1. Basic valid verification
    const summary = assetVerification.verifyReleaseAssetSet({ dir: tmp });
    assert.equal(summary.version, version);
    assert.equal(summary.tag, `v${version}`);
    assert.equal(summary.sourceCommit, commit);
    assert.equal(summary.files.length, 7);
    assert.ok(Object.isFrozen(summary), 'Summary must be frozen');
    assert.ok(Object.isFrozen(summary.files), 'Files array must be frozen');
    for (const f of summary.files) {
      assert.ok(Object.isFrozen(f), `File record ${f.name} must be frozen`);
      assert.ok(f.size >= 0);
      assert.equal(f.sha256.length, 64);
    }

    // Assert sorted by Unicode code point
    const fileNames = summary.files.map((f) => f.name);
    assert.deepEqual(fileNames, [...fileNames].sort(releaseContract.compareCodePoints));

    // 2. Cross-check with caller expected options
    const validWithExpected = assetVerification.verifyReleaseAssetSet({
      dir: tmp,
      version,
      tag: `v${version}`,
      sourceCommit: commit,
      expectedHashes: {
        'install.sh': summary.files.find((f) => f.name === 'install.sh').sha256,
        'install.ps1': summary.files.find((f) => f.name === 'install.ps1').sha256
      }
    });
    assert.equal(validWithExpected.version, version);

    // 3. Rejection on caller expected tag mismatch
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp, tag: 'v9.9.9' }),
      /Caller expected tag "v9.9.9" does not match/u
    );

    // 4. Rejection on caller expected source commit mismatch
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp, sourceCommit: '0'.repeat(40) }),
      /Caller expected source commit/u
    );

    // 5. Rejection on unknown expectedHashes key
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({
        dir: tmp,
        expectedHashes: { 'unknown-file.txt': '0'.repeat(64) }
      }),
      /Unknown expected file key "unknown-file.txt" rejected/u
    );

    // 6. Rejection on mismatched expectedHashes value
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({
        dir: tmp,
        expectedHashes: { 'install.sh': '0'.repeat(64) }
      }),
      /Expected SHA-256 mismatch for "install.sh"/u
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('WRQ-008: verifyReleaseAssetSet rejects mutations and preserves files with zero modification (no-mutation)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-neg-mut-'));
  const version = '3.0.0';
  const commit = '1'.repeat(40);
  try {
    createTestReleaseSet(tmp, version, commit);
    const baseline = snapshotDirectory(tmp);
    assert.equal(Object.keys(baseline).length, 7);

    // 1. Extra regular file rejected
    const extraPath = join(tmp, 'stale-artifact.txt');
    writeFileSync(extraPath, 'stale');
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
      /Extra unexpected release asset entries found: stale-artifact.txt/u
    );
    unlinkSync(extraPath);
    assertDirectoryUnchanged(tmp, baseline);

    // 2. Extra directory rejected
    const subDirPath = join(tmp, 'subfolder');
    mkdirSync(subDirPath);
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
      /Non-regular file rejected in release assets directory: "subfolder"/u
    );
    rmSync(subDirPath, { recursive: true });
    assertDirectoryUnchanged(tmp, baseline);

    // 3. Symlink rejected
    const symlinkPath = join(tmp, 'link.txt');
    try {
      symlinkSync(join(tmp, 'install.sh'), symlinkPath);
      assert.throws(
        () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
        /Symbolic link rejected in release assets directory/u
      );
      unlinkSync(symlinkPath);
    } catch (e) {
      if (existsSync(symlinkPath)) unlinkSync(symlinkPath);
    }
    assertDirectoryUnchanged(tmp, baseline);

    // 4. Missing file rejected
    const movedSh = join(tmpdir(), `temp-install-${Date.now()}.sh`);
    copyFileSync(join(tmp, 'install.sh'), movedSh);
    unlinkSync(join(tmp, 'install.sh'));
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
      /Missing expected release asset entries: install.sh/u
    );
    copyFileSync(movedSh, join(tmp, 'install.sh'));
    unlinkSync(movedSh);
    assertDirectoryUnchanged(tmp, baseline);

    // 5. Corrupted sidecar grammar
    const linuxSidecarName = `evcrate-v${version}-linux-x64.tar.gz.sha256`;
    const originalSidecar = readFileSync(join(tmp, linuxSidecarName), 'utf8');
    writeFileSync(join(tmp, linuxSidecarName), 'badsidecargrammar\n');
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
      /Sidecar does not match grammar/u
    );
    writeFileSync(join(tmp, linuxSidecarName), originalSidecar);
    assertDirectoryUnchanged(tmp, baseline);

    // 6. Sidecar digest mismatch
    writeFileSync(join(tmp, linuxSidecarName), `${'0'.repeat(64)}  evcrate-v${version}-linux-x64.tar.gz\n`);
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
      /Linux sidecar SHA-256 .* does not match metadata platform SHA-256/u
    );
    writeFileSync(join(tmp, linuxSidecarName), originalSidecar);
    assertDirectoryUnchanged(tmp, baseline);

    // 7. Corrupted archive bytes (digest mismatch against metadata)
    const winArchiveName = `evcrate-v${version}-windows-x64.zip`;
    const winArchivePath = join(tmp, winArchiveName);
    const originalWinZip = readFileSync(winArchivePath);
    const tamperedWinZip = Buffer.from(originalWinZip);
    tamperedWinZip[0] ^= 0xff;
    writeFileSync(winArchivePath, tamperedWinZip);
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
      /Windows archive SHA-256 mismatch/u
    );
    writeFileSync(winArchivePath, originalWinZip);
    assertDirectoryUnchanged(tmp, baseline);

    // 8. Corrupted installer bytes
    const ps1Path = join(tmp, 'install.ps1');
    const originalPs1 = readFileSync(ps1Path);
    writeFileSync(ps1Path, Buffer.from('# tampered ps1 installer\n'));
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp }),
      /install\.ps1 size mismatch|install\.ps1 SHA-256 mismatch/u
    );
    writeFileSync(ps1Path, originalPs1);
    assertDirectoryUnchanged(tmp, baseline);

    // 9. Tampered metadata (version mismatch)
    const metaName = `evcrate-v${version}.release.json`;
    const metaPath = join(tmp, metaName);
    const originalMeta = readFileSync(metaPath, 'utf8');
    const tamperedMetaObj = JSON.parse(originalMeta);
    tamperedMetaObj.version = '9.9.9';
    tamperedMetaObj.tag = 'v9.9.9';
    tamperedMetaObj.platforms['linux-x64'].archive_name = 'evcrate-v9.9.9-linux-x64.tar.gz';
    tamperedMetaObj.platforms['windows-x64'].archive_name = 'evcrate-v9.9.9-windows-x64.zip';
    writeFileSync(metaPath, JSON.stringify(tamperedMetaObj, null, 2));
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp, version }),
      /Metadata version "9.9.9" does not match expected version/u
    );
    writeFileSync(metaPath, originalMeta);
    assertDirectoryUnchanged(tmp, baseline);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('WRQ-009: verifyWindowsAssetSet accepts exact four files and rejects fifth entry with no mutation', () => {
  const fullTmp = mkdtempSync(join(tmpdir(), 'evcrate-full-src-'));
  const winTmp = mkdtempSync(join(tmpdir(), 'evcrate-win-four-'));
  const version = '4.1.2';
  const commit = '2'.repeat(40);
  try {
    createTestReleaseSet(fullTmp, version, commit);

    // Copy exact four Windows files: Windows archive, sidecar, release.json, install.ps1
    const winArchive = `evcrate-v${version}-windows-x64.zip`;
    const winSidecar = `${winArchive}.sha256`;
    const releaseMeta = `evcrate-v${version}.release.json`;
    copyFileSync(join(fullTmp, winArchive), join(winTmp, winArchive));
    copyFileSync(join(fullTmp, winSidecar), join(winTmp, winSidecar));
    copyFileSync(join(fullTmp, releaseMeta), join(winTmp, releaseMeta));
    copyFileSync(join(fullTmp, 'install.ps1'), join(winTmp, 'install.ps1'));

    const baseline = snapshotDirectory(winTmp);
    assert.equal(Object.keys(baseline).length, 4);

    // 1. Valid exact four passes
    const summary = assetVerification.verifyWindowsAssetSet({ dir: winTmp });
    assert.equal(summary.version, version);
    assert.equal(summary.tag, `v${version}`);
    assert.equal(summary.sourceCommit, commit);
    assert.equal(summary.files.length, 4);
    assert.deepEqual(
      summary.files.map((f) => f.name),
      [winArchive, winSidecar, releaseMeta, 'install.ps1'].sort(releaseContract.compareCodePoints)
    );

    // 2. Reject fifth entry: copying install.sh into winTmp must fail closed
    copyFileSync(join(fullTmp, 'install.sh'), join(winTmp, 'install.sh'));
    assert.throws(
      () => assetVerification.verifyWindowsAssetSet({ dir: winTmp }),
      /Extra unexpected Windows asset entries found: install.sh/u
    );
    unlinkSync(join(winTmp, 'install.sh'));
    assertDirectoryUnchanged(winTmp, baseline);

    // 3. Reject missing entry: removing install.ps1 fails closed
    const movedPs1 = join(tmpdir(), `temp-ps1-${Date.now()}.ps1`);
    copyFileSync(join(winTmp, 'install.ps1'), movedPs1);
    unlinkSync(join(winTmp, 'install.ps1'));
    assert.throws(
      () => assetVerification.verifyWindowsAssetSet({ dir: winTmp }),
      /Missing expected Windows asset entries: install.ps1/u
    );
    copyFileSync(movedPs1, join(winTmp, 'install.ps1'));
    unlinkSync(movedPs1);
    assertDirectoryUnchanged(winTmp, baseline);

    // 4. Reject tampered sidecar
    const originalSidecar = readFileSync(join(winTmp, winSidecar), 'utf8');
    writeFileSync(join(winTmp, winSidecar), `${'0'.repeat(64)}  ${winArchive}\n`);
    assert.throws(
      () => assetVerification.verifyWindowsAssetSet({ dir: winTmp }),
      /Windows sidecar SHA-256 .* does not match metadata platform SHA-256/u
    );
    writeFileSync(join(winTmp, winSidecar), originalSidecar);
    assertDirectoryUnchanged(winTmp, baseline);
  } finally {
    rmSync(fullTmp, { recursive: true, force: true });
    rmSync(winTmp, { recursive: true, force: true });
  }
});

test('WRQ-010: semantic-release-asset-prepare enforces build vs verify modes and fails closed', () => {
  // 1. Missing mode throws before anything else
  assert.throws(
    () => semanticReleaseAssetPrepare.parseAssetMode({}),
    /Missing required EVCRATE_RELEASE_ASSET_MODE environment variable/u
  );
  assert.throws(
    () => semanticReleaseAssetPrepare.parseAssetMode({ EVCRATE_RELEASE_ASSET_MODE: '' }),
    /Missing required EVCRATE_RELEASE_ASSET_MODE environment variable/u
  );

  // 2. Unknown/invalid mode throws
  assert.throws(
    () => semanticReleaseAssetPrepare.parseAssetMode({ EVCRATE_RELEASE_ASSET_MODE: 'dry-run' }),
    /Invalid EVCRATE_RELEASE_ASSET_MODE: "dry-run" \(must be literal "build" or "verify"\)/u
  );
  assert.throws(
    () => semanticReleaseAssetPrepare.parseAssetMode({ EVCRATE_RELEASE_ASSET_MODE: 'BUILD' }),
    /Invalid EVCRATE_RELEASE_ASSET_MODE/u
  );

  // 3. Literal "build" and "verify" accepted
  assert.equal(semanticReleaseAssetPrepare.parseAssetMode({ EVCRATE_RELEASE_ASSET_MODE: 'build' }), 'build');
  assert.equal(semanticReleaseAssetPrepare.parseAssetMode({ EVCRATE_RELEASE_ASSET_MODE: 'verify' }), 'verify');

  // 4. runVerifyPrepare succeeds on valid release directory without build/npm invocation
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-prep-test-'));
  const version = '5.0.0';
  const commit = '3'.repeat(40);
  try {
    createTestReleaseSet(tmp, version, commit);
    const baseline = snapshotDirectory(tmp);

    const summary = semanticReleaseAssetPrepare.runVerifyPrepare({
      releaseDir: tmp,
      version
    });
    assert.equal(summary.version, version);
    assert.equal(summary.files.length, 7);
    assertDirectoryUnchanged(tmp, baseline);

    // 5. runVerifyPrepare fails on tampered directory and cannot rebuild or modify files
    unlinkSync(join(tmp, 'install.sh'));
    assert.throws(
      () => semanticReleaseAssetPrepare.runVerifyPrepare({ releaseDir: tmp, version }),
      /Missing expected release asset entries: install.sh/u
    );
    // Assert install.sh was NOT recreated
    assert.equal(existsSync(join(tmp, 'install.sh')), false, 'Verify mode must never recreate missing files');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // 6. runBuildPrepare validates version argument
  assert.throws(
    () => semanticReleaseAssetPrepare.runBuildPrepare(''),
    /Missing required version argument for build prepare/u
  );
});

test('WRQ-011: .releaserc.json preserves canonical plugin order and updates prepareCmd', () => {
  const configPath = join(packageRoot, '.releaserc.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  assert.equal(config.plugins.length, 7, 'Must preserve exactly 7 plugins');
  const pluginNames = config.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  assert.deepEqual(pluginNames, [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/exec',
    '@semantic-release/github',
    '@semantic-release/git'
  ]);

  const execPlugin = config.plugins.find((p) => Array.isArray(p) && p[0] === '@semantic-release/exec');
  assert.ok(execPlugin, 'Exec plugin must exist');
  assert.equal(
    execPlugin[1].prepareCmd,
    'node scripts/release/semantic-release-asset-prepare.cjs ${nextRelease.version}'
  );
});

test('CLI verifier: parseVerifierArgs and main handle standalone invocation and help', () => {
  // Help flag
  const helpResult = assetVerification.parseVerifierArgs(['--help']);
  assert.equal(helpResult.help, true);
  assert.equal(assetVerification.main(['node', 'asset-verification.cjs', '--help']), 0);

  // Argument parsing
  const parsed = assetVerification.parseVerifierArgs([
    '--dir', '/fake/dir',
    '--set', 'windows',
    '--version', '1.2.3',
    '--tag', 'v1.2.3',
    '--commit', 'a'.repeat(40),
    '--expected-hash', 'install.ps1=1234567890abcdef'
  ]);
  assert.equal(parsed.dir, '/fake/dir');
  assert.equal(parsed.set, 'windows');
  assert.equal(parsed.version, '1.2.3');
  assert.equal(parsed.tag, 'v1.2.3');
  assert.equal(parsed.sourceCommit, 'a'.repeat(40));
  assert.deepEqual(parsed.expectedHashes, { 'install.ps1': '1234567890abcdef' });

  // Rejects missing directory
  assert.throws(
    () => assetVerification.parseVerifierArgs([]),
    /Missing required directory argument/u
  );

  // Rejects unknown flag
  assert.throws(
    () => assetVerification.parseVerifierArgs(['--unknown-flag', '/fake/dir']),
    /Unknown argument: "--unknown-flag"/u
  );
});

test('E04 Root Isolation: plugin package is excluded from root exact-seven release assets and root npm pack', () => {
  const version = '2.1.0';
  const expected7 = assetVerification.getExpectedReleaseAssetNames(version);
  assert.equal(expected7.length, 7, 'Root release assets must be exactly 7 files');
  for (const name of expected7) {
    assert.equal(name.includes('plugin'), false, `Plugin asset "${name}" must not leak into root release asset set`);
  }

  // Verify that an eighth plugin asset is strictly rejected by verifyReleaseAssetSet
  const tmp = mkdtempSync(join(tmpdir(), 'evcrate-root-isolation-'));
  try {
    for (const name of expected7) {
      writeFileSync(join(tmp, name), 'dummy content\n');
    }
    // Add an eighth plugin asset
    writeFileSync(join(tmp, 'evcrate-advisor-plugin-v0.1.0.tar.gz'), 'plugin binary\n');

    assert.throws(() => {
      assetVerification.verifyReleaseAssetSet({
        dir: tmp,
        version,
        tag: `v${version}`,
        sourceCommit: '0'.repeat(40),
        expectedHashes: {}
      });
    }, /Extra unexpected release asset entries found/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  // Verify root npm files allowlist excludes plugin distribution artifacts
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const files = pkg.files || [];
  // dist/advisor-plugin/** must be explicitly negated
  assert.ok(files.includes('!dist/advisor-plugin/**'), 'package.json files must explicitly negate !dist/advisor-plugin/**');
  assert.ok(files.includes('!dist/release/**'), 'package.json files must explicitly negate !dist/release/**');
  assert.equal(files.some((f) => f.startsWith('plugin') || f === 'plugin'), false, 'plugin/ must not be included in root package.json files');
  assert.equal(files.some((f) => f.startsWith('artifacts') || f === 'artifacts'), false, 'artifacts/ must not be included in root package.json files');
});
