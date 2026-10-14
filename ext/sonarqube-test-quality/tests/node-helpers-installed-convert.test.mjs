import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment, setupInstalledClosure } from './installed-helpers-fixture-utils.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Installed convert-sonar-report.mjs execution outside checkout', () => {
  let tempBase;
  let closure;
  let project;
  let installedConverter;
  let unrelatedCwd;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-convert-exec-'));
    closure = setupInstalledClosure(packageRoot, tempBase);
    project = path.join(tempBase, 'project-convert');

    execFileSync(process.execPath, [closure.installerCli, '--target', 'agents', '--directory', project], {
      cwd: tempBase,
      env: cleanEnvironment(),
    });

    installedConverter = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'scripts', 'convert-sonar-report.mjs');
    unrelatedCwd = path.join(tempBase, 'isolated-cwd');
    fs.mkdirSync(unrelatedCwd, { recursive: true });
  });

  afterEach(() => {
    if (tempBase && fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  test('converts report to JSON and Markdown from unrelated CWD and rejects overwrite', () => {
    const sampleEvidence = {
      project: { key: 'isolated-demo', branch: 'feat/installed' },
      issues: [
        { key: 'finding-1', component: 'isolated-demo:src/example.js', severity: 'MAJOR', status: 'OPEN', message: 'Test message for installed converter', line: 10 },
      ],
      measures: { component: { key: 'isolated-demo', measures: [{ metric: 'coverage', value: '87.5' }] } },
    };

    // 1. JSON format to stdout
    const resJson = spawnSync(process.execPath, [installedConverter, '--input', '-', '--format', 'json'], {
      cwd: unrelatedCwd,
      input: JSON.stringify(sampleEvidence),
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resJson.status, 0, resJson.stderr);
    assert.deepEqual(JSON.parse(resJson.stdout), sampleEvidence);

    // 2. Markdown format to stdout
    const resMd = spawnSync(process.execPath, [installedConverter, '--input', '-', '--format', 'markdown'], {
      cwd: unrelatedCwd,
      input: JSON.stringify(sampleEvidence),
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resMd.status, 0, resMd.stderr);
    assert.match(resMd.stdout, /finding-1/);
    assert.match(resMd.stdout, /isolated-demo/);
    assert.match(resMd.stdout, /src\/example\.js/);
    assert.match(resMd.stdout, /OPEN/);
    assert.match(resMd.stdout, /coverage/);
    assert.match(resMd.stdout, /87\.5/);

    // 3. Exclusive write fails when destination already exists
    const existingFile = path.join(unrelatedCwd, 'existing-output.md');
    fs.writeFileSync(existingFile, 'preserved content');
    const resConflict = spawnSync(process.execPath, [
      installedConverter,
      '--input', '-',
      '--format', 'markdown',
      '--output', existingFile,
    ], {
      cwd: unrelatedCwd,
      input: JSON.stringify(sampleEvidence),
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resConflict.status, 1);
    assert.match(resConflict.stderr, /EEXIST|file already exists/i);
    assert.equal(fs.readFileSync(existingFile, 'utf8'), 'preserved content');
  });
});
