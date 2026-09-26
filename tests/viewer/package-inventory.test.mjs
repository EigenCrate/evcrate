import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, '..', '..');

const { validateRuntimeClosure } = require('../../scripts/release/runtime-closure.cjs');
const { ADVISOR_CONTROLLER_FILES } = require('../../dist/manifests/controller-inventory.generated.js');
const assetVerification = require('../../scripts/release/asset-verification.cjs');
const { execNpmSync } = require('../../scripts/release/npm-runner.cjs');

test('AME-028: package.json has zero production dependencies and dev-only viewer deps', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined, 'Must have no production dependencies');
  assert.ok(pkg.devDependencies?.react, 'react must be devDependency');
  assert.ok(pkg.devDependencies?.['react-dom'], 'react-dom must be devDependency');
  assert.ok(pkg.devDependencies?.vite, 'vite must be devDependency');
  assert.ok(pkg.devDependencies?.['@playwright/test'], '@playwright/test must be devDependency');
});

test('AME-029: pack inventory excludes standalone viewer and excludes sources, configs, maps', () => {
  const packOutput = execNpmSync(['pack', '--dry-run', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  const match = packOutput.match(/^[{[]/m);
  const jsonIndex = match ? match.index : packOutput.search(/[[{]/);
  const parsed = JSON.parse(packOutput.slice(jsonIndex).trim());
  const [packMeta] = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const files = packMeta.files.map((f) => f.path);

  // Assert built standalone viewer is excluded from root package
  assert.equal(files.some((f) => f.startsWith('viewer/dist/')), false, 'viewer/dist must be excluded from root package');
  assert.equal(files.some((f) => f.startsWith('viewer/src/')), false, 'viewer/src/ must be excluded');
  assert.equal(files.some((f) => f.startsWith('viewer/') && f.endsWith('.ts')), false, 'viewer configs must be excluded');
  assert.equal(files.some((f) => f.endsWith('.map')), false, 'Sourcemaps must be excluded');
  assert.equal(files.some((f) => f.startsWith('plans/')), false, 'plans/ must be excluded');
  assert.equal(files.some((f) => f.includes('node_modules')), false, 'node_modules must be excluded');
});

test('AME-031: plugin UI bundle size adheres to <=5 MiB total', () => {
  const pluginUiPath = path.join(projectRoot, 'plugin', 'ui', 'index.html');
  assert.ok(fs.existsSync(pluginUiPath), 'plugin/ui/index.html must exist before size check');
  const size = fs.statSync(pluginUiPath).size;
  assert.ok(size <= 5 * 1024 * 1024, `Plugin UI size must be <= 5 MiB, got ${size} bytes`);
});

test('AME-007: controller inventory is exactly 33 files with zero viewer or external edges', () => {
  assert.equal(ADVISOR_CONTROLLER_FILES.length, 33, 'Controller files count must be exactly 33');
  for (const file of ADVISOR_CONTROLLER_FILES) {
    assert.equal(file.includes('viewer'), false, `Controller file ${file} must not reference viewer`);
    assert.equal(file.includes('react'), false, `Controller file ${file} must not reference react`);
    assert.equal(file.includes('vite'), false, `Controller file ${file} must not reference vite`);
  }

  const closure = validateRuntimeClosure(projectRoot);
  assert.equal(closure.valid, true, 'Runtime closure must be valid with zero external packages');
  for (const mod of closure.visited) {
    assert.equal(mod.includes('viewer'), false, `Closure module ${mod} must not be viewer`);
  }
});

test('AME-030: verifyReleaseAssetSet accepts exact-7 assets and rejects synthetic viewer top-level', () => {
  const version = '2.1.0';
  const expectedNames = assetVerification.getExpectedReleaseAssetNames(version);
  assert.equal(expectedNames.length, 7, 'Expected exact seven release asset names');
  assert.equal(expectedNames.some((n) => n.includes('viewer')), false, 'Viewer must not be in release asset names');

  const tmp = fs.mkdtempSync(path.join(projectRoot, 'dist', 'release-test-'));
  try {
    for (const name of expectedNames) {
      fs.writeFileSync(path.join(tmp, name), 'dummy');
    }
    fs.writeFileSync(path.join(tmp, 'viewer.tar.gz'), 'unexpected');
    assert.throws(
      () => assetVerification.verifyReleaseAssetSet({ dir: tmp, version }),
      /Extra unexpected release asset entries found: viewer\.tar\.gz/u
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
