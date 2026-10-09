import fs from 'node:fs';
import path from 'node:path';
import { getSourceInventory } from './inventory.js';
import { isSymlinkOrContainsSymlink } from './target-resolver.js';


/**
 * Candidate relative paths for legacy .claude installations of snyk-expert.
 */
export const LEGACY_CLAUDE_CANDIDATES = [
  'agents/snyk-expert.md',
  'skills/snyk-fix',
  'skills/dependency-upgrade-review'
];

/**
 * Detect pre-existing legacy snyk-expert assets under target's .claude/ directory.
 */
export function detectLegacyInstallation(targetDir) {
  const normalizedTarget = path.resolve(targetDir);
  const targetClaudeDir = path.join(normalizedTarget, '.claude');
  const detectedPaths = [];

  for (const rel of LEGACY_CLAUDE_CANDIDATES) {
    const full = path.join(targetClaudeDir, rel);
    const stat = fs.lstatSync(full, { throwIfNoEntry: false });
    if (stat) {
      detectedPaths.push(path.join('.claude', rel));
    }
  }

  return {
    detected: detectedPaths.length > 0,
    targetClaudeDir,
    paths: detectedPaths
  };
}
/**
 * Build a deterministic installation plan.
 */
export function planInstallation({
  sourceDir,
  targetDir,
  inventory = null
}) {
  const assets = inventory || getSourceInventory(sourceDir);
  const normalizedTarget = path.resolve(targetDir);
  const targetAgentsDir = path.join(normalizedTarget, '.agents');
  const legacyInstallation = detectLegacyInstallation(normalizedTarget);

  const actions = [];
  const additions = [];
  const replacements = [];
  const unchanged = [];
  const blockers = [];

  for (const asset of assets) {
    const destPath = path.join(targetAgentsDir, asset.relPath);

    // Symlink escape validation
    if (isSymlinkOrContainsSymlink(destPath, normalizedTarget)) {
      const action = {
        relPath: asset.relPath,
        srcPath: asset.fullPath,
        destPath,
        status: 'blocked',
        reason: 'Destination or parent path contains a symbolic link escaping target directory'
      };
      actions.push(action);
      blockers.push(action);
      continue;
    }

    const destLstat = fs.lstatSync(destPath, { throwIfNoEntry: false });

    if (!destLstat) {
      const action = {
        relPath: asset.relPath,
        srcPath: asset.fullPath,
        destPath,
        status: 'add',
        reason: 'Destination file does not exist'
      };
      actions.push(action);
      additions.push(action);
    } else if (destLstat.isSymbolicLink()) {
      const action = {
        relPath: asset.relPath,
        srcPath: asset.fullPath,
        destPath,
        status: 'blocked',
        reason: 'Existing destination is a symbolic link'
      };
      actions.push(action);
      blockers.push(action);
    } else if (!destLstat.isFile()) {
      const action = {
        relPath: asset.relPath,
        srcPath: asset.fullPath,
        destPath,
        status: 'blocked',
        reason: 'Existing destination is not a regular file'
      };
      actions.push(action);
      blockers.push(action);
    } else {
      const srcBytes = fs.readFileSync(asset.fullPath);
      const destBytes = fs.readFileSync(destPath);

      if (srcBytes.equals(destBytes)) {
        const action = {
          relPath: asset.relPath,
          srcPath: asset.fullPath,
          destPath,
          status: 'unchanged',
          reason: 'Identical file already exists'
        };
        actions.push(action);
        unchanged.push(action);
      } else {
        const action = {
          relPath: asset.relPath,
          srcPath: asset.fullPath,
          destPath,
          status: 'replace',
          reason: 'Existing file content differs'
        };
        actions.push(action);
        replacements.push(action);
      }
    }
  }

  return {
    targetDir: normalizedTarget,
    targetAgentsDir,
    actions,
    additions,
    replacements,
    unchanged,
    blockers,
    legacyInstallation,
    hasCollisions: replacements.length > 0,
    isBlocked: blockers.length > 0
  };
}
