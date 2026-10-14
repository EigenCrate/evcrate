import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const discoveryDocPath = path.join(packageRoot, 'references', 'project-discovery.md');
const localAnalysisDocPath = path.join(packageRoot, 'references', 'local-analysis.md');
const actorDocPath = path.join(packageRoot, 'agents', 'sonar-evidence.md');
const commandDocPath = path.join(packageRoot, 'commands', 'cmd-sonar-remediate', 'SKILL.md');
const cliCommandsDocPath = path.join(packageRoot, 'references', 'sonar-cli-commands.md');
const testingDocPath = path.join(packageRoot, 'references', 'testing-and-coverage.md');

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_SYSTEM: os.devNull,
  GIT_AUTHOR_NAME: 'Test Runner',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test Runner',
  GIT_COMMITTER_EMAIL: 'test@example.com'
};

/**
 * Path-component-aware containment check conforming to project-discovery.md §2.2
 */
function isPathContained(parentPath, childPath) {
  const canonicalParent = path.resolve(fs.realpathSync(parentPath));
  const canonicalChild = path.resolve(fs.realpathSync(childPath));
  const relative = path.relative(canonicalParent, canonicalChild);
  if (relative === '') return true;
  if (path.isAbsolute(relative)) return false;
  const firstSegment = relative.split(path.sep)[0];
  return firstSegment !== '..';
}

/**
 * Validates execution root and Git identity against checkout root
 */
function validateExecutionRoot(checkoutRoot, executionRoot) {
  if (!fs.existsSync(checkoutRoot)) {
    return { ok: false, blocker: 'checkout-root-missing' };
  }
  if (!fs.existsSync(executionRoot)) {
    return { ok: false, blocker: 'execution-root-missing' };
  }

  // 1. Path-component containment
  if (!isPathContained(checkoutRoot, executionRoot)) {
    return { ok: false, blocker: 'containment-violation' };
  }

  // 2. Git top-level check from execution root
  let gitTopLevel;
  try {
    gitTopLevel = execFileSync('git', ['-C', executionRoot, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: gitEnv
    }).trim();
  } catch (err) {
    return { ok: false, blocker: 'git-rev-parse-failed', error: err.message };
  }

  const canonicalCheckout = fs.realpathSync(checkoutRoot);
  const canonicalGitTop = fs.realpathSync(gitTopLevel);
  if (canonicalGitTop !== canonicalCheckout) {
    return {
      ok: false,
      blocker: 'foreign-repository-rejected',
      expected: canonicalCheckout,
      actual: canonicalGitTop
    };
  }

  return { ok: true, canonicalExecutionRoot: fs.realpathSync(executionRoot) };
}

/**
 * Validates manifest path is a regular file within checkout root per project-discovery.md §2.1
 */
function validateManifestPath(checkoutRoot, manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, blocker: 'manifest-missing' };
  }
  const stat = fs.statSync(manifestPath);
  if (!stat.isFile()) {
    return { ok: false, blocker: 'manifest-not-regular' };
  }
  const canonicalCheckout = fs.realpathSync(checkoutRoot);
  const canonicalManifest = fs.realpathSync(manifestPath);
  if (!isPathContained(canonicalCheckout, canonicalManifest)) {
    return { ok: false, blocker: 'manifest-symlink-escape' };
  }
  return { ok: true, canonicalManifest };
}

/**
 * Target discovery logic conforming to project-discovery.md §1
 */
function discoverTarget(checkoutRoot, explicitTarget = null) {
  if (explicitTarget) {
    const targetPath = path.resolve(checkoutRoot, explicitTarget);
    if (!fs.existsSync(targetPath)) {
      return { ok: false, blocker: 'target-path-missing' };
    }
    const manifestPath = fs.statSync(targetPath).isDirectory()
      ? path.join(targetPath, 'pom.xml')
      : targetPath;
    const executionRoot = fs.statSync(targetPath).isDirectory()
      ? targetPath
      : path.dirname(targetPath);
    if (!fs.existsSync(manifestPath)) {
      return { ok: false, blocker: 'manifest-missing' };
    }
    return { ok: true, executionRoot, manifestPath };
  }

  // Bounded candidate discovery within checkout root
  const candidates = [];
  function searchPoms(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target') continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === 'pom.xml') {
        candidates.push(full);
      } else if (entry.isDirectory()) {
        searchPoms(full);
      }
    }
  }
  searchPoms(checkoutRoot);

  if (candidates.length === 0) {
    return { ok: false, blocker: 'no-manifest-found' };
  }
  if (candidates.length === 1) {
    return {
      ok: true,
      executionRoot: path.dirname(candidates[0]),
      manifestPath: candidates[0]
    };
  }
  // Root POM exists?
  const rootPom = path.join(checkoutRoot, 'pom.xml');
  if (candidates.includes(rootPom)) {
    return { ok: true, executionRoot: checkoutRoot, manifestPath: rootPom };
  }

  // Multiple candidates without root POM -> ambiguous
  return { ok: false, blocker: 'ambiguous-target', candidateCount: candidates.length };
}

describe('Three-Root Execution Context and Filesystem Fixtures', () => {
  let tmpBase;
  let mainRepoDir;

  before(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-root-fixtures-'));
    mainRepoDir = path.join(tmpBase, 'main-repo');
    fs.mkdirSync(mainRepoDir, { recursive: true });

    execFileSync('git', ['init', '-b', 'main', mainRepoDir], { stdio: 'pipe', env: gitEnv });
    execFileSync('git', ['-C', mainRepoDir, 'config', 'user.name', 'Test Runner'], { stdio: 'pipe', env: gitEnv });
    execFileSync('git', ['-C', mainRepoDir, 'config', 'user.email', 'test@example.com'], { stdio: 'pipe', env: gitEnv });

    fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Main Repo\n');
    execFileSync('git', ['-C', mainRepoDir, 'add', 'README.md'], { stdio: 'pipe', env: gitEnv });
    execFileSync('git', ['-C', mainRepoDir, 'commit', '-m', 'Initial commit'], { stdio: 'pipe', env: gitEnv });
  });

  after(() => {
    if (tmpBase && fs.existsSync(tmpBase)) {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('validates path-component-aware containment and rejects string prefix spoofing', () => {
    const repoA = path.join(tmpBase, 'repo');
    const repoASibling = path.join(tmpBase, 'repo-sibling');
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoASibling, { recursive: true });

    // Legitimate child
    const childDir = path.join(repoA, 'service', 'child');
    fs.mkdirSync(childDir, { recursive: true });
    assert.equal(isPathContained(repoA, childDir), true);

    // Legitimate directory named with leading dots (e.g. ..custom)
    const dotDotDir = path.join(repoA, '..custom-dir');
    fs.mkdirSync(dotDotDir, { recursive: true });
    assert.equal(isPathContained(repoA, dotDotDir), true);

    // Sibling directory that shares string prefix but is a different path component
    assert.equal(isPathContained(repoA, repoASibling), false);

    // Traversal bypass attempt
    const traversalPath = path.join(repoA, '..', 'repo-sibling');
    assert.equal(isPathContained(repoA, traversalPath), false);
  });

  test('accepts monorepo service directory where execution_root != checkout_root', () => {
    const serviceDir = path.join(mainRepoDir, 'services', 'order-api');
    fs.mkdirSync(serviceDir, { recursive: true });
    fs.writeFileSync(path.join(serviceDir, 'pom.xml'), '<project></project>');

    const result = validateExecutionRoot(mainRepoDir, serviceDir);
    assert.equal(result.ok, true, 'Monorepo service directory must pass validation');
    assert.equal(result.canonicalExecutionRoot, fs.realpathSync(serviceDir));
  });

  test('accepts Git worktree where checkout_root is the worktree working tree', () => {
    const worktreeDir = path.join(tmpBase, 'worktree-feature');
    execFileSync('git', ['-C', mainRepoDir, 'worktree', 'add', '-b', 'feat/login', worktreeDir], {
      stdio: 'pipe',
      env: gitEnv
    });

    try {
      const serviceInWorktree = path.join(worktreeDir, 'modules', 'auth');
      fs.mkdirSync(serviceInWorktree, { recursive: true });
      fs.writeFileSync(path.join(serviceInWorktree, 'pom.xml'), '<project></project>');

      // Validating worktree root as checkout_root
      const result = validateExecutionRoot(worktreeDir, serviceInWorktree);
      assert.equal(result.ok, true, 'Worktree execution root must pass validation');
      assert.equal(result.canonicalExecutionRoot, fs.realpathSync(serviceInWorktree));
    } finally {
      execFileSync('git', ['-C', mainRepoDir, 'worktree', 'remove', '--force', worktreeDir], {
        stdio: 'pipe',
        env: gitEnv
      });
    }
  });

  test('rejects nested foreign git repository where git rev-parse top-level differs', () => {
    const foreignDir = path.join(mainRepoDir, 'vendor', 'foreign-lib');
    fs.mkdirSync(foreignDir, { recursive: true });
    execFileSync('git', ['init', foreignDir], { stdio: 'pipe', env: gitEnv });
    execFileSync('git', ['-C', foreignDir, 'config', 'user.name', 'Foreign Author'], { stdio: 'pipe', env: gitEnv });
    execFileSync('git', ['-C', foreignDir, 'config', 'user.email', 'foreign@example.com'], { stdio: 'pipe', env: gitEnv });
    fs.writeFileSync(path.join(foreignDir, 'package.json'), '{}');
    execFileSync('git', ['-C', foreignDir, 'add', 'package.json'], { stdio: 'pipe', env: gitEnv });
    execFileSync('git', ['-C', foreignDir, 'commit', '-m', 'Foreign init'], { stdio: 'pipe', env: gitEnv });

    const result = validateExecutionRoot(mainRepoDir, foreignDir);
    assert.equal(result.ok, false, 'Nested foreign repository must be rejected');
    assert.equal(result.blocker, 'foreign-repository-rejected');
  });

  test('rejects symlinked manifest that escapes the checkout root', () => {
    const outsideDir = path.join(tmpBase, 'outside-workspace');
    fs.mkdirSync(outsideDir, { recursive: true });
    const outsidePom = path.join(outsideDir, 'external-pom.xml');
    fs.writeFileSync(outsidePom, '<project></project>');

    const serviceDir = path.join(mainRepoDir, 'services', 'symlinked-service');
    fs.mkdirSync(serviceDir, { recursive: true });
    const symlinkPom = path.join(serviceDir, 'pom.xml');
    fs.symlinkSync(outsidePom, symlinkPom);

    const res = validateManifestPath(mainRepoDir, symlinkPom);
    assert.equal(res.ok, false, 'Symlink escaping checkout root must be rejected');
    assert.equal(res.blocker, 'manifest-symlink-escape');
  });

  test('accepts regular file manifest within checkout root', () => {
    const validPom = path.join(mainRepoDir, 'services', 'order-api', 'pom.xml');
    const res = validateManifestPath(mainRepoDir, validPom);
    assert.equal(res.ok, true, 'Regular file manifest inside checkout must be accepted');
    assert.equal(res.canonicalManifest, fs.realpathSync(validPom));
  });

  test('target discovery: explicit target overrides current directory and finds manifest', () => {
    const serviceDir = path.join(mainRepoDir, 'services', 'billing');
    fs.mkdirSync(serviceDir, { recursive: true });
    fs.writeFileSync(path.join(serviceDir, 'pom.xml'), '<project></project>');

    const res = discoverTarget(mainRepoDir, 'services/billing');
    assert.equal(res.ok, true);
    assert.equal(res.executionRoot, serviceDir);
    assert.equal(res.manifestPath, path.join(serviceDir, 'pom.xml'));
  });

  test('target discovery: ambiguous sibling services without root POM halts closed', () => {
    const multiRepo = path.join(tmpBase, 'multi-module-ambiguous');
    fs.mkdirSync(path.join(multiRepo, 'services', 'user'), { recursive: true });
    fs.mkdirSync(path.join(multiRepo, 'services', 'payment'), { recursive: true });
    fs.writeFileSync(path.join(multiRepo, 'services', 'user', 'pom.xml'), '<project></project>');
    fs.writeFileSync(path.join(multiRepo, 'services', 'payment', 'pom.xml'), '<project></project>');

    const res = discoverTarget(multiRepo);
    assert.equal(res.ok, false);
    assert.equal(res.blocker, 'ambiguous-target');
  });

  test('target discovery: missing manifest blocks applicable toolchain', () => {
    const emptyRepo = path.join(tmpBase, 'empty-repo');
    fs.mkdirSync(emptyRepo, { recursive: true });

    const res = discoverTarget(emptyRepo);
    assert.equal(res.ok, false);
    assert.equal(res.blocker, 'no-manifest-found');
  });
});

describe('Documentation and Policy Specification Contracts for Execution Roots', () => {
  const discoveryDoc = fs.readFileSync(discoveryDocPath, 'utf8');
  const localAnalysisDoc = fs.readFileSync(localAnalysisDocPath, 'utf8');
  const actorDoc = fs.readFileSync(actorDocPath, 'utf8');
  const commandDoc = fs.readFileSync(commandDocPath, 'utf8');
  const cliDoc = fs.readFileSync(cliCommandsDocPath, 'utf8');
  const testingDoc = fs.readFileSync(testingDocPath, 'utf8');

  test('project-discovery.md specifies three distinct roots, containment, and Git identity', () => {
    assert.match(discoveryDoc, /installed_skill_root/);
    assert.match(discoveryDoc, /checkout_root/);
    assert.match(discoveryDoc, /execution_root/);
    assert.match(discoveryDoc, /Never require `execution_root == checkout_root`/i);
    assert.match(discoveryDoc, /git -C <execution_root> rev-parse --show-toplevel/);
    assert.match(discoveryDoc, /foreign-repository-rejected/);
    assert.match(discoveryDoc, /Path-component containment/i);
    assert.match(discoveryDoc, /Freeze context/i);
    assert.match(discoveryDoc, /Forward to delegates/i);
  });

  test('local-analysis.md specifies Windows Maven recipe, splatting, and exit code preservation', () => {
    assert.match(localAnalysisDoc, /Windows Maven Recipe/i);
    assert.match(localAnalysisDoc, /Whole-string argument array/i);
    assert.match(localAnalysisDoc, /Call operator and splatting/i);
    assert.match(localAnalysisDoc, /& \$mvnCmd @mvnArgs/);
    assert.match(localAnalysisDoc, /mvn\.cmd.*cross Windows.*batch processing/i);
    assert.match(localAnalysisDoc, /\$savedExitCode = \$LASTEXITCODE/);
    assert.match(localAnalysisDoc, /try \.\.\. finally/);
    assert.match(localAnalysisDoc, /Set-Location -LiteralPath \$callerLocation/);
    assert.match(localAnalysisDoc, /Child-script exit only/i);
  });

  test('local-analysis.md specifies split native verification without intervening clean', () => {
    assert.match(localAnalysisDoc, /mvn clean verify/);
    assert.match(localAnalysisDoc, /Intermediate inspection/i);
    assert.match(localAnalysisDoc, /NO intervening `clean`/i);
    assert.match(localAnalysisDoc, /sonar-maven-plugin:<configured-version>:sonar/);
  });

  test('local-analysis.md and actor specify dynamic task metadata discovery and saved-task resume', () => {
    assert.match(localAnalysisDoc, /\$\{project\.build\.directory\}\/sonar\/report-task\.txt/);
    assert.match(localAnalysisDoc, /Resume without re-upload/i);
    assert.match(actorDoc, /\$\{project\.build\.directory\}\/sonar\/report-task\.txt/);
    assert.match(actorDoc, /foreign-repository-rejected/);
    assert.match(actorDoc, /containment-violation/);
    assert.match(actorDoc, /manifest-missing/);
  });

  test('cmd-sonar-remediate/SKILL.md freezes three-root context and consumes discovery policy', () => {
    assert.match(commandDoc, /installed_skill_root/);
    assert.match(commandDoc, /checkout_root/);
    assert.match(commandDoc, /execution_root/);
    assert.match(commandDoc, /foreign repositories/i);
    assert.match(commandDoc, /project-discovery\.md §2/);
  });

  test('sonar-cli-commands.md and testing-and-coverage.md provide split verification and root routing', () => {
    assert.match(cliDoc, /# Step 1: Clean native build, test, and fresh coverage verification/);
    assert.match(cliDoc, /# Step 3: Integrated scanner goal execution with identical reactor\/modules\/profiles and NO clean/);
    assert.match(testingDoc, /execution_root.*target\/site\/jacoco\/jacoco\.xml/);
    assert.match(testingDoc, /Standalone offline coverage parsing does not require Git/i);
  });
});
