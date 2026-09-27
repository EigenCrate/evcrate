import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildTestReleaseSet, createMinimalValidRecords } from './fixtures/private-release-fixture.mjs';
import { createIsolatedEnv, INSTALL_SH } from './fixtures/test-env.mjs';

test('fresh install from adjacent release assets commits pointers and launcher', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });
    const adjacentInstallSh = path.join(env.assetsDir, 'install.sh');

    const stdout = execFileSync(adjacentInstallSh, [
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], {
      cwd: env.tmp,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${env.binDir}:${process.env.PATH}` }
    });

    assert.ok(stdout.includes('Successfully installed EVCrate v1.0.0'));
    assert.ok(stdout.includes('No prior backup snapshot.'));

    const currentPath = path.join(env.dataDir, 'current');
    assert.ok(fs.existsSync(currentPath));
    const targetSnapshot = path.resolve(env.dataDir, fs.readlinkSync(currentPath));
    assert.ok(fs.existsSync(targetSnapshot));
    assert.ok(path.basename(targetSnapshot).startsWith('1.0.0-'));

    const launcherPath = path.join(env.binDir, 'evcrate');
    assert.ok(fs.existsSync(launcherPath));
    const cliOutput = execFileSync(launcherPath, ['version', '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(cliOutput);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.payload.version, '1.0.0');

    const receipt = JSON.parse(fs.readFileSync(path.join(targetSnapshot, 'installer-receipt.json'), 'utf8'));
    assert.equal(receipt.version, '1.0.0');
    assert.equal(receipt.snapshot_id, path.basename(targetSnapshot));

    const owned = JSON.parse(fs.readFileSync(path.join(env.stateDir, 'installer-owned.json'), 'utf8'));
    assert.equal(owned.current_snapshot, path.basename(targetSnapshot));
  } finally {
    env.cleanup();
  }
});

test('explicit local install succeeds and rejects partial flags', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0', includeInstallSh: false });

    assert.throws(
      () => execFileSync(INSTALL_SH, ['--archive', assets.linuxArchivePath], { encoding: 'utf8' }),
      /requires all three arguments/u
    );

    const stdout = execFileSync(INSTALL_SH, [
      '--archive', assets.linuxArchivePath,
      '--checksum', assets.sidecarPath,
      '--metadata', assets.metadataPath,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });

    assert.ok(stdout.includes('Successfully installed EVCrate v1.0.0'));
    const launcherPath = path.join(env.binDir, 'evcrate');
    const cliOutput = execFileSync(launcherPath, ['version', '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(cliOutput).payload.version, '1.0.0');
  } finally {
    env.cleanup();
  }
});

test('idempotent retry returns existing snapshot without creating new generation', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });
    const adjacentInstallSh = path.join(env.assetsDir, 'install.sh');
    const args = ['--data-dir', env.dataDir, '--state-dir', env.stateDir, '--bin-dir', env.binDir];

    execFileSync(adjacentInstallSh, args, { cwd: env.tmp, encoding: 'utf8' });
    const snapshots1 = fs.readdirSync(path.join(env.dataDir, 'snapshots'));
    assert.equal(snapshots1.length, 1);

    const stdout2 = execFileSync(adjacentInstallSh, args, { cwd: env.tmp, encoding: 'utf8' });
    assert.ok(stdout2.includes('already installed at snapshot'));

    const snapshots2 = fs.readdirSync(path.join(env.dataDir, 'snapshots'));
    assert.equal(snapshots2.length, 1);
    assert.equal(snapshots1[0], snapshots2[0]);
  } finally {
    env.cleanup();
  }
});

test('upgrade preserves prior snapshot as backup and does not merge mutable paths', () => {
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

    const current1 = path.resolve(env.dataDir, fs.readlinkSync(path.join(env.dataDir, 'current')));
    const v1RegistryPath = path.join(current1, 'package', '.evcrate', 'registry.json');
    fs.writeFileSync(v1RegistryPath, JSON.stringify({ custom_user_data: 'mutated' }) + '\n');

    const v2Assets = buildTestReleaseSet({ outputDir: path.join(env.tmp, 'v2'), version: '1.1.0' });
    const upgradeOutput = execFileSync(INSTALL_SH, [
      '--archive', v2Assets.linuxArchivePath,
      '--checksum', v2Assets.sidecarPath,
      '--metadata', v2Assets.metadataPath,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });

    assert.ok(upgradeOutput.includes('Successfully upgraded EVCrate v1.1.0'));
    assert.ok(upgradeOutput.includes(`Backup preserved at: ${current1}`));

    const current2 = path.resolve(env.dataDir, fs.readlinkSync(path.join(env.dataDir, 'current')));
    const v2SnapshotId = path.basename(current2);
    assert.ok(v2SnapshotId.startsWith('1.1.0-'));

    const v2RegistryPath = path.join(current2, 'package', '.evcrate', 'registry.json');
    assert.equal(fs.readFileSync(v2RegistryPath, 'utf8').trim(), '{}');
    assert.ok(fs.readFileSync(v1RegistryPath, 'utf8').includes('custom_user_data'));
  } finally {
    env.cleanup();
  }
});
test('installation succeeds with pre-existing broad directories and survives chmod on installed files', () => {
  const env = createIsolatedEnv();
  try {
    // 1. Pre-create dataDir, stateDir, and binDir with broad permissions (no try/catch; Linux-only)
    fs.mkdirSync(env.dataDir, { recursive: true });
    fs.mkdirSync(env.stateDir, { recursive: true });
    fs.mkdirSync(env.binDir, { recursive: true });
    fs.chmodSync(env.dataDir, 0o777);
    fs.chmodSync(env.stateDir, 0o777);

    // Write a sentinel file in dataDir to verify subsequent repair/install does not overwrite or remove it
    const sentinelPath = path.join(env.dataDir, 'user-sentinel.txt');
    fs.writeFileSync(sentinelPath, 'sentinel-payload\n');

    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });
    const adjacentInstallSh = path.join(env.assetsDir, 'install.sh');
    const installArgs = [
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ];

    const stdout = execFileSync(adjacentInstallSh, installArgs, {
      cwd: env.tmp,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${env.binDir}:${process.env.PATH}` }
    });

    assert.ok(stdout.includes('Successfully installed EVCrate v1.0.0'));

    const currentPath = path.join(env.dataDir, 'current');
    assert.ok(fs.existsSync(currentPath));
    const targetSnapshot = path.resolve(env.dataDir, fs.readlinkSync(currentPath));
    assert.ok(fs.existsSync(targetSnapshot));

    // 2. Chmod on installed snapshot files (no try/catch)
    const packageDir = path.join(targetSnapshot, 'package');
    const pkgJson = path.join(packageDir, 'package.json');
    fs.chmodSync(pkgJson, 0o666);

    // 3. Repeat-install and repair after chmod
    const repeatOutput = execFileSync(adjacentInstallSh, installArgs, {
      cwd: env.tmp,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${env.binDir}:${process.env.PATH}` }
    });
    assert.ok(repeatOutput.includes('already installed at snapshot') || repeatOutput.includes('Successfully installed'));

    const repairOutput = execFileSync(adjacentInstallSh, ['repair', ...installArgs], {
      cwd: env.tmp,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${env.binDir}:${process.env.PATH}` }
    });
    assert.ok(repairOutput.includes('Successfully repaired EVCrate v1.0.0'));

    // Launcher continues to work and returns expected version
    const launcherPath = path.join(env.binDir, 'evcrate');
    const cliOutput = execFileSync(launcherPath, ['version', '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(cliOutput);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.payload.version, '1.0.0');

    // Verify sentinel was preserved and not overwritten
    assert.ok(fs.existsSync(sentinelPath));
    assert.equal(fs.readFileSync(sentinelPath, 'utf8'), 'sentinel-payload\n');
  } finally {
    env.cleanup();
  }
});

test('all-0644 archive mode installs and repairs with runnable launcher (F2 regression)', () => {
  const env = createIsolatedEnv();
  try {
    // Build records where EVERY file in the archive has mode 0644
    const records = createMinimalValidRecords('1.0.0').map((r) => ({
      ...r,
      mode: 0o644
    }));
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0', records });
    const adjacentInstallSh = path.join(env.assetsDir, 'install.sh');

    const installArgs = [
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ];

    const stdout = execFileSync(adjacentInstallSh, installArgs, {
      cwd: env.tmp,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${env.binDir}:${process.env.PATH}` }
    });

    assert.ok(stdout.includes('Successfully installed EVCrate v1.0.0'));

    // Verify direct launcher execution
    const launcherPath = path.join(env.binDir, 'evcrate');
    assert.ok(fs.existsSync(launcherPath));
    const cliOutput = execFileSync(launcherPath, ['version', '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(cliOutput);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.payload.version, '1.0.0');

    // Verify non-launcher files did NOT receive execute bit arbitrarily
    const currentPath = path.join(env.dataDir, 'current');
    const targetSnapshot = path.resolve(env.dataDir, fs.readlinkSync(currentPath));
    const pkgJson = path.join(targetSnapshot, 'package', 'package.json');
    const pkgMode = fs.statSync(pkgJson).mode & 0o777;
    assert.equal((pkgMode & 0o111), 0, 'package.json should not be made executable');

    // Verify repair also works cleanly
    const repairStdout = execFileSync(adjacentInstallSh, ['repair', ...installArgs], {
      cwd: env.tmp,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${env.binDir}:${process.env.PATH}` }
    });
    assert.ok(repairStdout.includes('Successfully repaired EVCrate v1.0.0'));
  } finally {
    env.cleanup();
  }
});
