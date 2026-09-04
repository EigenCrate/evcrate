import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';

import { buildTestReleaseSet } from './fixtures/private-release-fixture.mjs';
import { createIsolatedEnv, INSTALL_SH } from './fixtures/test-env.mjs';

test('active installer lock blocks concurrent installer execution', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });

    // Seed active lock pointing to current process pid
    fs.mkdirSync(env.stateDir, { recursive: true });
    fs.writeFileSync(path.join(env.stateDir, 'install.lock'), JSON.stringify({
      pid: process.pid,
      hostname: os.hostname(),
      created_at: new Date().toISOString()
    }));

    assert.throws(
      () => execFileSync(INSTALL_SH, [
        '--archive', assets.linuxArchivePath,
        '--checksum', assets.sidecarPath,
        '--metadata', assets.metadataPath,
        '--data-dir', env.dataDir,
        '--state-dir', env.stateDir,
        '--bin-dir', env.binDir
      ], { cwd: env.tmp, encoding: 'utf8' }),
      /Installer is busy/u
    );
  } finally {
    env.cleanup();
  }
});

test('demonstrably stale lock is quarantined and install proceeds', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });

    // Seed stale lock with non-existent pid 99999999
    fs.mkdirSync(env.stateDir, { recursive: true });
    const staleLockPath = path.join(env.stateDir, 'install.lock');
    fs.writeFileSync(staleLockPath, JSON.stringify({
      pid: 99999999,
      hostname: os.hostname(),
      created_at: new Date().toISOString()
    }));

    const stdout = execFileSync(INSTALL_SH, [
      '--archive', assets.linuxArchivePath,
      '--checksum', assets.sidecarPath,
      '--metadata', assets.metadataPath,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });

    assert.ok(stdout.includes('Successfully installed EVCrate v1.0.0'));

    // Verify quarantine file created
    const files = fs.readdirSync(env.stateDir);
    assert.ok(files.some((f) => f.startsWith('install.lock.stale-')));
  } finally {
    env.cleanup();
  }
});

test('journal recovery in staged state discards stale staging directory', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });

    fs.mkdirSync(env.stateDir, { recursive: true });
    const stagingDir = path.join(env.dataDir, 'staging');
    fs.mkdirSync(stagingDir, { recursive: true });
    const mockStage = path.join(stagingDir, 'stage-abandoned-12345');
    fs.mkdirSync(mockStage, { recursive: true });
    fs.writeFileSync(path.join(mockStage, 'partial.txt'), 'partial');

    fs.writeFileSync(path.join(env.stateDir, 'install-journal.json'), JSON.stringify({
      schema: 'evcrate-install-journal/v1',
      operation: 'install',
      state: 'staged',
      stage_path: mockStage
    }));

    const stdout = execFileSync(INSTALL_SH, [
      '--archive', assets.linuxArchivePath,
      '--checksum', assets.sidecarPath,
      '--metadata', assets.metadataPath,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], { cwd: env.tmp, encoding: 'utf8' });

    assert.ok(stdout.includes('Successfully installed EVCrate v1.0.0'));
    // Abandoned stage directory cleaned up
    assert.ok(!fs.existsSync(mockStage));
  } finally {
    env.cleanup();
  }
});

test('journal recovery in pointer-ready state completes pointer commit', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });
    const adjacentInstallSh = path.join(env.assetsDir, 'install.sh');
    const args = ['--data-dir', env.dataDir, '--state-dir', env.stateDir, '--bin-dir', env.binDir];

    // First install
    execFileSync(adjacentInstallSh, args, { cwd: env.tmp, encoding: 'utf8' });
    const snapshots = fs.readdirSync(path.join(env.dataDir, 'snapshots'));
    const snapshotId = snapshots[0];
    const snapshotDir = path.join(env.dataDir, 'snapshots', snapshotId);

    // Break current symlink and set journal to pointer-ready
    fs.unlinkSync(path.join(env.dataDir, 'current'));
    fs.writeFileSync(path.join(env.stateDir, 'install-journal.json'), JSON.stringify({
      schema: 'evcrate-install-journal/v1',
      operation: 'install',
      state: 'pointer-ready',
      new_snapshot: snapshotId,
      target_snapshot_path: snapshotDir
    }));

    // Trigger any command (e.g. install again)
    execFileSync(adjacentInstallSh, args, { cwd: env.tmp, encoding: 'utf8' });

    // Pointers restored
    assert.ok(fs.existsSync(path.join(env.dataDir, 'current')));
    assert.ok(fs.existsSync(path.join(env.binDir, 'evcrate')));
    const cliOutput = execFileSync(path.join(env.binDir, 'evcrate'), ['version', '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(cliOutput).payload.version, '1.0.0');
  } finally {
    env.cleanup();
  }
});
