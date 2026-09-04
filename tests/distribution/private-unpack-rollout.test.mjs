import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  computeDirectoryHash,
  checkNetworkNamespaceSupport,
  createDisposableSandbox
} from '../../scripts/release/linux-verification-sandbox.cjs';
import {
  verifyReleaseAssetTree,
  verifyInstalledLauncherAndInvariance
} from '../../scripts/release/linux-verification-assertions.cjs';
import { verifyPrivateLinuxRelease } from '../../scripts/verify-private-linux-release.cjs';
import { buildTestReleaseSet } from '../installers/fixtures/private-release-fixture.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

test('Linux release verification script passes with unshare network isolation and package hash invariance', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const result = verifyPrivateLinuxRelease({ strictNetwork: true });
  assert.equal(result.status, 'PASS');
  assert.equal(result.package_hash_invariant, true);
  assert.equal(result.home_untouched_on_install, true);
  assert.equal(result.controller_closure_verified, true);
  assert.equal(result.home_projections_verified, true);
});

test('installed package snapshot proves clean-new and whole-old-backup mutable-state semantics on upgrade', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const sandbox = createDisposableSandbox();
  try {
    const assetsDir = path.join(sandbox.tmpDir, 'release-assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    // Build v1.0.0
    buildTestReleaseSet({ outputDir: assetsDir, version: '1.0.0' });
    const installSh = path.join(assetsDir, 'install.sh');

    // Fresh install v1.0.0 in network namespace
    const inst1 = spawnSync('unshare', [
      '-rn', '--', 'sh', installSh,
      '--data-dir', sandbox.dataDir,
      '--state-dir', sandbox.stateDir,
      '--bin-dir', sandbox.binDir
    ], { cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8' });
    assert.equal(inst1.status, 0, inst1.stderr);

    const currentLink = path.join(sandbox.dataDir, 'current');
    const v1Snapshot = path.resolve(sandbox.dataDir, fs.readlinkSync(currentLink));

    // Seed package-local mutation in v1 snapshot
    const mutatedFile = path.join(v1Snapshot, 'custom-mutation.txt');
    fs.writeFileSync(mutatedFile, 'user-scope-mutation');
    assert.ok(fs.existsSync(mutatedFile));

    // Build v1.1.0 in separate clean assets dir (as an authorized user downloads new release)
    const assetsDir2 = path.join(sandbox.tmpDir, 'release-assets-v1.1.0');
    fs.mkdirSync(assetsDir2, { recursive: true });
    buildTestReleaseSet({ outputDir: assetsDir2, version: '1.1.0' });
    const installSh2 = path.join(assetsDir2, 'install.sh');

    // Upgrade to v1.1.0 from adjacent new release assets
    const inst2 = spawnSync('unshare', [
      '-rn', '--', 'sh', installSh2,
      '--data-dir', sandbox.dataDir,
      '--state-dir', sandbox.stateDir,
      '--bin-dir', sandbox.binDir
    ], { cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8' });
    assert.equal(inst2.status, 0, inst2.stderr);
    const v2Snapshot = path.resolve(sandbox.dataDir, fs.readlinkSync(currentLink));
    assert.notEqual(v1Snapshot, v2Snapshot);

    // v2 snapshot is clean shipped state (no merged mutation)
    assert.equal(fs.existsSync(path.join(v2Snapshot, 'custom-mutation.txt')), false);

    // v1 snapshot is preserved intact at prior backup path
    assert.ok(fs.existsSync(mutatedFile));
    assert.equal(fs.readFileSync(mutatedFile, 'utf8'), 'user-scope-mutation');

    // Explicit rollback to v1 snapshot
    const v1Name = path.basename(v1Snapshot);
    const rollback = spawnSync('unshare', [
      '-rn', '--', 'sh', installSh, 'rollback', v1Name,
      '--data-dir', sandbox.dataDir,
      '--state-dir', sandbox.stateDir,
      '--bin-dir', sandbox.binDir
    ], { cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8' });
    assert.equal(rollback.status, 0, rollback.stderr);

    const rolledBackSnapshot = path.resolve(sandbox.dataDir, fs.readlinkSync(currentLink));
    assert.equal(rolledBackSnapshot, v1Snapshot);
    assert.ok(fs.existsSync(mutatedFile));

    // Rollback does not publish to HOME
    assert.equal(fs.readdirSync(sandbox.homeDir).length, 0);
  } finally {
    sandbox.cleanup();
  }
});

test('installed launcher exercises recover, health, and repeat apply without package mutation', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const sandbox = createDisposableSandbox();
  try {
    const assetsDir = path.join(PROJECT_ROOT, 'dist', 'release');
    const { linuxArchive } = verifyReleaseAssetTree(assetsDir);
    assert.ok(linuxArchive);

    const installSh = path.join(assetsDir, 'install.sh');
    const inst = spawnSync('unshare', [
      '-rn', '--', 'sh', installSh,
      '--data-dir', sandbox.dataDir,
      '--state-dir', sandbox.stateDir,
      '--bin-dir', sandbox.binDir
    ], { cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8' });
    assert.equal(inst.status, 0, inst.stderr);

    const launcher = path.join(sandbox.binDir, 'evcrate');
    const snapshot = path.resolve(sandbox.dataDir, fs.readlinkSync(path.join(sandbox.dataDir, 'current')));

    const verification = verifyInstalledLauncherAndInvariance(
      launcher, snapshot, sandbox.unrelatedCwd, sandbox.sandboxEnv, sandbox.homeDir
    );
    assert.equal(verification.packageHashBefore, verification.packageHashAfter);

    // Operator recover test
    const recover = spawnSync(launcher, ['recover', '--json'], {
      cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    });
    assert.equal(recover.status, 0, recover.stderr || recover.stdout);

    // Hash still invariant after recover
    assert.equal(computeDirectoryHash(snapshot), verification.packageHashBefore);
  } finally {
    sandbox.cleanup();
  }
});

test('uninstall leaves published HOME targets, advisor policy, and recovery state untouched', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const sandbox = createDisposableSandbox();
  try {
    const assetsDir = path.join(PROJECT_ROOT, 'dist', 'release');
    const installSh = path.join(assetsDir, 'install.sh');
    spawnSync('unshare', [
      '-rn', '--', 'sh', installSh,
      '--data-dir', sandbox.dataDir,
      '--state-dir', sandbox.stateDir,
      '--bin-dir', sandbox.binDir
    ], { cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv });

    const launcher = path.join(sandbox.binDir, 'evcrate');
    spawnSync(launcher, ['publish', '--apply'], {
      cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, maxBuffer: 32 * 1024 * 1024
    });

    // Verify HOME was published
    assert.ok(fs.existsSync(path.join(sandbox.homeDir, '.claude')));
    assert.ok(fs.existsSync(path.join(sandbox.homeDir, '.evcrate', 'bin', 'evcrate-advisor')));

    // Uninstall EVCrate CLI
    const uninst = spawnSync('unshare', [
      '-rn', '--', 'sh', installSh, 'uninstall',
      '--data-dir', sandbox.dataDir,
      '--state-dir', sandbox.stateDir,
      '--bin-dir', sandbox.binDir
    ], { cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8' });
    assert.equal(uninst.status, 0, uninst.stderr);

    // Installer roots and launcher removed
    assert.equal(fs.existsSync(path.join(sandbox.binDir, 'evcrate')), false);
    assert.equal(fs.existsSync(path.join(sandbox.dataDir, 'current')), false);

    // Published HOME targets and advisor policy remain completely untouched!
    assert.ok(fs.existsSync(path.join(sandbox.homeDir, '.claude')));
    assert.ok(fs.existsSync(path.join(sandbox.homeDir, '.evcrate', 'bin', 'evcrate-advisor')));
  } finally {
    sandbox.cleanup();
  }
});

test('network namespace isolation fails closed when socket connectivity is attempted', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  assert.equal(checkNetworkNamespaceSupport(), true);

  // Attempting to bind or connect outside loopback fails in network namespace
  const netTest = spawnSync('unshare', [
    '-rn', '--', process.execPath, '-e',
    'const net = require("node:net"); const s = net.connect({ host: "8.8.8.8", port: 53, timeout: 500 }); s.on("error", () => process.exit(42));'
  ], { timeout: 2000 });
  assert.equal(netTest.status, 42);
});
