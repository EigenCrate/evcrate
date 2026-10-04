import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PUBLICATION_BINDING_ORDER, PERSISTED_TARGETS, resolveCurrentPublicationBuild,
  resolveInvocationContext, runLocalBuild, verifyBuild
} from '../../dist/index.js';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url)).replace(/[/\\]$/u, '');
let builtFixture;
function sourceDerivedPackage() {
  if (builtFixture !== undefined) return builtFixture;
  const root = mkdtempSync(join(tmpdir(), 'evcrate-parity-package-'));
  const fixturePackage = join(root, 'package');
  cpSync(join(packageRoot, '.evcrate'), join(fixturePackage, '.evcrate'), {
    recursive: true, dereference: true
  });
  cpSync(join(packageRoot, 'dist'), join(fixturePackage, 'dist'), {
    recursive: true, dereference: true
  });
  runLocalBuild(fixturePackage, PERSISTED_TARGETS);
  builtFixture = { root, fixturePackage };
  return builtFixture;
}
function sourceDerivedBuild(targets = []) {
  const { fixturePackage } = sourceDerivedPackage();
  const root = mkdtempSync(join(tmpdir(), 'evcrate-parity-session-'));
  const home = join(root, 'home');
  mkdirSync(home);
  const context = resolveInvocationContext({
    packageRoot: fixturePackage, cwd: fixturePackage, home, targets
  });
  return { root, context, build: resolveCurrentPublicationBuild(context) };
}
test.after(() => {
  if (builtFixture !== undefined) rmSync(builtFixture.root, { recursive: true, force: true });
});


test('all-target schema-2 build resolves with explicit publication policy parity', () => {
  const fixture = sourceDerivedBuild();
  try {
    const { build } = fixture;
    assert.deepEqual(build.selectedManifests.map(({ name }) => name), [
      'antigravity', 'claude', 'codex', 'copilot', 'gemini', 'omp', 'pi', 'vscode'
    ]);
    assert.equal(build.manifest.validation.complete, true);
    assert.deepEqual(build.manifest.home_policy.omp.publication_rules, ['omp-agent-prefix']);
    assert.deepEqual(build.manifest.home_policy.codex.publication_rules, ['codex-home-path-rewrite']);
    assert.deepEqual(build.manifest.home_policy.claude.publication_rules, ['claude-home-path-rewrite', 'claude-skill-root-exclusion']);
    assert.deepEqual([...PUBLICATION_BINDING_ORDER], [
      '.evcrate/bin', '.gemini', '.agents', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot', '.evcrate-vscode'
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('build verification rejects a stale source hash before publication planning', () => {
  const fixture = sourceDerivedBuild(['claude']);
  try {
    const { context, build } = fixture;
    const stale = { ...build.manifest.source_hashes, 'CLAUDE.md': '0'.repeat(64) };
    assert.throws(() => verifyBuild({
      manifestPath: build.manifestPath,
      manifest: build.manifest,
      outputRoots: build.outputPaths,
      controllerRoot: context.controllerRoot,
      sourceHashes: stale,
      adapterHashes: build.manifest.adapter_hashes
    }));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
