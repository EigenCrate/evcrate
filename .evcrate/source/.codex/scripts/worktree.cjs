#!/usr/bin/env node
/**
 * Git Worktree Manager for EVCrate
 * Cross-platform Node.js script for creating isolated git worktrees
 *
 * Usage: node worktree.cjs <command> [options]
 * Commands:
 *   create <project> <feature>  Create a new worktree (project optional for standalone)
 *   remove <name-or-path>       Remove a worktree and its branch
 *   info                        Get repo info (type, projects, env files)
 *   list                        List existing worktrees
 *
 * Options:
 *   --base <branch>    Base branch to branch off from (e.g. main, develop)
 *   --prefix <type>    Branch prefix (feat|fix|refactor|docs|test|chore|perf)
 *   --env <files>      Comma-separated list of .env files to copy
 *   --plan <path>      Plan directory or file to copy (auto-detected if omitted)
 *   --no-plan          Disable automatic plan directory copying
 *   --json             Output in JSON format for LLM consumption
 *   --dry-run          Show what would be done without executing
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Minimum Node.js version check
const MIN_NODE_VERSION = 18;
const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < MIN_NODE_VERSION) {
  outputError('NODE_VERSION_ERROR', `Node.js ${MIN_NODE_VERSION}+ required. Current: ${process.version}`);
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
const jsonIndex = args.indexOf('--json');
const jsonOutput = jsonIndex > -1;
if (jsonIndex > -1) args.splice(jsonIndex, 1);

function getOptionValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const val = args[index + 1];
  if (!val || val.startsWith('--')) {
    outputError('MISSING_OPTION_VALUE', `Missing required value for ${flag} option`, {
      suggestion: `Specify a value after ${flag}, e.g. ${flag} <value>`
    });
  }
  args.splice(index, 2);
  return val;
}

function hasFlag(flag) {
  const index = args.indexOf(flag);
  if (index > -1) {
    args.splice(index, 1);
    return true;
  }
  return false;
}

const explicitPrefix = getOptionValue('--prefix');
let branchPrefix = explicitPrefix || 'feat';

const explicitBaseBranch = getOptionValue('--base');

const explicitPlanPath = getOptionValue('--plan');

const noPlan = hasFlag('--no-plan');

const envOption = getOptionValue('--env');
let envFilesToCopy = envOption ? envOption.split(',').filter(Boolean) : [];

const dryRun = hasFlag('--dry-run');
const command = args[0];
// For create: args[1] is project (or feature for standalone), args[2] is feature
// For remove: args[1] is worktree name or path
const arg1 = args[1];
const arg2 = args[2];

// Output helpers
function output(data) {
  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (data.success) {
      console.log(`\n✅ ${data.message}`);
      if (data.worktreePath) {
        console.log(`\n📋 Next Steps:`);
        console.log(`   1. cd ${data.worktreePath}`);
        console.log(`   2. codex`);
        console.log(`   3. Start working on your feature`);
        console.log(`\n🧹 Cleanup when done:`);
        console.log(`   git worktree remove ${data.worktreePath}`);
        console.log(`   git branch -d ${data.branch}`);
      }
      if (data.envFilesCopied && data.envFilesCopied.length > 0) {
        console.log(`\n📄 Environment files copied:`);
        data.envFilesCopied.forEach(f => console.log(`   ✓ ${f}`));
      }
      if (data.planCopied) {
        console.log(`\n📋 Plan directory copied:`);
        console.log(`   ✓ ${data.planCopied}`);
      }
      if (data.warnings && data.warnings.length > 0) {
        console.log(`\n⚠️  Warnings:`);
        data.warnings.forEach(w => console.log(`   ${w}`));
      }
    } else if (data.info) {
      // Info output
      console.log(`\n📦 Repository Info:`);
      console.log(`   Type: ${data.repoType}`);
      console.log(`   Base branch: ${data.baseBranch}`);
      if (data.projects && data.projects.length > 0) {
        console.log(`\n📁 Available projects:`);
        data.projects.forEach(p => console.log(`   - ${p.name} (${p.path})`));
      }
      if (data.envFiles && data.envFiles.length > 0) {
        console.log(`\n🔐 Environment files found:`);
        data.envFiles.forEach(f => console.log(`   - ${f}`));
      }
      if (data.dirtyState) {
        console.log(`\n⚠️  Working directory has uncommitted changes`);
      }
    }
  }
}

function outputError(code, message, details = {}) {
  const errorData = {
    success: false,
    error: { code, message, ...details }
  };
  if (jsonOutput) {
    console.log(JSON.stringify(errorData, null, 2));
  } else {
    console.error(`\n❌ Error [${code}]: ${message}`);
    if (details.suggestion) {
      console.error(`   💡 ${details.suggestion}`);
    }
    if (details.availableProjects) {
      console.error(`\n   Available projects:`);
      details.availableProjects.forEach(p => console.error(`     - ${p}`));
    }
  }
  process.exit(1);
}

// Git command wrapper with argument array safety (never invokes a shell)
function git(args, options = {}) {
  const argv = Array.isArray(args) ? args : args.split(/\s+/).filter(Boolean);
  try {
    const result = spawnSync('git', argv, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || undefined
    });
    if (result.error) {
      return {
        success: false,
        error: result.error.message,
        stderr: result.error.code === 'ETIMEDOUT' ? 'Command timed out' : '',
        code: 1,
        timedOut: result.error.code === 'ETIMEDOUT'
      };
    }
    return {
      success: result.status === 0,
      output: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim(),
      code: result.status
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stderr: error.stderr?.toString().trim() || '',
      code: error.status || 1
    };
  }
}

// Check if in git repo
function checkGitRepo() {
  const result = git(['rev-parse', '--show-toplevel'], { silent: true });
  if (!result.success) {
    outputError('NOT_GIT_REPO', 'Not in a git repository', {
      suggestion: 'Run this command from within a git repository'
    });
  }
  return result.output;
}

// Check git version supports worktree
function checkGitVersion() {
  const result = git(['worktree', 'list'], { silent: true });
  if (!result.success && result.stderr.includes('not a git command')) {
    outputError('GIT_VERSION_ERROR', 'Git version too old (worktree requires git 2.5+)', {
      suggestion: 'Upgrade git to version 2.5 or newer'
    });
  }
}

// Check if branch name adheres to Git's ref-format rules
function isValidBranchName(branchName, cwd) {
  if (!branchName || typeof branchName !== 'string' || branchName.startsWith('-')) {
    return false;
  }
  const result = git(['check-ref-format', '--branch', branchName], { silent: true, cwd });
  return result.success;
}

// Detect base branch
function detectBaseBranch(cwd) {
  // Check upstream origin/HEAD if configured (e.g. refs/remotes/origin/HEAD -> origin/main)
  const headRef = git(['symbolic-ref', 'refs/remotes/origin/HEAD'], { silent: true, cwd });
  if (headRef.success && headRef.output) {
    const defaultBranch = headRef.output.replace(/^refs\/remotes\/origin\//, '').trim();
    if (defaultBranch && isValidBranchName(defaultBranch, cwd)) {
      const local = git(['show-ref', '--verify', '--quiet', `refs/heads/${defaultBranch}`], { silent: true, cwd });
      const remote = git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${defaultBranch}`], { silent: true, cwd });
      if (local.success || remote.success) return defaultBranch;
    }
  }

  const branches = ['dev', 'develop', 'main', 'master'];
  for (const branch of branches) {
    const local = git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { silent: true, cwd });
    if (local.success) return branch;
    const remote = git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { silent: true, cwd });
    if (remote.success) return branch;
  }
  return 'main'; // fallback
}

// Resolve canonical path safely even if leaf does not exist yet
function getCanonicalPath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    const resolved = path.resolve(targetPath);
    const parent = path.dirname(resolved);
    try {
      const realParent = fs.realpathSync(parent);
      return path.join(realParent, path.basename(resolved));
    } catch {
      return resolved;
    }
  }
}

// Check if two paths overlap (identical, or one contains the other)
function pathsOverlap(src, dest) {
  const realSrc = path.resolve(getCanonicalPath(src));
  const realDest = path.resolve(getCanonicalPath(dest));
  if (realSrc === realDest) return true;
  if (realDest.startsWith(realSrc + path.sep)) return true;
  if (realSrc.startsWith(realDest + path.sep)) return true;
  return false;
}

function copyRecursive(src, dest, visited = new Set()) {
  const realSrc = getCanonicalPath(src);
  const realDest = getCanonicalPath(dest);
  if (pathsOverlap(realSrc, realDest)) {
    throw new Error(`Source and destination paths overlap: "${src}" and "${dest}"`);
  }

  const lstat = fs.lstatSync(src);
  if (lstat.isSymbolicLink()) {
    const target = fs.readlinkSync(src);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      const stat = fs.statSync(src);
      fs.symlinkSync(target, dest, stat.isDirectory() ? 'dir' : 'file');
      return;
    } catch (symlinkErr) {
      // Safe tested fallback if symlink creation fails (e.g. Windows non-admin permissions or cross-fs)
      try {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          if (visited.has(realSrc)) {
            return; // prevent cyclic recursion
          }
          visited.add(realSrc);
          fs.mkdirSync(dest, { recursive: true });
          for (const child of fs.readdirSync(src)) {
            const childSrc = path.join(src, child);
            const childDest = path.join(dest, child);
            const childReal = getCanonicalPath(childSrc);
            if (childReal === realDest || childReal.startsWith(realDest + path.sep)) {
              continue;
            }
            copyRecursive(childSrc, childDest, visited);
          }
        } else {
          fs.copyFileSync(src, dest);
        }
        return;
      } catch (fallbackErr) {
        throw new Error(`Failed to copy symlink "${src}" to "${dest}": ${symlinkErr.message} (fallback: ${fallbackErr.message})`);
      }
    }
  }

  if (lstat.isDirectory()) {
    if (visited.has(realSrc)) {
      return; // prevent symlink/directory cycle
    }
    visited.add(realSrc);

    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      const childSrc = path.join(src, child);
      const childDest = path.join(dest, child);
      const childReal = getCanonicalPath(childSrc);
      if (childReal === realDest || childReal.startsWith(realDest + path.sep)) {
        continue;
      }
      copyRecursive(childSrc, childDest, visited);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Check for uncommitted changes
function checkDirtyState() {
  const diff = git(['diff', '--quiet'], { silent: true });
  const diffCached = git(['diff', '--cached', '--quiet'], { silent: true });
  return !diff.success || !diffCached.success;
}

// Get dirty state details
function getDirtyStateDetails() {
  const status = git(['status', '--porcelain'], { silent: true });
  if (!status.success) return null;
  const lines = status.output.split('\n').filter(Boolean);
  const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
  const staged = lines.filter(l => l.startsWith('A ') || l.startsWith('M ') || l.startsWith('D ')).length;
  const untracked = lines.filter(l => l.startsWith('??')).length;
  return { modified, staged, untracked, total: lines.length };
}

// Parse .gitmodules for monorepo detection
function parseGitModules(gitRoot) {
  const modulesPath = path.join(gitRoot, '.gitmodules');
  if (!fs.existsSync(modulesPath)) return [];

  const content = fs.readFileSync(modulesPath, 'utf-8');
  const projects = [];
  const pathRegex = /path\s*=\s*(.+)/g;
  let match;
  while ((match = pathRegex.exec(content)) !== null) {
    const projectPath = match[1].trim();
    projects.push({
      path: projectPath,
      name: path.basename(projectPath)
    });
  }
  return projects;
}

// Find .env files
function findEnvFiles(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.filter(f => {
      if (!f.startsWith('.env')) return false;
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      return stat.isFile() && !stat.isSymbolicLink();
    });
  } catch {
    return [];
  }
}

// Find matching projects
function findMatchingProjects(projects, query) {
  const queryLower = query.toLowerCase();
  return projects.filter(p =>
    p.name.toLowerCase().includes(queryLower) ||
    p.path.toLowerCase().includes(queryLower)
  );
}

// Check if branch is already checked out
function isBranchCheckedOut(branchName, cwd) {
  const result = git(['worktree', 'list', '--porcelain'], { silent: true, cwd });
  if (!result.success) return false;
  return result.output.includes(`branch refs/heads/${branchName}`);
}

// Check if branch exists (local branch, local tracking ref, or remote origin ref)
function branchExists(branchName, cwd, options = {}) {
  if (!isValidBranchName(branchName, cwd)) return false;
  const local = git(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { silent: true, cwd });
  if (local.success) return 'local';
  const remote = git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`], { silent: true, cwd });
  if (remote.success) return 'remote';
  const checkRemote = options.checkRemote !== false;
  if (checkRemote) {
    const hasOrigin = git(['remote', 'get-url', 'origin'], { silent: true, cwd, timeout: 2000 }).success;
    if (hasOrigin) {
      const timeout = typeof options.timeout === 'number' ? options.timeout : 3000;
      const lsRemote = git(['ls-remote', '--heads', 'origin', branchName], { silent: true, cwd, timeout });
      if (lsRemote.success && lsRemote.output) {
        const lines = lsRemote.output.split('\n').filter(Boolean);
        const matchRef = `refs/heads/${branchName}`;
        if (lines.some(line => {
          const parts = line.split(/\s+/);
          return parts[1] === matchRef;
        })) {
          return 'remote';
        }
      }
    }
  }
  return false;
}

// Sanitize feature name to valid branch name
function sanitizeFeatureName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50); // Limit length
}

// COMMANDS

function cmdInfo() {
  const gitRoot = checkGitRepo();
  checkGitVersion();

  const projects = parseGitModules(gitRoot);
  const isMonorepo = projects.length > 0;
  if (explicitBaseBranch) {
    if (!isValidBranchName(explicitBaseBranch, gitRoot)) {
      outputError('BASE_BRANCH_NOT_FOUND', `Base branch "${explicitBaseBranch}" does not exist`, {
        suggestion: 'Verify branch exists locally or on remote origin'
      });
    }
    const exists = branchExists(explicitBaseBranch, gitRoot);
    if (!exists) {
      outputError('BASE_BRANCH_NOT_FOUND', `Base branch "${explicitBaseBranch}" does not exist`, {
        suggestion: 'Verify branch exists locally or on remote origin'
      });
    }
  }
  const baseBranch = explicitBaseBranch || detectBaseBranch(gitRoot);
  const dirtyState = checkDirtyState();
  const dirtyDetails = dirtyState ? getDirtyStateDetails() : null;
  const envFiles = findEnvFiles(gitRoot);

  // For monorepo, also check each project for env files
  const projectEnvFiles = {};
  if (isMonorepo) {
    projects.forEach(p => {
      const projectDir = path.join(gitRoot, p.path);
      if (fs.existsSync(projectDir)) {
        const files = findEnvFiles(projectDir);
        if (files.length > 0) {
          projectEnvFiles[p.name] = files;
        }
      }
    });
  }

  output({
    info: true,
    repoType: isMonorepo ? 'monorepo' : 'standalone',
    gitRoot,
    baseBranch,
    projects: isMonorepo ? projects : [],
    envFiles,
    projectEnvFiles: isMonorepo ? projectEnvFiles : {},
    dirtyState,
    dirtyDetails
  });
}

function cmdList() {
  checkGitRepo();
  const result = git(['worktree', 'list'], { silent: true });
  if (!result.success) {
    outputError('WORKTREE_LIST_ERROR', 'Failed to list worktrees', {
      suggestion: 'Ensure you are in a git repository'
    });
  }

  const worktrees = result.output.split('\n').filter(Boolean).map(line => {
    const parts = line.split(/\s+/);
    return {
      path: parts[0],
      commit: parts[1],
      branch: parts[2]?.replace(/[\[\]]/g, '') || 'detached'
    };
  });

  if (jsonOutput) {
    console.log(JSON.stringify({ success: true, worktrees }, null, 2));
  } else {
    console.log('\n📂 Existing worktrees:');
    worktrees.forEach(w => {
      console.log(`   ${w.path}`);
      console.log(`      Branch: ${w.branch} (${w.commit.slice(0, 7)})`);
    });
  }
}

function cmdCreate() {
  const gitRoot = checkGitRepo();
  checkGitVersion();

  const projects = parseGitModules(gitRoot);
  const isMonorepo = projects.length > 0;
  const warnings = [];

  // Parse arguments based on repo type
  // Monorepo: create <project> <feature>
  // Standalone: create <feature>
  let project, feature;
  if (isMonorepo) {
    project = arg1;
    feature = arg2;
    if (!project || !feature) {
      outputError('MISSING_ARGS', 'Both project and feature are required for monorepo', {
        suggestion: 'Usage: node worktree.cjs create <project> <feature> --prefix <type>',
        availableProjects: projects.map(p => p.name)
      });
    }
  } else {
    feature = arg1;
    if (!feature) {
      outputError('MISSING_FEATURE', 'Feature name is required', {
        suggestion: 'Usage: node worktree.cjs create <feature> --prefix <type>'
      });
    }
  }

  // Check dirty state
  if (checkDirtyState()) {
    const details = getDirtyStateDetails();
    warnings.push(`Uncommitted changes: ${details.modified} modified, ${details.staged} staged, ${details.untracked} untracked`);
  }

  // Determine working directory
  let workDir = gitRoot;
  let projectPath = '';
  let projectName = '';

  if (isMonorepo) {
    const matches = findMatchingProjects(projects, project);

    if (matches.length === 0) {
      outputError('PROJECT_NOT_FOUND', `Project "${project}" not found`, {
        suggestion: 'Check available projects with: node worktree.cjs info',
        availableProjects: projects.map(p => p.name)
      });
    }

    if (matches.length > 1) {
      outputError('MULTIPLE_PROJECTS_MATCH', `Multiple projects match "${project}"`, {
        suggestion: 'Use request_user_input to let user select one',
        matchingProjects: matches.map(p => ({ name: p.name, path: p.path }))
      });
    }

    projectPath = matches[0].path;
    projectName = matches[0].name;
    workDir = path.join(gitRoot, projectPath);

    if (!fs.existsSync(workDir)) {
      outputError('PROJECT_DIR_NOT_FOUND', `Project directory not found: ${workDir}`, {
        suggestion: 'Initialize submodules: git submodule update --init'
      });
    }
  }

  // Sanitize feature name
  const sanitizedFeature = sanitizeFeatureName(feature);
  if (sanitizedFeature !== feature.toLowerCase().replace(/\s+/g, '-')) {
    warnings.push(`Feature name sanitized: "${feature}" → "${sanitizedFeature}"`);
  }

  // Validate prefix
  if (!isValidBranchName(branchPrefix, workDir)) {
    branchPrefix = 'feat';
  }

  // Create branch name
  const branchName = `${branchPrefix}/${sanitizedFeature}`;
  // Resolve base branch
  if (explicitBaseBranch) {
    if (!isValidBranchName(explicitBaseBranch, workDir)) {
      outputError('BASE_BRANCH_NOT_FOUND', `Base branch "${explicitBaseBranch}" does not exist`, {
        suggestion: 'Verify branch exists locally or on remote origin'
      });
    }
    const exists = branchExists(explicitBaseBranch, workDir);
    if (!exists) {
      outputError('BASE_BRANCH_NOT_FOUND', `Base branch "${explicitBaseBranch}" does not exist`, {
        suggestion: 'Verify branch exists locally or on remote origin'
      });
    }
  }
  const baseBranch = explicitBaseBranch || detectBaseBranch(workDir);

  // Check if branch already checked out
  if (isBranchCheckedOut(branchName, workDir)) {
    outputError('BRANCH_CHECKED_OUT', `Branch "${branchName}" is already checked out in another worktree`, {
      suggestion: 'Use a different feature name or remove the existing worktree'
    });
  }

  // Determine worktree path
  let worktreesDir, worktreeName;
  if (isMonorepo) {
    worktreesDir = path.join(gitRoot, 'worktrees');
    worktreeName = `${projectName}-${sanitizedFeature}`;
  } else {
    const repoName = path.basename(gitRoot);
    worktreesDir = path.join(path.dirname(gitRoot), 'worktrees');
    worktreeName = `${repoName}-${sanitizedFeature}`;
  }

  const worktreePath = path.join(worktreesDir, worktreeName);

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    outputError('WORKTREE_EXISTS', `Worktree already exists: ${worktreePath}`, {
      suggestion: `To use: cd ${worktreePath} && codex\nTo remove: git worktree remove ${worktreePath}`
    });
  }

  // Check if branch exists
  const branchStatus = branchExists(branchName, workDir, { checkRemote: false });

  // Determine starting revision for planning (read-only, no network mutations)
  let startPoint = baseBranch;
  const localRef = `refs/heads/${baseBranch}`;
  const remoteRef = `refs/remotes/origin/${baseBranch}`;
  const hasLocal = git(['show-ref', '--verify', '--quiet', localRef], { silent: true, cwd: workDir }).success;
  const hasRemote = git(['show-ref', '--verify', '--quiet', remoteRef], { silent: true, cwd: workDir }).success;
  const baseStatus = branchExists(baseBranch, workDir);

  if (hasRemote && !hasLocal) {
    startPoint = remoteRef;
  } else if (!hasLocal && baseStatus === 'remote') {
    startPoint = remoteRef;
  } else if (hasRemote && hasLocal) {
    const localHash = git(['rev-parse', localRef], { silent: true, cwd: workDir }).output.trim();
    const remoteHash = git(['rev-parse', remoteRef], { silent: true, cwd: workDir }).output.trim();
    if (localHash !== remoteHash) {
      const isAncestor = git(['merge-base', '--is-ancestor', localRef, remoteRef], { silent: true, cwd: workDir }).success;
      if (isAncestor) {
        startPoint = remoteRef;
      } else {
        startPoint = localRef;
      }
    }
  }

  // Find plan directory to copy if not disabled
  const sourceDir = isMonorepo ? workDir : gitRoot;
  let detectedPlan = null;
  if (!noPlan) {
    if (explicitPlanPath) {
      const candidates = [
        path.isAbsolute(explicitPlanPath) ? explicitPlanPath : path.join(sourceDir, explicitPlanPath),
        path.join(sourceDir, 'plans', explicitPlanPath)
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          detectedPlan = candidate;
          break;
        }
      }
      if (!detectedPlan) {
        warnings.push(`Explicit plan path not found: ${explicitPlanPath}`);
      }
    } else if (process.env.EVCRATE_ACTIVE_PLAN) {
      const activePlan = process.env.EVCRATE_ACTIVE_PLAN;
      const candidates = [
        path.isAbsolute(activePlan) ? activePlan : path.join(sourceDir, activePlan),
        path.join(sourceDir, 'plans', path.basename(activePlan))
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          detectedPlan = candidate;
          break;
        }
      }
    } else {
      const plansDir = path.join(sourceDir, 'plans');
      if (fs.existsSync(plansDir)) {
        try {
          const entries = fs.readdirSync(plansDir, { withFileTypes: true });
          const matches = entries.filter(e => e.isDirectory() && (
            e.name === sanitizedFeature ||
            e.name.endsWith(`-${sanitizedFeature}`) ||
            e.name.includes(sanitizedFeature)
          ));
          if (matches.length > 0) {
            matches.sort((a, b) => b.name.localeCompare(a.name));
            detectedPlan = path.join(plansDir, matches[0].name);
          }
        } catch {
          // Ignore read errors
        }
      }
    }
  }

  // Validate plan path overlap before dry-run
  if (detectedPlan) {
    const relPlan = path.relative(sourceDir, detectedPlan);
    const destPlan = path.join(worktreePath, relPlan.startsWith('..') ? path.join('plans', path.basename(detectedPlan)) : relPlan);
    if (pathsOverlap(detectedPlan, destPlan) || pathsOverlap(detectedPlan, worktreePath)) {
      if (explicitPlanPath) {
        outputError('PLAN_PATH_OVERLAP', `Plan source path "${detectedPlan}" overlaps with worktree destination`, {
          suggestion: 'Specify a plan directory that does not contain or reside inside the worktree destination'
        });
      } else {
        warnings.push(`Plan path "${detectedPlan}" overlaps with worktree destination; skipping plan copy.`);
        detectedPlan = null;
      }
    }
  }

  // Dry-run mode: show what would be done
  if (dryRun) {
    output({
      success: true,
      dryRun: true,
      message: 'Dry run - no changes made',
      wouldCreate: {
        worktreePath,
        branch: branchName,
        baseBranch,
        startPoint,
        branchExists: !!branchStatus,
        project: isMonorepo ? projectName : null,
        envFilesToCopy: envFilesToCopy.length > 0 ? envFilesToCopy : undefined,
        planToCopy: detectedPlan || undefined
      },
      warnings: warnings.length > 0 ? warnings : undefined
    });
    return;
  }

  // Create worktrees directory
  try {
    fs.mkdirSync(worktreesDir, { recursive: true });
  } catch (err) {
    outputError('MKDIR_FAILED', `Failed to create worktrees directory: ${worktreesDir}`, {
      suggestion: 'Check write permissions'
    });
  }

  // Fetch remote base branch if origin is available (performed only during actual creation)
  const hasOrigin = git(['remote', 'get-url', 'origin'], { silent: true, cwd: workDir }).success;
  if (hasOrigin) {
    const fetchBase = git(['fetch', 'origin', `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`], { silent: true, cwd: workDir });
    if (fetchBase.success) {
      const hasRemoteNow = git(['show-ref', '--verify', '--quiet', remoteRef], { silent: true, cwd: workDir }).success;
      if (hasRemoteNow && !hasLocal) {
        startPoint = remoteRef;
      } else if (hasRemoteNow && hasLocal) {
        const localHash = git(['rev-parse', localRef], { silent: true, cwd: workDir }).output.trim();
        const remoteHash = git(['rev-parse', remoteRef], { silent: true, cwd: workDir }).output.trim();
        if (localHash !== remoteHash) {
          const isAncestor = git(['merge-base', '--is-ancestor', localRef, remoteRef], { silent: true, cwd: workDir }).success;
          startPoint = isAncestor ? remoteRef : localRef;
        }
      }
    } else if (!hasLocal && !hasRemote) {
      outputError('FETCH_FAILED', `Failed to fetch base branch "${baseBranch}" from remote`, {
        suggestion: 'Check network connection or specify existing local branch with --base'
      });
    } else {
      warnings.push(`Could not fetch "${baseBranch}" from origin; creating worktree from local commits.`);
    }
  }

  // Fetch remote branch if needed
  if (branchStatus === 'remote') {
    const fetchResult = git(['fetch', 'origin', `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`], { silent: true, cwd: workDir });
    if (!fetchResult.success) {
      outputError('FETCH_FAILED', `Failed to fetch branch from remote: ${branchName}`, {
        suggestion: 'Check network connection and remote repository access'
      });
    }
  }

  // Create worktree
  let createResult;
  if (branchStatus) {
    createResult = git(['worktree', 'add', worktreePath, branchName], { cwd: workDir });
  } else {
    const addArgs = ['worktree', 'add', '-b', branchName];
    if (startPoint.startsWith('refs/remotes/')) {
      addArgs.push('--no-track');
    }
    addArgs.push(worktreePath, startPoint);
    createResult = git(addArgs, { cwd: workDir });
  }

  if (!createResult.success) {
    outputError('WORKTREE_CREATE_FAILED', `Failed to create worktree`, {
      suggestion: createResult.stderr || createResult.error,
      gitError: createResult.stderr
    });
  }

  // Copy env files if specified
  const envFilesCopied = [];
  if (envFilesToCopy.length > 0) {
    envFilesToCopy.forEach(envFile => {
      const sourcePath = path.join(sourceDir, envFile);
      const destPath = path.join(worktreePath, envFile);
      if (fs.existsSync(sourcePath)) {
        try {
          fs.copyFileSync(sourcePath, destPath);
          envFilesCopied.push(envFile);
        } catch (err) {
          warnings.push(`Failed to copy ${envFile}: ${err.message}`);
        }
      } else {
        warnings.push(`Env file not found: ${envFile}`);
      }
    });
  }

  // Copy detected plan if available
  let planCopied = null;
  if (detectedPlan) {
    try {
      const relPlan = path.relative(sourceDir, detectedPlan);
      const destPlan = path.join(worktreePath, relPlan.startsWith('..') ? path.join('plans', path.basename(detectedPlan)) : relPlan);
      if (!fs.existsSync(destPlan)) {
        copyRecursive(detectedPlan, destPlan);
        planCopied = path.relative(worktreePath, destPlan) || destPlan;
      }
    } catch (err) {
      warnings.push(`Failed to copy plan from ${detectedPlan}: ${err.message}`);
    }
  }

  output({
    success: true,
    message: 'Worktree created successfully!',
    worktreePath,
    branch: branchName,
    baseBranch,
    project: isMonorepo ? projectName : null,
    envFilesCopied,
    planCopied,
    warnings: warnings.length > 0 ? warnings : undefined
  });
}

function cmdRemove() {
  if (!arg1) {
    outputError('MISSING_WORKTREE', 'Worktree name or path is required', {
      suggestion: 'Usage: node worktree.cjs remove <name-or-path>\nUse "node worktree.cjs list" to see available worktrees'
    });
  }

  const gitRoot = checkGitRepo();
  checkGitVersion();

  // Get list of worktrees
  const result = git(['worktree', 'list', '--porcelain'], { silent: true });
  if (!result.success) {
    outputError('WORKTREE_LIST_ERROR', 'Failed to list worktrees');
  }

  // Parse worktrees
  const worktrees = [];
  let current = {};
  result.output.split('\n').forEach(line => {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.replace('worktree ', '') };
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch refs/heads/', '');
    }
  });
  if (current.path) worktrees.push(current);

  // Find matching worktree
  const searchTerm = arg1.toLowerCase();
  const resolvedArg = path.resolve(arg1).toLowerCase();

  // Exclude main worktree (bare .git or the primary checkout)
  const isMainWorktree = (w) => w.path.includes('.git/') || path.resolve(w.path) === path.resolve(gitRoot);

  // Check exact path match first
  const exactPathMatches = worktrees.filter(w => !isMainWorktree(w) && (
    w.path.toLowerCase() === searchTerm ||
    path.resolve(w.path).toLowerCase() === resolvedArg
  ));

  // Check exact name match
  const exactNameMatches = worktrees.filter(w => !isMainWorktree(w) && path.basename(w.path).toLowerCase() === searchTerm);

  let removableMatches;
  if (exactPathMatches.length === 1) {
    removableMatches = exactPathMatches;
  } else if (exactNameMatches.length === 1) {
    removableMatches = exactNameMatches;
  } else {
    const matches = worktrees.filter(w => {
      const name = path.basename(w.path).toLowerCase();
      const fullPath = w.path.toLowerCase();
      return name.includes(searchTerm) || fullPath.includes(searchTerm) ||
             (w.branch && w.branch.toLowerCase().includes(searchTerm));
    });
    removableMatches = matches.filter(w => !isMainWorktree(w));
  }

  if (removableMatches.length === 0) {
    outputError('WORKTREE_NOT_FOUND', `No worktree matching "${arg1}" found`, {
      suggestion: 'Use "node worktree.cjs list" to see available worktrees',
      availableWorktrees: worktrees.filter(w => !w.path.includes('.git/')).map(w => path.basename(w.path))
    });
  }

  if (removableMatches.length > 1) {
    outputError('MULTIPLE_WORKTREES_MATCH', `Multiple worktrees match "${arg1}"`, {
      suggestion: 'Be more specific or use full path',
      matchingWorktrees: removableMatches.map(w => ({ name: path.basename(w.path), path: w.path, branch: w.branch }))
    });
  }

  const worktree = removableMatches[0];
  const worktreePath = worktree.path;
  const branchName = worktree.branch;

  // Dry-run mode
  if (dryRun) {
    output({
      success: true,
      dryRun: true,
      message: 'Dry run - no changes made',
      wouldRemove: {
        worktreePath,
        branch: branchName,
        deleteBranch: !!branchName
      }
    });
    return;
  }

  // Remove worktree
  const removeResult = git(['worktree', 'remove', worktreePath, '--force'], { silent: true });
  if (!removeResult.success) {
    outputError('WORKTREE_REMOVE_FAILED', `Failed to remove worktree: ${worktreePath}`, {
      suggestion: removeResult.stderr || 'Check if the worktree has uncommitted changes',
      gitError: removeResult.stderr
    });
  }

  // Delete branch if it exists
  let branchDeleted = false;
  if (branchName) {
    const deleteResult = git(['branch', '-d', branchName], { silent: true });
    if (deleteResult.success) {
      branchDeleted = true;
    } else {
      // Try force delete if normal delete fails
      const forceDeleteResult = git(['branch', '-D', branchName], { silent: true });
      branchDeleted = forceDeleteResult.success;
    }
  }

  output({
    success: true,
    message: 'Worktree removed successfully!',
    removedPath: worktreePath,
    branchDeleted: branchDeleted ? branchName : null,
    branchKept: !branchDeleted && branchName ? branchName : null
  });
}

// Main
function main() {
  switch (command) {
    case 'create':
      cmdCreate();
      break;
    case 'remove':
      cmdRemove();
      break;
    case 'info':
      cmdInfo();
      break;
    case 'list':
      cmdList();
      break;
    default:
      outputError('UNKNOWN_COMMAND', `Unknown command: ${command || '(none)'}`, {
        suggestion: 'Available commands: create, remove, info, list'
      });
  }
}

main();
