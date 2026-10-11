import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inspectDestination } from './target-resolver.js';
import { acquireLock, releaseLock, pruneEmptyDirectories } from './lock-manager.js';

/**
 * Execute the installation plan with safety guarantees, exclusive locking,
 * atomic staging, drift detection, and transactional rollback.
 */
export function executeInstallation(plan, options = {}) {
  const {
    dryRun = false,
    force = false,
    yes = false,
    _beforePublish = null
  } = options;

  if (plan.isBlocked || (plan.blockers && plan.blockers.length > 0)) {
    const error = new Error(
      `Installation blocked by incompatible destination paths:\n` +
      plan.blockers.map(b => `  - ${b.relativePath || b.relPath}: ${b.reason}`).join('\n')
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
        plan.replacements.map(r => `  - .agents/${r.relativePath || r.relPath}`).join('\n') +
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
      installationRoot: plan.installationRoot,
      committed: [],
      plannedAdditions: plan.additions.map(a => a.relativePath || a.relPath),
      plannedReplacements: plan.replacements.map(r => r.relativePath || r.relPath),
      additions: plan.additions.map(a => a.relativePath || a.relPath),
      replacements: plan.replacements.map(r => r.relativePath || r.relPath),
      unchanged: plan.unchanged.map(u => u.relativePath || u.relPath)
    };
  }

  const lockPath = path.join(plan.installationRoot, '.install.lock');
  acquireLock(lockPath);

  try {
    // 1. Pre-execution drift check: ensure destination state hasn't changed since planning
    for (const action of plan.actions) {
      const rel = action.relativePath || action.relPath;
      const current = inspectDestination(plan.installationRoot, rel, action.sourceBytes);
      if (current.status !== action.status || (action.status === 'replace' && !current.existingBytes.equals(action.existingBytes))) {
        throw new Error(`Destination changed after planning: ${rel}`);
      }
    }

    const committed = [];
    const temporaryPaths = [];
    const createdFiles = new Set();
    const backups = new Map();

    try {
      const staged = [];
      const toApply = [...plan.additions, ...plan.replacements];
      for (const action of toApply) {
        const dest = action.destinationPath || action.destPath;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const temporaryPath = path.join(path.dirname(dest), `.tmp-${crypto.randomUUID()}`);
        temporaryPaths.push(temporaryPath);
        fs.writeFileSync(temporaryPath, action.sourceBytes, { flag: 'wx' });
        staged.push({ action, temporaryPath, dest });
      }

      for (let index = 0; index < staged.length; index += 1) {
        const { action, temporaryPath, dest } = staged[index];
        const rel = action.relativePath || action.relPath;

        if (typeof _beforePublish === 'function') {
          _beforePublish(action, index);
        }

        if (action.status === 'add') {
          try {
            fs.copyFileSync(temporaryPath, dest, fs.constants.COPYFILE_EXCL);
          } catch (error) {
            if (error.code === 'EEXIST') {
              throw new Error(`Destination changed during installation: ${rel} already exists`);
            }
            throw error;
          }
          createdFiles.add(dest);
          fs.rmSync(temporaryPath, { force: true });
          committed.push(rel);
        } else if (action.status === 'replace') {
          const current = inspectDestination(plan.installationRoot, rel, action.sourceBytes);
          if (current.status !== 'replace' || !current.existingBytes.equals(action.existingBytes)) {
            throw new Error(`Destination changed during installation: ${rel}`);
          }
          backups.set(dest, current.existingBytes);
          fs.renameSync(temporaryPath, dest);
          committed.push(rel);
        }
      }

      // Final verification of all installed files
      for (const action of plan.actions) {
        const dest = action.destinationPath || action.destPath;
        if (!fs.readFileSync(dest).equals(action.sourceBytes)) {
          throw new Error(`Installed file verification failed: ${action.relativePath || action.relPath}`);
        }
      }

      return {
        dryRun: false,
        targetDir: plan.targetDir,
        installationRoot: plan.installationRoot,
        committed,
        unchanged: plan.unchanged.map(u => u.relativePath || u.relPath)
      };
    } catch (err) {
      for (const temporaryPath of temporaryPaths) fs.rmSync(temporaryPath, { force: true });
      for (const createdPath of createdFiles) fs.rmSync(createdPath, { force: true });
      for (const [destPath, existingBytes] of backups) {
        try {
          fs.writeFileSync(destPath, existingBytes);
        } catch {}
      }
      for (const createdPath of createdFiles) {
        pruneEmptyDirectories(path.dirname(createdPath), plan.installationRoot);
      }
      for (const temporaryPath of temporaryPaths) {
        pruneEmptyDirectories(path.dirname(temporaryPath), plan.installationRoot);
      }
      const error = new Error(`Installation failed after ${committed.length} file(s): ${err.message}`);
      error.code = 'ERR_INSTALL_FAILED';
      error.committed = committed;
      throw error;
    }
  } finally {
    releaseLock(lockPath);
    pruneEmptyDirectories(path.dirname(lockPath), plan.installationRoot);
  }
}
