'use strict';

const { execFileSync } = require('child_process');
const canonical = require('./canonical-json.cjs');
const sidecar = require('./sidecar.cjs');
const pathPolicy = require('./path-policy.cjs');
const metadataSchema = require('./metadata-schema.cjs');

const ALLOWED_RELEASE_COMMIT_FILES = Object.freeze([
  'CHANGELOG.md',
  'package.json',
  'package-lock.json',
  '.evcrate/source/.claude/metadata.json',
  '.evcrate/registry.json'
]);

/**
 * Validates that gitHead is either the exact expected source commit, OR a single-parent
 * @semantic-release/git release commit directly parented by sourceCommit.
 * Rejects merge commits, non-release commits, unrelated direct children, and malformed SHAs.
 *
 * @param {string} gitHead The gitHead commit SHA to check
 * @param {string} expectedParentSha The expected sourceCommit
 * @param {string} expectedVersion The release semver version
 * @param {string} [cwd=process.cwd()] Repository directory
 * @returns {boolean}
 */
function isValidReleaseCommitOrSource(gitHead, expectedParentSha, expectedVersion, cwd = process.cwd()) {
  const head = gitHead ? String(gitHead).trim().toLowerCase() : '';
  const expected = expectedParentSha ? String(expectedParentSha).trim().toLowerCase() : '';
  if (!head || !expected || !/^[0-9a-f]{40}$/.test(head) || !/^[0-9a-f]{40}$/.test(expected)) {
    return false;
  }
  if (head === expected) {
    return true;
  }

  try {
    // 1. Single-parent check: git rev-list --parents -n 1 must return exactly [head, expected]
    // Rejects merge commits (multiple parents) and non-parent commits
    const parentsOutput = execFileSync('git', ['rev-list', '--parents', '-n', '1', head], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim().split(/\s+/).filter(Boolean);

    if (parentsOutput.length !== 2 || parentsOutput[0].toLowerCase() !== head || parentsOutput[1].toLowerCase() !== expected) {
      return false;
    }

    // 2. Commit message check: must begin with canonical release message prefix
    const message = execFileSync('git', ['log', '-n', '1', '--format=%B', head], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    const expectedPrefix = `chore(release): ${expectedVersion} [skip ci]`;
    if (!message.startsWith(expectedPrefix)) {
      return false;
    }

    // 3. Changed paths check: must strictly be a subset of allowed release files
    const allowedFiles = new Set(ALLOWED_RELEASE_COMMIT_FILES);
    const changedFiles = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', head], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim().split('\n').map((l) => l.trim()).filter(Boolean);

    if (changedFiles.length === 0 || changedFiles.some((f) => !allowedFiles.has(f))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
function validateReleaseMetadata(data) {
  return metadataSchema.validateReleaseMetadata(data, pathPolicy.MUTABLE_PATHS);
}

module.exports = {
  // Schema and platforms
  SCHEMA_ID: metadataSchema.SCHEMA_ID,
  PLATFORM_LINUX_X64: metadataSchema.PLATFORM_LINUX_X64,
  PLATFORM_WINDOWS_X64: metadataSchema.PLATFORM_WINDOWS_X64,
  SUPPORTED_PLATFORMS: metadataSchema.SUPPORTED_PLATFORMS,
  STANDALONE_INSTALLERS: metadataSchema.STANDALONE_INSTALLERS,
  METADATA_EXACT_KEYS: metadataSchema.METADATA_EXACT_KEYS,

  // Limits and path policy
  MAX_FILES: pathPolicy.MAX_FILES,
  MAX_DIRECTORIES: pathPolicy.MAX_DIRECTORIES,
  MAX_FILE_BYTES: pathPolicy.MAX_FILE_BYTES,
  MAX_TOTAL_EXPANDED_BYTES: pathPolicy.MAX_TOTAL_EXPANDED_BYTES,
  MAX_ARCHIVE_BYTES: pathPolicy.MAX_ARCHIVE_BYTES,
  MAX_PATH_BYTES: pathPolicy.MAX_PATH_BYTES,
  MAX_PATH_DEPTH: pathPolicy.MAX_PATH_DEPTH,
  MUTABLE_PATHS: pathPolicy.MUTABLE_PATHS,
  validateInventoryPath: pathPolicy.validateInventoryPath,
  computeInventoryDigest: pathPolicy.computeInventoryDigest,

  // Canonical JSON and hashing
  compareCodePoints: canonical.compareCodePoints,
  canonicalJson: canonical.canonicalJson,
  canonicalJsonBytes: canonical.canonicalJsonBytes,
  sha256Bytes: canonical.sha256Bytes,
  sha256Canonical: canonical.sha256Canonical,

  // Filenames and sidecars
  linuxArchiveName: metadataSchema.linuxArchiveName,
  windowsArchiveName: metadataSchema.windowsArchiveName,
  releaseMetadataName: metadataSchema.releaseMetadataName,
  sidecarName: sidecar.sidecarName,
  serializeSidecar: sidecar.serializeSidecar,
  parseSidecar: sidecar.parseSidecar,

  // Metadata validation
  validateReleaseMetadata,
  // Git lineage validation
  ALLOWED_RELEASE_COMMIT_FILES,
  isValidReleaseCommitOrSource,
};
