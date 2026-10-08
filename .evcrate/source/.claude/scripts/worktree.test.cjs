#!/usr/bin/env node
/**
 * Test suite for worktree.cjs
 * Run: node .claude/scripts/worktree.test.cjs
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT_PATH = path.join(__dirname, 'worktree.cjs');
const REPO_ROOT = execSync('git rev-parse --show-toplevel', { cwd: __dirname, encoding: 'utf-8' }).trim();
const STANDALONE_DIR = REPO_ROOT;
const user = process.env.USER || process.env.USERNAME || 'unknown';
const MONOREPO_DIR = `/home/${user}/evcrate`;

let passed = 0;
let failed = 0;
const results = [];

// Test helper
function run(args, options = {}) {
  const cwd = options.cwd || STANDALONE_DIR;
  try {
    const output = execSync(`node "${SCRIPT_PATH}" ${args}`, {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim(), exitCode: 0 };
  } catch (error) {
    return {
      success: false,
      output: error.stdout?.toString().trim() || '',
      stderr: error.stderr?.toString().trim() || '',
      exitCode: error.status || 1
    };
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    results.push({ name, status: 'FAIL', error: error.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    throw new Error(`Invalid JSON: ${str.slice(0, 100)}...`);
  }
}

// ============================================
// INFO COMMAND TESTS
// ============================================
console.log('\n📋 INFO Command Tests');

test('info returns valid JSON', () => {
  const result = run('info --json');
  assert(result.success, 'Command should succeed');
  const json = assertJSON(result.output);
  assert(json.info === true, 'Should have info: true');
});

test('info detects repo type', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(['standalone', 'monorepo'].includes(json.repoType), 'Should detect repo type');
});

test('info detects base branch', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(json.baseBranch, 'Should detect base branch');
  assert(['dev', 'develop', 'main', 'master'].includes(json.baseBranch), 'Should be valid branch');
});

test('info finds env files', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(Array.isArray(json.envFiles), 'Should have envFiles array');
});

test('info detects dirty state', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(typeof json.dirtyState === 'boolean', 'Should have dirtyState boolean');
});

test('info detects monorepo from monorepo root', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return; // Skip if not available
  const result = run('info --json', { cwd: MONOREPO_DIR });
  const json = assertJSON(result.output);
  assert(json.repoType === 'monorepo', 'Should detect monorepo');
  assert(json.projects.length > 0, 'Should have projects');
});

test('info returns text output without --json', () => {
  const result = run('info');
  assert(result.success, 'Command should succeed');
  assert(result.output.includes('Repository Info'), 'Should have text output');
});

// ============================================
// LIST COMMAND TESTS
// ============================================
console.log('\n📂 LIST Command Tests');

test('list returns valid JSON', () => {
  const result = run('list --json');
  assert(result.success, 'Command should succeed');
  const json = assertJSON(result.output);
  assert(json.success === true, 'Should have success: true');
  assert(Array.isArray(json.worktrees), 'Should have worktrees array');
});

test('list worktrees have required fields', () => {
  const result = run('list --json');
  const json = assertJSON(result.output);
  if (json.worktrees.length > 0) {
    const wt = json.worktrees[0];
    assert(wt.path, 'Worktree should have path');
    assert(wt.commit, 'Worktree should have commit');
    assert(wt.branch, 'Worktree should have branch');
  }
});

test('list returns text output without --json', () => {
  const result = run('list');
  assert(result.success, 'Command should succeed');
  assert(result.output.includes('worktrees'), 'Should have text output');
});

// ============================================
// CREATE COMMAND TESTS
// ============================================
console.log('\n🆕 CREATE Command Tests');

test('create requires feature name', () => {
  const result = run('create --json');
  assert(!result.success, 'Should fail without feature');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MISSING_FEATURE', 'Should have MISSING_FEATURE error');
});

test('create dry-run does not create worktree', () => {
  const result = run('create test-dry-run --prefix feat --dry-run --json');
  assert(result.success, 'Dry-run should succeed');
  const json = assertJSON(result.output);
  assert(json.dryRun === true, 'Should have dryRun: true');
  assert(json.wouldCreate, 'Should have wouldCreate object');
});

test('create dry-run shows correct branch name', () => {
  const result = run('create my-feature --prefix fix --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch === 'fix/my-feature', 'Branch should be fix/my-feature');
});

test('create sanitizes feature name - spaces', () => {
  const result = run('create "my cool feature" --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.includes('my-cool-feature'), 'Should sanitize spaces');
});

test('create sanitizes feature name - uppercase', () => {
  const result = run('create "MyFeature" --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.includes('myfeature'), 'Should lowercase');
});

test('create sanitizes feature name - special chars', () => {
  const result = run('create "feat@#$test" --dry-run --json');
  const json = assertJSON(result.output);
  assert(!json.wouldCreate.branch.includes('@'), 'Should remove special chars');
});

test('create respects --prefix flag', () => {
  const prefixes = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf'];
  for (const prefix of prefixes) {
    const result = run(`create test-${prefix} --prefix ${prefix} --dry-run --json`);
    const json = assertJSON(result.output);
    assert(json.wouldCreate.branch.startsWith(`${prefix}/`), `Should use ${prefix} prefix`);
  }
});

test('create shows base branch', () => {
  const result = run('create test-base --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.baseBranch, 'Should show base branch');
});

test('create shows worktree path', () => {
  const result = run('create test-path --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.worktreePath, 'Should show worktree path');
  assert(json.wouldCreate.worktreePath.includes('worktrees'), 'Path should include worktrees dir');
});

test('create in monorepo requires project', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  const result = run('create --json', { cwd: MONOREPO_DIR });
  assert(!result.success, 'Should fail without project in monorepo');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MISSING_ARGS', 'Should have MISSING_ARGS error');
});

test('create in monorepo with project works', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  const result = run('create engineer test-mono --prefix feat --dry-run --json', { cwd: MONOREPO_DIR });
  assert(result.success, 'Should succeed with project');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.project === 'evcrate', 'Should detect project');
});

test('create detects invalid project', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  const result = run('create nonexistent test-invalid --json', { cwd: MONOREPO_DIR });
  assert(!result.success, 'Should fail with invalid project');
  const json = assertJSON(result.output);
  assert(json.error.code === 'PROJECT_NOT_FOUND', 'Should have PROJECT_NOT_FOUND error');
});

// ============================================
// REMOVE COMMAND TESTS
// ============================================
console.log('\n🗑️  REMOVE Command Tests');

test('remove requires worktree name', () => {
  const result = run('remove --json');
  assert(!result.success, 'Should fail without name');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MISSING_WORKTREE', 'Should have MISSING_WORKTREE error');
});

test('remove dry-run does not remove worktree', () => {
  // First get a worktree name from list
  const listResult = run('list --json');
  const listJson = assertJSON(listResult.output);
  const removable = listJson.worktrees.find(w => !w.path.includes('.git/') && path.resolve(w.path) !== path.resolve(REPO_ROOT));
  if (removable) {
    const result = run(`remove "${removable.path}" --dry-run --json`);
    assert(result.success, `Dry-run should succeed: ${result.stderr || result.output}`);
    const json = assertJSON(result.output);
    assert(json.dryRun === true, 'Should have dryRun: true');
    assert(json.wouldRemove, 'Should have wouldRemove object');
  }
});

test('remove handles not found', () => {
  const result = run('remove nonexistent-worktree-xyz --json');
  assert(!result.success, 'Should fail for nonexistent');
  const json = assertJSON(result.output);
  assert(json.error.code === 'WORKTREE_NOT_FOUND', 'Should have WORKTREE_NOT_FOUND error');
});

test('remove error includes available worktrees', () => {
  const result = run('remove nonexistent-worktree-xyz --json');
  const json = assertJSON(result.output);
  assert(Array.isArray(json.error.availableWorktrees), 'Should list available worktrees');
});

// ============================================
// ERROR HANDLING TESTS
// ============================================
console.log('\n⚠️  Error Handling Tests');

test('unknown command returns error', () => {
  const result = run('unknowncommand --json');
  assert(!result.success, 'Should fail');
  const json = assertJSON(result.output);
  assert(json.error.code === 'UNKNOWN_COMMAND', 'Should have UNKNOWN_COMMAND error');
});

test('no command returns error', () => {
  const result = run('--json');
  assert(!result.success, 'Should fail');
  const json = assertJSON(result.output);
  assert(json.error.code === 'UNKNOWN_COMMAND', 'Should have UNKNOWN_COMMAND error');
});

test('errors have suggestion field', () => {
  const result = run('create --json');
  const json = assertJSON(result.output);
  assert(json.error.suggestion, 'Error should have suggestion');
});

test('success commands return exit code 0', () => {
  const result = run('info --json');
  assert(result.exitCode === 0, 'Exit code should be 0');
});

test('error commands return exit code 1', () => {
  const result = run('create --json');
  assert(result.exitCode === 1, 'Exit code should be 1');
});

test('non-git directory returns error', () => {
  const result = run('info --json', { cwd: '/tmp' });
  assert(!result.success, 'Should fail in non-git dir');
  const json = assertJSON(result.output);
  assert(json.error.code === 'NOT_GIT_REPO', 'Should have NOT_GIT_REPO error');
});

// ============================================
console.log('\n🌿 Base Branch & Plan Tests');

test('info with valid --base reports requested base branch', () => {
  const result = run('info --base main --json');
  assert(result.success, `Should succeed: ${result.stderr}`);
  const json = assertJSON(result.output);
  assert(json.baseBranch === 'main', `Expected main, got ${json.baseBranch}`);
});

test('info with invalid --base returns BASE_BRANCH_NOT_FOUND', () => {
  const result = run('info --base nonexistent-branch-xyz --json');
  assert(!result.success, 'Should fail for nonexistent base');
  const json = assertJSON(result.output);
  assert(json.error.code === 'BASE_BRANCH_NOT_FOUND', 'Should return BASE_BRANCH_NOT_FOUND');
});

test('create dry-run respects --base flag', () => {
  const result = run('create test-feature --base main --dry-run --json');
  assert(result.success, `Should succeed: ${result.stderr}`);
  const json = assertJSON(result.output);
  assert(json.wouldCreate.baseBranch === 'main', `Expected main base branch, got ${json.wouldCreate.baseBranch}`);
  assert(json.wouldCreate.branch === 'feat/test-feature', 'Branch should be feat/test-feature');
});

test('create dry-run with invalid --base returns error', () => {
  const result = run('create test-feature --base nonexistent-branch-xyz --dry-run --json');
  assert(!result.success, 'Should fail for nonexistent base');
  const json = assertJSON(result.output);
  assert(json.error.code === 'BASE_BRANCH_NOT_FOUND', 'Should return BASE_BRANCH_NOT_FOUND');
});

test('create dry-run detects --no-plan flag', () => {
  const result = run('create test-feature --no-plan --dry-run --json');
  assert(result.success, `Should succeed: ${result.stderr}`);
  const json = assertJSON(result.output);
  assert(json.wouldCreate.planToCopy === undefined, 'Should not plan to copy when --no-plan is passed');
});

// ============================================
console.log('\n🛡️ Security & Regression Tests (Isolated Repositories)');

test('rejects shell command injection in --base without executing payload', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-test-sec-'));
  const marker = path.join(tmpDir, 'injection_marker.txt');
  try {
    const repo = path.join(tmpDir, 'repo');
    fs.mkdirSync(repo);
    execSync('git init -b main', { cwd: repo, stdio: 'pipe' });
    execSync('git config user.name "Tester" && git config user.email "test@example.com"', { cwd: repo, stdio: 'pipe' });
    fs.writeFileSync(path.join(repo, 'file.txt'), 'init');
    execSync('git add . && git commit -m "init"', { cwd: repo, stdio: 'pipe' });

    const result = run(`info --base "main; echo pwned > \\"${marker}\\"" --json`, { cwd: repo });
    assert(!result.success, 'Command with injected metacharacters should fail');
    assert(!fs.existsSync(marker), 'Injected shell command must NOT execute');
    const json = assertJSON(result.output);
    assert(json.error.code === 'BASE_BRANCH_NOT_FOUND', 'Should return BASE_BRANCH_NOT_FOUND error code');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('rejects malformed branch names in --base', () => {
  const malformedNames = [
    'main@{1}',
    'main..dev',
    '-invalid-dash-start',
    'main~1',
    'main^',
    'main:sub'
  ];
  for (const name of malformedNames) {
    const result = run(`info --base "${name}" --json`);
    assert(!result.success, `Should reject malformed branch: ${name}`);
    const json = assertJSON(result.output);
    assert(json.error.code === 'BASE_BRANCH_NOT_FOUND', `Expected BASE_BRANCH_NOT_FOUND for ${name}`);
  }
});

test('rejects plan directory overlap and prevents recursive copying', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-test-overlap-'));
  try {
    const repo = path.join(tmpDir, 'repo');
    fs.mkdirSync(repo);
    execSync('git init -b main', { cwd: repo, stdio: 'pipe' });
    execSync('git config user.name "Tester" && git config user.email "test@example.com"', { cwd: repo, stdio: 'pipe' });
    fs.writeFileSync(path.join(repo, 'file.txt'), 'init');
    execSync('git add . && git commit -m "init"', { cwd: repo, stdio: 'pipe' });

    // Explicit plan pointing to parent directory containing the worktree destination
    const result = run('create overlap-feat --plan ../ --json', { cwd: repo });
    assert(!result.success, 'Should fail when plan overlaps with destination');
    const json = assertJSON(result.output);
    assert(json.error.code === 'PLAN_PATH_OVERLAP', 'Should fail with PLAN_PATH_OVERLAP');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handles plan directory with symlinks without cyclic recursion', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-test-symlink-'));
  try {
    const repo = path.join(tmpDir, 'repo');
    fs.mkdirSync(repo);
    execSync('git init -b main', { cwd: repo, stdio: 'pipe' });
    execSync('git config user.name "Tester" && git config user.email "test@example.com"', { cwd: repo, stdio: 'pipe' });
    fs.writeFileSync(path.join(repo, 'file.txt'), 'init');
    execSync('git add . && git commit -m "init"', { cwd: repo, stdio: 'pipe' });

    const plansDir = path.join(repo, 'plans', 'cycle-plan');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, 'plan.md'), '# Plan');
    // Create a circular directory symlink inside the plan directory
    try {
      fs.symlinkSync(plansDir, path.join(plansDir, 'self-link'));
    } catch {
      // Symlinks may require special privileges on some platforms
    }

    const result = run('create symlink-feat --plan plans/cycle-plan --dry-run --json', { cwd: repo });
    assert(result.success, `Dry run with plan symlinks should succeed: ${result.stderr}`);
    const json = assertJSON(result.output);
    assert(json.wouldCreate.planToCopy !== undefined, 'Plan should be planned for copying');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dry-run does not perform network fetch or update remote refs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-test-dryrun-'));
  try {
    const upstream = path.join(tmpDir, 'upstream');
    fs.mkdirSync(upstream);
    execSync('git init -b main', { cwd: upstream, stdio: 'pipe' });
    execSync('git config user.name "Tester" && git config user.email "test@example.com"', { cwd: upstream, stdio: 'pipe' });
    fs.writeFileSync(path.join(upstream, 'file.txt'), 'v1');
    execSync('git add . && git commit -m "v1"', { cwd: upstream, stdio: 'pipe' });

    const bare = path.join(tmpDir, 'bare.git');
    execSync(`git clone --bare "${upstream}" "${bare}"`, { stdio: 'pipe' });

    const clone = path.join(tmpDir, 'clone');
    execSync(`git clone "${bare}" "${clone}"`, { stdio: 'pipe' });
    execSync('git config user.name "Tester" && git config user.email "test@example.com"', { cwd: clone, stdio: 'pipe' });

    // Upstream receives a new commit
    fs.writeFileSync(path.join(upstream, 'file.txt'), 'v2');
    execSync(`git commit -am "v2" && git push "${bare}" main:main`, { cwd: upstream, stdio: 'pipe' });

    const originMainBefore = execSync('git rev-parse refs/remotes/origin/main', { cwd: clone, encoding: 'utf-8' }).trim();
    const fetchHeadFile = path.join(clone, '.git', 'FETCH_HEAD');
    const fetchHeadMtimeBefore = fs.existsSync(fetchHeadFile) ? fs.statSync(fetchHeadFile).mtimeMs : 0;

    const result = run('create dry-check --base main --dry-run --json', { cwd: clone });
    assert(result.success, `Dry-run should succeed: ${result.stderr}`);

    const originMainAfter = execSync('git rev-parse refs/remotes/origin/main', { cwd: clone, encoding: 'utf-8' }).trim();
    const fetchHeadMtimeAfter = fs.existsSync(fetchHeadFile) ? fs.statSync(fetchHeadFile).mtimeMs : 0;

    assert(originMainBefore === originMainAfter, 'Remote tracking ref should NOT be updated by dry-run');
    assert(fetchHeadMtimeBefore === fetchHeadMtimeAfter, 'FETCH_HEAD should NOT be touched by dry-run');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('discovers remote-only base branch and creates worktree in single-branch clone', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-test-remote-'));
  try {
    const upstream = path.join(tmpDir, 'upstream');
    fs.mkdirSync(upstream);
    execSync('git init -b main', { cwd: upstream, stdio: 'pipe' });
    execSync('git config user.name "Tester" && git config user.email "test@example.com"', { cwd: upstream, stdio: 'pipe' });
    fs.writeFileSync(path.join(upstream, 'file.txt'), 'main');
    execSync('git add . && git commit -m "main commit"', { cwd: upstream, stdio: 'pipe' });

    const bare = path.join(tmpDir, 'bare.git');
    execSync(`git clone --bare "${upstream}" "${bare}"`, { stdio: 'pipe' });

    // Push a new remote branch to bare
    execSync(`git branch feature-remote && git push "${bare}" feature-remote:feature-remote`, { cwd: upstream, stdio: 'pipe' });

    // Clone only single branch (main)
    const clone = path.join(tmpDir, 'clone');
    execSync(`git clone --single-branch -b main "${bare}" "${clone}"`, { stdio: 'pipe' });
    execSync('git config user.name "Tester" && git config user.email "test@example.com"', { cwd: clone, stdio: 'pipe' });

    // Verify remote tracking ref for feature-remote does NOT exist locally yet
    let trackingExists = false;
    try {
      execSync('git show-ref --verify --quiet refs/remotes/origin/feature-remote', { cwd: clone });
      trackingExists = true;
    } catch {
      trackingExists = false;
    }
    assert(!trackingExists, 'Single branch clone should not have cached remote branch ref yet');

    // 1. Info discovers remote-only base branch
    const infoRes = run('info --base feature-remote --json', { cwd: clone });
    assert(infoRes.success, `Info with remote-only base should succeed: ${infoRes.stderr}`);
    const infoJson = assertJSON(infoRes.output);
    assert(infoJson.baseBranch === 'feature-remote', 'Info should report remote-only base branch');

    // 2. Dry-run discovers remote-only base branch without error
    const dryRes = run('create feat-from-remote --base feature-remote --dry-run --json', { cwd: clone });
    assert(dryRes.success, `Dry-run with remote-only base should succeed: ${dryRes.stderr}`);
    const dryJson = assertJSON(dryRes.output);
    assert(dryJson.wouldCreate.baseBranch === 'feature-remote', 'Dry-run baseBranch should be feature-remote');
    assert(dryJson.wouldCreate.startPoint === 'refs/remotes/origin/feature-remote', 'startPoint should point to remote ref');

    // 3. Real creation creates worktree from remote-only branch
    const createRes = run('create feat-from-remote --base feature-remote --json', { cwd: clone });
    assert(createRes.success, `Creation from remote-only base should succeed: ${createRes.stderr}`);
    const createJson = assertJSON(createRes.output);
    assert(createJson.success, 'Worktree should be created successfully');
    assert(fs.existsSync(createJson.worktreePath), 'Created worktree directory should exist');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================
// SUMMARY
// ============================================
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
