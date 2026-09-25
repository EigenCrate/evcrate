#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { MUTABLE_PATHS } = require('./release/release-contract.cjs');
const { validateRuntimeClosure } = require('./release/runtime-closure.cjs');
const { buildReleaseArchives } = require('./release/archive-writers.cjs');
const {
  collectPackInventory,
  collectBuildManifestDigests,
  collectControllerClosureDigest,
  getInstallerEntry
} = require('./release/pack-inventory.cjs');

function parseCliArgs(argv) {
  let version = null;
  let tag = null;
  let commit = null;
  let allowFixtureIdentity = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tag') {
      tag = argv[++i];
    } else if (arg.startsWith('--tag=')) {
      tag = arg.slice(6);
    } else if (arg === '--commit') {
      commit = argv[++i];
    } else if (arg.startsWith('--commit=')) {
      commit = arg.slice(9);
    } else if (arg === '--allow-fixture-identity') {
      allowFixtureIdentity = true;
    } else if (!arg.startsWith('-') && !version) {
      version = arg;
    }
  }

  if (!version) {
    throw new Error('Missing required version argument');
  }

  tag = tag || `v${version}`;
  return { version, tag, commit, allowFixtureIdentity };
}

function resolveReleaseIdentity(projectRoot, passedCommit, allowFixtureIdentity) {
  const isTest = allowFixtureIdentity || process.env.NODE_ENV === 'test';
  let gitCommit;
  try {
    gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {
    if (!isTest || !passedCommit) {
      throw new Error('Failed to resolve git HEAD commit and not in authorized test fixture mode');
    }
  }

  if (passedCommit && passedCommit !== gitCommit && !isTest) {
    throw new Error(`Arbitrary commit override "${passedCommit}" rejected in release mode (matches neither HEAD nor test gate)`);
  }

  const effectiveCommit = passedCommit || gitCommit;
  if (!/^[a-f0-9]{40}$/u.test(effectiveCommit)) {
    throw new Error(`Resolved commit SHA is invalid: ${effectiveCommit}`);
  }

  if (!isTest) {
    const statusRaw = execFileSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8' });
    const allowedReleaseFiles = new Set(['package.json', 'package-lock.json', 'CHANGELOG.md', '.evcrate/registry.json']);
    const dirtyFiles = statusRaw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[MADRCU?! ]+\s+/u, '').trim())
      .filter((file) => !allowedReleaseFiles.has(file));
    if (dirtyFiles.length > 0) {
      console.warn(`[WARN] Dirty working tree detected before release (dirty files: ${dirtyFiles.join(', ')}); proceeding.`);
    }
  }

  return effectiveCommit;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const { version, tag, commit: rawCommit, allowFixtureIdentity } = parseCliArgs(process.argv);

  const packageJsonPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (pkg.version !== version) {
    throw new Error(`Version mismatch: package.json has ${pkg.version}, argument has ${version}`);
  }
  if (tag !== `v${version}`) {
    throw new Error(`Tag "${tag}" does not match package version "v${version}"`);
  }

  const commit = resolveReleaseIdentity(projectRoot, rawCommit, allowFixtureIdentity);
  const outputDir = path.join(projectRoot, 'dist', 'release');
  fs.rmSync(outputDir, { recursive: true, force: true });

  // 1. Build and verify targets upfront
  console.log('Running build and distribution checks...');
  execFileSync('npm', ['run', 'build:all'], { cwd: projectRoot, stdio: 'inherit' });
  execFileSync('npm', ['run', 'distribute:check'], { cwd: projectRoot, stdio: 'inherit' });

  // 2. Verify runtime closure on fresh build
  console.log('Validating runtime closure...');
  validateRuntimeClosure(projectRoot);

  // 3. Collect verified build and controller digests
  const buildManifestDigests = collectBuildManifestDigests(projectRoot);
  const controllerClosureDigest = collectControllerClosureDigest(projectRoot);

  // 4. Standalone installer entrypoints (authored in Phases 2 and 3)
  const installSh = getInstallerEntry(projectRoot, 'install.sh');
  const installPs1 = getInstallerEntry(projectRoot, 'install.ps1');

  // 5. Collect sealed package inventory
  console.log('Collecting sealed package inventory...');
  const records = collectPackInventory(projectRoot);

  // 6. Output directory
  const releaseDir = path.join(projectRoot, 'dist', 'release');
  // Clean legacy unversioned dist/evcrate.zip if present
  const legacyZip = path.join(projectRoot, 'dist', 'evcrate.zip');
  if (fs.existsSync(legacyZip)) {
    fs.unlinkSync(legacyZip);
  }

  // 7. Build archives, sidecars, metadata, and stage installers in one atomic transaction
  console.log(`Building release archives for v${version}...`);
  const result = buildReleaseArchives({
    records,
    installers: [installSh, installPs1],
    outputDir: releaseDir,
    version,
    metadataGenerator: ({ inventoryDigest, platforms }) => ({
      schema: 'evcrate-private-release/v1',
      version,
      tag,
      source_commit: commit,
      node_floor: pkg.engines?.node || '>=22.19.0',
      inventory_digest: inventoryDigest,
      build_manifest_digests: buildManifestDigests,
      controller_closure_digest: controllerClosureDigest,
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
      mutable_paths: MUTABLE_PATHS
    })
  });

  console.log(`✓ Successfully prepared sealed release assets in ${releaseDir}`);
  console.log(`  Linux archive: ${result.platforms['linux-x64'].archive_name} (${result.platforms['linux-x64'].size} bytes)`);
  console.log(`  Windows archive: ${result.platforms['windows-x64'].archive_name} (${result.platforms['windows-x64'].size} bytes)`);
  console.log(`  Inventory digest: ${result.inventoryDigest}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`✗ Failed to prepare release assets: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseCliArgs,
  resolveReleaseIdentity
};
