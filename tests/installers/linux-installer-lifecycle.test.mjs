import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { buildTestReleaseSet, createMinimalValidRecords } from './fixtures/private-release-fixture.mjs';
import { createIsolatedEnv, INSTALL_SH } from './fixtures/test-env.mjs';
import { canonicalJsonBytes } from '../../scripts/release/canonical-json.cjs';

test('same-version repair creates new generation and preserves prior generation as backup', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });
    const adjacentInstallSh = path.join(env.assetsDir, 'install.sh');
    const args = ['--data-dir', env.dataDir, '--state-dir', env.stateDir, '--bin-dir', env.binDir];

    execFileSync(adjacentInstallSh, ['install', ...args], { cwd: env.tmp, encoding: 'utf8' });

    const current1 = path.resolve(env.dataDir, fs.readlinkSync(path.join(env.dataDir, 'current')));
    assert.ok(current1.endsWith('-1'));

    const repairOutput = execFileSync(adjacentInstallSh, ['repair', ...args], { cwd: env.tmp, encoding: 'utf8' });
    assert.ok(repairOutput.includes('Successfully repaired EVCrate v1.0.0'));
    assert.ok(repairOutput.includes(`Backup preserved at: ${current1}`));

    const current2 = path.resolve(env.dataDir, fs.readlinkSync(path.join(env.dataDir, 'current')));
    assert.ok(current2.endsWith('-2'));
    assert.ok(fs.existsSync(current1));
  } finally {
    env.cleanup();
  }
});

for (const receiptState of ['missing', 'corrupt']) {
  test(`current release repair replaces a ${receiptState} receipt and preserves user state`, () => {
    const env = createIsolatedEnv();
    try {
      buildTestReleaseSet({ outputDir: env.assetsDir });
      const installer = path.join(env.assetsDir, 'install.sh');
      const args = ['--data-dir', env.dataDir, '--state-dir', env.stateDir, '--bin-dir', env.binDir];
      execFileSync(installer, ['install', ...args], { cwd: env.tmp, encoding: 'utf8' });
      const currentPath = path.join(env.dataDir, 'current');
      const previous = path.resolve(env.dataDir, fs.readlinkSync(currentPath));
      const receiptPath = path.join(previous, 'installer-receipt.json');
      const userFiles = [
        path.join(env.dataDir, 'user-sentinel.txt'),
        path.join(env.stateDir, 'user-sentinel.txt'),
        path.join(previous, 'package', '.evcrate', 'source', '.claude', 'settings.json')
      ];
      for (const file of userFiles) fs.writeFileSync(file, 'user state\n');
      if (receiptState === 'missing') fs.unlinkSync(receiptPath);
      else fs.writeFileSync(receiptPath, '{invalid receipt\n');

      const output = execFileSync(installer, ['repair', ...args], { cwd: env.tmp, encoding: 'utf8' });
      assert.match(output, /Successfully repaired EVCrate v1\.0\.0/u);
      assert.ok(output.includes(`Backup preserved at: ${previous}`));
      const current = path.resolve(env.dataDir, fs.readlinkSync(currentPath));
      assert.notEqual(current, previous);
      const receipt = JSON.parse(fs.readFileSync(path.join(current, 'installer-receipt.json'), 'utf8'));
      assert.equal(receipt.snapshot_id, path.basename(current));
      for (const file of userFiles) assert.equal(fs.readFileSync(file, 'utf8'), 'user state\n');
      const version = execFileSync(path.join(env.binDir, 'evcrate'), ['version', '--json'], { encoding: 'utf8' });
      assert.equal(JSON.parse(version).payload.version, '1.0.0');
    } finally {
      env.cleanup();
    }
  });
}

test('predecessor repair admits matching recorded receipt and authenticated historical bytes', () => {
  const env = createIsolatedEnv();
  try {
    const data = Buffer.from('historical controller bytes retained as data\n');
    const controllerPath = '.evcrate/source/.evcrate/bin/historical.cjs';
    const controllerSha = crypto.createHash('sha256').update(data).digest('hex');
    const records = [
      ...createMinimalValidRecords(),
      { path: controllerPath, data, mode: 0o644, size: data.length, sha256: controllerSha }
    ];
    const closureDigest = crypto.createHash('sha256')
      .update(canonicalJsonBytes({ '.evcrate/bin/historical.cjs': controllerSha })).digest('hex');
    const assets = buildTestReleaseSet({
      outputDir: env.assetsDir, records,
      tamperMetadata(metadata) {
        metadata.schema = 'evcrate-private-release/v1';
        metadata.controller_closure_digest = closureDigest;
      }
    });
    // Seed a synthetic recorded predecessor, rather than granting fresh-install
    // admission to old assets. This is not release provenance qualification.
    const snapshotId = `1.0.0-${assets.archiveSha256}-1`;
    const previous = path.join(env.dataDir, 'snapshots', snapshotId);
    fs.mkdirSync(previous, { recursive: true });
    fs.writeFileSync(path.join(previous, 'installer-receipt.json'), JSON.stringify({
      schema: 'evcrate-installer-receipt/v1', snapshot_id: snapshotId, version: '1.0.0',
      archive_name: assets.linuxName, archive_sha256: assets.archiveSha256,
      inventory_digest: assets.inventoryDigest,
      immutable_files: Object.fromEntries(records.map((record) => [record.path, { size: record.size, sha256: record.sha256 }])),
      mutable_paths: assets.metadata.mutable_paths, installed_at: '2026-01-01T00:00:00.000Z'
    }));
    const currentPath = path.join(env.dataDir, 'current');
    fs.symlinkSync(path.relative(env.dataDir, previous), currentPath);
    const output = execFileSync(INSTALL_SH, [
      'repair', '--archive', assets.linuxArchivePath, '--checksum', assets.sidecarPath,
      '--metadata', assets.metadataPath, '--data-dir', env.dataDir,
      '--state-dir', env.stateDir, '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });
    assert.match(output, /Successfully repaired EVCrate v1\.0\.0/u);
    const current = path.resolve(env.dataDir, fs.readlinkSync(currentPath));
    assert.notEqual(current, previous);
    assert.equal(fs.readFileSync(path.join(current, 'package', controllerPath), 'utf8'), data.toString());
    assert.ok(fs.existsSync(path.join(previous, 'installer-receipt.json')));
  } finally {
    env.cleanup();
  }
});

test('rollback restores specified snapshot and preserves displaced snapshot as backup', () => {
  const env = createIsolatedEnv();
  try {
    const v1Assets = buildTestReleaseSet({ outputDir: path.join(env.tmp, 'v1'), version: '1.0.0' });
    execFileSync(INSTALL_SH, [
      '--archive', v1Assets.linuxArchivePath,
      '--checksum', v1Assets.sidecarPath,
      '--metadata', v1Assets.metadataPath,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });
    const v1SnapshotId = path.basename(path.resolve(env.dataDir, fs.readlinkSync(path.join(env.dataDir, 'current'))));

    const v2Assets = buildTestReleaseSet({ outputDir: path.join(env.tmp, 'v2'), version: '1.1.0' });
    execFileSync(INSTALL_SH, [
      '--archive', v2Assets.linuxArchivePath,
      '--checksum', v2Assets.sidecarPath,
      '--metadata', v2Assets.metadataPath,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });

    const rollbackOutput = execFileSync(INSTALL_SH, [
      'rollback', v1SnapshotId,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });

    assert.ok(rollbackOutput.includes(`Rolled back to snapshot: ${v1SnapshotId} (v1.0.0)`));

    const cliOutput = execFileSync(path.join(env.binDir, 'evcrate'), ['version', '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(cliOutput).payload.version, '1.0.0');
  } finally {
    env.cleanup();
  }
});

test('uninstall removes installer-owned files and launcher, and is idempotent', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });
    const adjacentInstallSh = path.join(env.assetsDir, 'install.sh');
    const args = ['--data-dir', env.dataDir, '--state-dir', env.stateDir, '--bin-dir', env.binDir];

    execFileSync(adjacentInstallSh, args, { cwd: env.tmp, encoding: 'utf8' });
    assert.ok(fs.existsSync(path.join(env.binDir, 'evcrate')));

    const uninstOutput = execFileSync(adjacentInstallSh, ['uninstall', ...args], { cwd: env.tmp, encoding: 'utf8' });
    assert.ok(uninstOutput.includes('Successfully uninstalled EVCrate CLI.'));

    assert.ok(!fs.existsSync(path.join(env.binDir, 'evcrate')));
    assert.ok(!fs.existsSync(env.dataDir));
    assert.ok(!fs.existsSync(env.stateDir));

    const uninstOutput2 = execFileSync(adjacentInstallSh, ['uninstall', ...args], { cwd: env.tmp, encoding: 'utf8' });
    assert.ok(uninstOutput2.includes('Successfully uninstalled EVCrate CLI.'));
  } finally {
    env.cleanup();
  }
});
