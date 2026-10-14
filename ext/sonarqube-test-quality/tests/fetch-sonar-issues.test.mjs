import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helperScript = path.join(packageRoot, 'scripts', 'fetch-sonar-issues.mjs');

function runHelper(args, options = {}) {
  const { cwd = packageRoot, env = process.env } = options;
  return spawnSync(process.execPath, [helperScript, ...args], {
    encoding: 'utf8',
    cwd,
    env,
  });
}

function createExecutableMock(mockPath, scriptBody) {
  const content = `#!/usr/bin/env node\n${scriptBody}\n`;
  fs.writeFileSync(mockPath, content, { mode: 0o755 });
}

describe('fetch-sonar-issues CLI and process execution', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-fetch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('--help displayed alone exits 0 with documented changes and usage', () => {
    const res = runHelper(['--help']);
    assert.equal(res.status, 0);
    assert.equal(res.stderr, '');
    assert.match(res.stdout, /Usage: node fetch-sonar-issues\.mjs/);
    assert.match(res.stdout, /--project-key <key>/);
    assert.match(res.stdout, /Node >=22\.19\.0 ESM execution/);
    assert.match(res.stdout, /No implicit OPEN,CONFIRMED default statuses/);
    assert.match(res.stdout, /Byte-preserving output/);
  });

  test('--help combined with other flags exits 1 with argument error', () => {
    const res = runHelper(['--project-key', 'p1', '--help']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Option --help must be used alone\./);
  });

  test('missing required --project-key exits 1 with argument error', () => {
    const res = runHelper(['--format', 'json']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Option --project-key is required\./);
  });

  test('unsupported option exits 1 with argument error', () => {
    const res = runHelper(['--project-key', 'p1', '--unsupported-flag']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Unsupported option\./);
  });
  test('prototype property names are rejected as unsupported options', () => {
    const res = runHelper(['constructor', 'val', '--project-key', 'p1']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Unsupported option\./);
  });


  test('repeated option exits 1 with argument error', () => {
    const res = runHelper(['--project-key', 'p1', '--format', 'toon', '--format', 'json']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Repeated option\./);
  });

  test('missing value for option exits 1 with argument error', () => {
    const res = runHelper(['--project-key', 'p1', '--branch']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Missing value for option\./);
  });

  test('empty value for option exits 1 with argument error', () => {
    const res = runHelper(['--project-key', 'p1', '--output', '']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Missing value for option\./);

    const keyRes = runHelper(['--project-key', '']);
    assert.equal(keyRes.status, 1);
    assert.match(keyRes.stderr, /fetch-sonar-issues: \[argument error\] Missing value for option\./);
  });

  test('option value with leading dash is rejected as invalid value', () => {
    const res = runHelper(['--project-key', '-x']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Invalid value for option\./);

    const branchRes = runHelper(['--project-key', 'p1', '--branch', '--some-flag']);
    assert.equal(branchRes.status, 1);
    assert.match(branchRes.stderr, /fetch-sonar-issues: \[argument error\] Invalid value for option\./);
  });

  test('unsupported format exits 1 with argument error', () => {
    const res = runHelper(['--project-key', 'p1', '--format', 'xml']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[argument error\] Unsupported format; expected toon, json, or table\./);
  });

  test('Windows batch or command script launcher is rejected with argument error', () => {
    const batRes = runHelper(['--project-key', 'p1', '--sonar-path', 'sonar.bat']);
    assert.equal(batRes.status, 1);
    assert.match(batRes.stderr, /fetch-sonar-issues: \[argument error\] Windows batch and command scripts/);

    const cmdRes = runHelper(['--project-key', 'p1', '--sonar-path', 'C:\\tools\\sonar.CMD']);
    assert.equal(cmdRes.status, 1);
    assert.match(cmdRes.stderr, /fetch-sonar-issues: \[argument error\] Windows batch and command scripts/);
  });

  test('nonexistent or non-regular --sonar-path exits 1 with launch error', () => {
    const missingRes = runHelper(['--project-key', 'p1', '--sonar-path', path.join(tempDir, 'absent')]);
    assert.equal(missingRes.status, 1);
    assert.match(missingRes.stderr, /fetch-sonar-issues: \[launch error\] Specified Sonar CLI executable does not exist or is not a regular file\./);

    const dirRes = runHelper(['--project-key', 'p1', '--sonar-path', tempDir]);
    assert.equal(dirRes.status, 1);
    assert.match(dirRes.stderr, /fetch-sonar-issues: \[launch error\] Specified Sonar CLI executable does not exist or is not a regular file\./);
  });

  test('nonexistent or non-directory --cwd exits 1 with launch error', () => {
    const missingRes = runHelper(['--project-key', 'p1', '--cwd', path.join(tempDir, 'absent')]);
    assert.equal(missingRes.status, 1);
    assert.match(missingRes.stderr, /fetch-sonar-issues: \[launch error\] Specified working directory does not exist or is not a directory\./);

    const filePath = path.join(tempDir, 'file.txt');
    fs.writeFileSync(filePath, 'hello');
    const fileRes = runHelper(['--project-key', 'p1', '--cwd', filePath]);
    assert.equal(fileRes.status, 1);
    assert.match(fileRes.stderr, /fetch-sonar-issues: \[launch error\] Specified working directory does not exist or is not a directory\./);
  });

  test('prior output file preserved on launch failure', () => {
    const priorFile = path.join(tempDir, 'prior.txt');
    fs.writeFileSync(priorFile, 'PRIOR_CONTENT');

    const res = runHelper([
      '--project-key', 'p1',
      '--cwd', path.join(tempDir, 'nonexistent-cwd'),
      '--output', priorFile,
    ]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[launch error\]/);
    assert.equal(fs.readFileSync(priorFile, 'utf8'), 'PRIOR_CONTENT');
  });

  test('missing default launcher in empty PATH exits 1 with launch error', () => {
    const res = runHelper(['--project-key', 'p1'], { env: { ...process.env, PATH: '' } });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[launch error\] Sonar CLI executable could not be launched\./);
  });

  test('prior output file preserved and no staging left on empty-PATH spawn failure', () => {
    const priorFile = path.join(tempDir, 'prior-empty-path.txt');
    fs.writeFileSync(priorFile, 'PRIOR_CONTENT_EMPTY_PATH');

    const res = runHelper(['--project-key', 'p1', '--output', priorFile], {
      env: { ...process.env, PATH: '' },
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[launch error\] Sonar CLI executable could not be launched\./);
    assert.equal(fs.readFileSync(priorFile, 'utf8'), 'PRIOR_CONTENT_EMPTY_PATH');

    const filesInDir = fs.readdirSync(tempDir);
    const tempFiles = filesInDir.filter((f) => f.includes('.tmp'));
    assert.equal(tempFiles.length, 0, 'No temporary staging files should remain');
  });

  test('constructs literal argv, preserves metacharacters, and delegates child CWD', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `
      const fs = require('node:fs');
      process.stdout.write(JSON.stringify({
        argv: process.argv.slice(2),
        cwd: process.cwd(),
      }));
    `);

    const subDir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subDir);

    const res = runHelper([
      '--project-key', 'proj:key with spaces & symbols;',
      '--branch', 'feature/test-1',
      '--statuses', 'OPEN,CONFIRMED',
      '--severities', 'BLOCKER,CRITICAL',
      '--format', 'json',
      '--sonar-path', mockCli,
      '--cwd', subDir,
    ]);

    assert.equal(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.deepEqual(parsed.argv, [
      'list', 'issues',
      '-p', 'proj:key with spaces & symbols;',
      '--format', 'json',
      '--branch', 'feature/test-1',
      '--statuses', 'OPEN,CONFIRMED',
      '--severities', 'BLOCKER,CRITICAL',
    ]);
    assert.equal(parsed.cwd, subDir);
  });

  test('resolves relative --output against child CWD and preserves raw byte output', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `
      process.stdout.write('RAW_ISSUE_LINE_1\\r\\nRAW_ISSUE_LINE_2\\n');
    `);

    const subDir = path.join(tempDir, 'workdir');
    fs.mkdirSync(subDir);

    const res = runHelper([
      '--project-key', 'p1',
      '--sonar-path', mockCli,
      '--cwd', subDir,
      '--output', 'issues.txt',
    ]);

    assert.equal(res.status, 0, res.stderr);
    const expectedOutput = path.join(subDir, 'issues.txt');
    assert.ok(fs.existsSync(expectedOutput), 'issues.txt must exist in child workdir');
    const bytes = fs.readFileSync(expectedOutput);
    assert.equal(bytes.toString('utf8'), 'RAW_ISSUE_LINE_1\r\nRAW_ISSUE_LINE_2\n');
  });

  test('stdout mode without --output preserves exact bytes and propagates nonzero exit code', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `
      process.stdout.write('DIRECT_STDOUT_BYTES\\n');
      process.exit(5);
    `);

    const res = runHelper(['--project-key', 'p1', '--sonar-path', mockCli]);
    assert.equal(res.status, 5);
    assert.equal(res.stdout, 'DIRECT_STDOUT_BYTES\n');
    assert.match(res.stderr, /fetch-sonar-issues: \[child failure\] Sonar CLI exited with status 5/);
  });

  test('resolves relative --cwd and --sonar-path relative to caller CWD', () => {
    if (process.platform === 'win32') return;

    const callerDir = path.join(tempDir, 'caller');
    fs.mkdirSync(callerDir);
    const mockCli = path.join(callerDir, 'rel-mock');
    createExecutableMock(mockCli, `
      process.stdout.write(process.cwd());
    `);
    const childTargetDir = path.join(callerDir, 'target');
    fs.mkdirSync(childTargetDir);

    const res = runHelper([
      '--project-key', 'p1',
      '--sonar-path', './rel-mock',
      '--cwd', './target',
    ], { cwd: callerDir });

    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, childTargetDir);
  });

  test('rejects non-existent parent directory for --output with publication error', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, 'process.stdout.write("data");');

    const res = runHelper([
      '--project-key', 'p1',
      '--sonar-path', mockCli,
      '--output', path.join(tempDir, 'nonexistent', 'out.txt'),
    ]);

    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[publication error\] Output parent directory does not exist or is not a directory\./);
  });

  test('rejects symlink output target with publication error', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, 'process.stdout.write("data");');

    const targetFile = path.join(tempDir, 'target.txt');
    fs.writeFileSync(targetFile, 'existing content');
    const symlinkPath = path.join(tempDir, 'symlink-out.txt');
    fs.symlinkSync(targetFile, symlinkPath);

    const res = runHelper([
      '--project-key', 'p1',
      '--sonar-path', mockCli,
      '--output', symlinkPath,
    ]);

    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[publication error\] Output destination must not be a symbolic link\./);
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'existing content');
  });

  test('rejects directory output target with publication error', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, 'process.stdout.write("data");');

    const dirTarget = path.join(tempDir, 'out-dir');
    fs.mkdirSync(dirTarget);

    const res = runHelper([
      '--project-key', 'p1',
      '--sonar-path', mockCli,
      '--output', dirTarget,
    ]);

    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[publication error\] Output destination exists and is not a regular file\./);
  });

  test('spools to restrictive POSIX 0600 staging before receiving child bytes', async () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    const pauseFlag = path.join(tempDir, 'child-started');
    const continueFlag = path.join(tempDir, 'continue');

    createExecutableMock(mockCli, `
      const fs = require('node:fs');
      fs.writeFileSync(${JSON.stringify(pauseFlag)}, 'started');
      let count = 0;
      while (!fs.existsSync(${JSON.stringify(continueFlag)}) && count < 200) {
        require('node:child_process').spawnSync('sleep', ['0.02']);
        count++;
      }
      process.stdout.write('finished');
    `);

    const outPath = path.join(tempDir, 'final.txt');
    const { spawn } = await import('node:child_process');

    const proc = spawn(process.execPath, [
      helperScript,
      '--project-key', 'p1',
      '--sonar-path', mockCli,
      '--output', outPath,
    ], { cwd: packageRoot });

    // Wait for child-started flag
    for (let i = 0; i < 100; i++) {
      if (fs.existsSync(pauseFlag)) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(fs.existsSync(pauseFlag), 'Child mock must have started');

    // Find sibling staging file in tempDir
    const files = fs.readdirSync(tempDir);
    const stagingFile = files.find((f) => f.startsWith('.final.txt.') && f.endsWith('.tmp'));
    assert.ok(stagingFile, 'Staging file must exist while child is running');
    const stat = fs.statSync(path.join(tempDir, stagingFile));
    assert.equal(stat.mode & 0o777, 0o600, 'Staging file must be created with 0600 permissions');

    // Signal child to finish
    fs.writeFileSync(continueFlag, 'go');

    const exitCode = await new Promise((resolve) => proc.on('close', resolve));
    assert.equal(exitCode, 0);
    assert.equal(fs.readFileSync(outPath, 'utf8'), 'finished');
  });

  test('child terminated by signal cleans up staging and reports signal diagnostic', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `
      process.kill(process.pid, 'SIGTERM');
    `);

    const outFile = path.join(tempDir, 'signal-report.txt');
    fs.writeFileSync(outFile, 'PRESERVED_BEFORE_SIGNAL');

    const res = runHelper(['--project-key', 'p1', '--sonar-path', mockCli, '--output', outFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /fetch-sonar-issues: \[signal termination\] Child process terminated by signal: SIGTERM/);
    assert.equal(fs.readFileSync(outFile, 'utf8'), 'PRESERVED_BEFORE_SIGNAL');
    const tempFiles = fs.readdirSync(tempDir).filter((f) => f.includes('.tmp'));
    assert.equal(tempFiles.length, 0, 'No temporary files must remain on signal termination');
  });

  test('creates new output file with POSIX 0600 mode and tightens existing mode', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `process.stdout.write("secure content");`);

    // New file
    const newFile = path.join(tempDir, 'new.txt');
    const newRes = runHelper(['--project-key', 'p1', '--sonar-path', mockCli, '--output', newFile]);
    assert.equal(newRes.status, 0, newRes.stderr);
    const newStat = fs.statSync(newFile);
    assert.equal(newStat.mode & 0o777, 0o600, 'New output file must have 0600 permissions');

    // Replacement file with permissive 0666 original mode
    const existingFile = path.join(tempDir, 'existing.txt');
    fs.writeFileSync(existingFile, 'old data', { mode: 0o666 });
    const replaceRes = runHelper(['--project-key', 'p1', '--sonar-path', mockCli, '--output', existingFile]);
    assert.equal(replaceRes.status, 0, replaceRes.stderr);
    const replaceStat = fs.statSync(existingFile);
    assert.equal(replaceStat.mode & 0o777, 0o600, 'Replacement file must strip group/other to mode & 0600');
    assert.equal(fs.readFileSync(existingFile, 'utf8'), 'secure content');
  });

  test('preserves prior output and cleans up staging on child exit code 4', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `
      process.stdout.write("partial data");
      process.exit(4);
    `);

    const outFile = path.join(tempDir, 'report.txt');
    fs.writeFileSync(outFile, 'PRESERVED_CONTENT');

    const res = runHelper(['--project-key', 'p1', '--sonar-path', mockCli, '--output', outFile]);
    assert.equal(res.status, 4, 'Child non-zero exit code must be propagated');
    assert.match(res.stderr, /fetch-sonar-issues: \[child failure\] Sonar CLI exited with status 4/);
    assert.equal(fs.readFileSync(outFile, 'utf8'), 'PRESERVED_CONTENT', 'Target output must remain unmodified');

    const filesInDir = fs.readdirSync(tempDir);
    const tempFiles = filesInDir.filter((f) => f.includes('.tmp'));
    assert.equal(tempFiles.length, 0, 'No temporary staging files should remain');
  });

  test('child stderr sentinel secret is never echoed in wrapper diagnostics on failure', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `
      process.stderr.write("SECRET_AUTH_TOKEN_VALUE_12345");
      process.exit(1);
    `);

    const res = runHelper(['--project-key', 'p1', '--sonar-path', mockCli]);
    assert.equal(res.status, 1);
    assert.doesNotMatch(res.stderr, /SECRET_AUTH_TOKEN_VALUE_12345/, 'Child stderr must not be echoed in wrapper diagnostics');
    assert.doesNotMatch(res.stdout, /SECRET_AUTH_TOKEN_VALUE_12345/);
    assert.match(res.stderr, /fetch-sonar-issues: \[child failure\] Sonar CLI exited with status 1/);
  });

  test('handles large stdout and stderr without deadlock or memory exhaustion', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `
      const stdoutChunk = 'X'.repeat(64 * 1024);
      const stderrChunk = 'E'.repeat(32 * 1024);
      for (let i = 0; i < 8; i++) {
        process.stdout.write(stdoutChunk);
        process.stderr.write(stderrChunk);
      }
    `);

    const outFile = path.join(tempDir, 'large.txt');
    const res = runHelper(['--project-key', 'p1', '--sonar-path', mockCli, '--output', outFile]);
    assert.equal(res.status, 0, res.stderr);
    const stat = fs.statSync(outFile);
    assert.equal(stat.size, 8 * 64 * 1024, 'Output file must contain exact total bytes');
  });

  test('zero-byte stdout writes empty file successfully', () => {
    if (process.platform === 'win32') return;

    const mockCli = path.join(tempDir, 'mock-sonar');
    createExecutableMock(mockCli, `/* zero byte output */`);

    const outFile = path.join(tempDir, 'empty.txt');
    const res = runHelper(['--project-key', 'p1', '--sonar-path', mockCli, '--output', outFile]);
    assert.equal(res.status, 0, res.stderr);
    const stat = fs.statSync(outFile);
    assert.equal(stat.size, 0);
  });

  test('importing module does not trigger execution or side effects', async () => {
    const modUrl = new URL('../scripts/fetch-sonar-issues.mjs', import.meta.url).href;
    const mod = await import(modUrl);
    assert.ok(typeof mod.fetchSonarIssues === 'function');
    assert.ok(typeof mod.parseArguments === 'function');
    assert.ok(typeof mod.HELP === 'string');
  });
});
