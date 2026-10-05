import fs from 'node:fs';
import path from 'node:path';

/**
 * Expected asset inventory relative to .claude/ directory.
 */
export const ASSET_INVENTORY = [
  'agents/snyk-expert.md',
  'skills/dependency-upgrade-review/SKILL.md',
  'skills/dependency-upgrade-review/references/compatibility-evidence.md',
  'skills/dependency-upgrade-review/references/review-output.md',
  'skills/snyk-fix/SKILL.md',
  'skills/snyk-fix/references/finding-and-owner-contract.md',
  'skills/snyk-fix/references/maven-spring-remediation.md',
  'skills/snyk-fix/references/verification-and-results.md'
];

/**
 * Scan source inventory and verify all required bundle assets exist.
 */
export function getSourceInventory(sourceDir) {
  const claudeDir = path.join(sourceDir, '.claude');
  if (!fs.existsSync(claudeDir) || !fs.statSync(claudeDir).isDirectory()) {
    throw new Error(`Source bundle .claude directory not found at: ${claudeDir}`);
  }

  const inventory = [];
  for (const relPath of ASSET_INVENTORY) {
    const fullPath = path.join(claudeDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required bundle asset missing: ${relPath} (expected at ${fullPath})`);
    }
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Source asset cannot be a symbolic link: ${relPath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Source asset is not a regular file: ${relPath}`);
    }
    inventory.push({
      relPath,
      fullPath
    });
  }

  return inventory;
}
