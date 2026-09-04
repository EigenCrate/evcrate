'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  linuxArchiveName,
  windowsArchiveName,
  releaseMetadataName,
  sidecarName,
  serializeSidecar,
  compareCodePoints,
  canonicalJsonBytes,
  validateReleaseMetadata
} = require('./release-contract.cjs');
const { validateInventoryPath, computeInventoryDigest } = require('./path-policy.cjs');
const { createTarArchive } = require('./tar-writer.cjs');
const { verifyTarArchive } = require('./tar-verifier.cjs');
const { createZipArchive } = require('./zip-writer.cjs');
const { verifyZipArchive } = require('./zip-verifier.cjs');

function sortAndValidateRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Records must be a non-empty array');
  }
  for (const rec of records) validateInventoryPath(rec.path);

  const sorted = [...records].sort((a, b) => compareCodePoints(a.path, b.path));
  const seenPaths = new Set();
  const seenLower = new Set();
  const frozenRecords = [];

  for (const rec of sorted) {
    if (seenPaths.has(rec.path)) throw new Error(`Duplicate path: ${rec.path}`);
    const lower = rec.path.toLowerCase();
    if (seenLower.has(lower)) throw new Error(`Case-fold collision: ${rec.path}`);
    seenPaths.add(rec.path);
    seenLower.add(lower);

    const rawData = rec.data || fs.readFileSync(rec.fullPath);
    const copiedData = Buffer.from(rawData);
    frozenRecords.push(Object.freeze({
      path: rec.path,
      size: copiedData.length,
      mode: rec.mode,
      sha256: rec.sha256,
      fullPath: rec.fullPath,
      data: copiedData
    }));
  }
  return Object.freeze(frozenRecords);
}

function assertNoExistingAssets(outputDir, version, installerNames = []) {
  const linuxName = linuxArchiveName(version);
  const windowsName = windowsArchiveName(version);
  const metaName = releaseMetadataName(version);

  const finalNames = [
    linuxName, sidecarName(linuxName),
    windowsName, sidecarName(windowsName),
    metaName, ...installerNames
  ];
  for (const name of finalNames) {
    const targetPath = path.join(outputDir, name);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }
  }
  return finalNames;
}

function buildReleaseArchives(options) {
  const { records, installers = [], outputDir, version, metadataGenerator } = options;
  if (typeof metadataGenerator !== 'function') {
    throw new Error('metadataGenerator function is required to produce metadata');
  }

  const sortedRecords = sortAndValidateRecords(records);
  const inventoryDigest = computeInventoryDigest(sortedRecords);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const installerNames = installers.map((inst) => inst.name);
  assertNoExistingAssets(outputDir, version, installerNames);

  const linuxName = linuxArchiveName(version);
  const windowsName = windowsArchiveName(version);
  const metaName = releaseMetadataName(version);
  const stagingDir = fs.mkdtempSync(path.join(outputDir, '.stage-'));
  const stagedFiles = [];
  const promotedFiles = [];

  try {
    const sLinux = path.join(stagingDir, linuxName);
    const sWindows = path.join(stagingDir, windowsName);
    const sLinuxSidecar = path.join(stagingDir, sidecarName(linuxName));
    const sWindowsSidecar = path.join(stagingDir, sidecarName(windowsName));
    const sMeta = path.join(stagingDir, metaName);

    const linuxInfo = createTarArchive(sortedRecords, sLinux);
    const windowsInfo = createZipArchive(sortedRecords, sWindows);
    stagedFiles.push(linuxName, windowsName);

    verifyTarArchive(sLinux, sortedRecords);
    verifyZipArchive(sWindows, sortedRecords);

    fs.writeFileSync(sLinuxSidecar, serializeSidecar(linuxInfo.sha256, linuxName), 'utf8');
    fs.writeFileSync(sWindowsSidecar, serializeSidecar(windowsInfo.sha256, windowsName), 'utf8');
    stagedFiles.push(sidecarName(linuxName), sidecarName(windowsName));

    const platforms = {
      'linux-x64': { archive_name: linuxName, size: linuxInfo.size, sha256: linuxInfo.sha256 },
      'windows-x64': { archive_name: windowsName, size: windowsInfo.size, sha256: windowsInfo.sha256 }
    };

    for (const inst of installers) {
      const sInst = path.join(stagingDir, inst.name);
      fs.writeFileSync(sInst, inst.data, { mode: inst.name.endsWith('.sh') ? 0o755 : 0o644 });
      stagedFiles.push(inst.name);
    }

    const metadata = metadataGenerator({ inventoryDigest, platforms });
    validateReleaseMetadata(metadata);
    fs.writeFileSync(sMeta, canonicalJsonBytes(metadata));
    stagedFiles.push(metaName);

    for (const name of stagedFiles) {
      const src = path.join(stagingDir, name);
      const dst = path.join(outputDir, name);
      fs.linkSync(src, dst);
      promotedFiles.push(dst);
    }
    for (const name of stagedFiles) fs.unlinkSync(path.join(stagingDir, name));
    fs.rmdirSync(stagingDir);

    return { inventoryDigest, platforms, metadata };
  } catch (error) {
    for (const dst of promotedFiles) {
      try { if (fs.existsSync(dst)) fs.unlinkSync(dst); } catch {}
    }
    throw error;
  } finally {
    if (fs.existsSync(stagingDir)) {
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    }
  }
}

module.exports = {
  sortAndValidateRecords,
  assertNoExistingAssets,
  buildReleaseArchives
};
