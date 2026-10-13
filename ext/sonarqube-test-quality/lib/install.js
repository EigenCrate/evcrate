import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SKILL_NAME = 'sonarqube-test-quality';
export const MIN_NODE_VERSION = '22.19.0';

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

export const ASSET_INVENTORY = [
  { source: 'SKILL.md', destination: 'skills/sonarqube-test-quality/SKILL.md' },
  { source: 'references/sonar-cli-commands.md', destination: 'skills/sonarqube-test-quality/references/sonar-cli-commands.md' },
  { source: 'references/full-scan-workflow.md', destination: 'skills/sonarqube-test-quality/references/full-scan-workflow.md' },
  { source: 'references/testing-and-coverage.md', destination: 'skills/sonarqube-test-quality/references/testing-and-coverage.md' },
  { source: 'references/remediation-and-handoff.md', destination: 'skills/sonarqube-test-quality/references/remediation-and-handoff.md' },
  { source: 'references/report-formats.md', destination: 'skills/sonarqube-test-quality/references/report-formats.md' },
  { source: 'references/worktree-remediation.md', destination: 'skills/sonarqube-test-quality/references/worktree-remediation.md' },
  { source: 'scripts/convert-sonar-report.mjs', destination: 'skills/sonarqube-test-quality/scripts/convert-sonar-report.mjs' },
  { source: 'scripts/fetch-sonar-issues.mjs', destination: 'skills/sonarqube-test-quality/scripts/fetch-sonar-issues.mjs' },
  { source: 'scripts/calculate-jacoco-coverage.mjs', destination: 'skills/sonarqube-test-quality/scripts/calculate-jacoco-coverage.mjs' },
  { source: 'scripts/vendor/sax.cjs', destination: 'skills/sonarqube-test-quality/scripts/vendor/sax.cjs' },
  { source: 'scripts/vendor/sax.LICENSE', destination: 'skills/sonarqube-test-quality/scripts/vendor/sax.LICENSE' },
  { source: 'scripts/vendor/sax-provenance.json', destination: 'skills/sonarqube-test-quality/scripts/vendor/sax-provenance.json' },
  { source: 'references/remediation-cycles.md', destination: 'skills/sonarqube-test-quality/references/remediation-cycles.md' },
  { source: 'references/project-discovery.md', destination: 'skills/sonarqube-test-quality/references/project-discovery.md' },
  { source: 'references/local-analysis.md', destination: 'skills/sonarqube-test-quality/references/local-analysis.md' },
  { source: 'references/run-guidance.md', destination: 'skills/sonarqube-test-quality/references/run-guidance.md' },
  { source: 'agents/sonar-evidence.md', destination: 'skills/sonarqube-test-quality/agents/sonar-evidence.md' },
  { source: 'templates/remediation-cycle-report.md', destination: 'skills/sonarqube-test-quality/templates/remediation-cycle-report.md' },
  { source: 'templates/run-guidance-report.md', destination: 'skills/sonarqube-test-quality/templates/run-guidance-report.md' },
  { source: 'commands/cmd-sonar-remediate/SKILL.md', destination: 'skills/cmd-sonar-remediate/SKILL.md' }
];

export const RETIRED_ASSETS = [
  {
    destination: 'skills/sonarqube-test-quality/scripts/fetch-sonar-issues.ps1',
    knownVariants: [
      {
        version: '1.0.0',
        release: 'v3.0.0',
        commit: 'e2e2c2849eb667fcbb19eee66d5c67f8f42c8ef7',
        introducedInCommit: '1948a08092285108605342fc7dcfb2f763ebf90f',
        length: 1466,
        sha256: 'b63eada507cf70b79f5a29110e1204a9273edc30d9200c8ae9ed9604c734f087',
        reproductionCommand: 'git show v3.0.0:ext/sonarqube-test-quality/scripts/fetch-sonar-issues.ps1'
      }
    ]
  },
  {
    destination: 'skills/sonarqube-test-quality/scripts/calculate-jacoco-coverage.ps1',
    knownVariants: [
      {
        version: '1.0.0',
        release: 'v3.0.0',
        commit: 'e2e2c2849eb667fcbb19eee66d5c67f8f42c8ef7',
        introducedInCommit: '1948a08092285108605342fc7dcfb2f763ebf90f',
        length: 2606,
        sha256: '1196999e702d55e3cdaf2e45b1e9193833151ce174f81403b5f64a8e29c1b2a9',
        reproductionCommand: 'git show v3.0.0:ext/sonarqube-test-quality/scripts/calculate-jacoco-coverage.ps1'
      }
    ]
  }
];

function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
function writeAllSync(fd, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = fs.writeSync(fd, buffer, offset, buffer.length - offset);
    if (written === 0) {
      throw new Error(`Write failed: zero bytes written at offset ${offset} of ${buffer.length}`);
    }
    offset += written;
  }
}


function lstatOrNull(filePath) {
  return fs.lstatSync(filePath, { throwIfNoEntry: false }) || null;
}

function validateAncestors(checkPath) {
  let current = path.resolve(checkPath);
  const root = path.parse(current).root;
  while (current && current !== root) {
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    const stat = lstatOrNull(parent);
    if (stat) {
      if (stat.isSymbolicLink()) return 'Ancestor contains a symbolic link';
      if (!stat.isDirectory()) return 'Ancestor is not a directory';
    }
    current = parent;
  }
  return null;
}

function mkdirTrackedSync(dirPath, createdDirs) {
  const resolved = path.resolve(dirPath);
  const root = path.parse(resolved).root;
  const parts = path.relative(root, resolved).split(path.sep);
  let current = root;
  for (const part of parts) {
    if (!part) continue;
    current = path.join(current, part);
    const stat = lstatOrNull(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Cannot create directory through non-directory or symbolic link: ${current}`);
      }
    } else {
      fs.mkdirSync(current);
      if (createdDirs) createdDirs.add(current);
    }
  }
}

function pruneCreatedDirectories(createdDirs, stopRoot, includeStopRoot = false) {
  if (!createdDirs || createdDirs.size === 0) return;
  const sorted = Array.from(createdDirs).sort((a, b) => b.length - a.length);
  for (const dir of sorted) {
    try {
      const canPrune = includeStopRoot ? isWithin(stopRoot, dir) : (isWithin(stopRoot, dir) && dir !== stopRoot);
      if (canPrune && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        createdDirs.delete(dir);
      }
    } catch {}
  }
}

function acquireLock(lockPath, createdDirs) {
  mkdirTrackedSync(path.dirname(lockPath), createdDirs);
  let fd;
  try {
    fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Installation locked by another process: ${lockPath}`);
    }
    throw error;
  }

  try {
    const payload = JSON.stringify({ pid: process.pid, time: Date.now() });
    fs.writeSync(fd, payload);
  } finally {
    try {
      fs.closeSync(fd);
    } catch {}
  }

  let stat;
  try {
    stat = fs.statSync(lockPath);
  } catch {
    return { lockPath, ino: null, dev: null };
  }
  return { lockPath, ino: stat.ino, dev: stat.dev };
}

function releaseLock(lockHandle) {
  if (!lockHandle || !lockHandle.lockPath) return;
  try {
    const stat = fs.statSync(lockHandle.lockPath);
    if (lockHandle.ino == null || (stat.ino === lockHandle.ino && stat.dev === lockHandle.dev)) {
      fs.unlinkSync(lockHandle.lockPath);
    }
  } catch {}
}

function inspectDestination(installationRoot, relativePath, sourceBytes, projectRoot) {
  const destination = path.resolve(installationRoot, relativePath);
  if (!isWithin(installationRoot, destination)) {
    return { status: 'blocked', reason: 'Destination escapes installation root' };
  }
  if (projectRoot && !isWithin(projectRoot, destination)) {
    return { status: 'blocked', reason: 'Destination escapes project root' };
  }

  const rootStat = lstatOrNull(installationRoot);
  if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
    return { status: 'blocked', reason: 'Installation root is not a regular directory' };
  }

  const ancestorIssue = validateAncestors(destination);
  if (ancestorIssue) {
    return { status: 'blocked', reason: ancestorIssue };
  }

  const parts = path.relative(installationRoot, destination).split(path.sep);
  let current = installationRoot;
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
        ? { status: 'unchanged', existingBytes, stat: { dev: stat.dev, ino: stat.ino, mode: stat.mode } }
        : { status: 'replace', existingBytes, stat: { dev: stat.dev, ino: stat.ino, mode: stat.mode } };
    }
  }

  return { status: 'add', existingBytes: null, stat: null };
}

function inspectRetirementCandidate(installationRoot, relativePath, candidateConfig, projectRoot) {
  const destination = path.resolve(installationRoot, relativePath);
  if (!isWithin(installationRoot, destination)) {
    return { status: 'blocked', reason: 'Retirement path escapes installation root' };
  }
  if (projectRoot && !isWithin(projectRoot, destination)) {
    return { status: 'blocked', reason: 'Retirement path escapes project root' };
  }

  const rootStat = lstatOrNull(installationRoot);
  if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
    return { status: 'blocked', reason: 'Installation root is not a regular directory' };
  }

  const ancestorIssue = validateAncestors(destination);
  if (ancestorIssue) {
    return { status: 'blocked', reason: ancestorIssue };
  }

  const parts = path.relative(installationRoot, destination).split(path.sep);
  let current = installationRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = lstatOrNull(current);
    if (!stat) {
      return { status: 'missing', existingBytes: null, stat: null };
    }
    if (stat.isSymbolicLink()) {
      return { status: 'blocked', reason: 'Retirement destination path contains a symbolic link' };
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      return { status: 'blocked', reason: 'A retirement destination parent is not a directory' };
    }
    if (index === parts.length - 1) {
      if (!stat.isFile()) {
        return { status: 'blocked', reason: 'Retirement destination is not a regular file' };
      }
      const matchedLength = candidateConfig.knownVariants.some(v => v.length === stat.size);
      if (!matchedLength) {
        return {
          status: 'blocked',
          reason: `Customized or unrecognized obsolete helper file: ${relativePath}`,
          existingBytes: null,
          stat: { dev: stat.dev, ino: stat.ino, mode: stat.mode }
        };
      }
      const existingBytes = fs.readFileSync(current);
      const hash = crypto.createHash('sha256').update(existingBytes).digest('hex');
      const matchedVariant = candidateConfig.knownVariants.find(
        v => v.length === existingBytes.length && v.sha256 === hash
      );
      if (matchedVariant) {
        return {
          status: 'remove',
          existingBytes,
          matchedVariant,
          stat: { dev: stat.dev, ino: stat.ino, mode: stat.mode }
        };
      }
      return {
        status: 'blocked',
        reason: `Customized or unrecognized obsolete helper file: ${relativePath}`,
        existingBytes,
        stat: { dev: stat.dev, ino: stat.ino, mode: stat.mode }
      };
    }
  }

  return { status: 'missing', existingBytes: null, stat: null };
}

export function resolveInstallTarget({ target, directory } = {}) {
  if (target !== 'agents' && target !== 'claude' && target !== 'both') {
    throw new Error(`Unsupported target or missing target '${target}'. Choose agents, claude, or both.`);
  }
  if (typeof directory !== 'string' || directory.trim().length === 0) {
    throw new Error(`The ${target} target requires --directory <project-root>.`);
  }

  const projectRoot = path.resolve(directory);
  const projectStat = lstatOrNull(projectRoot);
  if (projectStat && (!projectStat.isDirectory() || projectStat.isSymbolicLink())) {
    throw new Error('The project root must be a non-symbolic-link directory.');
  }

  const ancestorIssue = validateAncestors(projectRoot);
  if (ancestorIssue) {
    throw new Error(`The project root must be a non-symbolic-link directory: ${ancestorIssue}`);
  }

  if (target === 'agents') {
    return { target, installationRoot: path.join(projectRoot, '.agents'), projectRoot };
  }
  if (target === 'claude') {
    return { target, installationRoot: path.join(projectRoot, '.claude'), projectRoot };
  }
  return { target, installationRoot: projectRoot, projectRoot };
}

export function planInstallation({ sourceDir, target, directory } = {}) {
  const resolved = resolveInstallTarget({ target, directory });

  const sourceStat = lstatOrNull(sourceDir);
  if (!sourceStat || !sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error('Bundle sourceDir must be a non-symbolic-link directory.');
  }

  const sourceAncestorIssue = validateAncestors(sourceDir);
  if (sourceAncestorIssue) {
    throw new Error(`Bundle sourceDir contains invalid ancestor: ${sourceAncestorIssue}`);
  }

  const rootMap = {
    agents: [{ prefix: '', rootDir: resolved.installationRoot }],
    claude: [{ prefix: '', rootDir: resolved.installationRoot }],
    both: [
      { prefix: '.agents', rootDir: path.join(resolved.installationRoot, '.agents') },
      { prefix: '.claude', rootDir: path.join(resolved.installationRoot, '.claude') }
    ]
  };
  const rootConfigs = rootMap[resolved.target];

  const actions = [];
  for (const rootConfig of rootConfigs) {
    for (const asset of ASSET_INVENTORY) {
      const sourcePath = path.join(sourceDir, ...asset.source.split('/'));

      const srcParts = path.relative(sourceDir, sourcePath).split(path.sep);
      let curSrc = sourceDir;
      for (let i = 0; i < srcParts.length; i++) {
        curSrc = path.join(curSrc, srcParts[i]);
        const sStat = lstatOrNull(curSrc);
        if (!sStat) throw new Error(`Required regular bundle file is missing: ${asset.source}`);
        if (sStat.isSymbolicLink()) throw new Error(`Source path contains a symbolic link: ${asset.source}`);
        if (i < srcParts.length - 1 && !sStat.isDirectory()) throw new Error(`Source path ancestor is not a directory: ${asset.source}`);
        if (i === srcParts.length - 1 && !sStat.isFile()) throw new Error(`Source asset is not a regular file: ${asset.source}`);
      }

      const sourceBytes = fs.readFileSync(sourcePath);
      const relativePath = rootConfig.prefix
        ? path.posix.join(rootConfig.prefix, asset.destination)
        : asset.destination;
      const destinationPath = path.resolve(resolved.installationRoot, relativePath);

      const inspected = inspectDestination(
        resolved.installationRoot,
        relativePath,
        sourceBytes,
        resolved.projectRoot
      );

      actions.push({
        sourceRelative: asset.source,
        relativePath,
        sourcePath,
        destinationPath,
        sourceBytes,
        ...inspected
      });
    }
  }

  const retirementActions = [];
  for (const rootConfig of rootConfigs) {
    for (const candidate of RETIRED_ASSETS) {
      const relativePath = rootConfig.prefix
        ? path.posix.join(rootConfig.prefix, candidate.destination)
        : candidate.destination;
      const destinationPath = path.resolve(resolved.installationRoot, relativePath);

      const inspected = inspectRetirementCandidate(
        resolved.installationRoot,
        relativePath,
        candidate,
        resolved.projectRoot
      );

      retirementActions.push({
        candidateConfig: candidate,
        relativePath,
        destinationPath,
        ...inspected
      });
    }
  }

  const additions = actions.filter(action => action.status === 'add');
  const replacements = actions.filter(action => action.status === 'replace');
  const unchanged = actions.filter(action => action.status === 'unchanged');
  const activeBlockers = actions.filter(action => action.status === 'blocked');

  const removals = retirementActions.filter(action => action.status === 'remove');
  const missing = retirementActions.filter(action => action.status === 'missing');
  const retirementBlockers = retirementActions.filter(action => action.status === 'blocked');

  const blockers = [...activeBlockers, ...retirementBlockers];

  return {
    ...resolved,
    actions,
    additions,
    replacements,
    unchanged,
    retirementActions,
    removals,
    missing,
    blockers
  };
}

export function executeInstallation(plan, {
  dryRun = false,
  force = false,
  yes = false,
  _beforePublish = null,
  _afterStage = null,
  _beforeUnlink = null,
  _afterUnlink = null,
  _beforeVerify = null,
  _beforeRestoreChmod = null,
  _beforeRestoreWrite = null
} = {}) {
  if (dryRun) {
    return {
      dryRun: true,
      additions: plan.additions.map(item => item.relativePath),
      replacements: plan.replacements.map(item => item.relativePath),
      unchanged: plan.unchanged.map(item => item.relativePath),
      removals: plan.removals.map(item => item.relativePath),
      missing: plan.missing.map(item => item.relativePath),
      blockers: plan.blockers.map(item => ({ relativePath: item.relativePath, reason: item.reason }))
    };
  }

  if (plan.blockers.length) {
    throw new Error(`Installation blocked: ${plan.blockers.map(item => `${item.relativePath}: ${item.reason}`).join('; ')}`);
  }
  if (yes && !force) throw new Error('Option --yes cannot be used without --force.');
  if (plan.replacements.length && !force) throw new Error('Destination files differ. Re-run with --force to authorize replacement.');
  if (plan.replacements.length && force && !yes) throw new Error('Replacing files also requires confirmation with --yes.');

  const projectRoot = plan.projectRoot;
  const sharedLockPath = path.join(projectRoot, '.sonarqube-test-quality.install.lock');
  const legacyLockPath = (plan.target === 'agents' || plan.target === 'both')
    ? path.join(projectRoot, '.agents', 'skills', SKILL_NAME, '.install.lock')
    : null;

  const locksToAcquire = [sharedLockPath];
  if (legacyLockPath) {
    locksToAcquire.push(legacyLockPath);
  }

  const acquiredLocks = [];
  const createdDirs = new Set();

  try {
    for (const lockPath of locksToAcquire) {
      const handle = acquireLock(lockPath, createdDirs);
      acquiredLocks.push(handle);
    }
  } catch (lockError) {
    while (acquiredLocks.length > 0) {
      const handle = acquiredLocks.pop();
      releaseLock(handle);
    }
    pruneCreatedDirectories(createdDirs, projectRoot, true);
    throw lockError;
  }

  const temporaryPaths = [];
  const staged = [];
  const committed = [];
  const createdFiles = new Map();
  const backups = new Map();
  const completedRemovals = [];

  try {
    // 1. Locked revalidation of active assets
    for (const action of plan.actions) {
      const current = inspectDestination(plan.installationRoot, action.relativePath, action.sourceBytes, projectRoot);
      if (current.status !== action.status) {
        throw new Error(`Destination changed after planning: ${action.relativePath}`);
      }
      if (action.status === 'replace' && !current.existingBytes.equals(action.existingBytes)) {
        throw new Error(`Destination changed after planning: ${action.relativePath}`);
      }
      if (action.status === 'unchanged' && !current.existingBytes.equals(action.sourceBytes)) {
        throw new Error(`Destination changed after planning: ${action.relativePath}`);
      }
    }

    // 2. Locked revalidation of retirement assets
    for (const rAction of plan.retirementActions) {
      const current = inspectRetirementCandidate(plan.installationRoot, rAction.relativePath, rAction.candidateConfig, projectRoot);
      if (current.status !== rAction.status) {
        throw new Error(`Retirement candidate changed after planning: ${rAction.relativePath}`);
      }
      if (rAction.status === 'remove' && !current.existingBytes.equals(rAction.existingBytes)) {
        throw new Error(`Retirement candidate changed after planning: ${rAction.relativePath}`);
      }
    }

    // 3. Staging active additions and replacements
    const stagedActions = [...plan.additions, ...plan.replacements];
    for (let sIdx = 0; sIdx < stagedActions.length; sIdx += 1) {
      const action = stagedActions[sIdx];
      mkdirTrackedSync(path.dirname(action.destinationPath), createdDirs);
      const temporaryPath = path.join(path.dirname(action.destinationPath), `.tmp-${crypto.randomUUID()}`);
      temporaryPaths.push(temporaryPath);
      const srcStat = lstatOrNull(action.sourcePath);
      const mode = srcStat ? srcStat.mode : 0o644;
      fs.writeFileSync(temporaryPath, action.sourceBytes, { flag: 'wx', mode });
      staged.push({ action, temporaryPath, mode });
      if (typeof _afterStage === 'function') {
        _afterStage(action, sIdx, temporaryPath);
      }
    }

    // 4. Execute retirement unlinks before active publication
    for (let rIdx = 0; rIdx < plan.removals.length; rIdx += 1) {
      const rAction = plan.removals[rIdx];
      if (typeof _beforeUnlink === 'function') {
        _beforeUnlink(rAction, rIdx);
      }

      const ancestorErr = validateAncestors(rAction.destinationPath);
      if (ancestorErr) {
        throw new Error(`Retirement destination ancestor invalid immediately before removal: ${rAction.relativePath}: ${ancestorErr}`);
      }
      const curStat = lstatOrNull(rAction.destinationPath);
      if (!curStat || !curStat.isFile() || curStat.isSymbolicLink()) {
        throw new Error(`Retirement destination modified immediately before removal: ${rAction.relativePath}`);
      }
      if (rAction.stat && (curStat.dev !== rAction.stat.dev || curStat.ino !== rAction.stat.ino)) {
        throw new Error(`Retirement destination identity changed immediately before removal: ${rAction.relativePath}`);
      }
      const curBytes = fs.readFileSync(rAction.destinationPath);
      if (!curBytes.equals(rAction.existingBytes)) {
        throw new Error(`Retirement destination content changed immediately before removal: ${rAction.relativePath}`);
      }

      const removalRecord = {
        destinationPath: rAction.destinationPath,
        relativePath: rAction.relativePath,
        existingBytes: rAction.existingBytes,
        existingMode: curStat.mode,
        unlinked: false
      };

      fs.unlinkSync(rAction.destinationPath);
      removalRecord.unlinked = true;
      completedRemovals.push(removalRecord);

      if (typeof _afterUnlink === 'function') {
        _afterUnlink(rAction, rIdx);
      }
    }

    // 5. Publish active additions and replacements
    for (let index = 0; index < staged.length; index += 1) {
      const { action, temporaryPath, mode } = staged[index];

      if (typeof _beforePublish === 'function') {
        _beforePublish(action, index);
      }

      const ancestorErr = validateAncestors(action.destinationPath);
      if (ancestorErr) {
        throw new Error(`Destination ancestor invalid before publication: ${action.relativePath}: ${ancestorErr}`);
      }

      if (action.status === 'add') {
        const preStat = lstatOrNull(action.destinationPath);
        if (preStat !== null) {
          throw new Error(`Destination changed during installation: ${action.relativePath} already exists`);
        }
        try {
          fs.copyFileSync(temporaryPath, action.destinationPath, fs.constants.COPYFILE_EXCL);
        } catch (error) {
          if (error.code === 'EEXIST') {
            throw new Error(`Destination changed during installation: ${action.relativePath} already exists`);
          }
          throw error;
        }
        const createdStat = fs.statSync(action.destinationPath);
        createdFiles.set(action.destinationPath, {
          sourceBytes: action.sourceBytes,
          action,
          stat: { dev: createdStat.dev, ino: createdStat.ino }
        });
        fs.chmodSync(action.destinationPath, mode);
        fs.rmSync(temporaryPath, { force: true });
        committed.push(action.relativePath);
      } else if (action.status === 'replace') {
        const current = inspectDestination(plan.installationRoot, action.relativePath, action.sourceBytes, projectRoot);
        if (current.status !== 'replace' || !current.existingBytes.equals(action.existingBytes)) {
          throw new Error(`Destination changed during installation: ${action.relativePath}`);
        }
        const existingStat = lstatOrNull(action.destinationPath);
        if (action.stat && (existingStat.dev !== action.stat.dev || existingStat.ino !== action.stat.ino)) {
          throw new Error(`Destination identity changed during installation: ${action.relativePath}`);
        }
        fs.renameSync(temporaryPath, action.destinationPath);
        backups.set(action.destinationPath, {
          existingBytes: current.existingBytes,
          existingMode: existingStat ? existingStat.mode : 0o644,
          action,
          existingStat: { dev: existingStat.dev, ino: existingStat.ino }
        });
        fs.chmodSync(action.destinationPath, mode);
        committed.push(action.relativePath);
      }
    }

    if (typeof _beforeVerify === 'function') {
      _beforeVerify();
    }

    // 6. Verification: active files must match bundle bytes; retired paths must be absent
    for (const action of plan.actions) {
      const ancestorErr = validateAncestors(action.destinationPath);
      if (ancestorErr) throw new Error(`Installed file ancestor invalid: ${action.relativePath}: ${ancestorErr}`);
      const stat = lstatOrNull(action.destinationPath);
      if (!stat || !stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(action.destinationPath).equals(action.sourceBytes)) {
        throw new Error(`Installed file verification failed: ${action.relativePath}`);
      }
    }

    for (const rAction of plan.retirementActions) {
      const ancestorErr = validateAncestors(rAction.destinationPath);
      if (ancestorErr) throw new Error(`Retired path ancestor invalid: ${rAction.relativePath}: ${ancestorErr}`);
      const stat = lstatOrNull(rAction.destinationPath);
      if (stat !== null) {
        throw new Error(`Retired file verification failed: ${rAction.relativePath} is still present`);
      }
    }

    return {
      dryRun: false,
      committed,
      unchanged: plan.unchanged.map(item => item.relativePath),
      removals: completedRemovals.map(item => item.relativePath),
      missing: plan.missing.map(item => item.relativePath)
    };
  } catch (error) {
    for (const temporaryPath of temporaryPaths) {
      try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    }

    const rollbackFailures = [];

    // Rollback created files (active additions)
    for (const [createdPath, { sourceBytes, action, stat: origStat }] of createdFiles) {
      try {
        const ancestorErr = validateAncestors(createdPath);
        if (ancestorErr) {
          rollbackFailures.push(`${action.relativePath}: ancestor invalid during rollback, refusing to remove`);
          continue;
        }
        const stat = lstatOrNull(createdPath);
        if (stat) {
          if (stat.isFile() && !stat.isSymbolicLink() && stat.dev === origStat.dev && stat.ino === origStat.ino && fs.readFileSync(createdPath).equals(sourceBytes)) {
            fs.rmSync(createdPath, { force: true });
          } else {
            rollbackFailures.push(`${action.relativePath}: concurrent modification, identity change, or symlink detected, preserving file`);
          }
        }
      } catch (rmErr) {
        rollbackFailures.push(`${action.relativePath}: ${rmErr.message}`);
      }
    }

    // Rollback backups (active replacements)
    for (const [destinationPath, { existingBytes, existingMode, action }] of backups) {
      try {
        const ancestorErr = validateAncestors(destinationPath);
        if (ancestorErr) {
          rollbackFailures.push(`${action.relativePath}: ancestor invalid during replacement rollback, refusing to restore`);
          continue;
        }
        const stat = lstatOrNull(destinationPath);
        if (!stat) {
          rollbackFailures.push(`${action.relativePath}: destination missing during rollback, unable to safely restore`);
        } else if (stat.isSymbolicLink() || !stat.isFile()) {
          rollbackFailures.push(`${action.relativePath}: destination replaced with symbolic link or non-regular file, refusing to overwrite`);
        } else if (!fs.readFileSync(destinationPath).equals(action.sourceBytes)) {
          rollbackFailures.push(`${action.relativePath}: concurrent modification detected, unable to safely restore`);
        } else {
          const tmpRestore = path.join(path.dirname(destinationPath), `.tmp-restore-${crypto.randomUUID()}`);
          try {
            const fd = fs.openSync(tmpRestore, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, existingMode);
            try {
              writeAllSync(fd, existingBytes);
              fs.fchmodSync(fd, existingMode);
            } finally {
              try { fs.closeSync(fd); } catch {}
            }
            fs.renameSync(tmpRestore, destinationPath);
          } finally {
            try { fs.rmSync(tmpRestore, { force: true }); } catch {}
          }
        }
      } catch (restoreErr) {
        rollbackFailures.push(`${action.relativePath}: ${restoreErr.message}`);
      }
    }

    // Rollback completed removals (retirement)
    for (const removalRecord of completedRemovals) {
      if (!removalRecord.unlinked) continue;
      try {
        const ancestorErr = validateAncestors(removalRecord.destinationPath);
        if (ancestorErr) {
          rollbackFailures.push(`${removalRecord.relativePath}: ancestor invalid during removal rollback, refusing to restore`);
          continue;
        }
        const destStat = lstatOrNull(removalRecord.destinationPath);
        if (destStat !== null) {
          rollbackFailures.push(`${removalRecord.relativePath}: destination recreated during installation, preserving file`);
          continue;
        }

        let fd = null;
        try {
          try {
            fd = fs.openSync(
              removalRecord.destinationPath,
              fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
              removalRecord.existingMode
            );
          } catch (openErr) {
            if (openErr.code === 'EEXIST') {
              rollbackFailures.push(`${removalRecord.relativePath}: destination recreated during installation, preserving file`);
              continue;
            }
            throw openErr;
          }
          if (typeof _beforeRestoreWrite === 'function') {
            _beforeRestoreWrite(removalRecord, fd);
          }

          writeAllSync(fd, removalRecord.existingBytes);
          try {
            if (typeof _beforeRestoreChmod === 'function') {
              _beforeRestoreChmod(removalRecord, fd);
            }
            fs.fchmodSync(fd, removalRecord.existingMode);
          } catch (chmodErr) {
            rollbackFailures.push(`${removalRecord.relativePath}: failed to restore mode: ${chmodErr.message}`);
          }
        } catch (restoreErr) {
          rollbackFailures.push(`${removalRecord.relativePath}: restoration failed; any existing destination left untouched: ${restoreErr.message}`);
        } finally {
          if (fd !== null) {
            try { fs.closeSync(fd); } catch {}
          }
        }
      } catch (restoreErr) {
        rollbackFailures.push(`${removalRecord.relativePath}: ${restoreErr.message}`);
      }
    }
    pruneCreatedDirectories(createdDirs, projectRoot, true);

    if (rollbackFailures.length > 0) {
      throw new Error(`Installation failed after ${committed.length} file(s) and ${completedRemovals.length} removal(s): ${error.message}; rollback partial failure: ${rollbackFailures.join('; ')}`);
    }
    throw new Error(`Installation failed after ${committed.length} file(s) and ${completedRemovals.length} removal(s): ${error.message}`);
  } finally {
    while (acquiredLocks.length > 0) {
      const handle = acquiredLocks.pop();
      releaseLock(handle);
    }
    pruneCreatedDirectories(createdDirs, projectRoot, true);
  }
}
