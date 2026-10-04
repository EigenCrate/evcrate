'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { execNpmSync } = require('./npm-runner.cjs');
const crypto = require('node:crypto');
const { sha256Bytes } = require('./canonical-json.cjs');

const EXPECTED_TARGETS = Object.freeze([
  'antigravity',
  'claude',
  'codex',
  'copilot',
  'gemini',
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
    const isExecutable = (stat.mode & 0o111) !== 0 ||
      file.path === 'dist/cli/evcrate.js' ||
      file.path === '.evcrate/source/.evcrate/bin/evcrate-advisor';
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

  return records;
}

function collectBuildManifestDigests(projectRoot) {
  const evcrateDir = path.join(projectRoot, '.evcrate');
  const sourceRoot = path.join(evcrateDir, 'source');
  const controllerRoot = path.join(sourceRoot, '.evcrate', 'bin');

  const manifestLib = require(path.join(projectRoot, 'dist', 'distribution', 'manifest.js'));
  const { readBuildManifest, verifyBuild } = manifestLib;

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
      outputRoots[key] = path.join(sourceRoot, key);
    }

    verifyBuild({ manifestPath, outputRoots, controllerRoot });

    const rawBytes = fs.readFileSync(manifestPath);
    digests[targetKey] = sha256Bytes(rawBytes);
  }

  return digests;
}

function collectControllerClosureDigest(projectRoot) {
  const controllerMod = require(path.join(projectRoot, 'dist', 'manifests', 'controller.js'));
  const { validateAdvisorControllerSource, controllerHashBytes } = controllerMod;
  const controllerRoot = path.join(projectRoot, '.evcrate', 'source', '.evcrate', 'bin');
  validateAdvisorControllerSource(controllerRoot);
  return sha256Bytes(controllerHashBytes(controllerRoot));
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
  collectControllerClosureDigest,
  getInstallerEntry
};
