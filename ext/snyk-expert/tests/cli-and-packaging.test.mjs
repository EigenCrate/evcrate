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
    assert.ok(out.includes('--directory'));
    assert.ok(out.includes('--force'));
    assert.ok(out.includes('--dry-run'));
  });

  test('--version displays version', () => {
    const out = execFileSync('node', [CLI_PATH, '--version'], { encoding: 'utf8' });
    assert.ok(out.trim().match(/^\d+\.\d+\.\d+/));
  });

  test('CLI rejects missing target option', () => {
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--directory', tmpDir], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        const stderr = err.stderr ? err.stderr.toString() : '';
        assert.ok(stderr.includes('Option --target is required. Choose agents.'));
        return true;
      }
    );
  });

  test('CLI rejects unsupported target option', () => {
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', 'vscode', '--directory', tmpDir], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        const stderr = err.stderr ? err.stderr.toString() : '';
        assert.ok(stderr.includes("Unsupported target or missing target 'vscode'. Choose agents."));
        return true;
      }
    );
  });

  test('CLI rejects missing directory option for agents target', () => {
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', 'agents'], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        const stderr = err.stderr ? err.stderr.toString() : '';
        assert.ok(stderr.includes('The agents target requires --directory <project-root>.'));
        return true;
      }
    );
  });

  test('--dry-run writes no project resources', () => {
    execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir, '--dry-run']);
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('ASSET_INVENTORY contains unique entries and explicitly includes cmd-snyk-remediate', () => {
    const seen = new Set();
    for (const rel of ASSET_INVENTORY) {
      assert.ok(!seen.has(rel), `Duplicate inventory entry detected: ${rel}`);
      seen.add(rel);
    }
    assert.ok(seen.has('skills/cmd-snyk-remediate/SKILL.md'),
      'ASSET_INVENTORY must include skills/cmd-snyk-remediate/SKILL.md');
  });

  test('full CLI install creates the common resource tree with byte equality', () => {
    execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir]);
    for (const rel of ASSET_INVENTORY) {
      const installedPath = path.join(tmpDir, '.agents', rel);
      const sourcePath = path.join(PACKAGE_ROOT, '.agents', rel);
      assert.ok(fs.existsSync(installedPath), `Missing installed asset: ${rel}`);
      assert.ok(
        fs.readFileSync(installedPath).equals(fs.readFileSync(sourcePath)),
        `Installed asset content does not match source: ${rel}`
      );
    }
  });

  test('CLI rejects --yes without --force', () => {
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir, '--yes'], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        return true;
      }
    );
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('CLI fails on collisions without --force', () => {
    execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir]);
    fs.writeFileSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md'), 'MODIFIED');

    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        return true;
      }
    );
    assert.equal(fs.readFileSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md'), 'utf8'), 'MODIFIED');
  });

  test('CLI collision regression for new cmd-snyk-remediate preserves unrelated sentinel', () => {
    const commandPath = path.join(tmpDir, '.agents', 'skills', 'cmd-snyk-remediate', 'SKILL.md');
    const sentinelPath = path.join(tmpDir, '.agents', 'unrelated-sentinel.txt');
    fs.mkdirSync(path.dirname(commandPath), { recursive: true });
    fs.writeFileSync(commandPath, 'DIFFERING PRE-EXISTING COMMAND CONTENT');
    fs.writeFileSync(sentinelPath, 'SENTINEL CONTENT');

    // Without force: refusal, both preserved, no other assets written
    assert.throws(
      () => execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir], { stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        return true;
      }
    );
    assert.equal(fs.readFileSync(commandPath, 'utf8'), 'DIFFERING PRE-EXISTING COMMAND CONTENT');
    assert.equal(fs.readFileSync(sentinelPath, 'utf8'), 'SENTINEL CONTENT');
    for (const rel of ASSET_INVENTORY) {
      if (rel !== 'skills/cmd-snyk-remediate/SKILL.md') {
        assert.ok(!fs.existsSync(path.join(tmpDir, '.agents', rel)),
          `Unintended asset written during collision refusal: ${rel}`);
      }
    }
    // With --force --yes: authorized replacement of colliding asset, sentinel preserved
    execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir, '--force', '--yes']);
    const sourceCommand = path.join(PACKAGE_ROOT, '.agents', 'skills', 'cmd-snyk-remediate', 'SKILL.md');
    assert.ok(fs.readFileSync(commandPath).equals(fs.readFileSync(sourceCommand)));
    assert.equal(fs.readFileSync(sentinelPath, 'utf8'), 'SENTINEL CONTENT');
  });

  test('CLI succeeds on collisions with --force --yes', () => {
    execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir]);
    fs.writeFileSync(path.join(tmpDir, '.agents', 'agents', 'snyk-expert.md'), 'MODIFIED');

    execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir, '--force', '--yes']);
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
    assert.ok(!packedPaths.some(p => p.startsWith('tests/')));
  });

  test('verifies bundled skill references resolve within the installed package', () => {
    execFileSync('node', [CLI_PATH, '--target', 'agents', '--directory', tmpDir]);

    // Generic reference smoke for snyk-fix
    const installedFixSkill = path.join(tmpDir, '.agents', 'skills', 'snyk-fix', 'SKILL.md');
    assert.ok(fs.existsSync(installedFixSkill));
    const fixRefDir = path.join(tmpDir, '.agents', 'skills', 'snyk-fix');
    assert.ok(fs.existsSync(path.join(fixRefDir, 'references', 'node-typescript-remediation.md')));
    assert.ok(fs.existsSync(path.join(fixRefDir, 'references', 'maven-spring-remediation.md')));
    assert.ok(fs.existsSync(path.join(fixRefDir, 'references', 'finding-and-owner-contract.md')));
    assert.ok(fs.existsSync(path.join(fixRefDir, 'references', 'verification-and-results.md')));

    // Reference resolution smoke for new cmd-snyk-remediate coordinator
    const installedCmdSkill = path.join(tmpDir, '.agents', 'skills', 'cmd-snyk-remediate', 'SKILL.md');
    assert.ok(fs.existsSync(installedCmdSkill));
    const cmdDir = path.join(tmpDir, '.agents', 'skills', 'cmd-snyk-remediate');

    // Specialist actor
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../../agents/snyk-expert.md')));
    // Sibling remediation skills
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../snyk-fix/SKILL.md')));
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../snyk-fix/references/finding-and-owner-contract.md')));
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../snyk-fix/references/verification-and-results.md')));
    // Compatibility review skill
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../dependency-upgrade-review/SKILL.md')));
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../dependency-upgrade-review/references/compatibility-evidence.md')));
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../dependency-upgrade-review/references/review-output.md')));
    // Scanner CLI skill
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../snyk-cli/SKILL.md')));
    assert.ok(fs.existsSync(path.resolve(cmdDir, '../snyk-cli/references/cli-workflow.md')));
  });

  test('pack, extract, and invoke from unrelated cwd installs and resolves cleanly', () => {
    const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snyk-pack-'));
    try {
      // Pack into packDir
      const packStdout = execFileSync('npm', ['pack', '--pack-destination', packDir], {
        cwd: PACKAGE_ROOT,
        encoding: 'utf8'
      }).trim();
      const tarballName = packStdout.split('\n').pop().trim();
      const tarballPath = path.join(packDir, tarballName);
      assert.ok(fs.existsSync(tarballPath), `Expected tarball at ${tarballPath}`);

      // Extract tarball in packDir
      execFileSync('tar', ['-xzf', tarballPath, '-C', packDir]);
      const extractedPackageDir = path.join(packDir, 'package');
      const extractedCli = path.join(extractedPackageDir, 'bin', 'install.js');
      assert.ok(fs.existsSync(extractedCli), `Extracted CLI missing at ${extractedCli}`);

      // Invoke from completely unrelated cwd (os.tmpdir()) into clean tmpDir
      execFileSync('node', [extractedCli, '--target', 'agents', '--directory', tmpDir], {
        cwd: os.tmpdir()
      });

      // Verify all assets exist and match source
      for (const rel of ASSET_INVENTORY) {
        const destFile = path.join(tmpDir, '.agents', rel);
        const srcFile = path.join(PACKAGE_ROOT, '.agents', rel);
        assert.ok(fs.existsSync(destFile), `Missing extracted-installed asset: ${rel}`);
        assert.ok(fs.readFileSync(destFile).equals(fs.readFileSync(srcFile)),
          `Extracted-installed content mismatch: ${rel}`);
      }

      // Verify command skill resolves specialist and sibling links from bundle root
      const cmdDir = path.join(tmpDir, '.agents', 'skills', 'cmd-snyk-remediate');
      assert.ok(fs.existsSync(path.resolve(cmdDir, '../../agents/snyk-expert.md')),
        'cmd-snyk-remediate must resolve specialist actor');
      assert.ok(fs.existsSync(path.resolve(cmdDir, '../snyk-fix/SKILL.md')),
        'cmd-snyk-remediate must resolve snyk-fix skill');
    } finally {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  });
});
