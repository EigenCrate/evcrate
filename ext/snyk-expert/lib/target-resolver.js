import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/**
 * Resolve and validate the target project directory.
 * Guard against accidentally installing into user HOME by default.
 */
export function resolveTarget(targetOption, cwd = process.cwd(), home = os.homedir()) {
  const isExplicit = typeof targetOption === 'string' && targetOption.trim().length > 0;
  const rawTarget = isExplicit ? targetOption.trim() : cwd;
  const resolvedTarget = path.resolve(rawTarget);
  const resolvedHome = path.resolve(home);

  const isWindows = process.platform === 'win32';
  const isHomeMatch = isWindows
    ? resolvedTarget.toLowerCase() === resolvedHome.toLowerCase()
    : resolvedTarget === resolvedHome;

  if (!isExplicit && isHomeMatch) {
    const error = new Error(
      `Refusing to install into user home directory (${resolvedHome}) by default.\n` +
      `Snyk specialist bundles must be installed into a project repository.\n` +
      `To specify a project, pass --target <path>.`
    );
    error.code = 'ERR_HOME_TARGET_DISALLOWED';
    throw error;
  }

  return {
    targetDir: resolvedTarget,
    isExplicit
  };
}

/**
 * Check if a path or any intermediate component inside baseDir is a symlink escaping baseDir.
 */
export function isSymlinkOrContainsSymlink(targetPath, baseDir) {
  let current = path.resolve(targetPath);
  const normalizedBase = path.resolve(baseDir);

  let realBase = normalizedBase;
  try {
    if (fs.existsSync(normalizedBase)) {
      realBase = fs.realpathSync(normalizedBase);
    }
  } catch (_) {}

  while (current.length > normalizedBase.length && current !== normalizedBase) {
    const lstat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (lstat && lstat.isSymbolicLink()) {
      try {
        const real = fs.realpathSync(current);
        if (!real.startsWith(realBase + path.sep) && real !== realBase) {
          return true;
        }
      } catch (_) {
        // Dangling symlink cannot be safely resolved or written through
        return true;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}
