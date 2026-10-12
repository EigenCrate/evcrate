'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execNpmSync } = require('./npm-runner.cjs');
const crypto = require('node:crypto');
const { sha256Bytes } = require('./canonical-json.cjs');

const EXPECTED_TARGETS = Object.freeze([
  'antigravity',
  'claude',
  'codex',
  'copilot',
  'omp',
  'pi',
  'vscode'
]);

function collectPackInventory(projectRoot) {
  const packOutput = execNpmSync(['pack', '--dry-run', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  const match = packOutput.match(/^[{[]/m);
  const jsonIndex = match ? match.index : packOutput.search(/[[{]/);
  const parsed = JSON.parse(packOutput.slice(jsonIndex).trim());
  const packMeta = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];

  const records = [];
  for (const file of packMeta.files) {
    if (file.path.startsWith('dist/release/') || file.path === 'dist/release') continue;
    const fullPath = path.join(projectRoot, file.path);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Inventory item must be regular non-symlink file: ${file.path}`);
    }
    const data = Buffer.from(fs.readFileSync(fullPath));
    const isExecutable = (stat.mode & 0o111) !== 0 || file.path === 'dist/cli/evcrate.js';
    const normMode = isExecutable ? 0o755 : 0o644;
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');

    records.push({
      path: file.path,
      size: data.length,
      mode: normMode,
      sha256,
      fullPath,
      data
    });
  }
  verifyPackCompanionArtifacts(records, projectRoot);
  return records;
}

function verifyPackCompanionArtifacts(records, projectRoot) {
  const descRecord = records.find((r) => r.path === '.evcrate/targets/vscode/files/evcrate/companion/package.json');
  if (!descRecord) {
    throw new Error('Required VS Code companion descriptor missing from pack records: .evcrate/targets/vscode/files/evcrate/companion/package.json');
  }

  const desc = JSON.parse(descRecord.data.toString('utf8'));
  const expectedVsixPath = `.evcrate/targets/vscode/files/evcrate/companion/evcrate-model-bindings-${desc.version}.vsix`;
  const vsixRecord = records.find((r) => r.path === expectedVsixPath);
  if (!vsixRecord) {
    throw new Error(`Companion VSIX missing from pack records: ${expectedVsixPath}`);
  }
  if (vsixRecord.sha256 !== desc.vsixSha256) {
    throw new Error(`Pack inventory companion VSIX sha256 (${vsixRecord.sha256}) mismatches descriptor (${desc.vsixSha256})`);
  }

  const receiptRecord = records.find((r) => r.path === '.evcrate/targets/vscode/files/evcrate/companion/source-receipt.json');
  if (!receiptRecord) {
    throw new Error('Companion source receipt missing from pack records');
  }

  const projVsixPath = `.evcrate/source/.evcrate-vscode/evcrate/companion/evcrate-model-bindings-${desc.version}.vsix`;
  const projVsixRecord = records.find((r) => r.path === projVsixPath);
  if (!projVsixRecord) {
    throw new Error(`Projected companion VSIX missing from pack records: ${projVsixPath}`);
  }
  if (projVsixRecord.sha256 !== desc.vsixSha256) {
    throw new Error(`Projected companion VSIX sha256 (${projVsixRecord.sha256}) mismatches descriptor (${desc.vsixSha256})`);
  }
}

function collectBuildManifestDigests(projectRoot) {
  const evcrateDir = path.join(projectRoot, '.evcrate');
  const sourceRoot = path.join(evcrateDir, 'source');

  const manifestLib = require(path.join(projectRoot, 'dist', 'distribution', 'manifest.js'));
  const { readBuildManifest, verifyBuild } = manifestLib;
  const { localProjectionPath } = require(path.join(projectRoot, 'dist', 'distribution', 'output-paths.js'));

  const expectedFiles = [
    'build-manifest.json',
    ...EXPECTED_TARGETS.map((t) => `build-manifest-${t}.json`)
  ];

  for (const filename of expectedFiles) {
    const full = path.join(evcrateDir, filename);
    if (!fs.existsSync(full)) {
      throw new Error(`Required build manifest missing: ${filename}`);
    }
  }

  const digests = {};
  for (const filename of expectedFiles.sort()) {
    const targetKey = filename === 'build-manifest.json'
      ? 'all'
      : filename.replace(/^build-manifest-/u, '').replace(/\.json$/u, '');

    const manifestPath = path.join(evcrateDir, filename);
    const manifest = readBuildManifest(manifestPath);

    const outputRoots = {};
    for (const key of Object.keys(manifest.output_hashes)) {
      outputRoots[key] = localProjectionPath(sourceRoot, key, true);
    }

    verifyBuild({ manifestPath, outputRoots });

    const rawBytes = fs.readFileSync(manifestPath);
    digests[targetKey] = sha256Bytes(rawBytes);
  }

  return digests;
}


function getInstallerEntry(projectRoot, filename) {
  const filePath = path.join(projectRoot, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Installer entrypoint missing: ${filePath}. Full release packaging requires Phase 2 (install.sh) and Phase 3 (install.ps1) implementation.`);
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Installer must be regular non-link file: ${filePath}`);
  }
  const data = Buffer.from(fs.readFileSync(filePath));
  return {
    name: filename,
    size: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    data
  };
}

module.exports = {
  EXPECTED_TARGETS,
  collectPackInventory,
  collectBuildManifestDigests,
  getInstallerEntry,
  verifyPackCompanionArtifacts
};
