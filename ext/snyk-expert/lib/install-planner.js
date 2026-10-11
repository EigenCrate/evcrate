import fs from 'node:fs';
import path from 'node:path';
import { getSourceInventory } from './inventory.js';
import {
  resolveInstallTarget,
  resolveTarget,
  inspectDestination,
  lstatOrNull
} from './target-resolver.js';

/**
 * Build a deterministic installation plan.
 */
export function planInstallation({
  sourceDir,
  target,
  directory,
  targetDir,
  inventory = null
}) {
  let resolved;
  if (target !== undefined || directory !== undefined) {
    resolved = resolveInstallTarget({ target, directory });
  } else if (targetDir !== undefined) {
    resolved = resolveTarget(targetDir);
  } else {
    resolved = resolveInstallTarget({ target: undefined, directory: undefined });
  }

  const assets = inventory || getSourceInventory(sourceDir);
  const normalizedTarget = resolved.targetDir;
  const targetAgentsDir = resolved.installationRoot;

  const actions = [];

  for (const asset of assets) {
    const sourceRelative = typeof asset === 'string' ? asset : (asset.relPath || asset.relativePath);
    const sourcePath = asset.fullPath || path.join(sourceDir, '.agents', ...sourceRelative.split('/'));
    const destinationPath = path.resolve(targetAgentsDir, sourceRelative);

    const sourceStat = lstatOrNull(sourcePath);
    if (!sourceStat || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`Required regular bundle file is missing: ${sourceRelative}`);
    }

    const sourceBytes = fs.readFileSync(sourcePath);
    const inspected = inspectDestination(targetAgentsDir, sourceRelative, sourceBytes);

    actions.push({
      sourceRelative,
      relativePath: sourceRelative,
      relPath: sourceRelative,
      sourcePath,
      srcPath: sourcePath,
      destinationPath,
      destPath: destinationPath,
      sourceBytes,
      ...inspected
    });
  }

  const additions = actions.filter(action => action.status === 'add');
  const replacements = actions.filter(action => action.status === 'replace');
  const unchanged = actions.filter(action => action.status === 'unchanged');
  const blockers = actions.filter(action => action.status === 'blocked');

  return {
    target: resolved.target,
    targetDir: normalizedTarget,
    installationRoot: targetAgentsDir,
    targetAgentsDir,
    actions,
    additions,
    replacements,
    unchanged,
    blockers,
    hasCollisions: replacements.length > 0,
    isBlocked: blockers.length > 0
  };
}
