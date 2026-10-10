import { containedPath } from '../filesystem/paths.js';

// Claude's authored graph and native-rules projection differ. Never promote
// generated output over the canonical .claude tree; metadata keeps logical roots.
export function localProjectionPath(sourceRoot: string, logicalRoot: string, mustExist = false): string {
  return containedPath(sourceRoot, logicalRoot === '.claude' ? '.claude-projection' : logicalRoot, mustExist);
}
