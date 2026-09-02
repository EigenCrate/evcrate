import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PUBLICATION_BINDING_ORDER, resolveCurrentBuild, resolveInvocationContext, verifyBuild
} from '../../dist/index.js';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');

test('all-target schema-2 build resolves with explicit publication policy parity', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-parity-home-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: [] });
    const build = resolveCurrentBuild({
      packageRoot: context.packageRoot,
      canonicalSourceRoot: context.canonicalSourceRoot,
      controllerRoot: context.controllerRoot,
      targetRegistryPath: context.registryPath,
      selectedTargets: context.selectedTargetIds
    });
    assert.deepEqual(build.selectedManifests.map(({ name }) => name), [
      'antigravity', 'claude', 'codex', 'copilot', 'gemini', 'omp', 'pi'
    ]);
    assert.equal(build.manifest.validation.complete, true);
    assert.deepEqual(build.manifest.home_policy.omp.publication_rules, ['omp-agent-prefix']);
    assert.deepEqual(build.manifest.home_policy.codex.publication_rules, ['codex-home-path-rewrite']);
    assert.deepEqual(build.manifest.home_policy.claude.publication_rules, ['claude-skill-root-exclusion']);
    assert.deepEqual([...PUBLICATION_BINDING_ORDER], [
      '.evcrate/bin', '.gemini', '.agents', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot'
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('build verification rejects a stale source hash before publication planning', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-stale-home-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['claude'] });
    const build = resolveCurrentBuild({
      packageRoot: context.packageRoot,
      canonicalSourceRoot: context.canonicalSourceRoot,
      controllerRoot: context.controllerRoot,
      targetRegistryPath: context.registryPath,
      selectedTargets: context.selectedTargetIds
    });
    const stale = { ...build.manifest.source_hashes, 'CLAUDE.md': '0'.repeat(64) };
    assert.throws(() => verifyBuild({
      manifestPath: build.manifestPath,
      outputRoots: build.outputPaths,
      controllerRoot: context.controllerRoot,
      sourceHashes: stale,
      adapterHashes: build.manifest.adapter_hashes
    }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
