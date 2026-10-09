import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  PERSISTED_TARGETS,
  loadTargetManifestRegistry,
  readBuildManifest,
  runAllManifestsBuild,
  runLocalBuild
} from '../../dist/index.js';
import {
  collectRelativeFiles,
  makeTempDir,
  packageRoot,
  prepareFixtureWorkspace
} from './parity-verification-helpers.mjs';

describe('Phase 05: Output Parity & Manifest Verification', () => {
  describe('Gate 1: Full Projected Output Tree & Manifest Byte Parity', () => {
    it('runAllManifestsBuild produces 100% byte-for-byte identical output files in serial vs parallel modes', async () => {
      const fixtureSerial = makeTempDir('evcrate-parity-j1-');
      const fixtureParallel2 = makeTempDir('evcrate-parity-j2-');
      const fixtureParallel4 = makeTempDir('evcrate-parity-j4-');

      try {
        prepareFixtureWorkspace(fixtureSerial);
        prepareFixtureWorkspace(fixtureParallel2);
        prepareFixtureWorkspace(fixtureParallel4);

        // 1. Run serial build (jobs=1)
        const serialResult = await runAllManifestsBuild(fixtureSerial, { jobs: 1 });
        assert.equal(serialResult.allManifestPaths.length, PERSISTED_TARGETS.length + 1);
        assert.equal(serialResult.targetBuilds.size, PERSISTED_TARGETS.length);

        // 2. Run parallel builds (jobs=2, jobs=4)
        const parallel2Result = await runAllManifestsBuild(fixtureParallel2, { jobs: 2 });
        assert.equal(parallel2Result.allManifestPaths.length, PERSISTED_TARGETS.length + 1);
        assert.equal(parallel2Result.targetBuilds.size, PERSISTED_TARGETS.length);

        const parallel4Result = await runAllManifestsBuild(fixtureParallel4, { jobs: 4 });
        assert.equal(parallel4Result.allManifestPaths.length, PERSISTED_TARGETS.length + 1);
        assert.equal(parallel4Result.targetBuilds.size, PERSISTED_TARGETS.length);

        // 3. Verify aggregate and every target manifest are byte-for-byte identical across j1, j2, j4
        const manifestNames = [
          'build-manifest.json',
          ...PERSISTED_TARGETS.map((t) => `build-manifest-${t}.json`)
        ];

        for (const name of manifestNames) {
          const serialBytes = readFileSync(join(fixtureSerial, '.evcrate', name));
          const p2Bytes = readFileSync(join(fixtureParallel2, '.evcrate', name));
          const p4Bytes = readFileSync(join(fixtureParallel4, '.evcrate', name));

          assert.deepEqual(serialBytes, p2Bytes, `Manifest ${name} mismatch (jobs=1 vs jobs=2)`);
          assert.deepEqual(serialBytes, p4Bytes, `Manifest ${name} mismatch (jobs=1 vs jobs=4)`);
        }

        // 4. Verify every projected output file across all targets is byte-for-byte identical
        const targetOutputRoots = [
          join('.evcrate', 'source', '.claude-projection'),
          join('.evcrate', 'source', '.evcrate-vscode'),
          join('.evcrate', 'source', '.copilot'),
          join('.evcrate', 'source', '.antigravity'),
          join('.evcrate', 'source', '.codex'),
          join('.evcrate', 'source', '.pi'),
          join('.evcrate', 'source', '.omp'),
          join('.evcrate', 'source', '.agents', 'skills')
        ];

        let totalFilesCompared = 0;
        for (const outputRoot of targetOutputRoots) {
          const serialRoot = join(fixtureSerial, outputRoot);
          const p2Root = join(fixtureParallel2, outputRoot);
          const p4Root = join(fixtureParallel4, outputRoot);

          assert.ok(existsSync(serialRoot), `Missing projected output: ${outputRoot}`);

          const serialFiles = collectRelativeFiles(serialRoot);
          const p2Files = collectRelativeFiles(p2Root);
          const p4Files = collectRelativeFiles(p4Root);

          assert.deepEqual(serialFiles, p2Files, `File list mismatch in ${outputRoot} (jobs=1 vs jobs=2)`);
          assert.deepEqual(serialFiles, p4Files, `File list mismatch in ${outputRoot} (jobs=1 vs jobs=4)`);

          for (const file of serialFiles) {
            const sBytes = readFileSync(join(serialRoot, file));
            const p2Bytes = readFileSync(join(p2Root, file));
            const p4Bytes = readFileSync(join(p4Root, file));

            assert.deepEqual(sBytes, p2Bytes, `Content mismatch in ${outputRoot}/${file} (jobs=1 vs jobs=2)`);
            assert.deepEqual(sBytes, p4Bytes, `Content mismatch in ${outputRoot}/${file} (jobs=1 vs jobs=4)`);
            totalFilesCompared++;
          }
        }

        assert.ok(totalFilesCompared > 100, `Expected over 100 projected files compared, got ${totalFilesCompared}`);

        // 5. Verify native project documents parity, including exact nested documents
        for (const doc of [
          'AGENTS.md', '.github/copilot-instructions.md',
          '.agents/hooks.json', '.agents/rules/evcrate-antigravity.md'
        ]) {
          const sDoc = join(fixtureSerial, '.evcrate', 'source', doc);
          const p2Doc = join(fixtureParallel2, '.evcrate', 'source', doc);
          const p4Doc = join(fixtureParallel4, '.evcrate', 'source', doc);

          assert.ok(existsSync(sDoc), `Missing native project document: ${doc}`);
          assert.deepEqual(readFileSync(sDoc), readFileSync(p2Doc));
          assert.deepEqual(readFileSync(sDoc), readFileSync(p4Doc));
        }
      } finally {
        rmSync(fixtureSerial, { recursive: true, force: true });
        rmSync(fixtureParallel2, { recursive: true, force: true });
        rmSync(fixtureParallel4, { recursive: true, force: true });
      }
    });
  });

  describe('Gate 2: Manifest Semantic Verification & Target Subsets', () => {
    it('aggregate and every target manifest pass schema-2 validation and contain expected target policies', () => {
      const registryPath = join(packageRoot, '.evcrate', 'targets', 'manifest.json');
      const registry = loadTargetManifestRegistry(registryPath);
      assert.equal(registry.targets.size, PERSISTED_TARGETS.length);

      const aggregateManifestPath = join(packageRoot, '.evcrate', 'build-manifest.json');
      const aggregateManifest = readBuildManifest(aggregateManifestPath);
      assert.equal(aggregateManifest.schema_version, 2);
      assert.ok(aggregateManifest.controller_hashes);
      assert.ok(aggregateManifest.adapter_hashes);
      assert.ok(aggregateManifest.source_hashes);
      assert.ok(aggregateManifest.output_hashes);

      for (const target of PERSISTED_TARGETS) {
        const manifestPath = join(packageRoot, '.evcrate', `build-manifest-${target}.json`);
        assert.ok(existsSync(manifestPath), `Manifest for target ${target} must exist`);
        const manifest = readBuildManifest(manifestPath);
        assert.equal(manifest.schema_version, 2);
        assert.ok(manifest.home_policy);
        assert.ok(manifest.output_hashes);
      }
    });

    it('runLocalBuild with target subset generates only requested targets and leaves others untouched', async () => {
      const fixture = makeTempDir('evcrate-subset-');
      try {
        prepareFixtureWorkspace(fixture);

        const ompManifestPath = join(fixture, '.evcrate', 'build-manifest-omp.json');
        const piManifestPath = join(fixture, '.evcrate', 'build-manifest-pi.json');
        const codexManifestPath = join(fixture, '.evcrate', 'build-manifest-codex.json');

        const initialPiBytes = readFileSync(piManifestPath);

        const subsetResult = await runLocalBuild(fixture, ['omp', 'codex'], { jobs: 2 });
        assert.equal(subsetResult.selectedManifests.length, 2);

        const postPiBytes = readFileSync(piManifestPath);
        assert.deepEqual(initialPiBytes, postPiBytes, 'Unselected target manifest must remain untouched');

        assert.ok(existsSync(ompManifestPath));
        assert.ok(existsSync(codexManifestPath));
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  });
});
