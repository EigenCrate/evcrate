import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment, setupInstalledClosure } from './installed-helpers-fixture-utils.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Installed Node helpers runtime closure - packaging and installation', () => {
  let tempBase;
  let closure;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-closure-pack-'));
    closure = setupInstalledClosure(packageRoot, tempBase);
  });

  afterEach(() => {
    if (tempBase && fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  test('candidate tarball contains exact 27 assets, zero .ps1 helpers, and hashes match', () => {
    assert.equal(closure.candidateDigestSha256.length, 64);
    assert.equal(closure.candidateDigestSha512.length, 128);

    const files = closure.tarballEntries.map((e) => e.replace(/^package\//, ''));
    assert.equal(files.length, 27, `Tarball must contain exactly 27 files, got ${files.length}`);

    assert.ok(!files.includes('scripts/fetch-sonar-issues.ps1'), 'fetch-sonar-issues.ps1 absent from tarball');
    assert.ok(!files.includes('scripts/calculate-jacoco-coverage.ps1'), 'calculate-jacoco-coverage.ps1 absent from tarball');

    assert.ok(files.includes('scripts/convert-sonar-report.mjs'));
    assert.ok(files.includes('scripts/fetch-sonar-issues.mjs'));
    assert.ok(files.includes('scripts/calculate-jacoco-coverage.mjs'));
    assert.ok(files.includes('scripts/vendor/sax.cjs'));
    assert.ok(files.includes('scripts/vendor/sax.LICENSE'));
    assert.ok(files.includes('scripts/vendor/sax-provenance.json'));

    const unpackedPackage = path.join(closure.unpackedDir, 'package');
    assert.ok(fs.existsSync(unpackedPackage));
    assert.ok(!fs.existsSync(path.join(unpackedPackage, 'node_modules')), 'Unpacked package has no node_modules');
  });

  test('unpacked installer deploys agents, claude, and both roots outside checkout with zero .ps1 files', () => {
    const { installerCli } = closure;
    const projectAgents = path.join(tempBase, 'project-agents');
    const projectClaude = path.join(tempBase, 'project-claude');
    const projectBoth = path.join(tempBase, 'project-both');

    // 1. Install agents target (21 assets)
    const resAgents = spawnSync(process.execPath, [installerCli, '--target', 'agents', '--directory', projectAgents], {
      cwd: tempBase,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resAgents.status, 0, resAgents.stderr);
    assert.match(resAgents.stdout, /Installed 21 file\(s\)/);

    const agentsDir = path.join(projectAgents, '.agents', 'skills', 'sonarqube-test-quality');
    assert.ok(!fs.existsSync(path.join(agentsDir, 'scripts', 'fetch-sonar-issues.ps1')));
    assert.ok(!fs.existsSync(path.join(agentsDir, 'scripts', 'calculate-jacoco-coverage.ps1')));
    assert.ok(fs.existsSync(path.join(agentsDir, 'scripts', 'convert-sonar-report.mjs')));
    assert.ok(fs.existsSync(path.join(agentsDir, 'scripts', 'fetch-sonar-issues.mjs')));
    assert.ok(fs.existsSync(path.join(agentsDir, 'scripts', 'calculate-jacoco-coverage.mjs')));
    assert.ok(fs.existsSync(path.join(agentsDir, 'scripts', 'vendor', 'sax.cjs')));
    assert.ok(!fs.existsSync(path.join(projectAgents, 'node_modules')));

    // 2. Install claude target (21 assets)
    const resClaude = spawnSync(process.execPath, [installerCli, '--target', 'claude', '--directory', projectClaude], {
      cwd: tempBase,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resClaude.status, 0, resClaude.stderr);
    assert.match(resClaude.stdout, /Installed 21 file\(s\)/);

    const claudeDir = path.join(projectClaude, '.claude', 'skills', 'sonarqube-test-quality');
    assert.ok(!fs.existsSync(path.join(claudeDir, 'scripts', 'fetch-sonar-issues.ps1')));
    assert.ok(!fs.existsSync(path.join(claudeDir, 'scripts', 'calculate-jacoco-coverage.ps1')));
    assert.ok(fs.existsSync(path.join(claudeDir, 'scripts', 'fetch-sonar-issues.mjs')));
    assert.ok(fs.existsSync(path.join(claudeDir, 'scripts', 'calculate-jacoco-coverage.mjs')));

    // 3. Install both target (42 assets)
    const resBoth = spawnSync(process.execPath, [installerCli, '--target', 'both', '--directory', projectBoth], {
      cwd: tempBase,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resBoth.status, 0, resBoth.stderr);
    assert.match(resBoth.stdout, /Installed 42 file\(s\)/);

    for (const root of ['.agents', '.claude']) {
      const dir = path.join(projectBoth, root, 'skills', 'sonarqube-test-quality');
      assert.ok(!fs.existsSync(path.join(dir, 'scripts', 'fetch-sonar-issues.ps1')));
      assert.ok(!fs.existsSync(path.join(dir, 'scripts', 'calculate-jacoco-coverage.ps1')));
      assert.ok(fs.existsSync(path.join(dir, 'scripts', 'convert-sonar-report.mjs')));
      assert.ok(fs.existsSync(path.join(dir, 'scripts', 'fetch-sonar-issues.mjs')));
      assert.ok(fs.existsSync(path.join(dir, 'scripts', 'calculate-jacoco-coverage.mjs')));
      assert.ok(fs.existsSync(path.join(dir, 'scripts', 'vendor', 'sax.cjs')));
    }
  });
});
