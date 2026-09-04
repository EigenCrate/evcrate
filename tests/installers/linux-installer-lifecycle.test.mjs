import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildTestReleaseSet } from './fixtures/private-release-fixture.mjs';
import { createIsolatedEnv, INSTALL_SH } from './fixtures/test-env.mjs';

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
