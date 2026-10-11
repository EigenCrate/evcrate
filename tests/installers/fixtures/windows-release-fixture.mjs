import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { buildReleaseArchives } from '../../../scripts/release/archive-writers.cjs';
import { compareCodePoints } from '../../../scripts/release/canonical-json.cjs';
import { createMinimalValidRecords } from './fixture-records.mjs';
import {
  PROJECT_ROOT,
  computeBuildManifestDigests,
  getRealInstallerEntry
} from './release-fixture-shared-helpers.mjs';

/**
 * Builds a deterministic Windows test release set with exactly four files:
 *   - evcrate-v<version>-windows-x64.zip
 *   - evcrate-v<version>-windows-x64.zip.sha256
 *   - evcrate-v<version>.release.json
 *   - install.ps1
 * Uses buildReleaseArchives and real installer entrypoints.
 */
export function buildWindowsTestReleaseSet(options = {}) {
  const {
    outputDir,
    version = '1.0.0',
    records = createMinimalValidRecords(version),
    commit = 'a'.repeat(40),
    projectRoot = PROJECT_ROOT,
    nodeFloor = '>=22.19.0',
    mutablePaths = [
      '.evcrate/source/.claude/**',
      '.evcrate/registry.json',
      '.evcrate/scopes/**'
    ]
  } = options;

  if (!outputDir) {
    throw new Error('outputDir is required for buildWindowsTestReleaseSet');
  }

  const allRecords = [...records];
  if (options.schema === 'evcrate-private-release/v1' && !allRecords.some((r) => r.path.startsWith('.evcrate/source/.evcrate/bin/'))) {
    const defaultCtrl = Buffer.from('console.log("fixture controller");\n');
    allRecords.push({
      path: '.evcrate/source/.evcrate/bin/fixture-controller.cjs',
      mode: 0o644,
      size: defaultCtrl.length,
      sha256: crypto.createHash('sha256').update(defaultCtrl).digest('hex'),
      data: defaultCtrl
    });
  }
  const sortedRecords = allRecords.sort((a, b) => compareCodePoints(a.path, b.path));
  const buildManifestDigests = computeBuildManifestDigests(sortedRecords);
  const installSh = getRealInstallerEntry('install.sh', projectRoot);
  const installPs1 = getRealInstallerEntry('install.ps1', projectRoot);

  const windowsName = `evcrate-v${version}-windows-x64.zip`;
  const windowsSidecarName = `${windowsName}.sha256`;
  const metaName = `evcrate-v${version}.release.json`;

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-win-fixture-'));
  try {
    const archiveResult = buildReleaseArchives({
      records: sortedRecords,
      installers: [installSh, installPs1],
      outputDir: stagingDir,
      version,
      metadataGenerator: ({ inventoryDigest: invDig, platforms }) => ({
        schema: 'evcrate-private-release/v2',
        version,
        tag: `v${version}`,
        source_commit: commit,
        node_floor: nodeFloor,
        inventory_digest: invDig,
        build_manifest_digests: buildManifestDigests,
        platforms,
        installers: {
          'install.sh': {
            name: installSh.name,
            size: installSh.size,
            sha256: installSh.sha256
          },
          'install.ps1': {
            name: installPs1.name,
            size: installPs1.size,
            sha256: installPs1.sha256
          }
        },
        mutable_paths: mutablePaths
      })
    });

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filesToCopy = [
      windowsName,
      windowsSidecarName,
      metaName,
      'install.ps1'
    ];

    const fileRecords = [];
    for (const name of filesToCopy) {
      const src = path.join(stagingDir, name);
      const dst = path.join(outputDir, name);
      fs.copyFileSync(src, dst);
      const stat = fs.statSync(dst);
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex');
      fileRecords.push({
        name,
        size: stat.size,
        sha256
      });
    }
    fileRecords.sort((a, b) => compareCodePoints(a.name, b.name));

    let finalMetadata = archiveResult.metadata;
    if (options.schema === 'evcrate-private-release/v1') {
      const prefix = '.evcrate/source/.evcrate/bin/';
      const map = {};
      for (const rec of sortedRecords) {
        if (rec.path.startsWith(prefix)) {
          map[`.evcrate/bin/${rec.path.slice(prefix.length)}`] = rec.sha256;
        }
      }
      const sortedMap = Object.fromEntries(Object.entries(map).sort(([a], [b]) => compareCodePoints(a, b)));
      const controllerClosureDigest = options.controllerClosureDigest || (
        crypto.createHash('sha256').update(JSON.stringify(sortedMap) + '\n').digest('hex')
      );
      finalMetadata = {
        ...archiveResult.metadata,
        schema: 'evcrate-private-release/v1',
        controller_closure_digest: controllerClosureDigest
      };
      const metaDst = path.join(outputDir, metaName);
      fs.writeFileSync(metaDst, JSON.stringify(finalMetadata));
      const metaRec = fileRecords.find((r) => r.name === metaName);
      if (metaRec) {
        metaRec.size = fs.statSync(metaDst).size;
        metaRec.sha256 = crypto.createHash('sha256').update(fs.readFileSync(metaDst)).digest('hex');
      }
    }
    return {
      outputDir,
      version,
      tag: `v${version}`,
      sourceCommit: commit,
      windowsName,
      windowsArchivePath: path.join(outputDir, windowsName),
      sidecarName: windowsSidecarName,
      sidecarPath: path.join(outputDir, windowsSidecarName),
      metaName,
      metadataPath: path.join(outputDir, metaName),
      installPs1Name: 'install.ps1',
      installPs1Path: path.join(outputDir, 'install.ps1'),
      metadata: finalMetadata,
      inventoryDigest: archiveResult.inventoryDigest,
      archiveSha256: archiveResult.platforms['windows-x64'].sha256,
      files: fileRecords
    };
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {}
  }
}
