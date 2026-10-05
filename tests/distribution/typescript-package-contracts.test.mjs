import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { makeTempDir, packageRoot, prepareFixtureWorkspace } from './parity-verification-helpers.mjs';
import { spawnNpmSync } from '../../scripts/release/npm-runner.cjs';

function fixture(t) {
  const root = makeTempDir('evcrate-package-contract-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  prepareFixtureWorkspace(root);
  return root;
}

test('F4: npm clean build repairs missing advisor runtime, brief, and controller inventory', (t) => {
  const root = fixture(t);
  for (const name of ['src', 'scripts', 'tsconfig.json', 'tsconfig.advisor-runtime.json']) {
    cpSync(join(packageRoot, name), join(root, name), { recursive: true });
  }
  symlinkSync(join(packageRoot, 'node_modules'), join(root, 'node_modules'), 'junction');
  const generated = join(root, '.evcrate/source/.evcrate/bin/lib/advisor/generated');
  const brief = join(root, '.evcrate/source/.evcrate/bin/lib/advisor/runtime-brief.generated.cjs');
  const inventory = join(root, 'src/manifests/controller-inventory.generated.ts');
  rmSync(generated, { recursive: true });
  rmSync(brief);
  rmSync(inventory);
  const result = spawnNpmSync(['run', 'build:clean'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const require = createRequire(join(root, 'package.json'));
  const runtime = require(join(generated, 'canonical-json.js'));
  assert.equal(runtime.canonicalJson({ z: 2, a: 1 }), '{"a":1,"z":2}');
  assert.equal(existsSync(brief), true);
  assert.equal(existsSync(inventory), true);
  require(join(root, 'dist/index.js')).controllerHashes(join(root, '.evcrate/source/.evcrate/bin'));
});

test('F8: committed aggregate resolves against target files reconstructed from the Git index', (t) => {
  const root = fixture(t);
  rmSync(join(root, '.evcrate/targets'), { recursive: true });
  const files = execFileSync('git', ['ls-files', '-z', '.evcrate/targets'], { cwd: packageRoot, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  for (const name of files) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    copyFileSync(join(packageRoot, name), join(root, name));
  }
  copyFileSync(join(root, '.evcrate/source/CLAUDE.md'), join(root, 'CLAUDE.md'));
  const require = createRequire(join(root, 'package.json'));
  const api = require(join(root, 'dist/index.js'));
  const manifestPath = join(root, '.evcrate/build-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(api.treeHash(join(root, '.evcrate/targets')), manifest.source_hashes['.evcrate/targets']);
  const verified = api.resolveCurrentBuild({
    packageRoot: root, canonicalSourceRoot: join(root, '.evcrate/source/.claude'),
    controllerRoot: join(root, '.evcrate/source/.evcrate/bin'),
    targetRegistryPath: join(root, '.evcrate/targets/manifest.json'), selectedTargets: [], mode: 'authoring'
  });
  assert.deepEqual(verified.manifest, manifest);
});
