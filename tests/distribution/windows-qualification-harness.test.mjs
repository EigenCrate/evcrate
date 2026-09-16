import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

import {
  SCHEMA_RELEASE,
  SCHEMA_RECEIPT,
  SCHEMA_POINTER,
  SCHEMA_CANDIDATE,
  ALLOWED_MODES,
  ALLOWED_POWERSHELL,
  compareCodePoints,
  sha256File,
  sha256String,
  parseSidecar,
  parseCliArgs,
  assertPlatformAndHost,
  getExpectedCandidateAssetNames,
  getExpectedPredecessorAssetNames,
  verifyDirectoryMembership,
  verifyCandidateAssets,
  verifyPredecessorAssets,
  verifyCandidateReceipt,
  safeReleaseProcess
} from '../installers/windows-release-qualification.mjs';

import { buildWindowsTestReleaseSet } from '../installers/fixtures/windows-release-fixture.mjs';

const HARNESS_SCRIPT_PATH = path.resolve('tests/installers/windows-release-qualification.mjs');
const VALID_COMMIT = 'a'.repeat(40);
test('Harness CLI: parseCliArgs handles empty array without TypeError', () => {
  assert.throws(
    () => parseCliArgs([]),
    /Missing required argument: --mode <smoke\|full>/
  );
});


test('Harness CLI: parseCliArgs accepts valid smoke mode arguments', () => {
  const args = [
    '--mode', 'smoke',
    '--assets', '/tmp/assets',
    '--version', '2.2.0',
    '--source-commit', VALID_COMMIT,
    '--powershell', 'pwsh.exe'
  ];

  const parsed = parseCliArgs(args);
  assert.equal(parsed.mode, 'smoke');
  assert.equal(parsed.assets, path.resolve('/tmp/assets'));
  assert.equal(parsed.version, '2.2.0');
  assert.equal(parsed.sourceCommit, VALID_COMMIT);
  assert.equal(parsed.powershell, 'pwsh.exe');
  assert.equal(parsed.receipt, null);
  assert.equal(parsed.predecessor, null);
});

test('Harness CLI: parseCliArgs accepts valid full mode arguments with receipt and predecessor', () => {
  const args = [
    '--mode', 'full',
    '--assets', '/tmp/assets',
    '--receipt', '/tmp/receipt.json',
    '--predecessor', '/tmp/predecessor',
    '--version', '2.2.0',
    '--source-commit', VALID_COMMIT,
    '--powershell', 'powershell.exe',
    '--repository', 'test-owner/test-repo',
    '--workflow-run-id', '12345',
    '--workflow-run-attempt', '2'
  ];

  const parsed = parseCliArgs(args);
  assert.equal(parsed.mode, 'full');
  assert.equal(parsed.assets, path.resolve('/tmp/assets'));
  assert.equal(parsed.receipt, path.resolve('/tmp/receipt.json'));
  assert.equal(parsed.predecessor, path.resolve('/tmp/predecessor'));
  assert.equal(parsed.version, '2.2.0');
  assert.equal(parsed.sourceCommit, VALID_COMMIT);
  assert.equal(parsed.powershell, 'powershell.exe');
  assert.equal(parsed.repository, 'test-owner/test-repo');
  assert.equal(parsed.workflowRunId, 12345);
  assert.equal(parsed.workflowRunAttempt, 2);
});

test('Harness CLI: parseCliArgs rejects duplicate arguments', () => {
  assert.throws(
    () => parseCliArgs(['--mode', 'smoke', '--mode', 'full']),
    /Duplicate argument rejected: "--mode"/
  );
});

test('Harness CLI: parseCliArgs rejects unknown arguments', () => {
  assert.throws(
    () => parseCliArgs(['--unknown-flag', 'value']),
    /Unknown argument rejected: "--unknown-flag"/
  );
});

test('Harness CLI: parseCliArgs rejects missing value for flag', () => {
  assert.throws(
    () => parseCliArgs(['--mode']),
    /Missing value for argument: "--mode"/
  );
  assert.throws(
    () => parseCliArgs(['--assets', '--version', '1.0.0']),
    /Missing value for argument: "--assets"/
  );
});

test('Harness CLI: parseCliArgs rejects invalid mode', () => {
  assert.throws(
    () => parseCliArgs([
      '--mode', 'invalid-mode',
      '--assets', '/tmp',
      '--version', '1.0.0',
      '--source-commit', VALID_COMMIT,
      '--powershell', 'powershell.exe'
    ]),
    /Invalid --mode "invalid-mode"/
  );
});

test('Harness CLI: parseCliArgs rejects invalid semver', () => {
  assert.throws(
    () => parseCliArgs([
      '--mode', 'smoke',
      '--assets', '/tmp',
      '--version', 'not-a-semver',
      '--source-commit', VALID_COMMIT,
      '--powershell', 'powershell.exe'
    ]),
    /Invalid --version "not-a-semver"/
  );
});

test('Harness CLI: parseCliArgs rejects invalid source-commit (must be 40 hex)', () => {
  assert.throws(
    () => parseCliArgs([
      '--mode', 'smoke',
      '--assets', '/tmp',
      '--version', '1.0.0',
      '--source-commit', 'too-short',
      '--powershell', 'powershell.exe'
    ]),
    /Invalid --source-commit "too-short"/
  );
  assert.throws(
    () => parseCliArgs([
      '--mode', 'smoke',
      '--assets', '/tmp',
      '--version', '1.0.0',
      '--source-commit', 'g'.repeat(40),
      '--powershell', 'powershell.exe'
    ]),
    /Invalid --source-commit/
  );
});

test('Harness CLI: parseCliArgs rejects invalid powershell executable name', () => {
  assert.throws(
    () => parseCliArgs([
      '--mode', 'smoke',
      '--assets', '/tmp',
      '--version', '1.0.0',
      '--source-commit', VALID_COMMIT,
      '--powershell', 'cmd.exe'
    ]),
    /Invalid --powershell "cmd.exe"/
  );
});

test('Harness CLI: parseCliArgs full mode requires receipt and predecessor', () => {
  assert.throws(
    () => parseCliArgs([
      '--mode', 'full',
      '--assets', '/tmp',
      '--version', '1.0.0',
      '--source-commit', VALID_COMMIT,
      '--powershell', 'powershell.exe'
    ]),
    /Full mode requires argument: --receipt <file>/
  );

  assert.throws(
    () => parseCliArgs([
      '--mode', 'full',
      '--assets', '/tmp',
      '--receipt', '/tmp/receipt.json',
      '--version', '1.0.0',
      '--source-commit', VALID_COMMIT,
      '--powershell', 'powershell.exe'
    ]),
    /Full mode requires argument: --predecessor <dir>/
  );
});

test('Harness Preflight: assertPlatformAndHost fails on non-win32 host', async () => {
  if (process.platform === 'win32') return;

  await assert.rejects(
    () => assertPlatformAndHost({ powershell: 'pwsh.exe' }),
    /Platform assertion failed: expected "win32", got "linux"/
  );
});

test('Harness Utilities: compareCodePoints adheres to Unicode code point order', () => {
  assert.equal(compareCodePoints('a', 'b'), -1);
  assert.equal(compareCodePoints('b', 'a'), 1);
  assert.equal(compareCodePoints('abc', 'abc'), 0);
  assert.equal(compareCodePoints('install.ps1', 'install.sh'), -1);
});

test('Harness Utilities: parseSidecar validates sidecar grammar and basename', () => {
  const hash = 'a'.repeat(64);
  const parsed = parseSidecar(`${hash}  archive.zip\n`, 'archive.zip');
  assert.equal(parsed.sha256, hash);
  assert.equal(parsed.filename, 'archive.zip');

  // Mismatched basename
  assert.throws(
    () => parseSidecar(`${hash}  other.zip\n`, 'archive.zip'),
    /Sidecar filename mismatch/
  );

  // Malformed format (only one space)
  assert.throws(
    () => parseSidecar(`${hash} archive.zip\n`, 'archive.zip'),
    /Malformed sidecar line format/
  );
});

test('Harness Verification: verifyPredecessorAssets verifies valid 4-file Windows release set', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-test-'));
  try {
    buildWindowsTestReleaseSet({
      outputDir: tmpDir,
      version: '1.0.0',
      commit: VALID_COMMIT
    });

    const predResult = verifyPredecessorAssets(tmpDir);
    assert.equal(predResult.version, '1.0.0');
    assert.equal(predResult.tag, 'v1.0.0');
    assert.equal(predResult.sourceCommit, VALID_COMMIT);
    assert.equal(predResult.files.length, 4);

    const names = predResult.files.map((f) => f.name);
    assert.deepEqual(names, getExpectedPredecessorAssetNames('1.0.0'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Harness Verification: verifyCandidateReceipt verifies valid candidate.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-rcpt-test-'));
  try {
    buildWindowsTestReleaseSet({
      outputDir: tmpDir,
      version: '1.0.0',
      commit: VALID_COMMIT
    });
    const predResult = verifyPredecessorAssets(tmpDir);

    const receiptPath = path.join(tmpDir, 'candidate.json');
    const mockCandidateFiles = [
      { name: 'evcrate-v2.0.0-linux-x64.tar.gz', size: 100, sha256: '1'.repeat(64) },
      { name: 'evcrate-v2.0.0-linux-x64.tar.gz.sha256', size: 20, sha256: '2'.repeat(64) },
      { name: 'evcrate-v2.0.0-windows-x64.zip', size: 100, sha256: '3'.repeat(64) },
      { name: 'evcrate-v2.0.0-windows-x64.zip.sha256', size: 20, sha256: '4'.repeat(64) },
      { name: 'evcrate-v2.0.0.release.json', size: 50, sha256: '5'.repeat(64) },
      { name: 'install.sh', size: 30, sha256: '6'.repeat(64) },
      { name: 'install.ps1', size: 30, sha256: '7'.repeat(64) }
    ];

    const receiptContent = {
      schema: SCHEMA_CANDIDATE,
      repository: 'EigenCrate/evcrate',
      workflow_run_id: 1234,
      workflow_run_attempt: 1,
      source_commit: VALID_COMMIT,
      version: '2.0.0',
      tag: 'v2.0.0',
      files: mockCandidateFiles,
      predecessor: {
        kind: 'bootstrap-fixture',
        version: predResult.version,
        tag: predResult.tag,
        source_commit: predResult.sourceCommit,
        files: predResult.files
      }
    };

    fs.writeFileSync(receiptPath, JSON.stringify(receiptContent, null, 2), 'utf8');

    const verified = verifyCandidateReceipt(
      receiptPath,
      mockCandidateFiles,
      predResult.files,
      {
        version: '2.0.0',
        sourceCommit: VALID_COMMIT,
        repository: 'EigenCrate/evcrate',
        workflowRunId: 1234,
        workflowRunAttempt: 1
      }
    );

    assert.equal(verified.schema, SCHEMA_CANDIDATE);
    assert.equal(verified.version, '2.0.0');
    assert.equal(verified.predecessor.version, '1.0.0');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
test('Harness Verification: verifyCandidateAssets verifies valid 7-file candidate release set', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-cand-test-'));
  try {
    buildWindowsTestReleaseSet({
      outputDir: tmpDir,
      version: '2.0.0',
      commit: VALID_COMMIT
    });
    fs.writeFileSync(path.join(tmpDir, 'evcrate-v2.0.0-linux-x64.tar.gz'), 'linux-tar-gz');
    fs.writeFileSync(
      path.join(tmpDir, 'evcrate-v2.0.0-linux-x64.tar.gz.sha256'),
      crypto.createHash('sha256').update('linux-tar-gz').digest('hex') + '  evcrate-v2.0.0-linux-x64.tar.gz\n'
    );
    fs.writeFileSync(path.join(tmpDir, 'install.sh'), '#!/bin/sh\n');

    const metaPath = path.join(tmpDir, 'evcrate-v2.0.0.release.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.platforms['linux-x64'] = {
      archive_name: 'evcrate-v2.0.0-linux-x64.tar.gz',
      sha256: crypto.createHash('sha256').update('linux-tar-gz').digest('hex'),
      size: 12
    };
    meta.installers['install.sh'] = {
      sha256: crypto.createHash('sha256').update('#!/bin/sh\n').digest('hex'),
      size: 10
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    const result = verifyCandidateAssets(tmpDir, '2.0.0', VALID_COMMIT);
    assert.equal(result.version, '2.0.0');
    assert.equal(result.sourceCommit, VALID_COMMIT);
    assert.equal(result.files.length, 7);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Harness Verification: verifyCandidateReceipt rejects predecessor version mismatch against disk predecessor', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-mismatch-'));
  try {
    buildWindowsTestReleaseSet({
      outputDir: tmpDir,
      version: '1.0.0',
      commit: VALID_COMMIT
    });
    const predResult = verifyPredecessorAssets(tmpDir);
    const receiptPath = path.join(tmpDir, 'candidate.json');
    const mockCandidateFiles = [
      { name: 'evcrate-v2.0.0-linux-x64.tar.gz', size: 100, sha256: '1'.repeat(64) },
      { name: 'evcrate-v2.0.0-linux-x64.tar.gz.sha256', size: 20, sha256: '2'.repeat(64) },
      { name: 'evcrate-v2.0.0-windows-x64.zip', size: 100, sha256: '3'.repeat(64) },
      { name: 'evcrate-v2.0.0-windows-x64.zip.sha256', size: 20, sha256: '4'.repeat(64) },
      { name: 'evcrate-v2.0.0.release.json', size: 50, sha256: '5'.repeat(64) },
      { name: 'install.sh', size: 30, sha256: '6'.repeat(64) },
      { name: 'install.ps1', size: 30, sha256: '7'.repeat(64) }
    ];

    const receiptContent = {
      schema: SCHEMA_CANDIDATE,
      repository: 'EigenCrate/evcrate',
      workflow_run_id: 1234,
      workflow_run_attempt: 1,
      source_commit: VALID_COMMIT,
      version: '2.0.0',
      tag: 'v2.0.0',
      files: mockCandidateFiles,
      predecessor: {
        kind: 'bootstrap-fixture',
        version: '0.9.0', // Mismatched version
        tag: 'v0.9.0',
        source_commit: predResult.sourceCommit,
        files: predResult.files
      }
    };
    fs.writeFileSync(receiptPath, JSON.stringify(receiptContent, null, 2), 'utf8');

    assert.throws(
      () => verifyCandidateReceipt(
        receiptPath,
        mockCandidateFiles,
        predResult.files,
        { version: '2.0.0', sourceCommit: VALID_COMMIT },
        predResult
      ),
      /Receipt predecessor version mismatch/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


test('Harness Process: Invoking harness with --help exits 0 and prints usage', async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [HARNESS_SCRIPT_PATH, '--help']
  );
  assert.match(stdout, /Windows Release Qualification Harness/);
  assert.match(stdout, /--mode <smoke\|full>/);
});

test('Harness Process: Invoking harness on Linux fails preflight platform assertion', async () => {
  if (process.platform === 'win32') return;

  await assert.rejects(
    () => execFileAsync(
      process.execPath,
      [
        HARNESS_SCRIPT_PATH,
        '--mode', 'smoke',
        '--assets', '/tmp',
        '--version', '2.0.0',
        '--source-commit', VALID_COMMIT,
        '--powershell', 'pwsh.exe'
      ]
    ),
    (err) => {
      assert.match(err.stderr || err.stdout, /Platform assertion failed: expected "win32", got "linux"/);
      return true;
    }
  );
});

test('Harness Process: safeReleaseProcess gracefully handles null, already-exited, and live processes', async () => {
  // 1. null process
  await assert.doesNotReject(() => safeReleaseProcess(null));

  // 2. already exited process
  const childExited = execFile(process.execPath, ['-e', 'process.exit(0)']);
  await new Promise((resolve) => childExited.on('close', resolve));
  assert.notEqual(childExited.exitCode, null);
  await assert.doesNotReject(() => safeReleaseProcess(childExited));

  // 3. live process with stdin
  const childLive = execFile(process.execPath, ['-e', 'process.stdin.resume(); process.stdin.on("data", () => process.exit(0));']);
  await assert.doesNotReject(() => safeReleaseProcess(childLive));
  assert.notEqual(childLive.exitCode, null);
});
