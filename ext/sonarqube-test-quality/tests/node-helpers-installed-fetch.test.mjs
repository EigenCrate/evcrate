import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment, createMockSonarExecutable, setupInstalledClosure } from './installed-helpers-fixture-utils.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Installed fetch-sonar-issues.mjs execution outside checkout', () => {
  let tempBase;
  let closure;
  let project;
  let unrelatedCwd;
  let mockCliPath;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-fetch-exec-'));
    closure = setupInstalledClosure(packageRoot, tempBase);
    project = path.join(tempBase, 'project-fetch');

    execFileSync(process.execPath, [closure.installerCli, '--target', 'both', '--directory', project], {
      cwd: tempBase,
      env: cleanEnvironment(),
    });

    unrelatedCwd = path.join(tempBase, 'isolated-cwd');
    fs.mkdirSync(unrelatedCwd, { recursive: true });
    mockCliPath = path.join(unrelatedCwd, 'mock-sonar.js');
    createMockSonarExecutable(mockCliPath);
  });

  afterEach(() => {
    if (tempBase && fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  test('executes native process mock with atomic staging and mode tightening across both roots', () => {
    for (const root of ['.agents', '.claude']) {
      const installedFetcher = path.join(project, root, 'skills', 'sonarqube-test-quality', 'scripts', 'fetch-sonar-issues.mjs');
      const traceFile = path.join(unrelatedCwd, `trace-${root.replace('.', '')}.json`);
      const childCwd = path.join(unrelatedCwd, `child-${root.replace('.', '')}`);
      fs.mkdirSync(childCwd, { recursive: true });
      const outFile = path.join(childCwd, 'issues.json');

      const res = spawnSync(process.execPath, [
        installedFetcher,
        '--project-key', 'sample-proj',
        '--branch', 'feature-x',
        '--sonar-path', mockCliPath,
        '--cwd', childCwd,
        '--output', outFile,
      ], {
        cwd: unrelatedCwd,
        encoding: 'utf8',
        env: { ...cleanEnvironment(), MOCK_TRACE_FILE: traceFile },
      });
      assert.equal(res.status, 0, res.stderr);
      assert.ok(fs.existsSync(outFile));

      const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      assert.equal(parsed.issues[0].key, 'AW12345');

      const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
      assert.equal(trace.cwd, childCwd);
      assert.ok(trace.args.includes('sample-proj'));

      if (process.platform !== 'win32') {
        const stat = fs.statSync(outFile);
        assert.equal(stat.mode & 0o777, 0o600);
      }

      const stagingFiles = fs.readdirSync(childCwd).filter((f) => f.startsWith('.issues.json.'));
      assert.equal(stagingFiles.length, 0);
    }
  });

  test('propagates child nonzero status, drains child stderr silently, and rejects launch/arg errors', () => {
    const installedFetcher = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'scripts', 'fetch-sonar-issues.mjs');
    const childCwd = path.join(unrelatedCwd, 'child-fail');
    fs.mkdirSync(childCwd, { recursive: true });
    const failOut = path.join(childCwd, 'fail-out.json');

    // Child error status propagation and silent stderr
    const resChildFail = spawnSync(process.execPath, [
      installedFetcher,
      '--project-key', 'sample-proj',
      '--sonar-path', mockCliPath,
      '--cwd', childCwd,
      '--output', failOut,
    ], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: { ...cleanEnvironment(), MOCK_SONAR_FAIL_STATUS: '3' },
    });
    assert.equal(resChildFail.status, 3);
    assert.match(resChildFail.stderr, /fetch-sonar-issues: \[child failure\] Sonar CLI exited with status 3/);
    assert.ok(!resChildFail.stderr.includes('token='));
    assert.ok(!resChildFail.stderr.includes('SECRET123'));
    assert.ok(!fs.existsSync(failOut));

    // Launch error on nonexistent executable
    const resLaunchFail = spawnSync(process.execPath, [
      installedFetcher,
      '--project-key', 'sample-proj',
      '--sonar-path', path.join(unrelatedCwd, 'missing-sonar-bin'),
      '--cwd', childCwd,
    ], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resLaunchFail.status, 1);
    assert.match(resLaunchFail.stderr, /fetch-sonar-issues: \[launch error\]/);

    // Argument validation
    const resArgFail = spawnSync(process.execPath, [installedFetcher, '--format', 'json'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resArgFail.status, 1);
    assert.match(resArgFail.stderr, /fetch-sonar-issues: \[argument error\] Option --project-key is required\./);
  });
});
