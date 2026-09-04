import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { createTarArchive } from '../../../scripts/release/tar-writer.cjs';
import { computeInventoryDigest } from '../../../scripts/release/path-policy.cjs';
import { canonicalJsonBytes, sha256Bytes, compareCodePoints } from '../../../scripts/release/canonical-json.cjs';
import { ADVISOR_CONTROLLER_FILES } from '../../../dist/index.js';
import { createMinimalValidRecords } from './fixture-records.mjs';

export { createMinimalValidRecords };

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');

export function buildTestReleaseSet(options) {
  const {
    outputDir,
    version = '1.0.0',
    records = createMinimalValidRecords(version),
    commit = 'a'.repeat(40),
    tamperSidecar = false,
    tamperArchive = false,
    tamperMetadata = null,
    tamperChecksum = false,
    tamperController = false,
    includeInstallSh = true,
    customInstallShContent = null
  } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const sortedRecords = [...records].sort((a, b) => compareCodePoints(a.path, b.path));
  const inventoryDigest = computeInventoryDigest(sortedRecords);

  const linuxName = `evcrate-v${version}-linux-x64.tar.gz`;
  const windowsName = `evcrate-v${version}-windows-x64.zip`;
  const metaName = `evcrate-v${version}.release.json`;

  let installShData;
  if (customInstallShContent) {
    installShData = Buffer.from(customInstallShContent);
  } else {
    installShData = fs.readFileSync(path.join(PROJECT_ROOT, 'install.sh'));
  }

  const installShSha256 = crypto.createHash('sha256').update(installShData).digest('hex');

  if (includeInstallSh) {
    fs.writeFileSync(path.join(outputDir, 'install.sh'), installShData, { mode: 0o755 });
  }

  const linuxArchivePath = path.join(outputDir, linuxName);
  createTarArchive(sortedRecords, linuxArchivePath);

  if (tamperArchive) {
    const raw = fs.readFileSync(linuxArchivePath);
    raw[raw.length - 1] ^= 0xff;
    fs.writeFileSync(linuxArchivePath, raw);
  }

  const actualArchiveBytes = fs.readFileSync(linuxArchivePath);
  let actualArchiveSha256 = crypto.createHash('sha256').update(actualArchiveBytes).digest('hex');

  const sidecarName = `${linuxName}.sha256`;
  const sidecarPath = path.join(outputDir, sidecarName);
  let sidecarDigest = actualArchiveSha256;
  if (tamperChecksum) {
    sidecarDigest = 'b'.repeat(64);
  }
  let sidecarContent = `${sidecarDigest}  ${linuxName}\n`;
  if (tamperSidecar === 'bad_grammar') {
    sidecarContent = `${sidecarDigest} ${linuxName}\n`;
  } else if (tamperSidecar === 'extra_lines') {
    sidecarContent = `${sidecarDigest}  ${linuxName}\n${sidecarDigest}  ${linuxName}\n`;
  }
  fs.writeFileSync(sidecarPath, sidecarContent);

  let controllerClosureDigest = 'c'.repeat(64);
  if (!tamperController) {
    const controllerMap = {};
    for (const f of ADVISOR_CONTROLLER_FILES) {
      const rec = sortedRecords.find((r) => r.path === `.evcrate/source/.evcrate/bin/${f}`);
      if (rec) {
        controllerMap[`.evcrate/bin/${f}`] = rec.sha256;
      }
    }
    controllerClosureDigest = sha256Bytes(canonicalJsonBytes(controllerMap));
  }

  const buildManifestDigests = {};
  for (const rec of sortedRecords) {
    if (rec.path.startsWith('.evcrate/build-manifest')) {
      const key = rec.path === '.evcrate/build-manifest.json' ? 'all' : rec.path.replace(/^\.evcrate\/build-manifest-/u, '').replace(/\.json$/u, '');
      buildManifestDigests[key] = rec.sha256;
    }
  }

  const metadata = {
    schema: 'evcrate-private-release/v1',
    version,
    tag: `v${version}`,
    source_commit: commit,
    node_floor: '>=22.19.0',
    inventory_digest: inventoryDigest,
    build_manifest_digests: buildManifestDigests,
    controller_closure_digest: controllerClosureDigest,
    platforms: {
      'linux-x64': {
        archive_name: linuxName,
        size: actualArchiveBytes.length,
        sha256: actualArchiveSha256,
        format: 'tar.gz'
      },
      'windows-x64': {
        archive_name: windowsName,
        size: 100,
        sha256: 'd'.repeat(64),
        format: 'zip'
      }
    },
    installers: {
      'install.sh': {
        name: 'install.sh',
        size: installShData.length,
        sha256: installShSha256
      },
      'install.ps1': {
        name: 'install.ps1',
        size: 100,
        sha256: 'e'.repeat(64)
      }
    },
    mutable_paths: [
      '.evcrate/source/.claude/**',
      '.evcrate/registry.json',
      '.evcrate/scopes/**'
    ]
  };

  if (typeof tamperMetadata === 'function') {
    tamperMetadata(metadata);
  }

  const metadataPath = path.join(outputDir, metaName);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');

  return {
    outputDir,
    version,
    linuxName,
    linuxArchivePath,
    sidecarName,
    sidecarPath,
    metaName,
    metadataPath,
    metadata,
    inventoryDigest,
    archiveSha256: actualArchiveSha256
  };
}
