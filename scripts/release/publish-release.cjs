#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const assetVerification = require('./asset-verification.cjs');
const releaseContract = require('./release-contract.cjs');
const { readCanonicalReleaseConfig } = require('./run-release-candidate.cjs');

/**
 * Parses and validates environment and CLI arguments for publisher execution.
 * Enforces mandatory EVCRATE_RELEASE_ASSET_MODE=verify.
 *
 * @param {string[]} [argv] Command-line arguments
 * @param {object} [env] Environment variables
 */
function parsePublisherOptions(argv = process.argv, env = process.env) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  if (args.includes('-h') || args.includes('--help')) {
    return { help: true };
  }

  const modeVal = env && env.EVCRATE_RELEASE_ASSET_MODE;
  if (!modeVal || typeof modeVal !== 'string' || modeVal.trim() !== 'verify') {
    throw new Error(`EVCRATE_RELEASE_ASSET_MODE must be set to "verify", got: ${JSON.stringify(modeVal)}`);
  }

  const options = {
    cwd: process.cwd(),
    env: { ...env }
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--receipt') {
      options.receiptPath = args[++i];
    } else if (arg.startsWith('--receipt=')) {
      options.receiptPath = arg.slice('--receipt='.length);
    } else if (arg === '--assets-dir') {
      options.assetsDir = args[++i];
    } else if (arg.startsWith('--assets-dir=')) {
      options.assetsDir = arg.slice('--assets-dir='.length);
    } else if (arg === '--version') {
      options.expectedVersion = args[++i];
    } else if (arg.startsWith('--version=')) {
      options.expectedVersion = arg.slice('--version='.length);
    } else if (arg === '--tag') {
      options.expectedTag = args[++i];
    } else if (arg.startsWith('--tag=')) {
      options.expectedTag = arg.slice('--tag='.length);
    } else if (arg === '--source-commit') {
      options.expectedSourceCommit = args[++i];
    } else if (arg.startsWith('--source-commit=')) {
      options.expectedSourceCommit = arg.slice('--source-commit='.length);
    } else if (arg === '--run-id') {
      options.expectedRunId = Number(args[++i]);
    } else if (arg.startsWith('--run-id=')) {
      options.expectedRunId = Number(arg.slice('--run-id='.length));
    } else if (arg === '--run-attempt') {
      options.expectedRunAttempt = Number(args[++i]);
    } else if (arg.startsWith('--run-attempt=')) {
      options.expectedRunAttempt = Number(arg.slice('--run-attempt='.length));
    } else if (arg === '--approval' || arg === '--approval-evidence') {
      options.approvalPath = args[++i];
    } else if (arg.startsWith('--approval=')) {
      options.approvalPath = arg.slice('--approval='.length);
    } else if (arg.startsWith('--approval-evidence=')) {
      options.approvalPath = arg.slice('--approval-evidence='.length);
    } else if (arg === '--require-approval') {
      options.requireStableApproval = true;
    } else if (arg === '--branch') {
      options.branch = args[++i];
    } else if (arg.startsWith('--branch=')) {
      options.branch = arg.slice('--branch='.length);
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    }
  }

  if (!options.receiptPath && env.EVCRATE_RELEASE_CANDIDATE_RECEIPT) {
    options.receiptPath = env.EVCRATE_RELEASE_CANDIDATE_RECEIPT;
  }
  if (!options.expectedVersion && env.EVCRATE_EXPECTED_VERSION) {
    options.expectedVersion = env.EVCRATE_EXPECTED_VERSION;
  }
  if (!options.expectedTag && env.EVCRATE_EXPECTED_TAG) {
    options.expectedTag = env.EVCRATE_EXPECTED_TAG;
  }
  if (!options.expectedSourceCommit && env.EVCRATE_EXPECTED_SOURCE_COMMIT) {
    options.expectedSourceCommit = env.EVCRATE_EXPECTED_SOURCE_COMMIT;
  }
  if (options.expectedRunId === undefined && (env.EVCRATE_EXPECTED_RUN_ID || env.GITHUB_RUN_ID)) {
    const rawId = env.EVCRATE_EXPECTED_RUN_ID || env.GITHUB_RUN_ID;
    options.expectedRunId = Number(rawId);
  }
  if (options.expectedRunAttempt === undefined && (env.EVCRATE_EXPECTED_RUN_ATTEMPT || env.GITHUB_RUN_ATTEMPT)) {
    const rawAttempt = env.EVCRATE_EXPECTED_RUN_ATTEMPT || env.GITHUB_RUN_ATTEMPT;
    options.expectedRunAttempt = Number(rawAttempt);
  }
  if (!options.approvalPath && (env.EVCRATE_STABLE_APPROVAL_PATH || env.EVCRATE_APPROVAL_PATH)) {
    options.approvalPath = env.EVCRATE_STABLE_APPROVAL_PATH || env.EVCRATE_APPROVAL_PATH;
  }
  if (options.requireStableApproval === undefined && (env.EVCRATE_REQUIRE_STABLE_APPROVAL || env.EVCRATE_REQUIRE_APPROVAL)) {
    const rawVal = env.EVCRATE_REQUIRE_STABLE_APPROVAL || env.EVCRATE_REQUIRE_APPROVAL;
    options.requireStableApproval = rawVal === 'true' || rawVal === '1';
  }
  if (!options.branch && (env.EVCRATE_BRANCH || env.BRANCH_NAME || env.GITHUB_REF_NAME)) {
    options.branch = env.EVCRATE_BRANCH || env.BRANCH_NAME || env.GITHUB_REF_NAME;
  }

  options.expectedHashes = {};
  if (env.EVCRATE_EXPECTED_WINDOWS_ARCHIVE_SHA256) {
    options.expectedHashes.windowsArchive = env.EVCRATE_EXPECTED_WINDOWS_ARCHIVE_SHA256.trim().toLowerCase();
  }
  if (env.EVCRATE_EXPECTED_WINDOWS_SIDECAR_SHA256) {
    options.expectedHashes.windowsSidecar = env.EVCRATE_EXPECTED_WINDOWS_SIDECAR_SHA256.trim().toLowerCase();
  }
  if (env.EVCRATE_EXPECTED_METADATA_SHA256) {
    options.expectedHashes.metadata = env.EVCRATE_EXPECTED_METADATA_SHA256.trim().toLowerCase();
  }
  if (env.EVCRATE_EXPECTED_INSTALL_PS1_SHA256) {
    options.expectedHashes.installPs1 = env.EVCRATE_EXPECTED_INSTALL_PS1_SHA256.trim().toLowerCase();
  }

  return options;
}

/**
 * Asserts safe containment of target directory within allowed parent roots.
 */
function assertSafeDirectoryWithin(targetPath, allowedParents) {
  const resolved = path.resolve(targetPath);
  const isContained = allowedParents.some((parent) => {
    const resolvedParent = path.resolve(parent);
    const rel = path.relative(resolvedParent, resolved);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
  if (!isContained) {
    throw new Error(`Target path "${resolved}" is not safely contained within allowed roots: ${allowedParents.join(', ')}`);
  }
  return resolved;
}

/**
 * Verifies whether a version string is a prerelease version.
 * @param {string} version Semantic version string
 * @returns {boolean} True if prerelease
 */
function isPrereleaseVersion(version) {
  if (typeof version !== 'string') return false;
  return version.includes('-');
}

/**
 * Strictly verifies maintainer approval evidence for stable release publication.
 * Validates file existence, non-symlink, schema, exact version, tag, source commit,
 * status ('approved'), optional run ID and file digests.
 *
 * @param {string} approvalPath Path to approval evidence JSON file
 * @param {object} receipt Verified candidate receipt record
 * @param {object} [options] Optional verification parameters
 * @returns {object} Parsed and verified approval evidence record
 */
function verifyStableApprovalEvidence(approvalPath, receipt, options = {}) {
  if (!approvalPath || typeof approvalPath !== 'string' || !approvalPath.trim()) {
    throw new Error('Stable release publication requires verified maintainer approval evidence file binding candidate identity');
  }

  const resolvedPath = path.resolve(approvalPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Approval evidence file not found at "${resolvedPath}"`);
  }
  const stat = fs.lstatSync(resolvedPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Approval evidence file cannot be a symbolic link: "${resolvedPath}"`);
  }
  if (!stat.isFile()) {
    throw new Error(`Approval evidence path is not a regular file: "${resolvedPath}"`);
  }

  let raw;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read approval evidence file at "${resolvedPath}": ${err.message}`);
  }

  let approval;
  try {
    approval = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse approval evidence JSON at "${resolvedPath}": ${err.message}`);
  }

  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
    throw new Error('Approval evidence must be a non-null object');
  }

  if (approval.status !== 'approved') {
    throw new Error(`Approval evidence status must be "approved", got: ${JSON.stringify(approval.status)}`);
  }

  if (!approval.version || approval.version !== receipt.version) {
    throw new Error(`Approval evidence version "${approval.version}" does not match receipt version "${receipt.version}"`);
  }

  if (!approval.tag || approval.tag !== receipt.tag) {
    throw new Error(`Approval evidence tag "${approval.tag}" does not match receipt tag "${receipt.tag}"`);
  }

  const expectedCommit = receipt.source_commit.toLowerCase();
  if (!approval.source_commit || approval.source_commit.toLowerCase() !== expectedCommit) {
    throw new Error(`Approval evidence source_commit "${approval.source_commit}" does not match receipt source_commit "${expectedCommit}"`);
  }

  if (!approval.approved_by || typeof approval.approved_by !== 'string' || !approval.approved_by.trim()) {
    throw new Error('Approval evidence missing valid approved_by field');
  }

  if (!approval.approved_at || typeof approval.approved_at !== 'string' || !approval.approved_at.trim()) {
    throw new Error('Approval evidence missing valid approved_at timestamp');
  }

  if (approval.workflow_run_id !== undefined && approval.workflow_run_id !== receipt.workflow_run_id) {
    throw new Error(`Approval evidence workflow_run_id "${approval.workflow_run_id}" does not match receipt workflow_run_id "${receipt.workflow_run_id}"`);
  }

  if (approval.digests && typeof approval.digests === 'object') {
    const receiptFiles = {};
    for (const f of receipt.files) {
      receiptFiles[f.name] = f.sha256;
    }
    for (const [name, expectedSha] of Object.entries(approval.digests)) {
      if (receiptFiles[name] && receiptFiles[name] !== expectedSha.toLowerCase()) {
        throw new Error(`Approval evidence digest mismatch for "${name}": expected "${receiptFiles[name]}", approval has "${expectedSha}"`);
      }
    }
  }

  return approval;
}

/**
 * Verifies candidate.json receipt and validates staged assets in assetsDir against receipt records.
 *
 * @param {string} receiptPath Path to candidate.json
 * @param {object} options Options including expected values and optional assetsDir
 * @returns {object} Parsed and verified receipt record
 */
function verifyCandidateReceipt(receiptPath, options = {}) {
  const resolvedReceipt = path.resolve(receiptPath);
  if (!fs.existsSync(resolvedReceipt)) {
    throw new Error(`Candidate receipt file not found at "${resolvedReceipt}"`);
  }
  const stat = fs.lstatSync(resolvedReceipt);
  if (stat.isSymbolicLink()) {
    throw new Error(`Candidate receipt cannot be a symbolic link: "${resolvedReceipt}"`);
  }
  if (!stat.isFile()) {
    throw new Error(`Candidate receipt is not a regular file: "${resolvedReceipt}"`);
  }

  let raw;
  try {
    raw = fs.readFileSync(resolvedReceipt, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read candidate receipt at "${resolvedReceipt}": ${err.message}`);
  }

  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse candidate receipt at "${resolvedReceipt}": ${err.message}`);
  }

  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('Candidate receipt must be a non-null object');
  }

  if (receipt.schema !== 'evcrate-release-candidate/v1') {
    throw new Error(`Invalid candidate receipt schema: expected "evcrate-release-candidate/v1", got "${receipt.schema}"`);
  }

  if (typeof receipt.version !== 'string' || !receipt.version.trim()) {
    throw new Error(`Candidate receipt missing valid version: ${JSON.stringify(receipt.version)}`);
  }
  if (receipt.tag !== `v${receipt.version}`) {
    throw new Error(`Candidate receipt tag "${receipt.tag}" does not match "v${receipt.version}"`);
  }
  if (typeof receipt.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(receipt.source_commit)) {
    throw new Error(`Candidate receipt invalid source_commit: ${JSON.stringify(receipt.source_commit)}`);
  }
  if (typeof receipt.workflow_run_id !== 'number' || !Number.isInteger(receipt.workflow_run_id) || receipt.workflow_run_id <= 0) {
    throw new Error(`Candidate receipt invalid workflow_run_id: ${JSON.stringify(receipt.workflow_run_id)}`);
  }
  if (typeof receipt.workflow_run_attempt !== 'number' || !Number.isInteger(receipt.workflow_run_attempt) || receipt.workflow_run_attempt <= 0) {
    throw new Error(`Candidate receipt invalid workflow_run_attempt: ${JSON.stringify(receipt.workflow_run_attempt)}`);
  }
  if (!Array.isArray(receipt.files) || receipt.files.length !== 7) {
    throw new Error(`Candidate receipt must contain exactly 7 files in "files", got ${Array.isArray(receipt.files) ? receipt.files.length : typeof receipt.files}`);
  }

  // Assert expected identity values if provided
  if (options.expectedVersion && receipt.version !== options.expectedVersion) {
    throw new Error(`Receipt version "${receipt.version}" does not match expectedVersion "${options.expectedVersion}"`);
  }
  if (options.expectedTag && receipt.tag !== options.expectedTag) {
    throw new Error(`Receipt tag "${receipt.tag}" does not match expectedTag "${options.expectedTag}"`);
  }
  if (options.expectedSourceCommit && receipt.source_commit !== options.expectedSourceCommit.toLowerCase()) {
    throw new Error(`Receipt source_commit "${receipt.source_commit}" does not match expectedSourceCommit "${options.expectedSourceCommit}"`);
  }
  if (options.expectedRunId !== undefined && !Number.isNaN(options.expectedRunId) && receipt.workflow_run_id !== options.expectedRunId) {
    throw new Error(`Receipt workflow_run_id "${receipt.workflow_run_id}" does not match expectedRunId "${options.expectedRunId}"`);
  }
  if (options.expectedRunAttempt !== undefined && !Number.isNaN(options.expectedRunAttempt) && receipt.workflow_run_attempt !== options.expectedRunAttempt) {
    throw new Error(`Receipt workflow_run_attempt "${receipt.workflow_run_attempt}" does not match expectedRunAttempt "${options.expectedRunAttempt}"`);
  }

  // Assert expected hashes if provided
  const filesByName = {};
  for (const f of receipt.files) {
    if (!f.name || typeof f.size !== 'number' || !/^[0-9a-f]{64}$/.test(f.sha256)) {
      throw new Error(`Receipt file record invalid: ${JSON.stringify(f)}`);
    }
    filesByName[f.name] = f;
  }

  const winArchiveName = releaseContract.windowsArchiveName(receipt.version);
  const winSidecarName = releaseContract.sidecarName(winArchiveName);
  const metaName = releaseContract.releaseMetadataName(receipt.version);

  const expHashes = options.expectedHashes || {};
  if (expHashes.windowsArchive && filesByName[winArchiveName]?.sha256 !== expHashes.windowsArchive) {
    throw new Error(`Windows archive hash mismatch: expected "${expHashes.windowsArchive}", got "${filesByName[winArchiveName]?.sha256}"`);
  }
  if (expHashes.windowsSidecar && filesByName[winSidecarName]?.sha256 !== expHashes.windowsSidecar) {
    throw new Error(`Windows sidecar hash mismatch: expected "${expHashes.windowsSidecar}", got "${filesByName[winSidecarName]?.sha256}"`);
  }
  if (expHashes.metadata && filesByName[metaName]?.sha256 !== expHashes.metadata) {
    throw new Error(`Release metadata hash mismatch: expected "${expHashes.metadata}", got "${filesByName[metaName]?.sha256}"`);
  }
  if (expHashes.installPs1 && filesByName['install.ps1']?.sha256 !== expHashes.installPs1) {
    throw new Error(`install.ps1 hash mismatch: expected "${expHashes.installPs1}", got "${filesByName['install.ps1']?.sha256}"`);
  }

  // Verify downloaded assets directory
  const assetsDir = options.assetsDir ? path.resolve(options.assetsDir) : path.join(path.dirname(resolvedReceipt), 'assets');
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Candidate assets directory not found at "${assetsDir}"`);
  }
  const assetsStat = fs.lstatSync(assetsDir);
  if (assetsStat.isSymbolicLink() || !assetsStat.isDirectory()) {
    throw new Error(`Candidate assets directory is not a directory: "${assetsDir}"`);
  }

  const actualEntries = fs.readdirSync(assetsDir);
  if (actualEntries.length !== 7) {
    throw new Error(`Candidate assets directory "${assetsDir}" must contain exactly 7 files, found ${actualEntries.length}`);
  }

  for (const f of receipt.files) {
    const filePath = path.join(assetsDir, f.name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Candidate asset "${f.name}" missing in "${assetsDir}"`);
    }
    const s = fs.lstatSync(filePath);
    if (s.isSymbolicLink() || !s.isFile()) {
      throw new Error(`Candidate asset "${f.name}" is not a regular non-symlink file`);
    }
    if (s.size !== f.size) {
      throw new Error(`Candidate asset "${f.name}" size ${s.size} does not match receipt size ${f.size}`);
    }
    const actualSha = assetVerification.sha256File(filePath);
    if (actualSha !== f.sha256) {
      throw new Error(`Candidate asset "${f.name}" sha256 ${actualSha} does not match receipt sha256 ${f.sha256}`);
    }
  }

  // Run exact-seven verifier on assets directory
  assetVerification.verifyReleaseAssetSet({
    dir: assetsDir,
    version: receipt.version,
    tag: receipt.tag,
    sourceCommit: receipt.source_commit
  });

  return receipt;
}

/**
 * Clears dist/release and copies only the verified assets from candidate assetsDir.
 * Re-verifies dist/release in place.
 *
 * @param {string} assetsDir Directory containing candidate assets
 * @param {string} distReleaseDir Target dist/release directory
 * @param {object} receipt Verified candidate receipt record
 */
function preparePublishWorkspace(assetsDir, distReleaseDir, receipt, options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const runnerTemp = options.runnerTemp
    ? path.resolve(options.runnerTemp)
    : (process.env.RUNNER_TEMP ? path.resolve(process.env.RUNNER_TEMP) : os.tmpdir());

  assertSafeDirectoryWithin(distReleaseDir, [cwd, runnerTemp, os.tmpdir()]);

  if (fs.existsSync(distReleaseDir)) {
    fs.rmSync(distReleaseDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distReleaseDir, { recursive: true });

  for (const f of receipt.files) {
    const src = path.join(assetsDir, f.name);
    const dest = path.join(distReleaseDir, f.name);
    fs.copyFileSync(src, dest);
  }

  assetVerification.verifyReleaseAssetSet({
    dir: distReleaseDir,
    version: receipt.version,
    tag: receipt.tag,
    sourceCommit: receipt.source_commit
  });
}

/**
 * Runs the publish-release lifecycle in verify mode against canonical semantic-release.
 *
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function runPublishRelease(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const env = options.env ? { ...options.env } : { ...process.env };

  const receiptPath = options.receiptPath ? path.resolve(options.receiptPath) : path.join(cwd, 'release-candidate', 'candidate.json');
  const assetsDir = options.assetsDir ? path.resolve(options.assetsDir) : path.join(path.dirname(receiptPath), 'assets');
  const distReleaseDir = options.distReleaseDir ? path.resolve(options.distReleaseDir) : path.join(cwd, 'dist', 'release');

  // 1. Verify receipt and downloaded assets
  const receipt = verifyCandidateReceipt(receiptPath, {
    ...options,
    assetsDir
  });
  // 1b. Verify branch topology guards against canonical release configuration
  const isPrerelease = isPrereleaseVersion(receipt.version);
  const canonicalConfig = options.config || readCanonicalReleaseConfig({ projectRoot: cwd });
  const branch = options.branch || env.BRANCH_NAME || env.GITHUB_REF_NAME;
  if (branch) {
    const trimmedBranch = String(branch).trim();
    if (trimmedBranch === 'main' && isPrerelease) {
      throw new Error(`Topology violation: cannot publish prerelease version "${receipt.version}" on stable branch "main"`);
    }
    if (trimmedBranch === 'next' && !isPrerelease) {
      throw new Error(`Topology violation: cannot publish stable version "${receipt.version}" on prerelease branch "next"`);
    }
  }

  // 1c. Verify stable candidate approval evidence unconditionally for stable releases
  let approvalRecord = null;
  if (!isPrerelease || options.approvalPath || options.requireStableApproval) {
    approvalRecord = verifyStableApprovalEvidence(options.approvalPath, receipt, options);
  }
  // 2. Prepare publish workspace (copy assets only to dist/release, verify again)
  preparePublishWorkspace(assetsDir, distReleaseDir, receipt, { cwd, runnerTemp: options.runnerTemp });

  // 3. Canonical release configuration is already loaded
  // Ensure asset mode is strictly verify in semantic-release environment
  const publishEnv = {
    ...env,
    EVCRATE_RELEASE_ASSET_MODE: 'verify'
  };

  const rawSr = options.semanticReleaseFn || require('semantic-release');
  const semanticReleaseFn = typeof rawSr === 'function' ? rawSr : (rawSr && typeof rawSr.default === 'function' ? rawSr.default : null);
  if (typeof semanticReleaseFn !== 'function') {
    throw new Error('semantic-release module did not resolve to a callable function');
  }

  // 4. Call canonical semantic-release
  const result = await semanticReleaseFn(canonicalConfig, {
    cwd,
    env: publishEnv,
    stdout: options.stdout || process.stdout,
    stderr: options.stderr || process.stderr
  });

  if (result === false) {
    throw new Error('semantic-release returned false (no release) in publish mode: expected release matching candidate receipt');
  }

  const nextRelease = result && result.nextRelease;
  if (!nextRelease) {
    throw new Error(`semantic-release returned unexpected result without nextRelease: ${JSON.stringify(result)}`);
  }

  if (nextRelease.version !== receipt.version) {
    throw new Error(`Published release version "${nextRelease.version}" does not match receipt version "${receipt.version}"`);
  }
  if (nextRelease.gitTag !== receipt.tag) {
    throw new Error(`Published release tag "${nextRelease.gitTag}" does not match receipt tag "${receipt.tag}"`);
  }
  if (!releaseContract.isValidReleaseCommitOrSource(nextRelease.gitHead, receipt.source_commit, receipt.version, cwd)) {
    throw new Error(`Published release gitHead "${nextRelease.gitHead}" does not match receipt source_commit "${receipt.source_commit}" or a verified @semantic-release/git release commit`);
  }

  return {
    success: true,
    publishedRelease: nextRelease,
    receipt,
    approval: approvalRecord
  };
}

/**
 * Main CLI entry point for publish-release.cjs.
 */
async function main(argv = process.argv, env = process.env) {
  const parsed = parsePublisherOptions(argv, env);
  if (parsed.help) {
    console.log(`Usage: node scripts/release/publish-release.cjs [options]

Options:
  --receipt <path>          Path to candidate.json (default: ./release-candidate/candidate.json)
  --assets-dir <dir>        Path to candidate assets directory (default: <receipt-dir>/assets)
  --version <version>       Expected release version
  --tag <tag>               Expected git tag
  --source-commit <commit>  Expected 40-hex commit SHA
  --run-id <id>             Expected workflow run ID
  --run-attempt <attempt>   Expected workflow run attempt
  --approval <path>         Path to maintainer approval evidence JSON (mandatory for stable releases)
  -h, --help                Show this help message
`);
    return 0;
  }

  const result = await runPublishRelease(parsed);
  console.log(`✓ Release successfully published for v${result.publishedRelease.version} (${result.publishedRelease.gitTag})`);
  return result;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`✗ publish-release failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parsePublisherOptions,
  isPrereleaseVersion,
  verifyCandidateReceipt,
  verifyStableApprovalEvidence,
  preparePublishWorkspace,
  runPublishRelease,
  main
};
