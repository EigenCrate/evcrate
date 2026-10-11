export const MIN_NODE_VERSION = '18.0.0';

export function isSupportedNodeVersion(version = process.versions.node) {
  if (typeof version !== 'string') return false;
  const clean = version.replace(/^v/, '').split('-')[0];
  const parts = clean.split('.').map(Number);
  const [minMajor, minMinor, minPatch] = MIN_NODE_VERSION.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  if (major < minMajor) return false;
  if (major > minMajor) return true;
  if (minor < minMinor) return false;
  if (minor > minMinor) return true;
  return patch >= minPatch;
}

export {
  resolveTarget,
  resolveInstallTarget,
  isSymlinkOrContainsSymlink,
  isWithin,
  inspectDestination,
  lstatOrNull
} from './target-resolver.js';

export {
  ASSET_INVENTORY,
  getSourceInventory
} from './inventory.js';

export {
  planInstallation
} from './install-planner.js';

export {
  executeInstallation
} from './install-executor.js';
