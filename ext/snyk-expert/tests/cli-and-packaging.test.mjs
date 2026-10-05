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

  test('--help displays usage and options', () => {
    const out = execFileSync('node', [CLI_PATH, '--help'], { encoding: 'utf8' });
    assert.ok(out.includes('Usage:'));
    assert.ok(out.includes('--target'));
    assert.ok(out.includes('--force'));
    assert.ok(out.includes('--dry-run'));
  });

  test('--version displays version', () => {
    const out = execFileSync('node', [CLI_PATH, '--version'], { encoding: 'utf8' });
    assert.ok(out.trim().match(/^\d+\.\d+\.\d+/));
  });

  test('--dry-run via CLI previews changes without writes', () => {
    const out = execFileSync('node', [CLI_PATH, '--target', tmpDir, '--dry-run'], { encoding: 'utf8' });
    assert.ok(out.includes('Dry run preview'));
    assert.ok(out.includes('8 to add'));
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude')));
  });

  test('full CLI install succeeds and prints next steps', () => {
    const out = execFileSync('node', [CLI_PATH, '--target', tmpDir], { encoding: 'utf8' });
    assert.ok(out.includes('Installation complete!'));
    assert.ok(out.includes('delegate to snyk-expert'));

    for (const rel of ASSET_INVENTORY) {
      assert.ok(fs.existsSync(path.join(tmpDir, '.claude', rel)));
    }
  });

  test('CLI rejects --yes without --force', () => {
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', tmpDir, '--yes'], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        assert.ok(err.stderr.toString().includes('Option --yes cannot be used without --force'));
        return true;
      }
    );
  });

  test('CLI fails on collisions without --force', () => {
    execFileSync('node', [CLI_PATH, '--target', tmpDir]);
    fs.writeFileSync(path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md'), 'MODIFIED');

    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', tmpDir], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        assert.ok(err.stderr.toString().includes('Destination files already exist and differ'));
        return true;
      }
    );
  });

  test('CLI succeeds on collisions with --force --yes', () => {
    execFileSync('node', [CLI_PATH, '--target', tmpDir]);
    fs.writeFileSync(path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md'), 'MODIFIED');

    const out = execFileSync('node', [CLI_PATH, '--target', tmpDir, '--force', '--yes'], { encoding: 'utf8' });
    assert.ok(out.includes('Installation complete!'));
    const srcAgent = path.join(PACKAGE_ROOT, '.claude', 'agents', 'snyk-expert.md');
    const destAgent = path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md');
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
        packedPaths.includes(`.claude/${asset}`),
        `Missing ${asset} in npm pack files`
      );
    }
    assert.ok(packedPaths.includes('bin/install.js'));
    assert.ok(packedPaths.includes('README.md'));
    assert.ok(!packedPaths.some(p => p.startsWith('tests/')));
  });
});
