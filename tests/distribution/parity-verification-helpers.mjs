import { cpSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const packageRoot = join(__dirname, '..', '..');

export function makeTempDir(prefix = 'evcrate-phase05-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Recursively collects all files under a directory as relative POSIX paths.
 */
export function collectRelativeFiles(rootDir, currentDir = rootDir) {
  const results = [];
  if (!existsSync(currentDir)) return results;
  const entries = readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRelativeFiles(rootDir, fullPath));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      results.push(relative(rootDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return results.sort();
}

/**
 * Populates a temporary fixture workspace with package assets for build testing.
 */
export function prepareFixtureWorkspace(targetDir) {
  for (const item of ['.evcrate', 'dist', 'package.json']) {
    cpSync(join(packageRoot, item), join(targetDir, item), { recursive: true });
  }
}
