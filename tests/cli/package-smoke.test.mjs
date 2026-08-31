import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');

test('package metadata includes the CLI, declarations, and compatibility assets', () => {
  const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.equal(packed.status, 0, packed.stderr);
  const output = JSON.parse(packed.stdout.slice(packed.stdout.indexOf('[')).trim());
  const files = output[0].files.map(({ path }) => path);
  for (const expected of [
    'dist/cli/evcrate.js', 'dist/index.js', 'dist/index.d.ts',
    '.evcrate/source/.evcrate/bin/evcrate-advisor', '.evcrate/targets/manifest.json',
    'distribution/', 'distribute.py'
  ]) assert.ok(files.includes(expected) || files.some((file) => file.startsWith(expected)), expected);
});

test('importing the public package has no process or output side effect', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./dist/index.js')"], {
    cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
