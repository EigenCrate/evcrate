import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  assertLegacyRootClean,
  runAllManifestsBuild,
  runLocalBuild
} from '../../dist/index.js';
import {
  makeTempDir,
  packageRoot,
  prepareFixtureWorkspace
} from './parity-verification-helpers.mjs';

describe('Phase 05: Platform & Lifecycle Contracts', () => {
  describe('Gate 3: Real Worker Lifecycle, Cancellation & Rollback Scenarios', () => {
    it('aborts cleanly and cleans up staging root when worker process crashes', async () => {
      const fixture = makeTempDir('evcrate-worker-crash-');
      try {
        prepareFixtureWorkspace(fixture);

        const ompPath = join(fixture, '.evcrate', 'build-manifest-omp.json');
        const priorBytes = readFileSync(ompPath);

        const crashingWorkerScript = join(fixture, 'crashing-worker.js');
        writeFileSync(
          crashingWorkerScript,
          `
          process.on('message', (msg) => {
            process.send({
              type: 'TARGET_FAILURE',
              target: msg.target || 'omp',
              errorCode: 'VALIDATION_INVALID',
              message: 'Intentional synthetic worker failure'
            });
            process.exit(1);
          });
          `
        );

        await assert.rejects(
          async () => runLocalBuild(fixture, ['omp', 'codex'], { jobs: 2, workerScriptPath: crashingWorkerScript }),
          (err) => err?.code === 'VALIDATION_INVALID' || err?.code === 'PUBLICATION_FAILED'
        );

        const postBytes = readFileSync(ompPath);
        assert.deepEqual(priorBytes, postBytes, 'Prior manifest must remain untouched after worker crash');

        const remainingStagingDirs = readdirSync(fixture).filter((name) => name.startsWith('.evcrate-build-'));
        assert.equal(remainingStagingDirs.length, 0, 'Staging directory must be cleaned up on worker crash');
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    for (const jobs of [1, 2]) {
      it(`rejects canonical AGENTS drift before journal or promotion with jobs=${jobs}`, async () => {
        const fixture = makeTempDir('evcrate-live-change-');
        try {
          prepareFixtureWorkspace(fixture);
          const source = join(fixture, '.evcrate', 'source');
          const canonical = join(source, '.claude', 'AGENTS.md');
          const manifest = join(fixture, '.evcrate', 'build-manifest.json');
          const priorManifest = readFileSync(manifest);
          const priorCodex = readFileSync(join(source, 'AGENTS.md'));
          const claudeRule = join(source, '.claude-projection', 'rules', 'AGENTS.md');
          const priorClaude = existsSync(claudeRule) ? readFileSync(claudeRule) : null;

          // Snapshot capture is synchronous; promotion resumes after the awaited staging result.
          const pending = runLocalBuild(fixture, ['claude', 'codex'], { jobs });
          writeFileSync(canonical, '# AGENTS.md\nConcurrent authored instructions\n');
          await assert.rejects(pending, { code: 'PUBLICATION_FAILED' });

          assert.equal(readFileSync(canonical, 'utf8'), '# AGENTS.md\nConcurrent authored instructions\n');
          assert.deepEqual(readFileSync(manifest), priorManifest);
          assert.deepEqual(readFileSync(join(source, 'AGENTS.md')), priorCodex);
          if (priorClaude === null) assert.equal(existsSync(claudeRule), false);
          else assert.deepEqual(readFileSync(claudeRule), priorClaude);
          assert.equal(existsSync(join(fixture, '.evcrate', '.evcrate-promotion-journal.json')), false);
          assert.deepEqual(readdirSync(fixture).filter((name) =>
            name.startsWith('.evcrate-build-') || name.startsWith('.evcrate-snapshot-') || name.startsWith('.evcrate-target-')
          ), []);
        } finally {
          rmSync(fixture, { recursive: true, force: true });
        }
      });
    }

    it('staging failure leaves prior workspace completely unmodified (transaction rollback)', async () => {
      const fixture = makeTempDir('evcrate-rollback-');
      try {
        prepareFixtureWorkspace(fixture);

        const ompManifestPath = join(fixture, '.evcrate', 'build-manifest-omp.json');
        const priorOmpBytes = readFileSync(ompManifestPath);

        mkdirSync(join(fixture, '.omp'), { recursive: true });

        await assert.rejects(
          async () => runAllManifestsBuild(fixture),
          (err) => err?.code === 'PATH_UNSAFE'
        );

        const postOmpBytes = readFileSync(ompManifestPath);
        assert.deepEqual(priorOmpBytes, postOmpBytes, 'Prior manifest must remain unchanged on pre-promotion failure');
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  });

  describe('Gate 4: TypeScript Compiler Output Recovery & Packaging Isolation', () => {
    it('detects missing emitted output and invalidates cache', async () => {
      const { resolveConfigOutputs, validateAndInvalidateCache } = await import('../../scripts/typescript-build-cache.mjs');
      const info = resolveConfigOutputs('tsconfig.json', packageRoot);
      assert.ok(info.expectedOutputs.length > 0);
      assert.ok(info.tsBuildInfoPath);

      // Healthy check
      const healthyStatus = validateAndInvalidateCache(info, packageRoot, { warn: () => {} });
      assert.equal(healthyStatus.invalidated, false);

      // Create synthetic info with missing output in a temp workspace
      const fakeInfo = {
        tsBuildInfoPath: join(packageRoot, '.cache', 'evcrate', 'fake.tsbuildinfo'),
        expectedOutputs: ['dist/nonexistent-missing-file-xyz.js']
      };
      mkdirSync(dirname(fakeInfo.tsBuildInfoPath), { recursive: true });
      writeFileSync(fakeInfo.tsBuildInfoPath, '{"version":"fake"}');
      try {
        const invalidStatus = validateAndInvalidateCache(fakeInfo, packageRoot, { warn: () => {} });
        assert.equal(invalidStatus.invalidated, true);
        assert.ok(invalidStatus.reason?.startsWith('missing_outputs_'));
      } finally {
        rmSync(fakeInfo.tsBuildInfoPath, { force: true });
      }
    });

  });

  describe('Gate 5: Platform Contracts & Path Containment', () => {
    it('assertLegacyRootClean enforces containment and rejects legacy root folders', () => {
      const fixture = makeTempDir('evcrate-legacy-clean-');
      try {
        assert.doesNotThrow(() => assertLegacyRootClean(fixture));

        mkdirSync(join(fixture, '.claude'), { recursive: true });
        assert.throws(
          () => assertLegacyRootClean(fixture),
          (err) => err?.code === 'PATH_UNSAFE'
        );
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('advisor controller files preserve executable bits on POSIX', () => {
      if (process.platform === 'win32') return;

      const advisorBin = join(packageRoot, '.evcrate', 'source', '.evcrate', 'bin', 'evcrate-advisor');
      assert.ok(existsSync(advisorBin), 'Advisor controller binary must exist on repository source tree');
      const mode = statSync(advisorBin).mode;
      assert.ok((mode & 0o111) !== 0, 'Advisor controller binary must have executable bit set');
    });
  });
});
