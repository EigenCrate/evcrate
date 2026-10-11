import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export function lstatOrNull(filePath) {
  return fs.lstatSync(filePath, { throwIfNoEntry: false }) || null;
}

export function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function inspectDestination(root, relativePath, sourceBytes) {
  const destination = path.resolve(root, relativePath);
  if (!isWithin(root, destination)) {
    return { status: 'blocked', reason: 'Destination escapes installation root' };
  }

  const rootStat = lstatOrNull(root);
  if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
    return { status: 'blocked', reason: 'Installation root is not a regular directory' };
  }

  const parts = path.relative(root, destination).split(path.sep);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = lstatOrNull(current);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      return { status: 'blocked', reason: 'Destination path contains a symbolic link' };
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      return { status: 'blocked', reason: 'A destination parent is not a directory' };
    }
    if (index === parts.length - 1) {
      if (!stat.isFile()) return { status: 'blocked', reason: 'Destination is not a regular file' };
      const existingBytes = fs.readFileSync(current);
      return existingBytes.equals(sourceBytes)
        ? { status: 'unchanged', existingBytes }
        : { status: 'replace', existingBytes };
    }
  }

  return { status: 'add', existingBytes: null };
}

/**
 * Resolve and validate install target and project directory, matching the SonarQube contract.
 */
export function resolveInstallTarget({ target, directory } = {}) {
  if (target !== 'agents') {
    throw new Error(`Unsupported target or missing target '${target}'. Choose agents.`);
  }
  if (typeof directory !== 'string' || directory.trim().length === 0) {
    throw new Error('The agents target requires --directory <project-root>.');
  }

  const projectRoot = path.resolve(directory);
  const projectStat = lstatOrNull(projectRoot);
  if (projectStat && (!projectStat.isDirectory() || projectStat.isSymbolicLink())) {
    throw new Error('The project root must be a non-symbolic-link directory.');
  }

  return {
    target,
    installationRoot: path.join(projectRoot, '.agents'),
    targetDir: projectRoot
  };
}

/**
 * Resolve and validate the target project directory.
 * Accepts either { target, directory } or legacy targetOption.
 */
export function resolveTarget(targetOption, cwd = process.cwd(), home = os.homedir()) {
  if (typeof targetOption === 'object' && targetOption !== null) {
    return resolveInstallTarget(targetOption);
  }
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
    target: 'agents',
    targetDir: resolvedTarget,
    installationRoot: path.join(resolvedTarget, '.agents'),
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
