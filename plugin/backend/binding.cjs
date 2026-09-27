'use strict';

/**
 * @file binding.cjs
 * Worker context and source binding verifier for EVCrate Advisor Provider (Phase E01).
 *
 * Enforces exact target identity, non-symlink ancestor directory traversal,
 * native realpath equality, and file-kind invariants.
 * Re-runs E00 path normalization and worktree separation checks.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  invalidInput,
  sourceNotConfigured,
  sourceMissing,
  permissionDenied,
  createProviderError
} = require('./provider-errors.cjs');

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function inspectStat(targetPath) {
  try {
    return fs.lstatSync(targetPath, { bigint: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

function normalizeAndValidatePath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw invalidInput('Path must be a non-empty string');
  }
  if (!path.isAbsolute(rawPath)) {
    throw invalidInput('Path must be absolute');
  }
  if (rawPath.includes('\0')) {
    throw invalidInput('Path must not contain null bytes');
  }
  const parts = rawPath.split(path.sep);
  if (parts.some((p) => p === '.' || p === '..')) {
    throw invalidInput('Path must not contain relative dot segments (. or ..)');
  }
  return path.normalize(rawPath);
}

function computeHistoryIdentity(normalizedPath) {
  return createHash('sha256').update(normalizedPath, 'utf8').digest('hex');
}

function verifyTargetDirectory(targetPath) {
  const normalized = normalizeAndValidatePath(targetPath);
  const rootStat = inspectStat(normalized);
  if (!rootStat) {
    throw sourceMissing('Target directory does not exist');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw permissionDenied('Target path must be a non-symlink directory');
  }

  // Chain traversal of all ancestors
  let current = path.parse(normalized).root;
  const segments = normalized.slice(current.length).split(path.sep).filter(Boolean);
  for (const segment of segments) {
    current = path.join(current, segment);
    const segStat = inspectStat(current);
    if (!segStat) {
      throw sourceMissing('Ancestor path does not exist');
    }
    if (!segStat.isDirectory() || segStat.isSymbolicLink()) {
      throw permissionDenied('Ancestor path is not a directory or is a symlink');
    }
  }

  // Native realpath equality check (rejects symlink aliases)
  try {
    const realNative = fs.realpathSync.native(normalized);
    if (realNative !== normalized) {
      throw permissionDenied('Target directory must equal its native realpath without symlink traversal');
    }
  } catch (err) {
    if (err.name === 'ProviderError') throw err;
    throw permissionDenied('Failed to resolve native realpath for target directory');
  }

  return {
    normalized,
    stat: rootStat,
    historyIdentity: computeHistoryIdentity(normalized)
  };
}

function verifyWorkerContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw invalidInput('Worker context must be an object');
  }
  const {
    context_id: contextId,
    target,
    history_identity: historyIdentity,
    binding_revision: bindingRevision,
    allowed_operations: allowedOperations
  } = context;
  const scopeKind = context.scope_kind || context.scopeKind || 'project';
  if (scopeKind !== 'project' && scopeKind !== 'history-root') {
    throw invalidInput("scope_kind must be 'project' or 'history-root'");
  }

  if (typeof contextId !== 'string' || contextId.length === 0 || contextId.length > 128) {
    throw invalidInput('Invalid context_id: must be 1..128 characters');
  }
  if (!target || !historyIdentity) {
    throw sourceNotConfigured('Target or history_identity missing from context');
  }
  if (typeof historyIdentity !== 'string' || !SHA256_HEX_RE.test(historyIdentity.toLowerCase())) {
    throw invalidInput('Invalid history_identity: must be 64-char lowercase SHA-256');
  }

  const verifiedTarget = verifyTargetDirectory(target);
  if (verifiedTarget.historyIdentity !== historyIdentity.toLowerCase()) {
    throw createProviderError(
      'SOURCE_NOT_CONFIGURED',
      'Target path does not match approved history identity in worker context'
    );
  }

  const allowedOps = Array.isArray(allowedOperations)
    ? Object.freeze([...allowedOperations])
    : Object.freeze([]);

  return Object.freeze({
    contextId,
    scopeKind,
    target: verifiedTarget.normalized,
    historyIdentity: verifiedTarget.historyIdentity,
    bindingRevision: bindingRevision ?? 1,
    allowedOperations: allowedOps,
    policyDescriptor: context.policy_descriptor ? Object.freeze({ ...context.policy_descriptor }) : null,
    evaluationDescriptors: Array.isArray(context.evaluation_descriptors)
      ? Object.freeze(context.evaluation_descriptors.map((d) => Object.freeze({ ...d })))
      : Object.freeze([])
  });
}

function verifySafeRegularFile(filePath, maxBytes = 64 * 1024) {
  const normalized = normalizeAndValidatePath(filePath);
  const stat = inspectStat(normalized);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) {
    throw permissionDenied('File must be a non-symlink regular file with single hard link');
  }
  if (stat.size > BigInt(maxBytes)) {
    throw invalidInput(`File size exceeds maximum limit (${maxBytes}B)`);
  }
  return { path: normalized, stat };
}

module.exports = {
  inspectStat,
  normalizeAndValidatePath,
  computeHistoryIdentity,
  verifyTargetDirectory,
  verifyWorkerContext,
  verifySafeRegularFile
};
