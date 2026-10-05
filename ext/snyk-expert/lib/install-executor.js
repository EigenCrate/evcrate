import fs from 'node:fs';
import path from 'node:path';

/**
 * Execute the installation plan with safety guarantees and atomic staging.
 */
export function executeInstallation(plan, options = {}) {
  const {
    dryRun = false,
    force = false,
    yes = false
  } = options;

  if (plan.isBlocked) {
    const error = new Error(
      `Installation blocked by incompatible destination paths:\n` +
      plan.blockers.map(b => `  - ${b.relPath}: ${b.reason}`).join('\n')
    );
    error.code = 'ERR_INSTALL_BLOCKED';
    throw error;
  }

  if (yes && !force && plan.hasCollisions) {
    const error = new Error(
      `Option --yes alone cannot authorize overwriting existing files. Pass --force with --yes to overwrite.`
    );
    error.code = 'ERR_OVERWRITE_UNAUTHORIZED';
    throw error;
  }

  if (plan.hasCollisions) {
    if (!force) {
      const error = new Error(
        `Destination files already exist and differ:\n` +
        plan.replacements.map(r => `  - .claude/${r.relPath}`).join('\n') +
        `\nUse --force (with --yes or interactive confirmation) to overwrite.`
      );
      error.code = 'ERR_COLLISION_DETECTED';
      throw error;
    }

    if (!yes) {
      const error = new Error(
        `Overwrite authorized with --force, but confirmation (--yes) is required.`
      );
      error.code = 'ERR_CONFIRMATION_REQUIRED';
      throw error;
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      targetDir: plan.targetDir,
      committed: [],
      plannedAdditions: plan.additions.map(a => a.relPath),
      plannedReplacements: plan.replacements.map(r => r.relPath),
      unchanged: plan.unchanged.map(u => u.relPath)
    };
  }

  const committed = [];
  const stagedTemps = [];

  try {
    const toApply = [...plan.additions, ...plan.replacements];

    for (const item of toApply) {
      const destDir = path.dirname(item.destPath);
      fs.mkdirSync(destDir, { recursive: true });

      const tempFile = path.join(
        destDir,
        `.tmp-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${path.basename(item.destPath)}`
      );
      stagedTemps.push(tempFile);

      fs.copyFileSync(item.srcPath, tempFile);

      // Verify staged file
      const srcBuf = fs.readFileSync(item.srcPath);
      const tmpBuf = fs.readFileSync(tempFile);
      if (!srcBuf.equals(tmpBuf)) {
        throw new Error(`Byte verification failed during staging for ${item.relPath}`);
      }

      // Atomic rename
      fs.renameSync(tempFile, item.destPath);
      const idx = stagedTemps.indexOf(tempFile);
      if (idx !== -1) stagedTemps.splice(idx, 1);

      committed.push(item.relPath);
    }
  } catch (err) {
    // Clean up any remaining temp files
    for (const tmp of stagedTemps) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch (_) {}
    }
    const error = new Error(
      `Installation failed partway through: ${err.message}.\n` +
      `Committed files (${committed.length}):\n` +
      committed.map(c => `  - .claude/${c}`).join('\n')
    );
    error.code = 'ERR_INSTALL_FAILED';
    error.committed = committed;
    throw error;
  }

  // Final verification of all installed files
  for (const relPath of committed) {
    const src = path.join(plan.actions.find(a => a.relPath === relPath).srcPath);
    const dest = path.join(plan.actions.find(a => a.relPath === relPath).destPath);
    if (!fs.readFileSync(src).equals(fs.readFileSync(dest))) {
      throw new Error(`Post-install verification failed for .claude/${relPath}`);
    }
  }

  return {
    dryRun: false,
    targetDir: plan.targetDir,
    committed,
    unchanged: plan.unchanged.map(u => u.relPath)
  };
}
