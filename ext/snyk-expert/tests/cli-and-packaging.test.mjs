import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ASSET_INVENTORY } from '../lib/install.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(PACKAGE_ROOT, 'bin', 'install.js');

describe('Snyk Expert Installer - CLI & Packaging', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });


  test('--dry-run writes no project resources', () => {
    execFileSync('node', [CLI_PATH, '--target', tmpDir, '--dry-run']);
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('full CLI install creates the common resource tree', () => {
    execFileSync('node', [CLI_PATH, '--target', tmpDir]);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude')));
    for (const rel of ASSET_INVENTORY) {
      assert.ok(fs.existsSync(path.join(tmpDir, '.agents', rel)));
    }
  });

  test('CLI rejects --yes without --force', () => {
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', tmpDir, '--yes'], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        return true;
      }
    );
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('CLI fails on collisions without --force', () => {
    execFileSync('node', [CLI_PATH, '--target', tmpDir]);
    fs.writeFileSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md'), 'MODIFIED');

    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', tmpDir], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        return true;
      }
    );
    assert.equal(fs.readFileSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md'), 'utf8'), 'MODIFIED');
  });

  test('CLI succeeds on collisions with --force --yes', () => {
    execFileSync('node', [CLI_PATH, '--target', tmpDir]);
    fs.writeFileSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md'), 'MODIFIED');

    execFileSync('node', [CLI_PATH, '--target', tmpDir, '--force', '--yes']);
    const srcAgent = path.join(PACKAGE_ROOT, '.agents', 'agents', 'snyk-expert.md');
    const destAgent = path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md');
    assert.ok(fs.readFileSync(destAgent).equals(fs.readFileSync(srcAgent)));
  });

  test('npm pack includes all required assets and excludes test files', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8'
    });
    const parsed = JSON.parse(raw);
    const pkgInfo = parsed['@evcrate/snyk-expert'] || parsed[0];
    const packedPaths = pkgInfo.files.map(f => f.path);

    for (const asset of ASSET_INVENTORY) {
      assert.ok(
        packedPaths.includes(`.agents/${asset}`),
        `Missing ${asset} in npm pack files`
      );
    }
    assert.ok(packedPaths.includes('bin/install.js'));
    assert.ok(packedPaths.includes('docs/usage.md'));
    assert.ok(!packedPaths.some(p => p.startsWith('.claude/')));
    assert.ok(!packedPaths.some(p => p.startsWith('tests/')));
  });
});
