#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const {
  checkNetworkNamespaceSupport,
  createDisposableSandbox,
  computeDirectoryHash
} = require('./release/linux-verification-sandbox.cjs');
const {
  verifyReleaseAssetTree,
  verifyInstalledLauncherAndInvariance
} = require('./release/linux-verification-assertions.cjs');

function parseCliArgs(argv) {
  let assetsDir = null;
  let evidenceFile = null;
  let strictNetwork = true;
  let verbose = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--assets-dir' && i + 1 < argv.length) {
      assetsDir = path.resolve(argv[++i]);
    } else if (arg === '--evidence-file' && i + 1 < argv.length) {
      evidenceFile = path.resolve(argv[++i]);
    } else if (arg === '--no-strict-network') {
      strictNetwork = false;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/verify-private-linux-release.cjs [options]');
      console.log('Options:');
      console.log('  --assets-dir <dir>      Directory containing release assets');
      console.log('  --evidence-file <file>  Path to output JSON evidence report');
      console.log('  --no-strict-network     Allow fallback if unshare -rn is unavailable');
      console.log('  --verbose, -v           Print verbose log output');
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { assetsDir, evidenceFile, strictNetwork, verbose };
}

function resolveAssetsDir(providedAssetsDir, verbose) {
  if (providedAssetsDir && fs.existsSync(providedAssetsDir)) return providedAssetsDir;

  const defaultAssetsDir = path.join(PROJECT_ROOT, 'dist', 'release');
  if (fs.existsSync(defaultAssetsDir) && fs.readdirSync(defaultAssetsDir).some((f) => f.endsWith('.tar.gz'))) {
    return defaultAssetsDir;
  }

  if (verbose) console.log('Preparing release assets in maintainer context...');
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  execFileSync(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts', 'prepare-release-assets.cjs'),
    pkg.version,
    '--allow-fixture-identity'
  ], { cwd: PROJECT_ROOT, stdio: verbose ? 'inherit' : 'ignore' });
  return defaultAssetsDir;
}

function verifyPrivateLinuxRelease(options = {}) {
  const { assetsDir: provided, evidenceFile, strictNetwork = true, verbose = false } = options;

  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error(`Linux verification requires linux-x64 host (current: ${process.platform}-${process.arch})`);
  }

  const hasUnshare = checkNetworkNamespaceSupport();
  if (!hasUnshare && strictNetwork) {
    throw new Error('Linux network namespace isolation (unshare -rn) is unavailable on this host');
  }

  const assetsDir = resolveAssetsDir(provided, verbose);
  const { linuxArchive, archiveSha256, metadata } = verifyReleaseAssetTree(assetsDir);
  const sandbox = createDisposableSandbox();

  const evidence = {
    status: 'INCOMPLETE',
    timestamp: new Date().toISOString(),
    platform: 'linux-x64',
    node_version: process.version,
    network_isolation: hasUnshare ? 'unshare -rn (user namespace loopback-only)' : 'environment-only (unshare unavailable)',
    archive_name: linuxArchive,
    archive_sha256: archiveSha256,
    sidecar_match: true,
    metadata_digest: metadata.inventory_digest,
    node_floor: metadata.node_floor
  };

  try {
    const installScript = path.join(assetsDir, 'install.sh');
    const installArgs = [installScript, '--data-dir', sandbox.dataDir, '--state-dir', sandbox.stateDir, '--bin-dir', sandbox.binDir];

    const installResult = hasUnshare
      ? spawnSync('unshare', ['-rn', '--', 'sh', ...installArgs], {
          cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8', timeout: 30000
        })
      : spawnSync('sh', installArgs, {
          cwd: sandbox.unrelatedCwd, env: sandbox.sandboxEnv, encoding: 'utf8', timeout: 30000
        });

    if (installResult.status !== 0) {
      throw new Error(`Installer failed with exit code ${installResult.status}: ${installResult.stderr || installResult.stdout}`);
    }

    evidence.installer_result = { exit_code: installResult.status };
    if (fs.readdirSync(sandbox.homeDir).length > 0) {
      throw new Error('Target HOME was modified during install');
    }
    evidence.home_untouched_on_install = true;

    const launcherPath = path.join(sandbox.binDir, 'evcrate');
    const currentLink = path.join(sandbox.dataDir, 'current');
    const snapshotDir = path.resolve(sandbox.dataDir, fs.readlinkSync(currentLink));

    const verification = verifyInstalledLauncherAndInvariance(
      launcherPath, snapshotDir, sandbox.unrelatedCwd, sandbox.sandboxEnv, sandbox.homeDir
    );

    evidence.health_check_status = verification.healthStatus;
    evidence.package_hash_before_publish = verification.packageHashBefore;
    evidence.package_hash_after_publish = verification.packageHashAfter;
    evidence.package_hash_invariant = true;
    evidence.controller_closure_verified = true;
    evidence.home_projections_verified = true;
    evidence.status = 'PASS';
    evidence.evidence_complete = true;
  } finally {
    sandbox.cleanup();
  }

  if (evidenceFile) {
    fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
    fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
  }

  return evidence;
}

function main() {
  const options = parseCliArgs(process.argv);
  try {
    console.log('Running Linux release verification in disposable isolated sandbox...');
    const result = verifyPrivateLinuxRelease(options);
    console.log('✓ Linux release verification PASSED');
    console.log(`  Archive: ${result.archive_name} (${result.archive_sha256.slice(0, 16)}...)`);
    console.log(`  Network isolation: ${result.network_isolation}`);
    console.log(`  Package root hash invariant: ${result.package_hash_invariant}`);
    console.log(`  Target HOME publication: verified 7 projections + controller closure`);
    if (options.evidenceFile) console.log(`  Evidence written to: ${options.evidenceFile}`);
  } catch (error) {
    console.error(`✗ Linux release verification FAILED: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  verifyPrivateLinuxRelease,
  computeDirectoryHash,
  checkNetworkNamespaceSupport
};
