#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { verifyReleaseAssetSet } = require('./asset-verification.cjs');

/**
 * Validates and parses the mandatory EVCRATE_RELEASE_ASSET_MODE environment variable.
 * Accepts only literal "build" or "verify". Fails closed before touching any directory.
 * @param {object} env Environment object (defaults to process.env)
 * @returns {'build'|'verify'} The validated asset mode
 */
function parseAssetMode(env = process.env) {
  const modeVal = env && env.EVCRATE_RELEASE_ASSET_MODE;
  if (!modeVal || typeof modeVal !== 'string' || !modeVal.trim()) {
    throw new Error(
      'Missing required EVCRATE_RELEASE_ASSET_MODE environment variable (must be literal "build" or "verify")'
    );
  }
  const mode = modeVal.trim();
  if (mode !== 'build' && mode !== 'verify') {
    throw new Error(
      `Invalid EVCRATE_RELEASE_ASSET_MODE: "${modeVal}" (must be literal "build" or "verify")`
    );
  }
  return mode;
}

/**
 * Executes asset preparation in "build" mode:
 * Delegates to scripts/prepare-release-assets.cjs, then verifies exact-seven release assets.
 * @param {string} version Semantic version string (e.g. "2.1.0")
 * @param {object} [options] Execution options
 * @returns {object} Normalized frozen verification summary
 */
function runBuildPrepare(version, options = {}) {
  if (!version || typeof version !== 'string' || !version.trim()) {
    throw new Error(`Missing required version argument for build prepare`);
  }
  const v = version.trim();
  const projectRoot = options.projectRoot || path.resolve(__dirname, '../..');
  const prepareScript = options.prepareScript || path.join(projectRoot, 'scripts', 'prepare-release-assets.cjs');
  const releaseDir = options.releaseDir || path.join(projectRoot, 'dist', 'release');
  const env = options.env || process.env;

  console.log(`[PREPARE] Running build mode asset preparation for v${v}...`);
  execFileSync(process.execPath, [prepareScript, v], {
    cwd: projectRoot,
    stdio: options.stdio || 'inherit',
    env
  });

  console.log(`[PREPARE] Verifying built release assets in ${releaseDir}...`);
  const summary = verifyReleaseAssetSet({
    dir: releaseDir,
    version: v
  });

  return summary;
}

/**
 * Executes asset preparation in "verify" mode:
 * Strictly read-only; verifies existing exact-seven release assets without invoking any build steps.
 * @param {object} [options] Verification options
 * @returns {object} Normalized frozen verification summary
 */
function runVerifyPrepare(options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '../..');
  const releaseDir = options.releaseDir || path.join(projectRoot, 'dist', 'release');

  console.log(`[PREPARE] Running verify-only mode on release assets in ${releaseDir}...`);
  const summary = verifyReleaseAssetSet({
    dir: releaseDir,
    version: options.version,
    tag: options.tag,
    sourceCommit: options.sourceCommit,
    expectedHashes: options.expectedHashes
  });

  return summary;
}

/**
 * CLI entry point for semantic-release exec prepareCmd.
 * @param {string[]} [argv] Command-line arguments
 * @param {object} [env] Environment variables
 * @returns {object} Verification summary
 */
function main(argv = process.argv, env = process.env) {
  // 1. Mandatory mode check FIRST before any filesystem or process activity
  const mode = parseAssetMode(env);

  // 2. Parse version argument if present
  let version = null;
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 2; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--version' && i + 1 < args.length) {
      version = args[++i];
    } else if (arg.startsWith('--version=')) {
      version = arg.slice(10);
    } else if (!arg.startsWith('-') && !version) {
      version = arg;
    }
  }

  let summary;
  if (mode === 'build') {
    if (!version) {
      throw new Error('Missing required version argument for build prepare mode');
    }
    summary = runBuildPrepare(version, { env });
  } else if (mode === 'verify') {
    summary = runVerifyPrepare({ version });
  }

  console.log(`✓ Release asset prepare (${mode} mode) succeeded for v${summary.version}`);
  return summary;
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
  parseAssetMode,
  runBuildPrepare,
  runVerifyPrepare,
  main
};
