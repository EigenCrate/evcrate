'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const assetVerification = require('./asset-verification.cjs');
const releaseContract = require('./release-contract.cjs');
const { canonicalJsonBytes } = require('./canonical-json.cjs');

/**
 * Loads and strictly validates .releaserc.json without mutating the canonical config.
 * Returns a deep copy of the configuration object.
 *
 * @param {object} [options]
 * @param {string} [options.projectRoot] Root of project, defaults to process.cwd()
 * @param {string} [options.configPath] Path to config, defaults to <projectRoot>/.releaserc.json
 * @returns {object} Deep copy of validated canonical release configuration
 */
function readCanonicalReleaseConfig(options = {}) {
  const projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
  const configPath = options.configPath ? path.resolve(options.configPath) : path.join(projectRoot, '.releaserc.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Canonical release configuration file not found at "${configPath}"`);
  }
  const stat = fs.statSync(configPath);
  if (!stat.isFile()) {
    throw new Error(`Canonical release configuration path is not a regular file: "${configPath}"`);
  }

  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read canonical release config at "${configPath}": ${err.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse canonical release config at "${configPath}": ${err.message}`);
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Canonical release config at "${configPath}" must be a non-null object`);
  }

  if (!config.branches || (!Array.isArray(config.branches) && typeof config.branches !== 'string')) {
    throw new Error(`Canonical release config at "${configPath}" must specify "branches"`);
  }
  if (Array.isArray(config.branches) && config.branches.length === 0) {
    throw new Error(`Canonical release config at "${configPath}" "branches" array cannot be empty`);
  }

  if (!Array.isArray(config.plugins)) {
    throw new Error(`Canonical release config at "${configPath}" must specify a "plugins" array`);
  }

  return JSON.parse(JSON.stringify(config));
}

/**
 * Extracts plugin identifier name from a plugin specification.
 * @param {string|Array|object} plugin
 * @returns {string|null}
 */
function getPluginIdentifier(plugin) {
  if (typeof plugin === 'string') return plugin;
  if (Array.isArray(plugin) && typeof plugin[0] === 'string') return plugin[0];
  if (plugin && typeof plugin === 'object' && plugin.path && typeof plugin.path === 'string') return plugin.path;
  return null;
}

/**
 * Adapts canonical plugin specifications for candidate release execution.
 * Retains analyzer, notes, changelog, npm, exec, git; removes exactly @semantic-release/github.
 * Wraps release-notes-generator invocation/context so generated links use canonical repository URL.
 *
 * @param {Array} canonicalPlugins Array of canonical plugin specifications
 * @param {object} [options]
 * @param {string} [options.canonicalRepositoryUrl] Canonical repository URL (e.g. https://github.com/EigenCrate/evcrate)
 * @returns {Array} Adapted plugin specifications array
 */
function createCandidatePluginSpecs(canonicalPlugins, options = {}) {
  if (!Array.isArray(canonicalPlugins)) {
    throw new Error(`canonicalPlugins must be an array, got ${typeof canonicalPlugins}`);
  }

  const canonicalRepositoryUrl = options.canonicalRepositoryUrl || 'https://github.com/EigenCrate/evcrate';

  const pluginNames = canonicalPlugins.map(getPluginIdentifier);
  const required = [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/exec',
    '@semantic-release/git'
  ];

  for (const req of required) {
    if (!pluginNames.includes(req)) {
      throw new Error(`Canonical plugins missing required plugin "${req}"`);
    }
  }

  const adapted = [];
  for (const item of canonicalPlugins) {
    const name = getPluginIdentifier(item);
    if (name === '@semantic-release/github') {
      // Exactly exclude GitHub plugin from candidate run
      continue;
    }

    if (name === '@semantic-release/release-notes-generator') {
      let pluginConfig = {};
      if (Array.isArray(item)) {
        pluginConfig = JSON.parse(JSON.stringify(item[1] || {}));
      } else if (typeof item === 'object' && item !== null) {
        pluginConfig = JSON.parse(JSON.stringify(item));
        delete pluginConfig.path;
      }

      const realNotesGen = require('@semantic-release/release-notes-generator');
      const wrappedNotesGenerator = async (pConfig, context) => {
        const wrappedContext = {
          ...context,
          options: {
            ...context.options,
            repositoryUrl: canonicalRepositoryUrl
          }
        };
        return realNotesGen.generateNotes(pConfig, wrappedContext);
      };
      wrappedNotesGenerator.pluginName = '@semantic-release/release-notes-generator';

      adapted.push([{ generateNotes: wrappedNotesGenerator }, pluginConfig]);
    } else {
      adapted.push(JSON.parse(JSON.stringify(item)));
    }
  }

  return adapted;
}

/**
 * Creates a unique bare Git repository under runnerTemp, seeds triggering branch ref at sourceCommit,
 * and seeds all local tags. Returns mirror path, file:// URL, and cleanup callback.
 *
 * @param {object} options
 * @param {string} [options.cwd] Git working tree directory
 * @param {string} [options.tempDir] Base directory for temporary bare repo
 * @param {string} options.branch Triggering branch name
 * @param {string} options.sourceCommit Exact lowercase 40-hex commit SHA
 * @returns {{ mirrorPath: string, mirrorUrl: string, cleanup: () => void }}
 */
function createLocalReleaseMirror(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const tempDir = options.tempDir
    ? path.resolve(options.tempDir)
    : (process.env.RUNNER_TEMP ? path.resolve(process.env.RUNNER_TEMP) : os.tmpdir());
  const branch = options.branch !== undefined ? String(options.branch).trim() : 'main';
  const sourceCommit = options.sourceCommit ? String(options.sourceCommit).trim().toLowerCase() : null;

  if (!sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error(`createLocalReleaseMirror requires exact lowercase 40-hex sourceCommit: ${JSON.stringify(sourceCommit)}`);
  }
  if (!branch || !/^[a-zA-Z0-9/_.-]+$/.test(branch)) {
    throw new Error(`createLocalReleaseMirror requires valid branch name: ${JSON.stringify(branch)}`);
  }

  const mirrorParent = fs.mkdtempSync(path.join(tempDir, 'evcrate-release-mirror-'));
  const mirrorPath = path.join(mirrorParent, 'mirror.git');

  try {
    execFileSync('git', ['-c', `init.defaultBranch=${branch}`, 'init', '--bare', mirrorPath], { stdio: 'pipe' });

    const mirrorUrl = pathToFileURL(path.resolve(mirrorPath)).href;

    // Push sourceCommit to refs/heads/<branch>
    execFileSync('git', ['push', mirrorUrl, `${sourceCommit}:refs/heads/${branch}`], {
      cwd,
      stdio: 'pipe'
    });

    // Point bare mirror HEAD to the target branch so git fetch resolves remote HEAD
    execFileSync('git', ['--git-dir', mirrorPath, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`], {
      stdio: 'pipe'
    });

    // Push all local tags
    try {
      execFileSync('git', ['push', '--tags', mirrorUrl], {
        cwd,
        stdio: 'pipe'
      });
    } catch (tagErr) {
      const stderr = tagErr.stderr ? tagErr.stderr.toString() : '';
      if (!stderr.includes('Everything up-to-date') && !stderr.includes('No tags')) {
        throw new Error(`Failed to seed tags to bare mirror: ${stderr || tagErr.message}`);
      }
    }

    const cleanup = () => {
      try {
        fs.rmSync(mirrorParent, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    };

    return {
      mirrorPath,
      mirrorUrl,
      cleanup
    };
  } catch (err) {
    try {
      fs.rmSync(mirrorParent, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

/**
 * Asserts that target path is safely contained within at least one allowed parent.
 * Prevents directory traversal and accidental escapes.
 *
 * @param {string} targetPath Path to inspect
 * @param {string[]} allowedParents Allowed parent roots
 * @returns {string} Resolved target path
 */
function assertSafeDirectoryWithin(targetPath, allowedParents) {
  const resolved = path.resolve(targetPath);
  const isContained = allowedParents.some((parent) => {
    const resolvedParent = path.resolve(parent);
    const rel = path.relative(resolvedParent, resolved);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
  if (!isContained) {
    throw new Error(`Target path "${resolved}" is not safely contained within allowed roots: ${allowedParents.join(', ')}`);
  }
  return resolved;
}

/**
 * Stages the immutable release-candidate tree privately and promotes it atomically.
 * Computes SHA-256 and size from staged bytes, generates canonical candidate.json.
 *
 * @param {object} options
 * @returns {Promise<{ stagedDir: string, candidateRecord: object }>}
 */
async function stageCandidateArtifact(options = {}) {
  const {
    outputDir,
    tempDir = process.env.RUNNER_TEMP ? path.resolve(process.env.RUNNER_TEMP) : os.tmpdir(),
    distReleaseDir,
    predecessorDir,
    predecessorInfo,
    harnessPath,
    candidateVersion,
    sourceCommit,
    repository = 'EigenCrate/evcrate',
    workflowRunId = 1,
    workflowRunAttempt = 1
  } = options;

  if (!outputDir) throw new Error('stageCandidateArtifact requires outputDir');
  if (!distReleaseDir) throw new Error('stageCandidateArtifact requires distReleaseDir');
  if (!predecessorDir) throw new Error('stageCandidateArtifact requires predecessorDir');
  if (!predecessorInfo) throw new Error('stageCandidateArtifact requires predecessorInfo');
  if (!harnessPath) throw new Error('stageCandidateArtifact requires harnessPath');
  if (!candidateVersion) throw new Error('stageCandidateArtifact requires candidateVersion');
  if (!sourceCommit) throw new Error('stageCandidateArtifact requires sourceCommit');

  // Verify harness path is a regular non-symlink file
  const harnessStat = fs.lstatSync(harnessPath);
  if (harnessStat.isSymbolicLink()) {
    throw new Error(`Harness file cannot be a symbolic link: "${harnessPath}"`);
  }
  if (!harnessStat.isFile()) {
    throw new Error(`Harness file is not a regular file: "${harnessPath}"`);
  }

  // Create staging directory
  const stageDir = fs.mkdtempSync(path.join(tempDir, 'evcrate-candidate-stage-'));

  try {
    const stageAssetsDir = path.join(stageDir, 'assets');
    const stagePredecessorDir = path.join(stageDir, 'predecessor');
    const stageQualificationDir = path.join(stageDir, 'qualification');

    fs.mkdirSync(stageAssetsDir, { recursive: true });
    fs.mkdirSync(stagePredecessorDir, { recursive: true });
    fs.mkdirSync(stageQualificationDir, { recursive: true });

    // Copy exact 7 assets from distReleaseDir
    const assetEntries = fs.readdirSync(distReleaseDir);
    if (assetEntries.length !== 7) {
      throw new Error(`dist/release must contain exactly 7 files, found ${assetEntries.length}`);
    }
    for (const entry of assetEntries) {
      const srcPath = path.join(distReleaseDir, entry);
      const destPath = path.join(stageAssetsDir, entry);
      const s = fs.lstatSync(srcPath);
      if (s.isSymbolicLink() || !s.isFile()) {
        throw new Error(`Asset "${entry}" is not a regular file`);
      }
      fs.copyFileSync(srcPath, destPath);
    }

    // Copy exact 4 predecessor files
    const predEntries = fs.readdirSync(predecessorDir);
    if (predEntries.length !== 4) {
      throw new Error(`Predecessor directory must contain exactly 4 files, found ${predEntries.length}`);
    }
    for (const entry of predEntries) {
      const srcPath = path.join(predecessorDir, entry);
      const destPath = path.join(stagePredecessorDir, entry);
      const s = fs.lstatSync(srcPath);
      if (s.isSymbolicLink() || !s.isFile()) {
        throw new Error(`Predecessor asset "${entry}" is not a regular file`);
      }
      fs.copyFileSync(srcPath, destPath);
    }

    // Copy qualification harness
    const destHarnessPath = path.join(stageQualificationDir, 'windows-release-qualification.mjs');
    fs.copyFileSync(harnessPath, destHarnessPath);

    // Compute candidate file records by hashing staged bytes
    const stagedAssetFiles = fs.readdirSync(stageAssetsDir);
    const candidateFiles = [];
    for (const name of stagedAssetFiles) {
      const filePath = path.join(stageAssetsDir, name);
      const stat = fs.statSync(filePath);
      const sha256 = assetVerification.sha256File(filePath);
      candidateFiles.push({
        name,
        size: stat.size,
        sha256
      });
    }
    candidateFiles.sort((a, b) => releaseContract.compareCodePoints(a.name, b.name));

    // Compute predecessor file records by hashing staged bytes
    const stagedPredFiles = fs.readdirSync(stagePredecessorDir);
    const predecessorFiles = [];
    for (const name of stagedPredFiles) {
      const filePath = path.join(stagePredecessorDir, name);
      const stat = fs.statSync(filePath);
      const sha256 = assetVerification.sha256File(filePath);
      predecessorFiles.push({
        name,
        size: stat.size,
        sha256
      });
    }
    predecessorFiles.sort((a, b) => releaseContract.compareCodePoints(a.name, b.name));

    // Verify exact counts
    if (candidateFiles.length !== 7) {
      throw new Error(`Expected 7 candidate files, computed ${candidateFiles.length}`);
    }
    if (predecessorFiles.length !== 4) {
      throw new Error(`Expected 4 predecessor files, computed ${predecessorFiles.length}`);
    }

    // Build canonical candidate record
    const candidateRecord = {
      schema: 'evcrate-release-candidate/v1',
      repository,
      workflow_run_id: Number(workflowRunId),
      workflow_run_attempt: Number(workflowRunAttempt),
      source_commit: String(sourceCommit).toLowerCase(),
      version: String(candidateVersion),
      tag: `v${candidateVersion}`,
      files: candidateFiles,
      predecessor: {
        kind: predecessorInfo.kind,
        version: String(predecessorInfo.version),
        tag: String(predecessorInfo.tag),
        source_commit: String(predecessorInfo.sourceCommit).toLowerCase(),
        files: predecessorFiles
      }
    };

    // Write candidate.json using canonical JSON encoding
    const receiptPath = path.join(stageDir, 'candidate.json');
    fs.writeFileSync(receiptPath, canonicalJsonBytes(candidateRecord));

    // Verify staged sets
    assetVerification.verifyReleaseAssetSet({
      dir: stageAssetsDir,
      version: candidateVersion,
      tag: `v${candidateVersion}`,
      sourceCommit
    });

    assetVerification.verifyWindowsAssetSet({
      dir: stagePredecessorDir,
      version: predecessorInfo.version,
      tag: predecessorInfo.tag,
      sourceCommit: predecessorInfo.sourceCommit
    });

    // Promote stageDir to outputDir atomically
    const finalOutputDir = path.resolve(outputDir);
    if (fs.existsSync(finalOutputDir)) {
      fs.rmSync(finalOutputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(finalOutputDir), { recursive: true });

    try {
      fs.renameSync(stageDir, finalOutputDir);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        fs.cpSync(stageDir, finalOutputDir, { recursive: true });
        fs.rmSync(stageDir, { recursive: true, force: true });
      } else {
        throw renameErr;
      }
    }

    return {
      stagedDir: finalOutputDir,
      candidateRecord
    };
  } catch (err) {
    try {
      fs.rmSync(stageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw err;
  }
}

/**
 * Emits the nine exact stable scalar outputs to $GITHUB_OUTPUT.
 * Uses safe format and strict character validation.
 *
 * @param {object} outputs Key-value map of outputs
 * @param {object} [options]
 * @param {string} [options.githubOutput] Path to output file, defaults to env.GITHUB_OUTPUT
 */
function writeGithubOutputs(outputs, options = {}) {
  const outputPath = options.githubOutput || process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const allowedKeys = [
    'has_release',
    'version',
    'tag',
    'source_commit',
    'artifact_name',
    'windows_archive_sha256',
    'windows_sidecar_sha256',
    'metadata_sha256',
    'install_ps1_sha256'
  ];

  const lines = [];
  for (const key of allowedKeys) {
    const val = outputs && outputs[key] != null ? String(outputs[key]).trim() : '';
    if (val && !/^[a-zA-Z0-9_.-]+$/.test(val)) {
      throw new Error(`Output value for "${key}" contains invalid characters: ${JSON.stringify(val)}`);
    }
    lines.push(`${key}=${val}\n`);
  }

  fs.appendFileSync(outputPath, lines.join(''), 'utf8');
}

/**
 * Runs the canonical semantic-release candidate lifecycle against a disposable mirror.
 *
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function runCandidateRelease(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const env = options.env ? { ...options.env } : { ...process.env };
  const runnerTemp = options.runnerTemp
    ? path.resolve(options.runnerTemp)
    : (env.RUNNER_TEMP ? path.resolve(env.RUNNER_TEMP) : os.tmpdir());

  const distReleaseDir = options.distReleaseDir ? path.resolve(options.distReleaseDir) : path.join(cwd, 'dist', 'release');
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : path.join(cwd, 'release-candidate');
  const githubOutput = options.githubOutput || env.GITHUB_OUTPUT || null;

  const repository = options.repository || env.GITHUB_REPOSITORY || 'EigenCrate/evcrate';
  const workflowRunId = Number(options.workflowRunId || env.GITHUB_RUN_ID || 1);
  const workflowRunAttempt = Number(options.workflowRunAttempt || env.GITHUB_RUN_ATTEMPT || 1);
  const githubToken = options.githubToken || env.GITHUB_TOKEN || env.GH_TOKEN || null;
  // 1. Require clean triggering checkout (unless explicitly disabled in test options)
  const requireClean = options.requireClean !== false;
  if (requireClean) {
    let statusOutput = '';
    try {
      statusOutput = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim();
    } catch (err) {
      throw new Error(`Failed to check git status in "${cwd}": ${err.message}`);
    }
    if (statusOutput.length > 0) {
      throw new Error(`Working directory is dirty: clean checkout required for candidate release. Changes:\n${statusOutput}`);
    }
  }

  // 2. Capture branch and exact 40-hex lowercase SHA
  let sourceCommit = options.sourceCommit ? String(options.sourceCommit).trim().toLowerCase() : null;
  if (!sourceCommit) {
    try {
      sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim().toLowerCase();
    } catch (err) {
      throw new Error(`Failed to resolve HEAD commit in "${cwd}": ${err.message}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error(`Captured source commit must be 40 lowercase hex characters: ${JSON.stringify(sourceCommit)}`);
  }

  // 3. Read canonical config
  const canonicalConfig = options.config || readCanonicalReleaseConfig({ projectRoot: cwd });

  // Resolve branch
  let branch = options.branch ? String(options.branch).trim() : null;
  if (!branch) {
    branch = env.GITHUB_REF_NAME ? String(env.GITHUB_REF_NAME).trim() : null;
  }
  if (!branch) {
    try {
      const currentRef = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
      if (currentRef !== 'HEAD') {
        branch = currentRef;
      }
    } catch {
      // ignore
    }
  }
  if (!branch) {
    // Fall back to first configured branch name
    const b0 = Array.isArray(canonicalConfig.branches) ? canonicalConfig.branches[0] : canonicalConfig.branches;
    branch = typeof b0 === 'string' ? b0 : (b0 && b0.name ? b0.name : 'main');
  }

  // 4. Containment guards & clear stale outputs
  assertSafeDirectoryWithin(distReleaseDir, [cwd, runnerTemp, os.tmpdir()]);
  assertSafeDirectoryWithin(outputDir, [cwd, runnerTemp, os.tmpdir()]);

  if (fs.existsSync(distReleaseDir)) {
    fs.rmSync(distReleaseDir, { recursive: true, force: true });
  }
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  // Preflight tag ancestry check: ensure v<package.json.version> is merged into sourceCommit if it exists (production only)
  let startingPkgVersion = null;
  try {
    const currentPkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    startingPkgVersion = currentPkg.version;
  } catch {}

  if (!options.semanticReleaseFn && startingPkgVersion) {
    try {
      const expectedTag = `v${startingPkgVersion}`;
      const tagList = execFileSync('git', ['tag', '--list', expectedTag], { cwd, encoding: 'utf8' }).trim();
      if (tagList === expectedTag) {
        const mergedTags = execFileSync('git', ['tag', '--merged', sourceCommit], { cwd, encoding: 'utf8' })
          .split(/\r?\n/)
          .map((t) => t.trim());
        if (!mergedTags.includes(expectedTag)) {
          throw new Error(`Tag "${expectedTag}" exists but is not merged into source commit "${sourceCommit}". Remote tags are detached from branch history.`);
        }
      }
    } catch (tagCheckErr) {
      if (tagCheckErr.message && tagCheckErr.message.includes('detached from branch history')) {
        throw tagCheckErr;
      }
    }
  }

  // 5. Create ephemeral bare mirror under runnerTemp
  const mirror = createLocalReleaseMirror({
    cwd,
    tempDir: runnerTemp,
    branch,
    sourceCommit
  });

  try {
    // 6. Adapt plugins
    const canonicalRepositoryUrl = `https://github.com/${repository}`;
    const candidatePlugins = createCandidatePluginSpecs(canonicalConfig.plugins, { canonicalRepositoryUrl });

    // 7. Child API environment: allowlisted needed values, mode=build, strip write credentials
    const allowlist = [
      'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL',
      'NODE', 'NODE_PATH', 'NODE_OPTIONS',
      'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
      'RUNNER_TEMP', 'CI'
    ];
    const childEnv = {};
    for (const k of allowlist) {
      if (env[k] !== undefined) childEnv[k] = env[k];
    }
    childEnv.EVCRATE_RELEASE_ASSET_MODE = 'build';
    // Explicitly delete release tokens
    delete childEnv.GITHUB_TOKEN;
    delete childEnv.GH_TOKEN;
    delete childEnv.NPM_TOKEN;

    const rawSr = options.semanticReleaseFn || require('semantic-release');
    const semanticReleaseFn = typeof rawSr === 'function' ? rawSr : (rawSr && typeof rawSr.default === 'function' ? rawSr.default : null);
    if (typeof semanticReleaseFn !== 'function') {
      throw new Error('semantic-release module did not resolve to a callable function');
    }
    const assetVerifier = options.assetVerifier || assetVerification.verifyReleaseAssetSet;

    // 8. Invoke semantic-release
    const releaseResult = await semanticReleaseFn({
      branches: canonicalConfig.branches,
      repositoryUrl: mirror.mirrorUrl,
      plugins: candidatePlugins,
      publish: [],
      dryRun: false,
      ci: false
    }, {
      cwd,
      env: childEnv,
      stdout: options.stdout || process.stdout,
      stderr: options.stderr || process.stderr
    });

    // 9. Handle false (no release) branch
    if (releaseResult === false) {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      const outputs = {
        has_release: 'false',
        version: '',
        tag: '',
        source_commit: '',
        artifact_name: '',
        windows_archive_sha256: '',
        windows_sidecar_sha256: '',
        metadata_sha256: '',
        install_ps1_sha256: ''
      };
      writeGithubOutputs(outputs, { githubOutput });
      return {
        hasRelease: false,
        outputs,
        result: false
      };
    }

    // 10. Handle release branch
    const nextRelease = releaseResult && releaseResult.nextRelease;
    if (!nextRelease) {
      throw new Error(`semantic-release returned an unexpected result: ${JSON.stringify(releaseResult)}`);
    }

    if (!releaseContract.isValidReleaseCommitOrSource(nextRelease.gitHead, sourceCommit, nextRelease.version, cwd)) {
      throw new Error(`Release gitHead "${nextRelease.gitHead}" does not match captured sourceCommit "${sourceCommit}" or a verified @semantic-release/git release commit`);
    }
    if (nextRelease.gitTag !== `v${nextRelease.version}`) {
      throw new Error(`Release gitTag "${nextRelease.gitTag}" does not match expected "v${nextRelease.version}"`);
    }

    // Defensive sanity check: nextRelease.version must be strictly greater than starting package.json version (production only)
    if (!options.semanticReleaseFn && startingPkgVersion) {
      try {
        const nextParts = String(nextRelease.version).split('.').map(Number);
        const startParts = String(startingPkgVersion).split('.').map(Number);
        const isLte = nextParts[0] < startParts[0] ||
          (nextParts[0] === startParts[0] && nextParts[1] < startParts[1]) ||
          (nextParts[0] === startParts[0] && nextParts[1] === startParts[1] && nextParts[2] <= startParts[2]);
        if (isLte) {
          throw new Error(`semantic-release computed version ${nextRelease.version} which is <= starting package.json version ${startingPkgVersion}. Ensure git tags are merged into the target branch.`);
        }
      } catch (verErr) {
        if (verErr.message && verErr.message.includes('semantic-release computed version')) {
          throw verErr;
        }
      }
    }

    // Verify exact seven release assets in distReleaseDir
    assetVerifier({
      dir: distReleaseDir,
      version: nextRelease.version,
      tag: nextRelease.gitTag,
      sourceCommit
    });

    // 11. Predecessor resolution
    let predecessorResolver = options.predecessorResolver;
    if (!predecessorResolver) {
      const predModule = await import('./prepare-windows-predecessor.mjs');
      predecessorResolver = predModule.prepareWindowsPredecessor;
    }

    const predecessorTempDir = fs.mkdtempSync(path.join(runnerTemp, `evcrate-pred-${nextRelease.version}-`));
    let predecessorResult;
    try {
      predecessorResult = await predecessorResolver({
        candidateVersion: nextRelease.version,
        outputDir: predecessorTempDir,
        repository,
        githubToken
      });

      const predDir = predecessorResult.directory || predecessorTempDir;
      assetVerification.verifyWindowsAssetSet({
        dir: predDir,
        version: predecessorResult.version,
        tag: predecessorResult.tag,
        sourceCommit: predecessorResult.sourceCommit
      });

      const harnessPath = options.harnessPath || path.join(cwd, 'tests', 'installers', 'windows-release-qualification.mjs');

      // 12. Stage candidate artifact tree
      const staged = await stageCandidateArtifact({
        outputDir,
        tempDir: runnerTemp,
        distReleaseDir,
        predecessorDir: predDir,
        predecessorInfo: predecessorResult,
        harnessPath,
        candidateVersion: nextRelease.version,
        sourceCommit,
        repository,
        workflowRunId,
        workflowRunAttempt
      });

      // 13. Build outputs map
      const filesByName = {};
      for (const f of staged.candidateRecord.files) {
        filesByName[f.name] = f.sha256;
      }
      const winArchiveName = releaseContract.windowsArchiveName(nextRelease.version);
      const winSidecarName = releaseContract.sidecarName(winArchiveName);
      const metaName = releaseContract.releaseMetadataName(nextRelease.version);

      const artifactName = `release-candidate-${workflowRunId}-${workflowRunAttempt}-${sourceCommit}`;
      const outputs = {
        has_release: 'true',
        version: nextRelease.version,
        tag: nextRelease.gitTag,
        source_commit: sourceCommit,
        artifact_name: artifactName,
        windows_archive_sha256: filesByName[winArchiveName],
        windows_sidecar_sha256: filesByName[winSidecarName],
        metadata_sha256: filesByName[metaName],
        install_ps1_sha256: filesByName['install.ps1']
      };

      writeGithubOutputs(outputs, { githubOutput });

      return {
        hasRelease: true,
        outputs,
        result: releaseResult,
        receipt: staged.candidateRecord,
        artifactDir: staged.stagedDir
      };
    } finally {
      try {
        fs.rmSync(predecessorTempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  } finally {
    // Mirror cleanup is mandatory in finally
    mirror.cleanup();
  }
}

/**
 * Standalone CLI argument parser.
 */
function parseCandidateCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output-dir') {
      options.outputDir = args[++i];
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--branch') {
      options.branch = args[++i];
    } else if (arg.startsWith('--branch=')) {
      options.branch = arg.slice('--branch='.length);
    } else if (arg === '--source-commit') {
      options.sourceCommit = args[++i];
    } else if (arg.startsWith('--source-commit=')) {
      options.sourceCommit = arg.slice('--source-commit='.length);
    } else if (arg === '--run-id') {
      options.workflowRunId = Number(args[++i]);
    } else if (arg.startsWith('--run-id=')) {
      options.workflowRunId = Number(arg.slice('--run-id='.length));
    } else if (arg === '--run-attempt') {
      options.workflowRunAttempt = Number(args[++i]);
    } else if (arg.startsWith('--run-attempt=')) {
      options.workflowRunAttempt = Number(arg.slice('--run-attempt='.length));
    } else if (arg === '--github-output') {
      options.githubOutput = args[++i];
    } else if (arg.startsWith('--github-output=')) {
      options.githubOutput = arg.slice('--github-output='.length);
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    }
  }

  return options;
}

/**
 * Main entry point for scripts/release/run-release-candidate.cjs.
 */
async function main(argv = process.argv, env = process.env) {
  const parsed = parseCandidateCliArgs(argv);
  if (parsed.help) {
    console.log(`Usage: node scripts/release/run-release-candidate.cjs [options]

Options:
  --output-dir <path>       Destination directory for candidate artifact (default: ./release-candidate)
  --branch <branch>         Triggering branch name (default: git rev-parse --abbrev-ref HEAD)
  --source-commit <commit>  Triggering 40-hex commit SHA (default: git rev-parse HEAD)
  --run-id <id>             GitHub Actions run ID (default: env.GITHUB_RUN_ID || 1)
  --run-attempt <attempt>   GitHub Actions run attempt (default: env.GITHUB_RUN_ATTEMPT || 1)
  --github-output <path>    File to append GitHub outputs (default: env.GITHUB_OUTPUT)
  -h, --help                Show this help message
`);
    return 0;
  }

  const result = await runCandidateRelease({ ...parsed, env });
  if (result.hasRelease) {
    console.log(`✓ Candidate release staged successfully for v${result.outputs.version} (${result.outputs.tag})`);
    console.log(`  Artifact name: ${result.outputs.artifact_name}`);
    console.log(`  Handoff dir:   ${result.artifactDir}`);
  } else {
    console.log('✓ No release candidate needed (has_release=false)');
  }
  return result;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`✗ run-release-candidate failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  readCanonicalReleaseConfig,
  createCandidatePluginSpecs,
  createLocalReleaseMirror,
  runCandidateRelease,
  stageCandidateArtifact,
  writeGithubOutputs,
  main
};
