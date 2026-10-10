import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PERSISTED_TARGETS,
  MIN_BUILD_JOBS,
  MAX_BUILD_JOBS,
  parseJobsValue,
  resolveBuildJobs,
  prepareInputSnapshot,
  assertLiveInputsUnchanged,
  hashFile,
  treeHash,
  resolveCurrentBuild,
  runAllManifestsBuild,
  runLocalBuild,
  TargetWorkerPool
} from '../../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..', '..');

function makeTempDir(prefix = 'evcrate-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('Phase 03: Bounded Worker Staging', () => {
  describe('Jobs parsing and resolution', () => {
    it('parseJobsValue accepts valid integers 1 through 8 as numbers and strings', () => {
      for (let i = 1; i <= 8; i++) {
        assert.equal(parseJobsValue(i), i);
        assert.equal(parseJobsValue(String(i)), i);
      }
    });

    it('parseJobsValue rejects values less than 1 or greater than 8', () => {
      for (const invalid of [0, -1, -5, 9, 10, 100]) {
        assert.throws(
          () => parseJobsValue(invalid),
          (err) => err?.code === 'USAGE_INVALID'
        );
        assert.throws(
          () => parseJobsValue(String(invalid)),
          (err) => err?.code === 'USAGE_INVALID'
        );
      }
    });

    it('parseJobsValue rejects non-integers, NaN, and non-numeric strings', () => {
      for (const invalid of [1.5, 2.9, NaN, Infinity, 'abc', '', ' 1 ', 'foo']) {
        assert.throws(
          () => parseJobsValue(invalid),
          (err) => err?.code === 'USAGE_INVALID'
        );
      }
    });

    it('resolveBuildJobs respects explicit options over environment variables', () => {
      const origEnv = process.env.EVCRATE_BUILD_JOBS;
      try {
        process.env.EVCRATE_BUILD_JOBS = '4';
        const resolved = resolveBuildJobs({ explicitJobs: 2, targetCount: 8 });
        assert.equal(resolved, 2);
      } finally {
        if (origEnv !== undefined) process.env.EVCRATE_BUILD_JOBS = origEnv;
        else delete process.env.EVCRATE_BUILD_JOBS;
      }
    });

    it('resolveBuildJobs respects environment variable when explicit option is absent', () => {
      const origEnv = process.env.EVCRATE_BUILD_JOBS;
      try {
        process.env.EVCRATE_BUILD_JOBS = '3';
        const resolved = resolveBuildJobs({ targetCount: 8 });
        assert.equal(resolved, 3);
      } finally {
        if (origEnv !== undefined) process.env.EVCRATE_BUILD_JOBS = origEnv;
        else delete process.env.EVCRATE_BUILD_JOBS;
      }
    });

    it('resolveBuildJobs caps jobs by targetCount', () => {
      const resolved = resolveBuildJobs({ explicitJobs: 8, targetCount: 1 });
      assert.equal(resolved, 1);
    });

    it('resolveBuildJobs defaults to bounded concurrency (<= 2) when unspecified', () => {
      const origEnv = process.env.EVCRATE_BUILD_JOBS;
      try {
        delete process.env.EVCRATE_BUILD_JOBS;
        const resolved = resolveBuildJobs({ targetCount: 8 });
        assert.ok(resolved >= 1 && resolved <= 2);
      } finally {
        if (origEnv !== undefined) process.env.EVCRATE_BUILD_JOBS = origEnv;
      }
    });
  });

  describe('Input snapshot lifecycle and freshness verification', () => {
    it('snapshots canonical AGENTS independently of generated root instructions', () => {
      const fixture = makeTempDir('evcrate-fixture-snapshot-');
      try {
        for (const item of ['.evcrate', 'dist', 'package.json']) {
          cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
        }
        const source = join(fixture, '.evcrate', 'source');
        const canonical = join(source, '.claude', 'AGENTS.md');
        const generated = join(source, 'AGENTS.md');
        writeFileSync(generated, '# Generated Codex output, not authoring input\n');
        const { shared, snapshotStage, snapshotHashes } = prepareInputSnapshot(fixture);
        try {
          assert.equal(snapshotHashes.agentsMdHash, hashFile(canonical));
          assert.equal(shared.agentsMdHash, hashFile(canonical));
          assert.deepEqual(readFileSync(join(shared.canonicalHarnessRoot, 'AGENTS.md')), readFileSync(canonical));
          assert.equal(existsSync(join(shared.sourceRoot, 'AGENTS.md')), false);

          writeFileSync(generated, '# Changed generated output\n');
          assert.doesNotThrow(() => assertLiveInputsUnchanged(fixture, snapshotHashes));
          rmSync(generated);
          assert.doesNotThrow(() => assertLiveInputsUnchanged(fixture, snapshotHashes));
        } finally {
          snapshotStage.cleanup();
        }
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('assertLiveInputsUnchanged aborts with PUBLICATION_FAILED if source files change', () => {
      const fixture = makeTempDir('evcrate-fixture-stale-');
      try {
        for (const item of ['.evcrate', 'dist', 'package.json']) {
          cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
        }

        const { snapshotStage, snapshotHashes } = prepareInputSnapshot(fixture);
        try {
          // Mutate the canonical graph input, not the generated Codex root document.
          writeFileSync(join(fixture, '.evcrate', 'source', '.claude', 'AGENTS.md'), 'mutated content\n');

          assert.throws(
            () => assertLiveInputsUnchanged(fixture, snapshotHashes),
            (err) => err?.code === 'PUBLICATION_FAILED'
          );
        } finally {
          snapshotStage.cleanup();
        }
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    for (const jobs of [1, 2]) {
      it(`rebuilds twice without promoting over canonical AGENTS with jobs=${jobs}`, async () => {
        const fixture = makeTempDir('evcrate-authority-rebuild-');
        try {
          for (const item of ['.evcrate', 'dist', 'package.json']) {
            cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
          }
          const source = join(fixture, '.evcrate', 'source');
          const canonicalRoot = join(source, '.claude');
          const canonical = join(canonicalRoot, 'AGENTS.md');
          const original = readFileSync(canonical);
          const canonicalHash = treeHash(canonicalRoot);
          const first = await runLocalBuild(fixture, ['claude', 'codex'], { jobs });
          const generatedCodex = readFileSync(join(source, 'AGENTS.md'));
          assert.equal(first.manifest.source_hashes['AGENTS.md'], hashFile(canonical));
          assert.equal(first.outputPaths['.claude'], join(source, '.claude-projection'));
          assert.deepEqual(readFileSync(join(first.outputPaths['.claude'], 'rules', 'AGENTS.md')), original);
          assert.equal(existsSync(join(first.outputPaths['.claude'], 'AGENTS.md')), false);
          assert.equal(treeHash(canonicalRoot), canonicalHash);

          // A generated file changed after capture is output to replace, not source drift.
          const pending = runLocalBuild(fixture, ['claude', 'codex'], { jobs });
          writeFileSync(join(source, 'AGENTS.md'), '# Untrusted generated output mutation\n');
          const second = await pending;
          assert.equal(second.manifestDigest, first.manifestDigest);
          assert.deepEqual(readFileSync(canonical), original);
          assert.equal(treeHash(canonicalRoot), canonicalHash);
          assert.deepEqual(readFileSync(join(source, 'AGENTS.md')), generatedCodex);
          const options = {
            packageRoot: fixture, canonicalSourceRoot: canonicalRoot,
            controllerRoot: join(source, '.evcrate', 'bin'),
            targetRegistryPath: join(fixture, '.evcrate', 'targets', 'manifest.json'),
            selectedTargets: ['claude', 'codex']
          };
          assert.equal(resolveCurrentBuild(options).manifestDigest, second.manifestDigest);
          writeFileSync(canonical, '# AGENTS.md\nNew authoring input\n');
          assert.throws(() => resolveCurrentBuild(options), { code: 'PUBLICATION_FAILED' });
        } finally {
          rmSync(fixture, { recursive: true, force: true });
        }
      });
    }
  });

  describe('Parity and concurrency execution', () => {
    it('runAllManifestsBuild produces identical 9 manifests with jobs=1 (serial) vs jobs=2 (parallel)', async () => {
      const fixtureSerial = makeTempDir('evcrate-serial-');
      const fixtureParallel = makeTempDir('evcrate-parallel-');

      try {
        for (const item of ['.evcrate', 'dist', 'package.json']) {
          cpSync(join(packageRoot, item), join(fixtureSerial, item), { recursive: true });
          cpSync(join(packageRoot, item), join(fixtureParallel, item), { recursive: true });
        }

        // 1. Run serial build (jobs=1)
        const serialResult = await runAllManifestsBuild(fixtureSerial, { jobs: 1 });
        assert.equal(serialResult.allManifestPaths.length, PERSISTED_TARGETS.length + 1);
        assert.equal(serialResult.targetBuilds.size, PERSISTED_TARGETS.length);

        // 2. Run parallel build (jobs=2)
        const parallelResult = await runAllManifestsBuild(fixtureParallel, { jobs: 2 });
        assert.equal(parallelResult.allManifestPaths.length, PERSISTED_TARGETS.length + 1);
        assert.equal(parallelResult.targetBuilds.size, PERSISTED_TARGETS.length);

        // 3. Verify aggregate and every target manifest are byte-for-byte identical
        const manifestNames = [
          'build-manifest.json',
          ...PERSISTED_TARGETS.map((t) => `build-manifest-${t}.json`)
        ];

        for (const name of manifestNames) {
          const serialPath = join(fixtureSerial, '.evcrate', name);
          const parallelPath = join(fixtureParallel, '.evcrate', name);

          assert.ok(existsSync(serialPath), `Serial manifest ${name} must exist`);
          assert.ok(existsSync(parallelPath), `Parallel manifest ${name} must exist`);

          const serialBytes = readFileSync(serialPath);
          const parallelBytes = readFileSync(parallelPath);

          assert.equal(
            serialBytes.length,
            parallelBytes.length,
            `Byte length mismatch for ${name}: serial=${serialBytes.length} parallel=${parallelBytes.length}`
          );
          assert.deepEqual(
            serialBytes,
            parallelBytes,
            `Byte content mismatch for ${name}`
          );
        }

        // 4. Verify each target build manifest home_policy matches
        for (const target of PERSISTED_TARGETS) {
          const serialBuild = serialResult.targetBuilds.get(target);
          const parallelBuild = parallelResult.targetBuilds.get(target);

          assert.ok(serialBuild);
          assert.ok(parallelBuild);
          assert.deepEqual(serialBuild.manifest.home_policy, parallelBuild.manifest.home_policy);
        }
      } finally {
        rmSync(fixtureSerial, { recursive: true, force: true });
        rmSync(fixtureParallel, { recursive: true, force: true });
      }
    });

    it('runLocalBuild with jobs=4 matches jobs=1 byte-for-byte for target subset', async () => {
      const fixtureSerial = makeTempDir('evcrate-serial-p4-');
      const fixtureParallel4 = makeTempDir('evcrate-parallel-p4-');

      try {
        for (const item of ['.evcrate', 'dist', 'package.json']) {
          cpSync(join(packageRoot, item), join(fixtureSerial, item), { recursive: true });
          cpSync(join(packageRoot, item), join(fixtureParallel4, item), { recursive: true });
        }

        const serialResult = await runLocalBuild(fixtureSerial, ['omp', 'codex'], { jobs: 1 });
        const parallel4Result = await runLocalBuild(fixtureParallel4, ['omp', 'codex'], { jobs: 4 });

        assert.equal(serialResult.selectedManifests.length, 2);
        assert.equal(parallel4Result.selectedManifests.length, 2);
        assert.equal(serialResult.manifestDigest, parallel4Result.manifestDigest);
      } finally {
        rmSync(fixtureSerial, { recursive: true, force: true });
        rmSync(fixtureParallel4, { recursive: true, force: true });
      }
    });
  });

  describe('Error handling and cancellation in worker pool', () => {
    it('worker failure halts execution and cleans up without modifying baseline outputs', async () => {
      const fixture = makeTempDir('evcrate-fixture-fail-');
      try {
        for (const item of ['.evcrate', 'dist', 'package.json']) {
          cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
        }
        rmSync(join(fixture, '.evcrate', 'build-manifest.json'), { force: true });

        await runLocalBuild(fixture, ['omp'], { jobs: 1 });
        const ompPath = join(fixture, '.evcrate', 'build-manifest-omp.json');
        assert.ok(existsSync(ompPath));
        const priorBytes = readFileSync(ompPath);

        // Corrupt an adapter file in source to trigger validation failure
        const fakeWorkerScript = join(fixture, 'fake-failing-worker.js');
        writeFileSync(
          fakeWorkerScript,
          `
          process.on('message', () => {
            process.send({
              type: 'TARGET_FAILURE',
              target: 'claude',
              errorCode: 'VALIDATION_INVALID',
              message: 'Intentional synthetic failure'
            });
            process.exit(1);
          });
          `
        );

        await assert.rejects(
          async () => runLocalBuild(fixture, ['omp', 'codex'], { jobs: 2, workerScriptPath: fakeWorkerScript }),
          (err) => err?.code === 'VALIDATION_INVALID'
        );

        // Baseline must remain completely unchanged
        const postBytes = readFileSync(ompPath);
        assert.deepEqual(priorBytes, postBytes, 'Prior manifest must remain unchanged after worker failure');

        // Aggregate manifest was never written
        assert.equal(existsSync(join(fixture, '.evcrate', 'build-manifest.json')), false);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('worker pool dispatch never spawns more than configured jobs concurrently', async () => {
      const fixture = makeTempDir('evcrate-concurrency-check-');
      try {
        for (const item of ['.evcrate', 'dist', 'package.json']) {
          cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
        }

        const trackingFile = join(fixture, 'concurrency.log');
        writeFileSync(trackingFile, '0\n0\n'); // [currentActive, maxActive]

        // Custom worker script that tracks in-flight concurrency with 50ms hold
        const trackingWorkerScript = join(fixture, 'tracking-worker.js');
        writeFileSync(
          trackingWorkerScript,
          `
          const fs = require('fs');
          process.on('message', async (msg) => {
            if (msg.type === 'BUILD_TARGET') {
              const trackingPath = ${JSON.stringify(trackingFile)};
              const lines = fs.readFileSync(trackingPath, 'utf8').trim().split('\\n');
              let current = parseInt(lines[0], 10) + 1;
              let max = Math.max(parseInt(lines[1], 10), current);
              fs.writeFileSync(trackingPath, current + '\\n' + max + '\\n');

              // Hold for 50ms to verify overlap without exceeding limit
              await new Promise(r => setTimeout(r, 50));

              const afterLines = fs.readFileSync(trackingPath, 'utf8').trim().split('\\n');
              current = parseInt(afterLines[0], 10) - 1;
              fs.writeFileSync(trackingPath, current + '\\n' + max + '\\n');

              // Send synthetic success
              process.send({
                type: 'TARGET_FAILURE',
                target: msg.target,
                errorCode: 'VALIDATION_INVALID',
                message: 'Synthetic tracking exit'
              });
              process.exit(1);
            }
          });
          `
        );

        await assert.rejects(
          async () => runLocalBuild(fixture, ['omp', 'codex', 'claude', 'antigravity'], {
            jobs: 2,
            workerScriptPath: trackingWorkerScript
          })
        );

        const finalLines = readFileSync(trackingFile, 'utf8').trim().split('\n');
        const maxObserved = parseInt(finalLines[1], 10);
        assert.ok(maxObserved <= 2, `Max concurrent workers (${maxObserved}) must not exceed jobs=2`);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('child worker stdout producing >64KB drains cleanly without deadlocking', async () => {
      const fixture = makeTempDir('evcrate-stdout-drain-');
      try {
        for (const item of ['.evcrate', 'dist', 'package.json']) {
          cpSync(join(packageRoot, item), join(fixture, item), { recursive: true });
        }

        const largeOutputWorker = join(fixture, 'large-stdout-worker.js');
        writeFileSync(
          largeOutputWorker,
          `
          process.on('message', (msg) => {
            if (msg.type === 'BUILD_TARGET') {
              // Write >64KB to stdout
              const chunk = 'X'.repeat(4096) + '\\n';
              for (let i = 0; i < 20; i++) {
                process.stdout.write(chunk);
              }
              process.send({
                type: 'TARGET_FAILURE',
                target: msg.target,
                errorCode: 'VALIDATION_INVALID',
                message: 'Drained stdout successfully'
              });
              process.exit(1);
            }
          });
          `
        );

        await assert.rejects(
          async () => runLocalBuild(fixture, ['omp', 'codex'], { jobs: 2, workerScriptPath: largeOutputWorker }),
          (err) => err?.code === 'VALIDATION_INVALID'
        );
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  });
});
