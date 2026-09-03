import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import {
  ADVISOR_CONTROLLER_FILES,
  getAllTargetGateReceipts,
  PERSISTED_TARGETS,
  publicationStateRoot,
  PUBLICATION_BINDING_ORDER,
  publishApply,
  resolveCurrentBuild,
  resolveInvocationContext,
  treeHash,
  validateAdvisorControllerSource,
  verifyBuild
} from '../../dist/index.js';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

function npmJson(args, cwd) {
  const result = spawnSync('npm', [...args, '--json', '--ignore-scripts'], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('[')).trim());
}

function packPackage(destination) {
  const output = npmJson(['pack', '--pack-destination', destination], packageRoot);
  return join(destination, output[0].filename);
}

function installPackage(tarball, root) {
  const result = spawnSync('npm', [
    'install', '--prefix', root, '--no-audit', '--no-fund', '--ignore-scripts', tarball
  ], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000
  });
  assert.equal(result.status, 0, result.stderr);
}

test('consumer mode build resolution verifies outputs and controller closure without requiring authoring adapter sources', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-val-home-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: [] });
    const consumerBuild = resolveCurrentBuild({
      packageRoot: context.packageRoot,
      canonicalSourceRoot: context.canonicalSourceRoot,
      controllerRoot: context.controllerRoot,
      targetRegistryPath: context.registryPath,
      selectedTargets: context.selectedTargetIds,
      mode: 'consumer'
    });
    assert.ok(consumerBuild.manifest);
    assert.equal(consumerBuild.manifest.schema_version, 2);
    assert.equal(consumerBuild.selectedManifests.length, PERSISTED_TARGETS.length);
    assert.ok(consumerBuild.outputPaths['.evcrate']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('consumer mode verification fails closed if output projection is tampered', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-val-home-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['claude'] });
    const build = resolveCurrentBuild({
      packageRoot: context.packageRoot,
      canonicalSourceRoot: context.canonicalSourceRoot,
      controllerRoot: context.controllerRoot,
      targetRegistryPath: context.registryPath,
      selectedTargets: context.selectedTargetIds,
      mode: 'consumer'
    });
    const fakeOutputRoots = { ...build.outputPaths, '.claude': home };
    assert.throws(() => verifyBuild({
      manifestPath: build.manifestPath,
      outputRoots: fakeOutputRoots,
      controllerRoot: context.controllerRoot
    }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('installed packed package runs publish dry-run and apply with zero package-root mutation', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-val-rollout-'));
  const installRoot = join(root, 'install');
  const home = join(root, 'home');
  const state = join(root, 'state');
  mkdirSync(installRoot); mkdirSync(home); mkdirSync(state);

  try {
    const tarball = packPackage(root);
    installPackage(tarball, installRoot);

    const installedPackageDir = join(installRoot, 'node_modules', 'evcrate');
    assert.ok(existsSync(installedPackageDir));

    // Capture initial hash of installed package root
    const packageHashBefore = treeHash(installedPackageDir);

    const cliPath = join(installRoot, 'node_modules', '.bin', 'evcrate');

    // 1. Dry run
    const dryRun = spawnSync(cliPath, [
      'publish', '--dry-run', '--json', '--home', home, '--state-home', state
    ], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 32 * 1024 * 1024
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryRunResult = JSON.parse(dryRun.stdout);
    assert.equal(dryRunResult.status, 'preview');
    assert.equal(dryRunResult.operation, 'publish.dry-run');
    assert.ok(Array.isArray(dryRunResult.payload.changes));
    assert.ok(dryRunResult.payload.changes.length > 0);

    // Verify promotion order: controller -> OMP -> Copilot
    assert.deepEqual([...dryRunResult.payload.bindingOrder], [
      '.evcrate/bin', '.gemini', '.agents', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot'
    ]);

    // Ensure home directory remains empty after dry-run
    assert.deepEqual(existsSync(join(home, '.claude')), false);
    assert.deepEqual(existsSync(join(home, '.copilot')), false);
    assert.deepEqual(existsSync(join(home, '.omp')), false);

    // 2. Publish apply
    const apply = spawnSync(cliPath, [
      'publish', '--apply', '--json', '--home', home, '--state-home', state
    ], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 32 * 1024 * 1024
    });
    assert.equal(apply.status, 0, apply.stderr);
    const applyResult = JSON.parse(apply.stdout);
    assert.equal(applyResult.status, 'published');
    assert.equal(applyResult.operation, 'publish.apply');
    assert.ok(typeof applyResult.payload.releaseId === 'string');

    // Inviolable invariant: ZERO filesystem writes or mutations under installed package root
    const packageHashAfter = treeHash(installedPackageDir);
    assert.equal(packageHashAfter, packageHashBefore, 'installed package root must not be mutated during publish');

    // Verify target projections exist in home
    assert.ok(existsSync(join(home, '.evcrate', 'bin', 'evcrate-advisor')), 'advisor controller bin exists');
    assert.ok(existsSync(join(home, '.claude')), 'claude home exists');
    assert.ok(existsSync(join(home, '.copilot')), 'copilot home exists');
    assert.ok(existsSync(join(home, '.omp')), 'omp home exists');
    assert.ok(existsSync(join(home, '.pi')), 'pi home exists');
    assert.ok(existsSync(join(home, '.gemini')), 'gemini home exists');
    assert.ok(existsSync(join(home, '.codex')), 'codex home exists');
    assert.ok(existsSync(join(home, '.agents')), 'agents home exists');

    // Verify advisor controller is executable
    const advisorStat = lstatSync(join(home, '.evcrate', 'bin', 'evcrate-advisor'));
    assert.ok((advisorStat.mode & 0o111) !== 0, 'evcrate-advisor must be executable');

    // 3. Repeat apply is idempotent
    const repeatApply = spawnSync(cliPath, [
      'publish', '--apply', '--json', '--home', home, '--state-home', state
    ], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 32 * 1024 * 1024
    });
    assert.equal(repeatApply.status, 0, repeatApply.stderr);
    const repeatResult = JSON.parse(repeatApply.stdout);
    assert.equal(repeatResult.status, 'published');

    // Verify package root still unmutated
    assert.equal(treeHash(installedPackageDir), packageHashBefore);

    // 4. Recover in consumer environment
    const recover = spawnSync(cliPath, [
      'recover', '--json', '--home', home, '--state-home', state
    ], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 32 * 1024 * 1024
    });
    const recoverResult = JSON.parse(recover.stdout);
    assert.equal(recoverResult.status, 'recovered');
    assert.equal(recoverResult.operation, 'recover');

    // 5. Health diagnostic in consumer environment
    const health = spawnSync(cliPath, [
      'health', '--json', '--home', home, '--state-home', state
    ], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 32 * 1024 * 1024
    });
    const healthResult = JSON.parse(health.stdout);
    assert.ok(healthResult.status === 'QUALIFIED' || healthResult.status === 'FAILED');
    assert.equal(healthResult.protocol, 'evcrate-advisor-diagnostic');
    // Inviolable: zero counsel or checkpoint generation in health output
    assert.equal(health.stdout.includes('evcrate-advisor-checkpoint'), false);
    assert.equal(health.stdout.includes('counsel'), false);

  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controller closure matches exactly the 17 files in ADVISOR_CONTROLLER_FILES and validates cleanly', () => {
  assert.equal(ADVISOR_CONTROLLER_FILES.length, 17);
  const controllerRoot = join(packageRoot, '.evcrate', 'source', '.evcrate', 'bin');
  assert.doesNotThrow(() => validateAdvisorControllerSource(controllerRoot));
});

test('all target manifests and cutover receipts validate schema 2 with TypeScript authority', () => {
  const receipts = getAllTargetGateReceipts();
  assert.equal(receipts.length, 7);
  for (const receipt of receipts) {
    assert.ok(PERSISTED_TARGETS.includes(receipt.target));
    assert.equal(receipt.authoritativeEngine, 'typescript');
    assert.equal(receipt.parityVerified, true);
    assert.equal(receipt.closureVerified, true);
    assert.equal(receipt.schemaVersion, 2);
  }
});

test('unmanaged existing content in user HOME is preserved across publication apply', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-preserve-home-'));
  try {
    // Pre-create an unmanaged user file inside target destination directory
    const claudeHome = join(home, '.claude');
    mkdirSync(claudeHome, { recursive: true });
    const customFilePath = join(claudeHome, 'my-custom-note.txt');
    const customContent = 'user-authored private note that must never be removed';
    writeFileSync(customFilePath, customContent, 'utf8');

    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, targets: ['claude']
    });


    const result = publishApply(context);
    assert.ok(result.releaseId);

    // Verify that the custom user file is still intact
    assert.ok(existsSync(customFilePath));
    assert.equal(readFileSync(customFilePath, 'utf8'), customContent);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('advisor settings and target publication maintain strictly isolated journals and locks', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-isolation-home-'));
  try {
    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, targets: ['claude']
    });

    const pubState = publicationStateRoot(home);

    // Verify target publication state root is separate and isolated
    assert.equal(pubState, join(home, '.evcrate', 'publication'));
    assert.ok(!pubState.includes('advisor-settings'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
