'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { computeDirectoryHash } = require('./linux-verification-sandbox.cjs');

function verifyReleaseAssetTree(assetsDir) {
  const files = fs.readdirSync(assetsDir);
  const linuxArchive = files.find((f) => f.startsWith('evcrate-v') && f.endsWith('-linux-x64.tar.gz'));
  if (!linuxArchive) {
    throw new Error(`Missing Linux archive (*-linux-x64.tar.gz) in ${assetsDir}`);
  }
  const sidecarName = `${linuxArchive}.sha256`;
  const sidecarPath = path.join(assetsDir, sidecarName);
  if (!fs.existsSync(sidecarPath)) {
    throw new Error(`Missing sidecar ${sidecarName} in ${assetsDir}`);
  }
  const metaFile = files.find((f) => f.startsWith('evcrate-v') && f.endsWith('.release.json'));
  if (!metaFile) {
    throw new Error(`Missing release metadata (*.release.json) in ${assetsDir}`);
  }
  const installSh = files.find((f) => f === 'install.sh');
  if (!installSh) {
    throw new Error(`Missing install.sh in ${assetsDir}`);
  }

  const archiveBytes = fs.readFileSync(path.join(assetsDir, linuxArchive));
  const archiveSha256 = crypto.createHash('sha256').update(archiveBytes).digest('hex');
  const sidecarContent = fs.readFileSync(sidecarPath, 'utf8');
  const sidecarMatch = sidecarContent.trim().split(/\s+/);
  if (sidecarMatch[0] !== archiveSha256) {
    throw new Error(`Sidecar digest ${sidecarMatch[0]} does not match archive SHA-256 ${archiveSha256}`);
  }

  const metadata = JSON.parse(fs.readFileSync(path.join(assetsDir, metaFile), 'utf8'));
  if (metadata.schema !== 'evcrate-private-release/v1') {
    throw new Error(`Invalid metadata schema: ${metadata.schema}`);
  }
  if (!metadata.platforms || !metadata.platforms['linux-x64']) {
    throw new Error('Metadata missing linux-x64 platform record');
  }
  if (metadata.platforms['linux-x64'].sha256 !== archiveSha256) {
    throw new Error(`Metadata archive SHA-256 mismatch: expected ${archiveSha256}, got ${metadata.platforms['linux-x64'].sha256}`);
  }

  return { linuxArchive, archiveSha256, metadata };
}

function verifyInstalledLauncherAndInvariance(launcherPath, snapshotDir, unrelatedCwd, sandboxEnv, homeDir) {
  const defaultOpts = {
    cwd: unrelatedCwd,
    env: sandboxEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  };

  const versionRes = spawnSync(launcherPath, ['version', '--json'], { ...defaultOpts, timeout: 60000 });
  if (versionRes.status !== 0) {
    throw new Error(`evcrate version failed: ${versionRes.stderr || versionRes.stdout}`);
  }
  const versionJson = JSON.parse(versionRes.stdout);
  if (versionJson.status !== 'ok') {
    throw new Error(`evcrate version returned unexpected status: ${versionJson.status}`);
  }

  const healthRes = spawnSync(launcherPath, ['health', '--json'], { ...defaultOpts, timeout: 60000 });
  const healthStatus = healthRes.status === 0 ? 'ok' : 'diagnostic-flagged';

  const packageHashBefore = computeDirectoryHash(snapshotDir);

  const dryRun1 = spawnSync(launcherPath, ['publish', '--dry-run', '--json'], { ...defaultOpts, timeout: 120000 });
  if (dryRun1.status !== 0) {
    throw new Error(`publish --dry-run failed (status ${dryRun1.status}, signal ${dryRun1.signal}, error ${dryRun1.error}): ${dryRun1.stderr || dryRun1.stdout}`);
  }

  const apply = spawnSync(launcherPath, ['publish', '--apply'], { ...defaultOpts, timeout: 180000 });
  if (apply.status !== 0) {
    throw new Error(`publish --apply failed (status ${apply.status}, signal ${apply.signal}, error ${apply.error}): ${apply.stderr || apply.stdout}`);
  }

  const dryRun2 = spawnSync(launcherPath, ['publish', '--dry-run', '--json'], { ...defaultOpts, timeout: 120000 });
  if (dryRun2.status !== 0) {
    throw new Error(`repeat publish --dry-run failed (status ${dryRun2.status}, signal ${dryRun2.signal}, error ${dryRun2.error}): ${dryRun2.stderr || dryRun2.stdout}`);
  }
  const packageHashAfter = computeDirectoryHash(snapshotDir);
  if (packageHashBefore !== packageHashAfter) {
    throw new Error(`Package snapshot mutated during publish! Before: ${packageHashBefore}, After: ${packageHashAfter}`);
  }

  const expectedTargets = ['.claude', '.copilot', '.omp', '.pi', '.gemini', '.codex', '.agents'];
  for (const target of expectedTargets) {
    if (!fs.existsSync(path.join(homeDir, target))) {
      throw new Error(`Missing expected HOME target projection: ${target}`);
    }
  }

  const controllerBin = path.join(homeDir, '.evcrate', 'bin', 'evcrate-advisor');
  if (!fs.existsSync(controllerBin)) {
    throw new Error('Advisor controller binary missing in published HOME');
  }

  return { healthStatus, packageHashBefore, packageHashAfter };
}

module.exports = {
  verifyReleaseAssetTree,
  verifyInstalledLauncherAndInvariance
};
