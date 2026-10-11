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

test('installer rejects obsolete release metadata during fresh install', () => {
  const env = createIsolatedEnv();
  try {
    const assets = buildTestReleaseSet({
      outputDir: env.assetsDir,
      version: '1.0.0',
      tamperMetadata: (metadata) => { metadata.schema = 'evcrate-private-release/v1'; metadata.controller_closure_digest = 'c'.repeat(64); }
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
      /Old release assets require repair of a recorded matching predecessor snapshot/u
    );

    assert.ok(!fs.existsSync(path.join(env.dataDir, 'snapshots')));
  } finally {
    env.cleanup();
  }
});

for (const receiptState of ['missing', 'corrupt', 'mismatched', 'wrong-snapshot', 'symlink', 'directory']) {
  test(`predecessor repair refuses a ${receiptState} recorded receipt before staging`, () => {
    const env = createIsolatedEnv();
    try {
      const assets = buildTestReleaseSet({ outputDir: env.assetsDir });
      const args = [
        '--archive', assets.linuxArchivePath, '--checksum', assets.sidecarPath,
        '--metadata', assets.metadataPath, '--data-dir', env.dataDir,
        '--state-dir', env.stateDir, '--bin-dir', env.binDir
      ];
      execFileSync(INSTALL_SH, ['install', ...args], { cwd: env.tmp, encoding: 'utf8' });
      const currentPath = path.join(env.dataDir, 'current');
      const previousTarget = fs.readlinkSync(currentPath);
      const previous = path.resolve(env.dataDir, previousTarget);
      const receiptPath = path.join(previous, 'installer-receipt.json');
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      const journalPath = path.join(env.stateDir, 'install-journal.json');
      const journal = fs.readFileSync(journalPath, 'utf8');
      const externalReceipt = path.join(env.tmp, 'external-receipt.json');
      fs.writeFileSync(externalReceipt, JSON.stringify(receipt));
      const sentinel = path.join(env.stateDir, 'user-state.txt');
      fs.writeFileSync(sentinel, 'preserve me\n');
      // Receipt admission precedes archive closure validation. These assets
      // intentionally have no historical controller closure.
      const metadata = { ...assets.metadata, schema: 'evcrate-private-release/v1', controller_closure_digest: 'c'.repeat(64) };
      fs.writeFileSync(assets.metadataPath, JSON.stringify(metadata));
      fs.unlinkSync(receiptPath);
      if (receiptState === 'corrupt') fs.writeFileSync(receiptPath, '{invalid');
      if (receiptState === 'mismatched') fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, archive_sha256: '0'.repeat(64) }));
      if (receiptState === 'wrong-snapshot') fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, snapshot_id: 'another-snapshot' }));
      if (receiptState === 'symlink') fs.symlinkSync(externalReceipt, receiptPath);
      if (receiptState === 'directory') fs.mkdirSync(receiptPath);
      const expectedError = {
        missing: /ENOENT/u,
        corrupt: /JSON/u,
        mismatched: /Old release assets require repair of a recorded matching predecessor snapshot/u,
        'wrong-snapshot': /Predecessor receipt snapshot mismatch/u,
        symlink: /Predecessor receipt must be a regular non-symlink file/u,
        directory: /Predecessor receipt must be a regular non-symlink file/u
      }[receiptState];
      assert.throws(() => execFileSync(INSTALL_SH, ['repair', ...args], { cwd: env.tmp, encoding: 'utf8' }), expectedError);
      assert.equal(fs.readlinkSync(currentPath), previousTarget);
      assert.equal(fs.readFileSync(journalPath, 'utf8'), journal);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve me\n');
      assert.equal(fs.readFileSync(externalReceipt, 'utf8'), JSON.stringify(receipt));
      assert.deepEqual(fs.readdirSync(path.join(env.dataDir, 'snapshots')), [path.basename(previous)]);
    } finally {
      env.cleanup();
    }
  });
}

for (const schema of ['evcrate-private-release/v1', 'evcrate-private-release/v2']) {
  test(`${schema} repair refuses a symlinked snapshot without touching its receipt`, () => {
    const env = createIsolatedEnv();
    try {
      const assets = buildTestReleaseSet({ outputDir: env.assetsDir });
      const args = ['--data-dir', env.dataDir, '--state-dir', env.stateDir, '--bin-dir', env.binDir];
      const installer = path.join(env.assetsDir, 'install.sh');
      execFileSync(installer, ['install', ...args], { cwd: env.tmp, encoding: 'utf8' });
      const currentPath = path.join(env.dataDir, 'current');
      const current = path.resolve(env.dataDir, fs.readlinkSync(currentPath));
      const external = path.join(env.tmp, 'external-snapshot');
      fs.renameSync(current, external);
      fs.symlinkSync(external, current);
      const receiptPath = path.join(external, 'installer-receipt.json');
      const receipt = fs.readFileSync(receiptPath, 'utf8');
      if (schema.endsWith('/v1')) {
        fs.writeFileSync(assets.metadataPath, JSON.stringify({
          ...assets.metadata, schema, controller_closure_digest: 'c'.repeat(64)
        }));
      }
      assert.throws(() => execFileSync(installer, ['repair', ...args], { cwd: env.tmp, encoding: 'utf8' }), /Symlink detected in ancestor/u);
      assert.equal(fs.readFileSync(receiptPath, 'utf8'), receipt);
      assert.ok(fs.lstatSync(current).isSymbolicLink());
    } finally {
      env.cleanup();
    }
  });
}

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
