'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyInstalledLauncherAndInvariance } = require('./installed-lifecycle-assertions.cjs');

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


module.exports = {
  verifyReleaseAssetTree,
  verifyInstalledLauncherAndInvariance
};
