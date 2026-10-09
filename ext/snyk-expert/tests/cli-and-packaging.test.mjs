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

  test('CLI emits legacy migration warning when .claude installation is detected', () => {
    const legacyAgent = path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(legacyAgent), { recursive: true });
    fs.writeFileSync(legacyAgent, 'LEGACY AGENT');

    const out = execFileSync('node', [CLI_PATH, '--target', tmpDir], { encoding: 'utf8' });
    assert.ok(out.includes('Legacy .claude/ installation detected'));
    assert.ok(out.includes(path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md')));
    assert.ok(!out.includes('rm -rf'));
    assert.equal(fs.readFileSync(legacyAgent, 'utf8'), 'LEGACY AGENT');
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md')));
  });

  test('CLI install succeeds without error when .claude is a regular file', () => {
    fs.writeFileSync(path.join(tmpDir, '.claude'), 'regular file');
    const out = execFileSync('node', [CLI_PATH, '--target', tmpDir], { encoding: 'utf8' });
    assert.ok(out.includes('Installation complete!'));
    assert.ok(!out.includes('Legacy .claude/ installation detected'));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md')));
  });
  test('CLI dry-run emits legacy migration warning when .claude installation is detected', () => {
    const legacyAgent = path.join(tmpDir, '.claude', 'agents', 'snyk-expert.md');
    fs.mkdirSync(path.dirname(legacyAgent), { recursive: true });
    fs.writeFileSync(legacyAgent, 'LEGACY AGENT');

    const out = execFileSync('node', [CLI_PATH, '--target', tmpDir, '--dry-run'], { encoding: 'utf8' });
    assert.ok(out.includes('Legacy .claude/ installation detected'));
    assert.ok(out.includes('.claude/agents/snyk-expert.md'));
    assert.equal(fs.readFileSync(legacyAgent, 'utf8'), 'LEGACY AGENT');
    assert.deepEqual(fs.readdirSync(tmpDir), ['.claude']);
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
