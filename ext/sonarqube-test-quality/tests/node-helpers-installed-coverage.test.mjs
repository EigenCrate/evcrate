import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment, setupInstalledClosure } from './installed-helpers-fixture-utils.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syntheticFixturePath = path.join(packageRoot, 'tests', 'fixtures', 'synthetic-jacoco-report.xml');

describe('Installed calculate-jacoco-coverage.mjs execution outside checkout', () => {
  let tempBase;
  let closure;
  let project;
  let unrelatedCwd;
  let fixtureCopy;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-cov-exec-'));
    closure = setupInstalledClosure(packageRoot, tempBase);
    project = path.join(tempBase, 'project-coverage');

    execFileSync(process.execPath, [closure.installerCli, '--target', 'both', '--directory', project], {
      cwd: tempBase,
      env: cleanEnvironment(),
    });

    unrelatedCwd = path.join(tempBase, 'isolated-cwd');
    fs.mkdirSync(unrelatedCwd, { recursive: true });
    fixtureCopy = path.join(unrelatedCwd, 'jacoco-synthetic.xml');
    fs.copyFileSync(syntheticFixturePath, fixtureCopy);
  });

  afterEach(() => {
    if (tempBase && fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  test('calculates coverage with exact BigInt rational threshold and parses SAX runtime', () => {
    const installedCoverage = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'scripts', 'calculate-jacoco-coverage.mjs');

    // 1. Pass: threshold 50 (fixture has 8 covered / 10 total = 80.0000%)
    const resPass = spawnSync(process.execPath, [installedCoverage, '--report-path', fixtureCopy, '--threshold', '50'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resPass.status, 0, resPass.stderr);
    assert.match(resPass.stdout, /Combined coverage\s*:\s*8\/10 \(80\.0000%\)/);
    assert.match(resPass.stdout, /RESULT\s*:\s*PASSED/);

    // 2. Fail: threshold 90
    const resFail = spawnSync(process.execPath, [installedCoverage, '--report-path', fixtureCopy, '--threshold', '90'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resFail.status, 2);
    assert.match(resFail.stdout, /RESULT\s*:\s*FAILED/);

    // 3. Exact rational BigInt boundary test: 79.999999% passes strict threshold
    const resRational = spawnSync(process.execPath, [installedCoverage, '--report-path', fixtureCopy, '--threshold', '79.999999'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resRational.status, 0);
  });

  test('accepts external DOCTYPE offline and rejects internal DTD subset and custom entities fail-closed', () => {
    const installedCoverage = path.join(project, '.claude', 'skills', 'sonarqube-test-quality', 'scripts', 'calculate-jacoco-coverage.mjs');

    // 1. External DOCTYPE accepted without network fetch
    const externalDtdXml = path.join(unrelatedCwd, 'external-dtd.xml');
    fs.writeFileSync(externalDtdXml, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">
<report name="demo">
  <package name="pkg">
    <class name="pkg/App">
      <counter type="LINE" missed="0" covered="2"/>
    </class>
  </package>
</report>`);
    const resDtdPass = spawnSync(process.execPath, [installedCoverage, '--report-path', externalDtdXml, '--threshold', '50'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resDtdPass.status, 0, resDtdPass.stderr);

    // 2. Internal DTD subset rejected
    const internalDtdXml = path.join(unrelatedCwd, 'internal-dtd.xml');
    fs.writeFileSync(internalDtdXml, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE report [ <!ENTITY internal "injected"> ]>
<report name="demo">
  <package name="pkg">
    <class name="pkg/App">
      <counter type="LINE" missed="0" covered="2"/>
    </class>
  </package>
</report>`);
    const resInternalFail = spawnSync(process.execPath, [installedCoverage, '--report-path', internalDtdXml, '--threshold', '50'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resInternalFail.status, 1);
    assert.match(resInternalFail.stderr, /calculate-jacoco-coverage: \[xml error\]/);

    // 3. Custom entity rejected
    const customEntityXml = path.join(unrelatedCwd, 'custom-entity.xml');
    fs.writeFileSync(customEntityXml, `<?xml version="1.0" encoding="UTF-8"?>
<report name="demo">
  <package name="pkg">
    <class name="pkg/App &custom;">
      <counter type="LINE" missed="0" covered="2"/>
    </class>
  </package>
</report>`);
    const resCustomFail = spawnSync(process.execPath, [installedCoverage, '--report-path', customEntityXml, '--threshold', '50'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resCustomFail.status, 1);
    assert.match(resCustomFail.stderr, /calculate-jacoco-coverage: \[xml error\]/);
    // 4. Invalid threshold argument
    const resArgFail = spawnSync(process.execPath, [installedCoverage, '--report-path', fixtureCopy, '--threshold', 'invalid'], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: cleanEnvironment(),
    });
    assert.equal(resArgFail.status, 1);
    assert.match(resArgFail.stderr, /calculate-jacoco-coverage: \[argument error\] Threshold must be an unsigned base-10 decimal/);
  });
});
