import fs from 'node:fs';
import path from 'node:path';

/**
 * Expected asset inventory relative to .agents/ directory.
 */
export const ASSET_INVENTORY = [
  'agents/snyk-expert.md',
  'skills/dependency-upgrade-review/SKILL.md',
  'skills/dependency-upgrade-review/references/compatibility-evidence.md',
  'skills/dependency-upgrade-review/references/review-output.md',
  'skills/snyk-fix/SKILL.md',
  'skills/snyk-fix/references/finding-and-owner-contract.md',
  'skills/snyk-fix/references/maven-spring-remediation.md',
  'skills/snyk-fix/references/verification-and-results.md',
  'skills/snyk-fix/references/node-typescript-remediation.md',
  'skills/snyk-cli/SKILL.md',
  'skills/snyk-cli/references/cli-workflow.md'
];

/**
 * Scan source inventory and verify all required bundle assets exist.
 */
export function getSourceInventory(sourceDir) {
  const agentsDir = path.join(sourceDir, '.agents');
  if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
    throw new Error(`Source bundle .agents directory not found at: ${agentsDir}`);
  }

  const inventory = [];
  for (const relPath of ASSET_INVENTORY) {
    const fullPath = path.join(agentsDir, relPath);
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
