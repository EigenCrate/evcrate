import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import {
  buildTargetPolicies,
  deriveManifestView,
  loadSelectedManifests,
  loadTargetManifestRegistry,
  PERSISTED_TARGETS,
  prepareSharedBuildInputs,
  readBuildManifest,
  runAllManifestsBuild,
  runLocalBuild,
  stageAdvisorController
} from '../../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..', '..');

const temporaryDirectories = [];
function makeTempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Phase 02: Single-Projection Manifest Reuse', () => {
  describe('Metadata derivation unit tests', () => {
    it('buildTargetPolicies generates mandatory controller policy and target policy entries', () => {
      const registryPath = join(packageRoot, '.evcrate', 'targets', 'manifest.json');
      const registry = loadTargetManifestRegistry(registryPath);
      const manifests = loadSelectedManifests(registry, ['omp']);

      const policy = buildTargetPolicies(manifests);
      assert.ok(policy['advisor-controller'], 'advisor-controller policy must be present');
      assert.equal(policy['advisor-controller'].promotion_order, 5);
      assert.ok(policy.omp, 'omp target policy must be present');
      assert.equal(Object.keys(policy).length, 2, 'Single target policy should have exactly controller + target');
    });

    it('deriveManifestView excludes .evcrate/targets for single target and includes it for all targets', () => {
      const shared = prepareSharedBuildInputs(packageRoot);
      const stageDir = makeTempDir('evcrate-stage-derivation-');
      const stageBin = join(stageDir, '.evcrate', 'bin');
      const controllerMeta = stageAdvisorController(shared.controllerBinSource, stageBin);
      const manifests = loadSelectedManifests(shared.registry, ['omp']);
      const ompManifest = manifests[0];

      const mockFact = {
        manifest: ompManifest,
        stagedOutputRoots: { '.omp': join(stageDir, '.omp') },
        stagedOutputs: new Map([['.omp', join(stageDir, '.omp')]]),
        localOutputs: new Map([['.omp', join(shared.sourceRoot, '.omp')]]),
        owners: new Map([['.omp/config.json', 'baseline']]),
        adapterHashes: { 'dist/adapters/omp/commands.js': '0'.repeat(64) },
        sourceHashes: { 'omp/manifest.json': '0'.repeat(64) }
      };

      mkdirSync(join(stageDir, '.omp'), { recursive: true });
      writeFileSync(join(stageDir, '.omp', 'config.json'), '{"test":true}\n');


      // 1. Single target view
      const singleView = deriveManifestView([mockFact], shared, stageDir, controllerMeta, 'omp');
      assert.ok(singleView.manifestPath.endsWith('build-manifest-omp.json'));
      const parsedSingle = JSON.parse(new TextDecoder().decode(singleView.manifestData));
      assert.equal(parsedSingle.source_hashes['.evcrate/targets'], undefined, 'Single target manifest must NOT contain .evcrate/targets');
      assert.ok(parsedSingle.source_hashes['omp/manifest.json']);
      assert.ok(parsedSingle.source_hashes['.claude']);
      assert.equal(parsedSingle.source_hashes['AGENTS.md'], shared.agentsMdHash);
      assert.ok(parsedSingle.home_policy.omp);
      assert.equal(parsedSingle.home_policy.claude, undefined);

      // 2. All targets view
      const allManifests = loadSelectedManifests(shared.registry, PERSISTED_TARGETS);
      const allFacts = allManifests.map((m) => ({
        manifest: m,
        stagedOutputRoots: { [m.name]: join(stageDir, m.name) },
        stagedOutputs: new Map([[m.name, join(stageDir, m.name)]]),
        localOutputs: new Map([[m.name, join(shared.sourceRoot, m.name)]]),
        owners: new Map([[`${m.name}/file.txt`, 'baseline']]),
        adapterHashes: { [`dist/adapters/${m.name}.js`]: '1'.repeat(64) },
        sourceHashes: { [`${m.name}/manifest.json`]: '1'.repeat(64) }
      }));

      for (const m of allManifests) {
        mkdirSync(join(stageDir, m.name), { recursive: true });
        writeFileSync(join(stageDir, m.name, 'file.txt'), 'data\n');
      }

      const allView = deriveManifestView(allFacts, shared, stageDir, controllerMeta);
      assert.ok(allView.manifestPath.endsWith('build-manifest.json'));
      const parsedAll = JSON.parse(new TextDecoder().decode(allView.manifestData));
      assert.ok(parsedAll.source_hashes['.evcrate/targets'], 'All-targets manifest MUST contain .evcrate/targets');
      assert.equal(Object.keys(parsedAll.home_policy).length, PERSISTED_TARGETS.length + 1, 'All targets policy must include controller and every target');
    });
  });

  describe('Parity and projection reuse verification', () => {
    it('runAllManifestsBuild produces 100% byte-for-byte identical manifests compared to sequential runLocalBuild', async () => {
      const fixtureA = makeTempDir('evcrate-fixture-legacy-');
      const fixtureB = makeTempDir('evcrate-fixture-singlepass-');

      // Setup identical workspaces
      for (const item of ['.evcrate', 'dist', 'package.json']) {
        cpSync(join(packageRoot, item), join(fixtureA, item), { recursive: true });
        cpSync(join(packageRoot, item), join(fixtureB, item), { recursive: true });
      }

      // Legacy approach: individual target builds plus aggregate build
      for (const target of PERSISTED_TARGETS) {
        await runLocalBuild(fixtureA, [target]);
      }
      await runLocalBuild(fixtureA, PERSISTED_TARGETS);

      // Single-pass approach: each target projected once, all manifest views promoted together
      const result = await runAllManifestsBuild(fixtureB);
      assert.equal(result.allManifestPaths.length, PERSISTED_TARGETS.length + 1);
      assert.equal(result.targetBuilds.size, PERSISTED_TARGETS.length);
      assert.ok(result.aggregateBuild);

      // Verify aggregate and every target manifest match byte-for-byte
      const manifestFiles = [
        'build-manifest.json',
        ...PERSISTED_TARGETS.map((t) => `build-manifest-${t}.json`)
      ];

      for (const filename of manifestFiles) {
        const legacyPath = join(fixtureA, '.evcrate', filename);
        const newPath = join(fixtureB, '.evcrate', filename);

        assert.ok(existsSync(legacyPath), `Legacy manifest ${filename} must exist`);
        assert.ok(existsSync(newPath), `New manifest ${filename} must exist`);

        const legacyBytes = readFileSync(legacyPath);
        const newBytes = readFileSync(newPath);

        assert.equal(
          legacyBytes.length,
          newBytes.length,
          `Manifest byte length mismatch for ${filename}: legacy ${legacyBytes.length} vs new ${newBytes.length}`
        );
        assert.deepEqual(
          legacyBytes,
          newBytes,
          `Byte-for-byte mismatch in ${filename}`
        );
      }

      // Verify each individual target build manifest validates
      for (const target of PERSISTED_TARGETS) {
        const targetBuild = result.targetBuilds.get(target);
        assert.ok(targetBuild, `Target build for ${target} must exist`);
        assert.equal(targetBuild.selectedManifests.length, 1);
        assert.equal(targetBuild.selectedManifests[0].id, target);
        assert.ok(targetBuild.manifest.home_policy[target], `Home policy for ${target} must be present`);
      }
    });

    it('runLocalBuild with emitAllManifests option populates allStagedManifests and produces verified build', async () => {
      const fixture = makeTempDir('evcrate-fixture-opt-');
      for (const item of ['.evcrate', 'dist', 'package.json']) {
        cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
      }

      const build = await runLocalBuild(fixture, PERSISTED_TARGETS, { emitAllManifests: true });
      assert.ok(build.manifest);
      assert.equal(build.selectedManifests.length, PERSISTED_TARGETS.length);

      // Check aggregate and every target manifest exist in destination
      assert.ok(existsSync(join(fixture, '.evcrate', 'build-manifest.json')));
      for (const target of PERSISTED_TARGETS) {
        assert.ok(existsSync(join(fixture, '.evcrate', `build-manifest-${target}.json`)));
      }
    });
  });

  describe('Isolation and atomic promotion', () => {
    it('single target runLocalBuild leaves other target manifests and outputs untouched', async () => {
      const fixture = makeTempDir('evcrate-fixture-isolation-');
      for (const item of ['.evcrate', 'dist', 'package.json']) {
        cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
      }

      // Record timestamps or existence of other manifests
      const otherManifest = join(fixture, '.evcrate', 'build-manifest-claude.json');
      const priorClaudeBytes = existsSync(otherManifest) ? readFileSync(otherManifest) : null;

      // Run build only for omp
      const ompBuild = await runLocalBuild(fixture, ['omp']);
      assert.equal(ompBuild.selectedManifests.length, 1);
      assert.equal(ompBuild.selectedManifests[0].id, 'omp');
      assert.ok(existsSync(join(fixture, '.evcrate', 'build-manifest-omp.json')));

      if (priorClaudeBytes) {
        const afterClaudeBytes = readFileSync(otherManifest);
        assert.deepEqual(priorClaudeBytes, afterClaudeBytes, 'Unselected target manifest must not be altered');
      }
    });
    it('staging failure leaves prior workspace completely unmodified', async () => {
      const fixture = makeTempDir('evcrate-fixture-rollback-');
      for (const item of ['.evcrate', 'dist', 'package.json']) {
        cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
      }
      rmSync(join(fixture, '.evcrate', 'build-manifest.json'), { force: true });
      rmSync(join(fixture, '.evcrate', 'build-manifest-codex.json'), { force: true });


      // 1. Initial build succeeds
      await runLocalBuild(fixture, ['omp']);
      const ompManifestPath = join(fixture, '.evcrate', 'build-manifest-omp.json');
      assert.ok(existsSync(ompManifestPath));
      const priorOmpBytes = readFileSync(ompManifestPath);

      // 2. Introduce a dirty/unsafe legacy root to trigger assertLegacyRootClean failure
      writeFileSync(join(fixture, '.claude'), 'unsafe');

      // 3. runAllManifestsBuild must throw PATH_UNSAFE
      await assert.rejects(async () => runAllManifestsBuild(fixture), (err) => err?.code === 'PATH_UNSAFE');
      // 4. Prior manifest remains completely identical
      const postOmpBytes = readFileSync(ompManifestPath);
      assert.deepEqual(priorOmpBytes, postOmpBytes, 'Prior manifest must remain unchanged on pre-promotion failure');

      // 5. Aggregate manifest was never written
      assert.equal(existsSync(join(fixture, '.evcrate', 'build-manifest.json')), false);
    });
  });
});
