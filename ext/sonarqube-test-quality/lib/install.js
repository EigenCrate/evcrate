import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SKILL_NAME = 'sonarqube-test-quality';
export const MIN_NODE_VERSION = '18.11.0';

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

function acquireLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, time: Date.now() }));
    fs.closeSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Installation locked by another process: ${lockPath}`);
    }
    throw error;
  }
}

function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {}
}

function pruneEmptyDirectories(directory, root) {
  try {
    let current = directory;
    while (current !== root && isWithin(root, current)) {
      if (fs.existsSync(current) && fs.readdirSync(current).length === 0) {
        fs.rmdirSync(current);
        current = path.dirname(current);
      } else {
        break;
      }
    }
  } catch {}
}

const SKILL_FILES = [
  'SKILL.md',
  'references/sonar-cli-commands.md',
  'references/full-scan-workflow.md',
  'references/testing-and-coverage.md',
  'references/remediation-and-handoff.md',
  'references/report-formats.md',
  'references/worktree-remediation.md',
  'scripts/convert-sonar-report.mjs',
  'scripts/fetch-sonar-issues.ps1',
  'scripts/calculate-jacoco-coverage.ps1'
];

function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function lstatOrNull(filePath) {
  return fs.lstatSync(filePath, { throwIfNoEntry: false }) || null;
}

function inspectDestination(root, relativePath, sourceBytes) {
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

  return { target, installationRoot: path.join(projectRoot, '.agents') };
}

export function planInstallation({ sourceDir, target, directory } = {}) {
  const resolved = resolveInstallTarget({ target, directory });
  const files = SKILL_FILES.map(sourceRelative => ({
    sourceRelative,
    relativePath: path.posix.join('skills', SKILL_NAME, sourceRelative),
    sourcePath: path.join(sourceDir, ...sourceRelative.split('/'))
  }));

  const actions = files.map(file => {
    const sourceStat = lstatOrNull(file.sourcePath);
    if (!sourceStat || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`Required regular bundle file is missing: ${file.sourceRelative}`);
    }
    const sourceBytes = fs.readFileSync(file.sourcePath);
    const inspected = inspectDestination(resolved.installationRoot, file.relativePath, sourceBytes);
    return { ...file, ...inspected, sourceBytes, destinationPath: path.resolve(resolved.installationRoot, file.relativePath) };
  });

  return {
    ...resolved,
    actions,
    additions: actions.filter(action => action.status === 'add'),
    replacements: actions.filter(action => action.status === 'replace'),
    unchanged: actions.filter(action => action.status === 'unchanged'),
    blockers: actions.filter(action => action.status === 'blocked')
  };
}

export function executeInstallation(plan, { dryRun = false, force = false, yes = false, _beforePublish = null } = {}) {
  if (plan.blockers.length) throw new Error(`Installation blocked: ${plan.blockers.map(item => `${item.relativePath}: ${item.reason}`).join('; ')}`);
  if (yes && !force) throw new Error('Option --yes cannot be used without --force.');
  if (plan.replacements.length && !force) throw new Error('Destination files differ. Re-run with --force to authorize replacement.');
  if (plan.replacements.length && force && !yes) throw new Error('Replacing files also requires confirmation with --yes.');

  if (dryRun) {
    return {
      dryRun: true,
      additions: plan.additions.map(item => item.relativePath),
      replacements: plan.replacements.map(item => item.relativePath),
      unchanged: plan.unchanged.map(item => item.relativePath)
    };
  }

  const lockPath = path.join(plan.installationRoot, 'skills', SKILL_NAME, '.install.lock');
  acquireLock(lockPath);

  try {
    for (const action of plan.actions) {
      const current = inspectDestination(plan.installationRoot, action.relativePath, action.sourceBytes);
      if (current.status !== action.status || (action.status === 'replace' && !current.existingBytes.equals(action.existingBytes))) {
        throw new Error(`Destination changed after planning: ${action.relativePath}`);
      }
    }

    const committed = [];
    const temporaryPaths = [];
    const createdFiles = new Set();
    const backups = new Map();

    try {
      const staged = [];
      for (const action of [...plan.additions, ...plan.replacements]) {
        fs.mkdirSync(path.dirname(action.destinationPath), { recursive: true });
        const temporaryPath = path.join(path.dirname(action.destinationPath), `.tmp-${crypto.randomUUID()}`);
        temporaryPaths.push(temporaryPath);
        fs.writeFileSync(temporaryPath, action.sourceBytes, { flag: 'wx' });
        staged.push({ action, temporaryPath });
      }

      for (let index = 0; index < staged.length; index += 1) {
        const { action, temporaryPath } = staged[index];

        if (typeof _beforePublish === 'function') {
          _beforePublish(action, index);
        }

        if (action.status === 'add') {
          try {
            fs.copyFileSync(temporaryPath, action.destinationPath, fs.constants.COPYFILE_EXCL);
          } catch (error) {
            if (error.code === 'EEXIST') {
              throw new Error(`Destination changed during installation: ${action.relativePath} already exists`);
            }
            throw error;
          }
          createdFiles.add(action.destinationPath);
          fs.rmSync(temporaryPath, { force: true });
          committed.push(action.relativePath);
        } else if (action.status === 'replace') {
          const current = inspectDestination(plan.installationRoot, action.relativePath, action.sourceBytes);
          if (current.status !== 'replace' || !current.existingBytes.equals(action.existingBytes)) {
            throw new Error(`Destination changed during installation: ${action.relativePath}`);
          }
          backups.set(action.destinationPath, current.existingBytes);
          fs.renameSync(temporaryPath, action.destinationPath);
          committed.push(action.relativePath);
        }
      }

      for (const action of plan.actions) {
        if (!fs.readFileSync(action.destinationPath).equals(action.sourceBytes)) {
          throw new Error(`Installed file verification failed: ${action.relativePath}`);
        }
      }

      return { dryRun: false, committed, unchanged: plan.unchanged.map(item => item.relativePath) };
    } catch (error) {
      for (const temporaryPath of temporaryPaths) fs.rmSync(temporaryPath, { force: true });
      for (const createdPath of createdFiles) fs.rmSync(createdPath, { force: true });
      for (const [destinationPath, existingBytes] of backups) {
        try {
          fs.writeFileSync(destinationPath, existingBytes);
        } catch {}
      }
      for (const createdPath of createdFiles) {
        pruneEmptyDirectories(path.dirname(createdPath), plan.installationRoot);
      }
      for (const temporaryPath of temporaryPaths) {
        pruneEmptyDirectories(path.dirname(temporaryPath), plan.installationRoot);
      }
      throw new Error(`Installation failed after ${committed.length} file(s): ${error.message}`);
    }
  } finally {
    releaseLock(lockPath);
    pruneEmptyDirectories(path.dirname(lockPath), plan.installationRoot);
  }
}