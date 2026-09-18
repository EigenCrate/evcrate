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

test('AME-028: package.json has zero production dependencies and dev-only viewer deps', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined, 'Must have no production dependencies');
  assert.ok(pkg.devDependencies?.react, 'react must be devDependency');
  assert.ok(pkg.devDependencies?.['react-dom'], 'react-dom must be devDependency');
  assert.ok(pkg.devDependencies?.vite, 'vite must be devDependency');
  assert.ok(pkg.devDependencies?.['@playwright/test'], '@playwright/test must be devDependency');
});

test('AME-029: pack inventory includes built viewer and excludes sources, configs, maps', () => {
  const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  const match = packOutput.match(/^[{[]/m);
  const jsonIndex = match ? match.index : packOutput.search(/[[{]/);
  const parsed = JSON.parse(packOutput.slice(jsonIndex).trim());
  const [packMeta] = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const files = packMeta.files.map((f) => f.path);

  assert.ok(files.includes('viewer/dist/index.html'), 'viewer/dist/index.html must be packed');
  assert.ok(files.some((f) => f.startsWith('viewer/dist/assets/') && f.endsWith('.js')), 'Hashed JS must be packed');
  assert.ok(files.some((f) => f.startsWith('viewer/dist/assets/') && f.endsWith('.css')), 'Hashed CSS must be packed');

  assert.equal(files.some((f) => f.startsWith('viewer/src/')), false, 'viewer/src/ must be excluded');
  assert.equal(files.some((f) => f.startsWith('viewer/') && f.endsWith('.ts')), false, 'viewer configs must be excluded');
  assert.equal(files.some((f) => f.endsWith('.map')), false, 'Sourcemaps must be excluded');
  assert.equal(files.some((f) => f.startsWith('plans/')), false, 'plans/ must be excluded');
  assert.equal(files.some((f) => f.includes('node_modules')), false, 'node_modules must be excluded');
});

test('AME-031: viewer bundle size adheres to <=5 MiB total and <=2 MiB largest asset', () => {
  const distDir = path.join(projectRoot, 'viewer', 'dist');
  assert.ok(fs.existsSync(distDir), 'viewer/dist must exist before size check');

  let totalBytes = 0;
  let largestAssetBytes = 0;
  let largestAssetName = '';

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const size = fs.statSync(full).size;
        totalBytes += size;
        if (size > largestAssetBytes) {
          largestAssetBytes = size;
          largestAssetName = entry.name;
        }
      }
    }
  }

  walk(distDir);

  const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
  const MAX_ASSET_BYTES = 2 * 1024 * 1024;

  assert.ok(
    totalBytes <= MAX_TOTAL_BYTES,
    `Total viewer bytes (${totalBytes}) exceeds 5 MiB ceiling (${MAX_TOTAL_BYTES})`
  );
  assert.ok(
    largestAssetBytes <= MAX_ASSET_BYTES,
    `Largest asset ${largestAssetName} (${largestAssetBytes} bytes) exceeds 2 MiB (${MAX_ASSET_BYTES})`
  );
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

test('AME-027: viewer Vite config defines exact CSP, loopback bind, and no external URLs', async () => {
  const viteConfigPath = path.join(projectRoot, 'viewer', 'vite.config.ts');
  const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf8');

  const exactCSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  assert.ok(viteConfigContent.includes(exactCSP), 'Vite config must include exact CSP header');
  assert.ok(viteConfigContent.includes("host: '127.0.0.1'"), 'Preview host must be 127.0.0.1');
  assert.ok(viteConfigContent.includes('port: 4173'), 'Preview port must be 4173');
  assert.ok(viteConfigContent.includes('strictPort: true'), 'strictPort must be true');

  const indexHtml = fs.readFileSync(path.join(projectRoot, 'viewer', 'dist', 'index.html'), 'utf8');
  assert.equal(/https?:\/\//i.test(indexHtml), false, 'Built index.html must not contain external URLs');
});
