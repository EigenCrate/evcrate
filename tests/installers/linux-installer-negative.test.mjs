import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildTestReleaseSet, createMinimalValidRecords } from './fixtures/private-release-fixture.mjs';
import { createIsolatedEnv, INSTALL_SH } from './fixtures/test-env.mjs';
import { createTarArchive } from '../../scripts/release/tar-writer.cjs';

test('installer rejects tampered checksum before destination writes', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({
      outputDir: env.assetsDir,
      version: '1.0.0',
      tamperChecksum: true
    });

    assert.throws(
      () => execFileSync(INSTALL_SH, [
        '--archive', assets.linuxArchivePath,
        '--checksum', assets.sidecarPath,
        '--metadata', assets.metadataPath,
        '--data-dir', env.dataDir,
        '--state-dir', env.stateDir,
        '--bin-dir', env.binDir
      ], { cwd: env.tmp, encoding: 'utf8' }),
      /SHA-256.*does not match sidecar/u
    );

    // No snapshots created
    assert.ok(!fs.existsSync(path.join(env.dataDir, 'snapshots')));
  } finally {
    env.cleanup();
  }
});

test('installer rejects corrupted archive bytes', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({
      outputDir: env.assetsDir,
      version: '1.0.0',
      tamperArchive: true
    });

    assert.throws(
      () => execFileSync(INSTALL_SH, [
        '--archive', assets.linuxArchivePath,
        '--checksum', assets.sidecarPath,
        '--metadata', assets.metadataPath,
        '--data-dir', env.dataDir,
        '--state-dir', env.stateDir,
        '--bin-dir', env.binDir
      ], { cwd: env.tmp, encoding: 'utf8' })
    );

    assert.ok(!fs.existsSync(path.join(env.dataDir, 'snapshots')));
  } finally {
    env.cleanup();
  }
});

test('installer rejects controller closure digest mismatch', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({
      outputDir: env.assetsDir,
      version: '1.0.0',
      tamperController: true
    });

    assert.throws(
      () => execFileSync(INSTALL_SH, [
        '--archive', assets.linuxArchivePath,
        '--checksum', assets.sidecarPath,
        '--metadata', assets.metadataPath,
        '--data-dir', env.dataDir,
        '--state-dir', env.stateDir,
        '--bin-dir', env.binDir
      ], { cwd: env.tmp, encoding: 'utf8' }),
      /Controller closure digest.*does not match metadata/u
    );

    assert.ok(!fs.existsSync(path.join(env.dataDir, 'snapshots')));
  } finally {
    env.cleanup();
  }
});

test('offline installation succeeds without npm in PATH', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({ outputDir: env.assetsDir, version: '1.0.0' });

    // Construct PATH containing only node's directory and basic system utilities, excluding npm
    const nodeDir = path.dirname(process.execPath);
    const minimalPath = `${nodeDir}:/usr/bin:/bin`;

    const stdout = execFileSync(INSTALL_SH, [
      '--archive', assets.linuxArchivePath,
      '--checksum', assets.sidecarPath,
      '--metadata', assets.metadataPath,
      '--data-dir', env.dataDir,
      '--state-dir', env.stateDir,
      '--bin-dir', env.binDir
    ], {
      cwd: env.tmp,
      encoding: 'utf8',
      env: {
        HOME: env.tmp,
        PATH: minimalPath
      }
    });

    assert.ok(stdout.includes('Successfully installed EVCrate v1.0.0'));
    const launcherPath = path.join(env.binDir, 'evcrate');
    const cliOutput = execFileSync(launcherPath, ['version', '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(cliOutput).payload.version, '1.0.0');
  } finally {
    env.cleanup();
  }
});
