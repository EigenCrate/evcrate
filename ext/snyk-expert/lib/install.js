export {
  resolveTarget,
  isSymlinkOrContainsSymlink
} from './target-resolver.js';

export {
  ASSET_INVENTORY,
  getSourceInventory
} from './inventory.js';

export {
  planInstallation,
  detectLegacyInstallation,
  LEGACY_CLAUDE_CANDIDATES
} from './install-planner.js';
export {
  executeInstallation
} from './install-executor.js';
