import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
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
