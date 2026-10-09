import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url)).replace(/[/\\]+$/u, '');
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

function npmJson(args, cwd) {
  const result = spawnSync('npm', [...args, '--json', '--ignore-scripts'], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, maxBuffer: 50 * 1024 * 1024, shell: true
  });
  assert.equal(result.status, 0, result.stderr);
  const jsonIndex = result.stdout.search(/[[{]/);
  const parsed = JSON.parse(result.stdout.slice(jsonIndex).trim());
  return Array.isArray(parsed) ? parsed : Object.values(parsed);
}

function packPackage(destination) {
  const output = npmJson(['pack', '--pack-destination', destination], packageRoot);
  return join(destination, output[0].filename);
}

function installPackage(tarball, root) {
  const result = spawnSync('npm', [
    'install', '--prefix', root, '--no-audit', '--no-fund', '--ignore-scripts', tarball
  ], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, maxBuffer: 50 * 1024 * 1024, shell: true
  });
  assert.equal(result.status, 0, result.stderr);
}

test('package metadata includes the CLI, declarations, and required runtime assets', { timeout: 300_000 }, () => {
  const output = npmJson(['pack', '--dry-run'], packageRoot);
  const files = output[0].files.map(({ path }) => path);
  for (const expected of [
    'dist/cli/evcrate.js', 'dist/index.js', 'dist/index.d.ts',
    '.evcrate/source/.evcrate/bin/evcrate-advisor', '.evcrate/targets/manifest.json'
  ]) assert.ok(files.includes(expected) || files.some((file) => file.startsWith(expected)), expected);
  assert.equal(files.some((f) => f.startsWith('distribution/') || f.startsWith('distribute.py')), false);
  assert.equal(files.some((f) => f.startsWith('plans/')), false, 'Packaged artifact must not contain plans/');
  assert.equal(packageMetadata.private, true, 'Package must be marked private: true');
  assert.equal(packageMetadata.publishConfig, undefined, 'Package must not declare publishConfig');
  assert.equal(packageMetadata.dependencies, undefined, 'Package must declare zero production dependencies');
});

test('importing the sealed package entrypoint has no process or output side effect', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./dist/index.js')"], {
    cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('installed tarball runs version and resolves distinct target contexts', { timeout: 300_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-package-smoke-'));
  const installRoot = join(root, 'install');
  const home = join(root, 'home');
  const state = join(root, 'state');
  mkdirSync(installRoot); mkdirSync(home); mkdirSync(state);
  const tarball = packPackage(root);
  installPackage(tarball, installRoot);

  const cliPath = join(installRoot, 'node_modules', '.bin', 'evcrate');
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : cliPath;
  const args = isWindows ? ['/d', '/s', '/c', `${cliPath}.cmd`, 'version', '--json'] : ['version', '--json'];
  const version = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000
  });
  if (version.status !== 0) {
    console.error('package-smoke version failed with:', { status: version.status, stderr: version.stderr, stdout: version.stdout });
  }
  assert.equal(version.status, 0, version.stderr);
  const versionResult = JSON.parse(version.stdout);
  assert.equal(versionResult.payload.version, packageMetadata.version);

  const contextScript = `
    const path = require('node:path');
    const { resolveInvocationContext } = require('evcrate');
    const packageRoot = path.dirname(path.dirname(require.resolve('evcrate')));
    const context = resolveInvocationContext({
      packageRoot, cwd: process.cwd(), home: ${JSON.stringify(home)},
      stateHome: ${JSON.stringify(state)}, targets: ['omp', 'copilot']
    });
    process.stdout.write(JSON.stringify({
      ids: context.selectedTargetIds,
      generated: context.generatedRoots,
      homes: context.homeBindings.map(({ homeRoot }) => homeRoot)
    }));
  `;
  const context = spawnSync(process.execPath, ['-e', contextScript], {
    cwd: installRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000
  });
  assert.equal(context.status, 0, context.stderr);
  const contextResult = JSON.parse(context.stdout);
  assert.deepEqual(contextResult.ids, ['copilot', 'omp']);
  assert.ok(contextResult.generated.some((value) => value.endsWith(`${sep}.evcrate${sep}source${sep}.copilot`) || value.endsWith('/.evcrate/source/.copilot')));
  assert.ok(contextResult.generated.some((value) => value.endsWith(`${sep}.evcrate${sep}source${sep}.omp`) || value.endsWith('/.evcrate/source/.omp')));
  assert.ok(contextResult.homes.some((value) => value.endsWith(`${sep}.copilot`) || value.endsWith('/.copilot')));
  assert.ok(contextResult.homes.some((value) => value.endsWith(`${sep}.omp`) || value.endsWith('/.omp')));
});
