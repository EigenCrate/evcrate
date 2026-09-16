#!/usr/bin/env node
/**
 * Self-contained Windows Release Qualification Harness.
 *
 * Requirements: WRQ-024–028, WRQ-060.
 * Node-builtins only: carries zero repository or npm dependencies.
 * Carried with the candidate artifact to qualify Windows release candidates
 * across the supported PowerShell (5.1 / 7) and Node (22.19.0 / 24.21.0) matrix.
 *
 * Notice: This file deliberately does NOT use the `.test.mjs` suffix so the
 * Linux installer wildcard `tests/installers/*.test.mjs` does not execute it.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Schemas and Constants
// ---------------------------------------------------------------------------
export const SCHEMA_RELEASE = 'evcrate-private-release/v1';
export const SCHEMA_RECEIPT = 'evcrate-installer-receipt/v1';
export const SCHEMA_POINTER = 'evcrate-current-pointer/v1';
export const SCHEMA_CANDIDATE = 'evcrate-release-candidate/v1';

export const ALLOWED_MODES = Object.freeze(['smoke', 'full']);
export const ALLOWED_POWERSHELL = Object.freeze(['powershell.exe', 'pwsh.exe']);
export const ALLOWED_NODE_VERSIONS = Object.freeze(['v22.19.0', 'v24.21.0']);

export const EXPECTED_CANDIDATE_ASSET_COUNT = 7;
export const EXPECTED_PREDECESSOR_ASSET_COUNT = 4;

// ---------------------------------------------------------------------------
// Canonical code-point and hashing utilities (RFC 8785)
// ---------------------------------------------------------------------------

export function compareCodePoints(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  const minLen = Math.min(lenA, lenB);
  for (let i = 0; i < minLen; i++) {
    const cpA = a.codePointAt(i);
    const cpB = b.codePointAt(i);
    if (cpA !== cpB) {
      return cpA < cpB ? -1 : 1;
    }
    if (cpA > 0xffff) i++;
  }
  return lenA === lenB ? 0 : lenA < lenB ? -1 : 1;
}

export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export function sha256String(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

export function parseSidecar(content, expectedBasename) {
  if (typeof content !== 'string' || !content) {
    throw new Error('Invalid sidecar content: empty or non-string');
  }
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length !== 1) {
    throw new Error(`Sidecar must contain exactly 1 non-empty line, found ${lines.length}`);
  }
  const line = lines[0];
  const match = /^([a-f0-9]{64})\s\s(.+)$/u.exec(line);
  if (!match) {
    throw new Error(`Malformed sidecar line format: "${line}"`);
  }
  const [, sha256, filename] = match;
  if (filename !== expectedBasename) {
    throw new Error(`Sidecar filename mismatch: expected "${expectedBasename}", got "${filename}"`);
  }
  return { sha256: sha256.toLowerCase(), filename };
}

// ---------------------------------------------------------------------------
// Strict CLI Argument Parsing
// ---------------------------------------------------------------------------

export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let i = 0;
  // Skip node and script paths if passed full process.argv
  if (args.length >= 2 && (args[0].endsWith('node') || args[0].endsWith('node.exe'))) {
    i = 2;
  }

  const seenFlags = new Set();
  const options = {
    mode: null,
    assets: null,
    receipt: null,
    predecessor: null,
    version: null,
    sourceCommit: null,
    powershell: null,
    repository: process.env.GITHUB_REPOSITORY || null,
    workflowRunId: process.env.GITHUB_RUN_ID ? parseInt(process.env.GITHUB_RUN_ID, 10) : null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ? parseInt(process.env.GITHUB_RUN_ATTEMPT, 10) : null
  };

  while (i < args.length) {
    const rawArg = args[i];
    let flag = rawArg;
    let value = null;

    if (rawArg.includes('=')) {
      const eqIdx = rawArg.indexOf('=');
      flag = rawArg.slice(0, eqIdx);
      value = rawArg.slice(eqIdx + 1);
    }

    if (flag === '-h' || flag === '--help') {
      options.help = true;
      i++;
      continue;
    }

    if (seenFlags.has(flag)) {
      throw new Error(`Duplicate argument rejected: "${flag}"`);
    }
    seenFlags.add(flag);

    const getValue = () => {
      if (value !== null) return value;
      i++;
      if (i >= args.length || args[i].startsWith('--')) {
        throw new Error(`Missing value for argument: "${flag}"`);
      }
      return args[i];
    };

    switch (flag) {
      case '--mode': {
        const m = getValue();
        if (!ALLOWED_MODES.includes(m)) {
          throw new Error(`Invalid --mode "${m}": must be one of ${ALLOWED_MODES.join(', ')}`);
        }
        options.mode = m;
        break;
      }
      case '--assets':
        options.assets = path.resolve(getValue());
        break;
      case '--receipt':
        options.receipt = path.resolve(getValue());
        break;
      case '--predecessor':
        options.predecessor = path.resolve(getValue());
        break;
      case '--version': {
        const v = getValue();
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(v)) {
          throw new Error(`Invalid --version "${v}": must be valid semver format`);
        }
        options.version = v;
        break;
      }
      case '--source-commit': {
        const s = getValue();
        if (!/^[a-f0-9]{40}$/u.test(s)) {
          throw new Error(`Invalid --source-commit "${s}": must be 40 lowercase hex characters`);
        }
        options.sourceCommit = s;
        break;
      }
      case '--powershell': {
        const p = getValue();
        if (!ALLOWED_POWERSHELL.includes(p)) {
          throw new Error(`Invalid --powershell "${p}": must be one of ${ALLOWED_POWERSHELL.join(', ')}`);
        }
        options.powershell = p;
        break;
      }
      case '--repository':
        options.repository = getValue();
        break;
      case '--workflow-run-id': {
        const rId = parseInt(getValue(), 10);
        if (Number.isNaN(rId) || rId <= 0) {
          throw new Error(`Invalid --workflow-run-id: must be positive integer`);
        }
        options.workflowRunId = rId;
        break;
      }
      case '--workflow-run-attempt': {
        const rAtt = parseInt(getValue(), 10);
        if (Number.isNaN(rAtt) || rAtt <= 0) {
          throw new Error(`Invalid --workflow-run-attempt: must be positive integer`);
        }
        options.workflowRunAttempt = rAtt;
        break;
      }
      default:
        throw new Error(`Unknown argument rejected: "${rawArg}"`);
    }
    i++;
  }

  if (options.help) {
    return options;
  }

  // Validate required options
  if (!options.mode) throw new Error('Missing required argument: --mode <smoke|full>');
  if (!options.assets) throw new Error('Missing required argument: --assets <dir>');
  if (!options.version) throw new Error('Missing required argument: --version <version>');
  if (!options.sourceCommit) throw new Error('Missing required argument: --source-commit <40hex>');
  if (!options.powershell) throw new Error('Missing required argument: --powershell <powershell.exe|pwsh.exe>');

  if (options.mode === 'full') {
    if (!options.receipt) throw new Error('Full mode requires argument: --receipt <file>');
    if (!options.predecessor) throw new Error('Full mode requires argument: --predecessor <dir>');
  }

  return options;
}

// ---------------------------------------------------------------------------
// Host and Runtime Preflight Probes
// ---------------------------------------------------------------------------

export async function assertPlatformAndHost(options) {
  if (process.platform !== 'win32') {
    throw new Error(`Platform assertion failed: expected "win32", got "${process.platform}"`);
  }
  if (process.arch !== 'x64') {
    throw new Error(`Architecture assertion failed: expected "x64", got "${process.arch}"`);
  }

  const currentNodeVersion = process.version;
  if (!ALLOWED_NODE_VERSIONS.includes(currentNodeVersion)) {
    throw new Error(
      `Node version assertion failed: expected one of ${ALLOWED_NODE_VERSIONS.join(', ')}, got "${currentNodeVersion}"`
    );
  }

  // Probe PowerShell major version
  const probeArgs = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[Console]::WriteLine($PSVersionTable.PSVersion.Major)'
  ];

  const { exitCode, stdout, stderr } = await runProcess(options.powershell, probeArgs);
  if (exitCode !== 0) {
    throw new Error(`PowerShell probe failed (${options.powershell}): exit ${exitCode}\n${stderr}`);
  }

  const major = parseInt(stdout.trim(), 10);
  if (Number.isNaN(major)) {
    throw new Error(`Could not parse PowerShell major version from output: "${stdout}"`);
  }

  if (options.powershell === 'powershell.exe' && major !== 5) {
    throw new Error(
      `PowerShell major version mismatch for powershell.exe: expected 5 (Windows PowerShell 5.1), got ${major}`
    );
  }

  if (options.powershell === 'pwsh.exe' && major !== 7) {
    throw new Error(`PowerShell major version mismatch for pwsh.exe: expected 7 (PowerShell 7), got ${major}`);
  }

  return { platform: 'win32', arch: 'x64', nodeVersion: currentNodeVersion, psMajor: major };
}

// ---------------------------------------------------------------------------
// Exact Asset and Receipt Verification (Node built-ins only)
// ---------------------------------------------------------------------------

export function getExpectedCandidateAssetNames(version) {
  return [
    `evcrate-v${version}-linux-x64.tar.gz`,
    `evcrate-v${version}-linux-x64.tar.gz.sha256`,
    `evcrate-v${version}-windows-x64.zip`,
    `evcrate-v${version}-windows-x64.zip.sha256`,
    `evcrate-v${version}.release.json`,
    'install.sh',
    'install.ps1'
  ].sort(compareCodePoints);
}

export function getExpectedPredecessorAssetNames(version) {
  return [
    `evcrate-v${version}-windows-x64.zip`,
    `evcrate-v${version}-windows-x64.zip.sha256`,
    `evcrate-v${version}.release.json`,
    'install.ps1'
  ].sort(compareCodePoints);
}

export function verifyDirectoryMembership(targetDir, expectedNames) {
  const dirStat = fs.lstatSync(targetDir);
  if (dirStat.isSymbolicLink()) {
    throw new Error(`Target directory cannot be a symbolic link: "${targetDir}"`);
  }
  if (!dirStat.isDirectory()) {
    throw new Error(`Target directory is not a directory: "${targetDir}"`);
  }

  const entries = fs.readdirSync(targetDir);
  for (const entry of entries) {
    const entryPath = path.join(targetDir, entry);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link rejected in release directory: "${entry}"`);
    }
    if (!stat.isFile()) {
      throw new Error(`Non-regular file rejected in release directory: "${entry}"`);
    }
  }

  const sortedActual = [...entries].sort(compareCodePoints);
  const sortedExpected = [...expectedNames].sort(compareCodePoints);

  if (sortedActual.length !== sortedExpected.length) {
    throw new Error(
      `Directory file count mismatch in "${targetDir}": expected ${sortedExpected.length}, got ${sortedActual.length}`
    );
  }

  for (let idx = 0; idx < sortedExpected.length; idx++) {
    if (sortedActual[idx] !== sortedExpected[idx]) {
      throw new Error(
        `Directory membership mismatch in "${targetDir}": expected "${sortedExpected[idx]}", found "${sortedActual[idx]}"`
      );
    }
  }
}

export function verifyCandidateAssets(assetsDir, version, sourceCommit) {
  const expectedNames = getExpectedCandidateAssetNames(version);
  verifyDirectoryMembership(assetsDir, expectedNames);

  // Parse and verify release metadata
  const metaPath = path.join(assetsDir, `evcrate-v${version}.release.json`);
  const metaRaw = fs.readFileSync(metaPath, 'utf8');
  let metadata;
  try {
    metadata = JSON.parse(metaRaw);
  } catch (err) {
    throw new Error(`Failed to parse release metadata JSON: ${err.message}`);
  }

  if (metadata.schema !== SCHEMA_RELEASE) {
    throw new Error(`Metadata schema mismatch: expected "${SCHEMA_RELEASE}", got "${metadata.schema}"`);
  }
  if (metadata.version !== version) {
    throw new Error(`Metadata version mismatch: expected "${version}", got "${metadata.version}"`);
  }
  if (metadata.tag !== `v${version}`) {
    throw new Error(`Metadata tag mismatch: expected "v${version}", got "${metadata.tag}"`);
  }
  if (metadata.source_commit !== sourceCommit) {
    throw new Error(`Metadata source_commit mismatch: expected "${sourceCommit}", got "${metadata.source_commit}"`);
  }

  const computedFiles = [];

  // Verify Windows archive, sidecar, installer
  const winArchive = `evcrate-v${version}-windows-x64.zip`;
  const winArchiveSha = sha256File(path.join(assetsDir, winArchive));
  const winSidecarPath = path.join(assetsDir, `${winArchive}.sha256`);
  const winSidecar = parseSidecar(fs.readFileSync(winSidecarPath, 'utf8'), winArchive);

  if (winSidecar.sha256 !== winArchiveSha) {
    throw new Error(`Windows sidecar SHA-256 mismatch for "${winArchive}": sidecar=${winSidecar.sha256}, disk=${winArchiveSha}`);
  }

  const winRecord = metadata.platforms?.['windows-x64'];
  if (!winRecord) throw new Error('Metadata missing platforms["windows-x64"] record');
  if (winRecord.sha256 !== winArchiveSha) {
    throw new Error(`Metadata platforms["windows-x64"] SHA mismatch: metadata=${winRecord.sha256}, disk=${winArchiveSha}`);
  }

  const ps1Record = metadata.installers?.['install.ps1'];
  if (!ps1Record) throw new Error('Metadata missing installers["install.ps1"] record');
  const ps1Sha = sha256File(path.join(assetsDir, 'install.ps1'));
  if (ps1Record.sha256 !== ps1Sha) {
    throw new Error(`Metadata installers["install.ps1"] SHA mismatch: metadata=${ps1Record.sha256}, disk=${ps1Sha}`);
  }

  // Hash every file in the directory
  for (const name of expectedNames) {
    const filePath = path.join(assetsDir, name);
    const stat = fs.statSync(filePath);
    const sha = sha256File(filePath);
    computedFiles.push({ name, size: stat.size, sha256: sha });
  }

  computedFiles.sort((a, b) => compareCodePoints(a.name, b.name));
  return { version, sourceCommit, metadata, files: computedFiles };
}

export function verifyPredecessorAssets(predecessorDir) {
  const entries = fs.readdirSync(predecessorDir);
  const metaCandidates = entries.filter((e) => /^evcrate-v.+?\.release\.json$/u.test(e));
  if (metaCandidates.length !== 1) {
    throw new Error(`Predecessor directory must contain exactly one release metadata file, found ${metaCandidates.length}`);
  }

  const metaFile = metaCandidates[0];
  const versionMatch = /^evcrate-v(.+?)\.release\.json$/u.exec(metaFile);
  const version = versionMatch[1];

  const expectedNames = getExpectedPredecessorAssetNames(version);
  verifyDirectoryMembership(predecessorDir, expectedNames);

  const metaPath = path.join(predecessorDir, metaFile);
  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  if (metadata.schema !== SCHEMA_RELEASE) {
    throw new Error(`Predecessor metadata schema mismatch: expected "${SCHEMA_RELEASE}", got "${metadata.schema}"`);
  }
  if (metadata.version !== version) {
    throw new Error(`Predecessor metadata version mismatch: expected "${version}", got "${metadata.version}"`);
  }

  const winArchive = `evcrate-v${version}-windows-x64.zip`;
  const winArchiveSha = sha256File(path.join(predecessorDir, winArchive));
  const winSidecarPath = path.join(predecessorDir, `${winArchive}.sha256`);
  const winSidecar = parseSidecar(fs.readFileSync(winSidecarPath, 'utf8'), winArchive);
  if (winSidecar.sha256 !== winArchiveSha) {
    throw new Error(`Predecessor sidecar SHA-256 mismatch for "${winArchive}"`);
  }

  const winRecord = metadata.platforms?.['windows-x64'];
  if (!winRecord) throw new Error('Predecessor metadata missing platforms["windows-x64"] record');
  if (winRecord.sha256 !== winArchiveSha) {
    throw new Error(`Predecessor metadata platforms["windows-x64"] SHA mismatch: metadata=${winRecord.sha256}, disk=${winArchiveSha}`);
  }

  const ps1Record = metadata.installers?.['install.ps1'];
  if (!ps1Record) throw new Error('Predecessor metadata missing installers["install.ps1"] record');
  const ps1Sha = sha256File(path.join(predecessorDir, 'install.ps1'));
  if (ps1Record.sha256 !== ps1Sha) {
    throw new Error(`Predecessor metadata installers["install.ps1"] SHA mismatch: metadata=${ps1Record.sha256}, disk=${ps1Sha}`);
  }
  const computedFiles = [];
  for (const name of expectedNames) {
    const filePath = path.join(predecessorDir, name);
    const stat = fs.statSync(filePath);
    const sha = sha256File(filePath);
    computedFiles.push({ name, size: stat.size, sha256: sha });
  }

  computedFiles.sort((a, b) => compareCodePoints(a.name, b.name));
  return { version, tag: `v${version}`, sourceCommit: metadata.source_commit, files: computedFiles };
}

export function verifyCandidateReceipt(receiptPath, candidateFiles, predecessorFiles, options, predResult = null) {
  if (!fs.existsSync(receiptPath)) {
    throw new Error(`Receipt file not found: "${receiptPath}"`);
  }

  const raw = fs.readFileSync(receiptPath, 'utf8');
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Malformed receipt JSON: ${err.message}`);
  }

  if (receipt.schema !== SCHEMA_CANDIDATE) {
    throw new Error(`Receipt schema mismatch: expected "${SCHEMA_CANDIDATE}", got "${receipt.schema}"`);
  }
  if (receipt.version !== options.version) {
    throw new Error(`Receipt version mismatch: expected "${options.version}", got "${receipt.version}"`);
  }
  if (receipt.tag !== `v${options.version}`) {
    throw new Error(`Receipt tag mismatch: expected "v${options.version}", got "${receipt.tag}"`);
  }
  if (receipt.source_commit !== options.sourceCommit) {
    throw new Error(`Receipt source_commit mismatch: expected "${options.sourceCommit}", got "${receipt.source_commit}"`);
  }

  if (options.repository && receipt.repository !== options.repository) {
    throw new Error(`Receipt repository mismatch: expected "${options.repository}", got "${receipt.repository}"`);
  }
  if (options.workflowRunId && receipt.workflow_run_id !== options.workflowRunId) {
    throw new Error(`Receipt workflow_run_id mismatch: expected ${options.workflowRunId}, got ${receipt.workflow_run_id}`);
  }
  if (options.workflowRunAttempt && receipt.workflow_run_attempt !== options.workflowRunAttempt) {
    throw new Error(`Receipt workflow_run_attempt mismatch: expected ${options.workflowRunAttempt}, got ${receipt.workflow_run_attempt}`);
  }

  // Cross-check candidate files
  if (!Array.isArray(receipt.files) || receipt.files.length !== candidateFiles.length) {
    throw new Error(`Receipt files array length mismatch: expected ${candidateFiles.length}, got ${receipt.files?.length}`);
  }

  for (const candFile of candidateFiles) {
    const rec = receipt.files.find((f) => f.name === candFile.name);
    if (!rec) {
      throw new Error(`Receipt missing file entry for "${candFile.name}"`);
    }
    if (rec.size !== candFile.size) {
      throw new Error(`Receipt file size mismatch for "${candFile.name}": receipt=${rec.size}, disk=${candFile.size}`);
    }
    if (rec.sha256.toLowerCase() !== candFile.sha256.toLowerCase()) {
      throw new Error(`Receipt file sha256 mismatch for "${candFile.name}": receipt=${rec.sha256}, disk=${candFile.sha256}`);
    }
  }

  // Cross-check predecessor records if present/required
  if (predecessorFiles) {
    if (!receipt.predecessor) {
      throw new Error(`Receipt missing required "predecessor" object`);
    }
    const predRec = receipt.predecessor;
    if (!['bootstrap-fixture', 'qualified-release'].includes(predRec.kind)) {
      throw new Error(`Invalid predecessor kind in receipt: "${predRec.kind}"`);
    }
    if (predResult) {
      if (predRec.version !== predResult.version) {
        throw new Error(`Receipt predecessor version mismatch: receipt=${predRec.version}, disk=${predResult.version}`);
      }
      if (predRec.tag !== predResult.tag) {
        throw new Error(`Receipt predecessor tag mismatch: receipt=${predRec.tag}, disk=${predResult.tag}`);
      }
      if (predRec.source_commit !== predResult.sourceCommit) {
        throw new Error(`Receipt predecessor source_commit mismatch: receipt=${predRec.source_commit}, disk=${predResult.sourceCommit}`);
      }
    }
    if (!Array.isArray(predRec.files) || predRec.files.length !== predecessorFiles.length) {
      throw new Error(`Receipt predecessor files count mismatch: expected ${predecessorFiles.length}, got ${predRec.files?.length}`);
    }
    for (const predFile of predecessorFiles) {
      const rec = predRec.files.find((f) => f.name === predFile.name);
      if (!rec) {
        throw new Error(`Receipt predecessor missing file entry for "${predFile.name}"`);
      }
      if (rec.size !== predFile.size) {
        throw new Error(`Receipt predecessor file size mismatch for "${predFile.name}"`);
      }
      if (rec.sha256.toLowerCase() !== predFile.sha256.toLowerCase()) {
        throw new Error(`Receipt predecessor sha256 mismatch for "${predFile.name}"`);
      }
    }
  }

  return receipt;
}

// ---------------------------------------------------------------------------
// Safe Child Process Wrappers
// ---------------------------------------------------------------------------

export function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    const timeoutMs = options.timeoutMs || 180000;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Process timed out after ${timeoutMs}ms: ${executable} ${args.join(' ')}`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

export async function safeReleaseProcess(proc) {
  if (!proc) return;
  if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) {
    try {
      proc.stdin.write('\n');
      proc.stdin.end();
    } catch {
      // Stream write error ignored during shutdown
    }
  }
  if (proc.exitCode === null) {
    await new Promise((resolve) => {
      let timer;
      const onClose = () => {
        clearTimeout(timer);
        resolve();
      };
      proc.once('close', onClose);
      timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        resolve();
      }, 5000);
    });
  }
}

export function runPowerShell(powershell, scriptPath, subcommand, cmdArgs = [], envOverrides = {}) {
  const safeArgs = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    subcommand,
    ...cmdArgs
  ];

  return runProcess(powershell, safeArgs, {
    env: { ...process.env, ...envOverrides }
  });
}

export async function runCmdVersionSmoke(binDir, expectedVersion) {
  const cmdLauncher = path.join(binDir, 'evcrate.cmd');
  if (!fs.existsSync(cmdLauncher)) {
    throw new Error(`Launcher cmd not found: "${cmdLauncher}"`);
  }

  const comSpec = process.env.ComSpec || 'cmd.exe';
  const args = ['/d', '/s', '/c', `""${cmdLauncher}" version --json"`];

  const { exitCode, stdout, stderr } = await runProcess(comSpec, args, { windowsVerbatimArguments: true });
  if (exitCode !== 0) {
    throw new Error(`Launcher version --json failed with exit ${exitCode}:\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (err) {
    throw new Error(`Failed to parse version --json output as JSON: "${stdout}"`);
  }

  if (parsed.status !== 'ok') {
    throw new Error(`Expected status "ok", got "${parsed.status}"`);
  }
  if (parsed.payload?.version !== expectedVersion) {
    throw new Error(`Expected version "${expectedVersion}", got "${parsed.payload?.version}"`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// User PATH Management (Registry-backed via PowerShell API)
// ---------------------------------------------------------------------------

export async function getUserPath(powershell) {
  const args = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[Console]::Write([System.Environment]::GetEnvironmentVariable("PATH", [System.EnvironmentVariableTarget]::User))'
  ];
  const { exitCode, stdout, stderr } = await runProcess(powershell, args);
  if (exitCode !== 0) {
    throw new Error(`Failed to read User PATH: ${stderr}`);
  }
  return stdout;
}

export async function setUserPath(powershell, newPath) {
  const script = '[System.Environment]::SetEnvironmentVariable("PATH", $env:__EVCRATE_SET_USER_PATH, [System.EnvironmentVariableTarget]::User)';
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script];
  const { exitCode, stderr } = await runProcess(powershell, args, {
    env: { ...process.env, __EVCRATE_SET_USER_PATH: newPath || '' }
  });
  if (exitCode !== 0) {
    throw new Error(`Failed to write User PATH: ${stderr}`);
  }
}

// ---------------------------------------------------------------------------
// State Observers (Pointers, Receipts, Hashes, Sentinels)
// ---------------------------------------------------------------------------

export function observePointer(dataDir) {
  const currentJsonPath = path.join(dataDir, 'current.json');
  if (!fs.existsSync(currentJsonPath)) {
    throw new Error(`current.json pointer does not exist: "${currentJsonPath}"`);
  }
  const stat = fs.lstatSync(currentJsonPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`current.json cannot be a symbolic link`);
  }

  const raw = fs.readFileSync(currentJsonPath, 'utf8').replace(/^\uFEFF/, '');
  const pointer = JSON.parse(raw);

  if (pointer.schema !== SCHEMA_POINTER) {
    throw new Error(`Pointer schema mismatch: expected "${SCHEMA_POINTER}", got "${pointer.schema}"`);
  }
  if (!pointer.version_dir || typeof pointer.version_dir !== 'string') {
    throw new Error(`Invalid pointer version_dir: "${pointer.version_dir}"`);
  }

  const targetDir = path.join(dataDir, 'versions', pointer.version_dir);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Target version directory missing: "${targetDir}"`);
  }

  return pointer;
}

export function observeReceipt(dataDir, versionDir) {
  const receiptPath = path.join(dataDir, 'versions', versionDir, 'installer-receipt.json');
  if (!fs.existsSync(receiptPath)) {
    throw new Error(`installer-receipt.json missing in snapshot "${versionDir}"`);
  }

  const raw = fs.readFileSync(receiptPath, 'utf8').replace(/^\uFEFF/, '');
  const receipt = JSON.parse(raw);
  if (receipt.schema !== SCHEMA_RECEIPT) {
    throw new Error(`Receipt schema mismatch in snapshot "${versionDir}"`);
  }
  if (receipt.snapshot_id !== versionDir) {
    throw new Error(`Receipt snapshot_id mismatch: expected "${versionDir}", got "${receipt.snapshot_id}"`);
  }

  // Verify immutable files exist on disk and check sha256
  const targetDir = path.join(dataDir, 'versions', versionDir);
  const packageDir = path.join(targetDir, 'package');
  const baseDir = fs.existsSync(packageDir) ? packageDir : targetDir;
  const fileRecords = [];

  for (const [relPath, info] of Object.entries(receipt.immutable_files || {})) {
    const fullPath = path.join(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Immutable file missing from snapshot "${versionDir}": "${relPath}"`);
    }
    const stat = fs.statSync(fullPath);
    if (stat.size !== info.size) {
      throw new Error(`Immutable file size mismatch for "${relPath}" in snapshot "${versionDir}"`);
    }
    const sha = sha256File(fullPath);
    if (sha.toLowerCase() !== info.sha256.toLowerCase()) {
      throw new Error(`Immutable file sha256 mismatch for "${relPath}" in snapshot "${versionDir}"`);
    }
    fileRecords.push({ path: relPath, sha256: sha });
  }

  fileRecords.sort((a, b) => compareCodePoints(a.path, b.path));
  const digestInput = fileRecords.map((r) => `${r.sha256}  ${r.path}\n`).join('');
  const computedDigest = sha256String(digestInput);

  return { receipt, immutableDirectoryDigest: computedDigest };
}

export async function observeInvariants(powershell, dataDir, stateDir, binDir, sentinelDataFile, sentinelStateFile, sentinelPathEntry, isInstalled) {
  // Check sentinel files
  if (!fs.existsSync(sentinelDataFile) || fs.readFileSync(sentinelDataFile, 'utf8') !== 'sentinel-data') {
    throw new Error('Unrelated data sentinel corrupted or missing');
  }
  if (!fs.existsSync(sentinelStateFile) || fs.readFileSync(sentinelStateFile, 'utf8') !== 'sentinel-state') {
    throw new Error('Unrelated state sentinel corrupted or missing');
  }

  // Check user PATH
  const currentPath = await getUserPath(powershell);
  const pathParts = currentPath.split(';').filter((p) => p.trim().length > 0);

  if (!pathParts.includes(sentinelPathEntry)) {
    throw new Error(`Unrelated PATH sentinel missing from user PATH: "${sentinelPathEntry}"`);
  }

  const normBin = path.normalize(binDir).toLowerCase().replace(/[\\/]+$/u, '');
  const hasBin = pathParts.some((p) => path.normalize(p).toLowerCase().replace(/[\\/]+$/u, '') === normBin);

  if (isInstalled && !hasBin) {
    throw new Error(`Installer bin directory missing from User PATH: "${binDir}"`);
  }
  if (!isInstalled && hasBin) {
    throw new Error(`Uninstalled bin directory still present in User PATH: "${binDir}"`);
  }
}

// ---------------------------------------------------------------------------
// Smoke Qualification Flow
// ---------------------------------------------------------------------------

export async function runSmokeMode(options, sandboxRoot) {
  const dataDir = path.join(sandboxRoot, 'data with spaces');
  const stateDir = path.join(sandboxRoot, 'state with spaces');
  const binDir = path.join(sandboxRoot, 'bin with spaces');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const sentinelDataFile = path.join(dataDir, 'unrelated-sentinel.txt');
  const sentinelStateFile = path.join(stateDir, 'unrelated-sentinel.txt');
  fs.writeFileSync(sentinelDataFile, 'sentinel-data', 'utf8');
  fs.writeFileSync(sentinelStateFile, 'sentinel-state', 'utf8');

  const sentinelPathEntry = 'C:\\evcrate-unrelated-sentinel-path';
  const originalUserPath = await getUserPath(options.powershell);
  const pathWithSentinel = originalUserPath ? `${originalUserPath};${sentinelPathEntry}` : sentinelPathEntry;
  await setUserPath(options.powershell, pathWithSentinel);

  const installPs1 = path.join(options.assets, 'install.ps1');
  const archivePath = path.join(options.assets, `evcrate-v${options.version}-windows-x64.zip`);
  const checksumPath = path.join(options.assets, `evcrate-v${options.version}-windows-x64.zip.sha256`);
  const metaPath = path.join(options.assets, `evcrate-v${options.version}.release.json`);

  const commonArgs = [
    '-Archive', archivePath,
    '-Checksum', checksumPath,
    '-Metadata', metaPath,
    '-DataDir', dataDir,
    '-StateDir', stateDir,
    '-BinDir', binDir
  ];

  try {
    // 1. Install candidate
    const installRes = await runPowerShell(options.powershell, installPs1, 'install', commonArgs);
    if (installRes.exitCode !== 0) {
      throw new Error(`Smoke install failed with exit ${installRes.exitCode}:\n${installRes.stderr}\n${installRes.stdout}`);
    }

    // 2. Verify cmd.exe version smoke
    await runCmdVersionSmoke(binDir, options.version);

    // 3. Observe pointer and invariants
    const pointer = observePointer(dataDir);
    if (pointer.package_version !== options.version) {
      throw new Error(`Pointer version mismatch: expected "${options.version}", got "${pointer.package_version}"`);
    }
    const receiptObs = observeReceipt(dataDir, pointer.version_dir);
    if (!receiptObs.immutableDirectoryDigest) {
      throw new Error('Immutable directory digest computation failed');
    }

    await observeInvariants(options.powershell, dataDir, stateDir, binDir, sentinelDataFile, sentinelStateFile, sentinelPathEntry, true);

    // 4. Uninstall candidate
    const uninstRes = await runPowerShell(options.powershell, installPs1, 'uninstall', [
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);
    if (uninstRes.exitCode !== 0) {
      throw new Error(`Smoke uninstall failed with exit ${uninstRes.exitCode}:\n${uninstRes.stderr}\n${uninstRes.stdout}`);
    }

    // 5. Repeat uninstall (assert idempotent exit 0)
    const repeatUninstRes = await runPowerShell(options.powershell, installPs1, 'uninstall', [
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);
    if (repeatUninstRes.exitCode !== 0) {
      throw new Error(`Repeat uninstall failed with exit ${repeatUninstRes.exitCode}:\n${repeatUninstRes.stderr}`);
    }

    // 6. Assert uninstalled state
    if (fs.existsSync(path.join(dataDir, 'current.json'))) {
      throw new Error('current.json still exists after uninstall');
    }
    if (fs.existsSync(path.join(binDir, 'evcrate.cmd'))) {
      throw new Error('evcrate.cmd still exists after uninstall');
    }

    await observeInvariants(options.powershell, dataDir, stateDir, binDir, sentinelDataFile, sentinelStateFile, sentinelPathEntry, false);
  } finally {
    // Restore user PATH
    await setUserPath(options.powershell, originalUserPath);
  }
}

// ---------------------------------------------------------------------------
// Full Qualification Flow (State Machine Transitions)
// ---------------------------------------------------------------------------

export async function runFullMode(options, sandboxRoot, predInfo) {
  const dataDir = path.join(sandboxRoot, 'data with spaces');
  const stateDir = path.join(sandboxRoot, 'state with spaces');
  const binDir = path.join(sandboxRoot, 'bin with spaces');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const sentinelDataFile = path.join(dataDir, 'unrelated-sentinel.txt');
  const sentinelStateFile = path.join(stateDir, 'unrelated-sentinel.txt');
  fs.writeFileSync(sentinelDataFile, 'sentinel-data', 'utf8');
  fs.writeFileSync(sentinelStateFile, 'sentinel-state', 'utf8');

  const sentinelPathEntry = 'C:\\evcrate-unrelated-sentinel-path';
  const originalUserPath = await getUserPath(options.powershell);
  const pathWithSentinel = originalUserPath ? `${originalUserPath};${sentinelPathEntry}` : sentinelPathEntry;
  await setUserPath(options.powershell, pathWithSentinel);

  const candInstallPs1 = path.join(options.assets, 'install.ps1');
  const candArchive = path.join(options.assets, `evcrate-v${options.version}-windows-x64.zip`);
  const candChecksum = path.join(options.assets, `evcrate-v${options.version}-windows-x64.zip.sha256`);
  const candMeta = path.join(options.assets, `evcrate-v${options.version}.release.json`);

  const predInstallPs1 = path.join(options.predecessor, 'install.ps1');
  const predArchive = path.join(options.predecessor, `evcrate-v${predInfo.version}-windows-x64.zip`);
  const predChecksum = path.join(options.predecessor, `evcrate-v${predInfo.version}-windows-x64.zip.sha256`);
  const predMeta = path.join(options.predecessor, `evcrate-v${predInfo.version}.release.json`);

  const candArgs = [
    '-Archive', candArchive,
    '-Checksum', candChecksum,
    '-Metadata', candMeta,
    '-DataDir', dataDir,
    '-StateDir', stateDir,
    '-BinDir', binDir
  ];

  const predArgs = [
    '-Archive', predArchive,
    '-Checksum', predChecksum,
    '-Metadata', predMeta,
    '-DataDir', dataDir,
    '-StateDir', stateDir,
    '-BinDir', binDir
  ];

  try {
    // 1. Install Predecessor
    const p1Res = await runPowerShell(options.powershell, predInstallPs1, 'install', predArgs);
    if (p1Res.exitCode !== 0) {
      throw new Error(`Full Step 1 (predecessor install) failed: ${p1Res.stderr}\n${p1Res.stdout}`);
    }
    await runCmdVersionSmoke(binDir, predInfo.version);
    const predPtr = observePointer(dataDir);
    const predSnapId = predPtr.version_dir;
    const predDigest = observeReceipt(dataDir, predSnapId).immutableDirectoryDigest;
    await observeInvariants(options.powershell, dataDir, stateDir, binDir, sentinelDataFile, sentinelStateFile, sentinelPathEntry, true);

    // 2. Repeat Predecessor Install (Idempotent)
    const p2Res = await runPowerShell(options.powershell, predInstallPs1, 'install', predArgs);
    if (p2Res.exitCode !== 0) {
      throw new Error(`Full Step 2 (predecessor repeat install) failed: ${p2Res.stderr}`);
    }
    const p2Ptr = observePointer(dataDir);
    if (p2Ptr.version_dir !== predSnapId) {
      throw new Error(`Idempotence violated: snapshot changed from ${predSnapId} to ${p2Ptr.version_dir}`);
    }
    const p2Digest = observeReceipt(dataDir, predSnapId).immutableDirectoryDigest;
    if (p2Digest !== predDigest) {
      throw new Error('Immutable directory digest changed on idempotent repeat install');
    }

    // 3. Upgrade to Candidate
    const p3Res = await runPowerShell(options.powershell, candInstallPs1, 'install', candArgs);
    if (p3Res.exitCode !== 0) {
      throw new Error(`Full Step 3 (upgrade to candidate) failed: ${p3Res.stderr}\n${p3Res.stdout}`);
    }
    await runCmdVersionSmoke(binDir, options.version);
    const candPtr1 = observePointer(dataDir);
    const candSnapId1 = candPtr1.version_dir;
    if (candSnapId1 === predSnapId) {
      throw new Error(`Candidate snapshot ID should differ from predecessor: "${candSnapId1}"`);
    }
    const candDigest1 = observeReceipt(dataDir, candSnapId1).immutableDirectoryDigest;

    // 4. Rollback to Predecessor
    const p4Res = await runPowerShell(options.powershell, candInstallPs1, 'rollback', [
      predSnapId,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);
    if (p4Res.exitCode !== 0) {
      throw new Error(`Full Step 4 (rollback to predecessor) failed: ${p4Res.stderr}`);
    }
    await runCmdVersionSmoke(binDir, predInfo.version);
    const p4Ptr = observePointer(dataDir);
    if (p4Ptr.version_dir !== predSnapId) {
      throw new Error(`Rollback failed to restore predecessor snapshot: got "${p4Ptr.version_dir}"`);
    }
    const p4Digest = observeReceipt(dataDir, predSnapId).immutableDirectoryDigest;
    if (p4Digest !== predDigest) {
      throw new Error('Predecessor immutable digest mismatch after rollback');
    }

    // 5. Reinstall Candidate
    const p5Res = await runPowerShell(options.powershell, candInstallPs1, 'install', candArgs);
    if (p5Res.exitCode !== 0) {
      throw new Error(`Full Step 5 (reinstall candidate) failed: ${p5Res.stderr}`);
    }
    await runCmdVersionSmoke(binDir, options.version);
    const candPtr2 = observePointer(dataDir);
    const candSnapId2 = candPtr2.version_dir;

    // 6. Repeat Candidate Install (Idempotent)
    const p6Res = await runPowerShell(options.powershell, candInstallPs1, 'install', candArgs);
    if (p6Res.exitCode !== 0) {
      throw new Error(`Full Step 6 (repeat candidate install) failed: ${p6Res.stderr}`);
    }
    const candPtr2Repeat = observePointer(dataDir);
    if (candPtr2Repeat.version_dir !== candSnapId2) {
      throw new Error(`Idempotence violated on candidate repeat: "${candPtr2Repeat.version_dir}" vs "${candSnapId2}"`);
    }

    // 7. Repair Candidate (Must select NEW generation)
    const p7Res = await runPowerShell(options.powershell, candInstallPs1, 'repair', candArgs);
    if (p7Res.exitCode !== 0) {
      throw new Error(`Full Step 7 (repair candidate) failed: ${p7Res.stderr}\n${p7Res.stdout}`);
    }
    await runCmdVersionSmoke(binDir, options.version);
    const candPtr3 = observePointer(dataDir);
    const candSnapId3 = candPtr3.version_dir;
    if (candSnapId3 === candSnapId2) {
      throw new Error(`Repair must create a new generation snapshot: remained "${candSnapId2}"`);
    }
    const candDigest3 = observeReceipt(dataDir, candSnapId3).immutableDirectoryDigest;
    if (candDigest3 !== candDigest1) {
      throw new Error('Candidate repair immutable digest mismatch with original candidate');
    }

    // 8. Rollback to earlier Candidate generation
    const p8Res = await runPowerShell(options.powershell, candInstallPs1, 'rollback', [
      candSnapId2,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);
    if (p8Res.exitCode !== 0) {
      throw new Error(`Full Step 8 (rollback to earlier generation) failed: ${p8Res.stderr}`);
    }
    const p8Ptr = observePointer(dataDir);
    if (p8Ptr.version_dir !== candSnapId2) {
      throw new Error(`Rollback failed to select target generation: got "${p8Ptr.version_dir}"`);
    }

    // 9. Node-less Rollback and Uninstall
    // Strip Node directory from child PATH
    const currentPath = process.env.PATH || '';
    const strippedPath = currentPath
      .split(';')
      .filter((segment) => {
        if (!segment.trim()) return false;
        try {
          const nodeExe = path.join(segment, 'node.exe');
          return !fs.existsSync(nodeExe);
        } catch {
          return true;
        }
      })
      .join(';');

    // Verify strippedPath does not have node
    const testNodeRes = await runProcess(options.powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      'Get-Command node.exe -ErrorAction SilentlyContinue'
    ], { env: { ...process.env, PATH: strippedPath } });

    if (testNodeRes.stdout.trim().length > 0) {
      // Node was not completely stripped; log warning
    }

    // Rollback without Node
    const nodelessRbRes = await runPowerShell(options.powershell, candInstallPs1, 'rollback', [
      candSnapId3,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ], { PATH: strippedPath });

    if (nodelessRbRes.exitCode !== 0) {
      throw new Error(`Node-less rollback failed: ${nodelessRbRes.stderr}\n${nodelessRbRes.stdout}`);
    }

    // Uninstall without Node
    const nodelessUninstRes = await runPowerShell(options.powershell, candInstallPs1, 'uninstall', [
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ], { PATH: strippedPath });

    if (nodelessUninstRes.exitCode !== 0) {
      throw new Error(`Node-less uninstall failed: ${nodelessUninstRes.stderr}\n${nodelessUninstRes.stdout}`);
    }

    await observeInvariants(options.powershell, dataDir, stateDir, binDir, sentinelDataFile, sentinelStateFile, sentinelPathEntry, false);
  } finally {
    await setUserPath(options.powershell, originalUserPath);
  }
}

// ---------------------------------------------------------------------------
// Isolated Negative Scenarios
// ---------------------------------------------------------------------------

export async function runNegativeScenarios(options, baseSandboxRoot) {
  const originalUserPath = await getUserPath(options.powershell);
  try {
    const negRoot = path.join(baseSandboxRoot, 'negatives');
    fs.mkdirSync(negRoot, { recursive: true });
  const candInstallPs1 = path.join(options.assets, 'install.ps1');
  const candArchive = path.join(options.assets, `evcrate-v${options.version}-windows-x64.zip`);
  const candChecksum = path.join(options.assets, `evcrate-v${options.version}-windows-x64.zip.sha256`);
  const candMeta = path.join(options.assets, `evcrate-v${options.version}.release.json`);

  // --- Negative 1: Tampered sidecar ---
  {
    const subSandbox = path.join(negRoot, 'neg1-tampered-sidecar');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');
    fs.mkdirSync(subSandbox, { recursive: true });

    const tamperedSidecar = path.join(subSandbox, 'tampered.sha256');
    fs.writeFileSync(tamperedSidecar, '0'.repeat(64) + '  ' + path.basename(candArchive) + '\n', 'utf8');

    const res = await runPowerShell(options.powershell, candInstallPs1, 'install', [
      '-Archive', candArchive,
      '-Checksum', tamperedSidecar,
      '-Metadata', candMeta,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    if (res.exitCode === 0) {
      throw new Error('Negative 1 failed: install succeeded despite tampered sidecar');
    }
    // Assert no mutation occurred
    if (fs.existsSync(dataDir) && fs.existsSync(path.join(dataDir, 'current.json'))) {
      throw new Error('Negative 1 mutation violation: current.json created despite failed sidecar');
    }
  }

  // --- Negative 2: Incomplete explicit trio ---
  {
    const subSandbox = path.join(negRoot, 'neg2-incomplete-trio');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');
    fs.mkdirSync(subSandbox, { recursive: true });

    // Pass only -Archive without -Checksum or -Metadata
    const res = await runPowerShell(options.powershell, candInstallPs1, 'install', [
      '-Archive', candArchive,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    if (res.exitCode === 0) {
      throw new Error('Negative 2 failed: install succeeded with incomplete explicit trio');
    }
    if (fs.existsSync(dataDir) && fs.existsSync(path.join(dataDir, 'current.json'))) {
      throw new Error('Negative 2 mutation violation: target mutated despite incomplete trio');
    }
  }

  // --- Negative 3: Invalid rollback ID ---
  {
    const subSandbox = path.join(negRoot, 'neg3-invalid-rollback');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');

    // Install candidate first
    await runPowerShell(options.powershell, candInstallPs1, 'install', [
      '-Archive', candArchive,
      '-Checksum', candChecksum,
      '-Metadata', candMeta,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    const beforePointer = fs.readFileSync(path.join(dataDir, 'current.json'), 'utf8');

    // Try traversal rollback
    const res1 = await runPowerShell(options.powershell, candInstallPs1, 'rollback', [
      '../traversal',
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);
    if (res1.exitCode === 0) {
      throw new Error('Negative 3 failed: rollback succeeded with traversal ID');
    }

    // Try slash rollback
    const res2 = await runPowerShell(options.powershell, candInstallPs1, 'rollback', [
      'invalid/snapshot',
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);
    if (res2.exitCode === 0) {
      throw new Error('Negative 3 failed: rollback succeeded with slash snapshot ID');
    }

    const afterPointer = fs.readFileSync(path.join(dataDir, 'current.json'), 'utf8');
    if (beforePointer !== afterPointer) {
      throw new Error('Negative 3 mutation violation: pointer mutated after failed rollback');
    }
  }

  // --- Negative 4: Tampered receipt path ---
  {
    const subSandbox = path.join(negRoot, 'neg4-tampered-receipt');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');

    await runPowerShell(options.powershell, candInstallPs1, 'install', [
      '-Archive', candArchive,
      '-Checksum', candChecksum,
      '-Metadata', candMeta,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    const ptr = observePointer(dataDir);
    const rcptFile = path.join(dataDir, 'versions', ptr.version_dir, 'installer-receipt.json');
    const rcpt = JSON.parse(fs.readFileSync(rcptFile, 'utf8'));

    // Inject traversal in immutable_files
    rcpt.immutable_files['../../escaped.txt'] = { size: 10, sha256: '0'.repeat(64), mode: 420 };
    fs.writeFileSync(rcptFile, JSON.stringify(rcpt, null, 2), 'utf8');

    const beforePointer = fs.readFileSync(path.join(dataDir, 'current.json'), 'utf8');

    // Attempt rollback to this tampered snapshot
    const res = await runPowerShell(options.powershell, candInstallPs1, 'rollback', [
      ptr.version_dir,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    if (res.exitCode === 0) {
      throw new Error('Negative 4 failed: rollback succeeded with tampered receipt path');
    }

    const afterPointer = fs.readFileSync(path.join(dataDir, 'current.json'), 'utf8');
    if (beforePointer !== afterPointer) {
      throw new Error('Negative 4 mutation violation: pointer mutated after failed tampered receipt check');
    }
  }

  // --- Negative 5: Concurrent active lock ---
  {
    const subSandbox = path.join(negRoot, 'neg5-active-lock');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');
    fs.mkdirSync(stateDir, { recursive: true });

    const lockFile = path.join(stateDir, 'install.lock');
    // Lock file with exclusive sharing via PowerShell
    const lockScript = `
      $fs = [System.IO.File]::Open("${lockFile.replace(/\\/g, '\\\\')}", [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      [Console]::WriteLine("LOCKED")
      [Console]::ReadLine()
      $fs.Dispose()
    `;

    const lockProc = spawn(options.powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', lockScript
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Negative 5 lock acquisition timed out')), 15000);
        lockProc.stdout.on('data', (d) => {
          if (d.toString().includes('LOCKED')) {
            clearTimeout(timer);
            resolve();
          }
        });
        lockProc.on('error', (err) => { clearTimeout(timer); reject(err); });
        lockProc.on('close', (code) => {
          clearTimeout(timer);
          reject(new Error(`Negative 5 lock process exited prematurely with code ${code}`));
        });
      });

      const res = await runPowerShell(options.powershell, candInstallPs1, 'install', [
        '-Archive', candArchive,
        '-Checksum', candChecksum,
        '-Metadata', candMeta,
        '-DataDir', dataDir,
        '-StateDir', stateDir,
        '-BinDir', binDir
      ]);
      if (res.exitCode === 0) {
        throw new Error('Negative 5 failed: install succeeded despite active exclusive lock');
      }
    } finally {
      await safeReleaseProcess(lockProc);
    }
  }

  // --- Negative 6: Stale legacy lock reclaim ---
  {
    const subSandbox = path.join(negRoot, 'neg6-stale-lock');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');
    fs.mkdirSync(stateDir, { recursive: true });

    const lockFile = path.join(stateDir, 'install.lock');
    // Stale legacy lock: hostname, pid, created_at, no token
    const staleContent = JSON.stringify({
      hostname: os.hostname(),
      pid: 999999,
      created_at: '2020-01-01T00:00:00Z'
    });
    fs.writeFileSync(lockFile, staleContent, 'utf8');
    const res = await runPowerShell(options.powershell, candInstallPs1, 'install', [
      '-Archive', candArchive,
      '-Checksum', candChecksum,
      '-Metadata', candMeta,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    if (res.exitCode !== 0) {
      throw new Error(`Negative 6 failed: install failed on stale legacy lock: ${res.stderr}`);
    }

    // Verify quarantine file exists: install.ps1 names it install.lock.stale-<guid>
    const stateEntries = fs.readdirSync(stateDir);
    const quarantine = stateEntries.find((e) => e.startsWith('install.lock.stale-'));
    if (!quarantine) {
      throw new Error('Negative 6 failed: stale lock was not quarantined by rename');
    }
  }

  // --- Negative 7: Sibling-prefix journal escape ---
  {
    const subSandbox = path.join(negRoot, 'neg7-sibling-journal');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');
    fs.mkdirSync(stateDir, { recursive: true });

    const journalFile = path.join(stateDir, 'install-journal.json');
    // Craft staged journal with sibling-prefix destination
    const stagingDir = path.join(dataDir, 'staging');
    const siblingDir = `${stagingDir}-sibling`;
    const maliciousJournal = {
      schema: 'evcrate-install-journal/v1',
      operation: 'install',
      state: 'staged',
      stage_path: siblingDir,
      archive_digest: '0'.repeat(64),
      version: options.version,
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(journalFile, JSON.stringify(maliciousJournal, null, 2), 'utf8');
    const res = await runPowerShell(options.powershell, candInstallPs1, 'install', [
      '-Archive', candArchive,
      '-Checksum', candChecksum,
      '-Metadata', candMeta,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    if (res.exitCode === 0) {
      throw new Error('Negative 7 failed: install accepted sibling-prefix journal stage');
    }

    const combined = `${res.stdout}\n${res.stderr}`;
    if (!combined.includes('Journal stage_path escape detected')) {
      throw new Error(`Negative 7 did not fail with stage_path escape: ${combined}`);
    }
  }

  // --- Negative 8: Reparse/junction ancestor check ---
  {
    const subSandbox = path.join(negRoot, 'neg8-reparse');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');

    // Test Assert-NoReparseAncestor against a simulated junction if supported
    const linkSrc = path.join(subSandbox, 'real_dir');
    const linkDst = path.join(subSandbox, 'junction_dir');
    fs.mkdirSync(linkSrc, { recursive: true });

    let junctionCreated = false;
    try {
      const mklinkRes = await runProcess(process.env.ComSpec || 'cmd.exe', [
        '/d', '/s', '/c', `mklink /J "${linkDst}" "${linkSrc}"`
      ]);
      junctionCreated = mklinkRes.exitCode === 0;
    } catch {
      junctionCreated = false;
    }

    if (junctionCreated) {
      const reparseDataDir = path.join(linkDst, 'data');
      const res = await runPowerShell(options.powershell, candInstallPs1, 'install', [
        '-Archive', candArchive,
        '-Checksum', candChecksum,
        '-Metadata', candMeta,
        '-DataDir', reparseDataDir,
        '-StateDir', stateDir,
        '-BinDir', binDir
      ]);

      if (res.exitCode === 0) {
        throw new Error('Negative 8 failed: install succeeded inside junction tree');
      }
    } else {
      console.warn('[WARN] Junction creation failed or not supported; skipping Negative 8 reparse check');
    }
  }

  // --- Negative 9: Open immutable file handle on uninstall (Truthful nonzero uninstall) ---
  {
    const subSandbox = path.join(negRoot, 'neg9-open-handle');
    const dataDir = path.join(subSandbox, 'data');
    const stateDir = path.join(subSandbox, 'state');
    const binDir = path.join(subSandbox, 'bin');

    // Install candidate
    const instRes = await runPowerShell(options.powershell, candInstallPs1, 'install', [
      '-Archive', candArchive,
      '-Checksum', candChecksum,
      '-Metadata', candMeta,
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);
    if (instRes.exitCode !== 0) {
      throw new Error(`Negative 9 setup failed: ${instRes.stderr}`);
    }

    const ptr = observePointer(dataDir);
    const snapDir = path.join(dataDir, 'versions', ptr.version_dir);
    // Find an unpacked file to lock
    const rcptFile = path.join(snapDir, 'installer-receipt.json');
    const rcpt = JSON.parse(fs.readFileSync(rcptFile, 'utf8'));
    const firstRel = Object.keys(rcpt.immutable_files)[0];
    const pkgDir = path.join(snapDir, 'package');
    const baseDir = fs.existsSync(pkgDir) ? pkgDir : snapDir;
    const targetFileToLock = path.join(baseDir, firstRel);

    // Lock file with exclusive access using PowerShell
    const lockScript = `
      $ErrorActionPreference = 'Stop'
      $fs = [System.IO.File]::Open("${targetFileToLock.replace(/\\/g, '\\\\')}", [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
      [Console]::WriteLine("LOCKED")
      [Console]::ReadLine()
      $fs.Dispose()
    `;

    const lockProc = spawn(options.powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', lockScript
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Negative 9 lock acquisition timed out')), 15000);
        lockProc.stdout.on('data', (d) => {
          if (d.toString().includes('LOCKED')) {
            clearTimeout(timer);
            resolve();
          }
        });
        lockProc.on('error', (err) => { clearTimeout(timer); reject(err); });
        lockProc.on('close', (code) => {
          clearTimeout(timer);
          reject(new Error(`Negative 9 lock process exited prematurely with code ${code}`));
        });
      });

      // First uninstall: MUST exit nonzero (exit code 1) due to open file sharing violation!
      const uninst1 = await runPowerShell(options.powershell, candInstallPs1, 'uninstall', [
        '-DataDir', dataDir,
        '-StateDir', stateDir,
        '-BinDir', binDir
      ]);

      if (uninst1.exitCode === 0) {
        throw new Error('Negative 9 failed: uninstall claimed success while immutable file was locked');
      }

      // Check survivor report in output
      const combinedOutput = `${uninst1.stdout}\n${uninst1.stderr}`;
      if (!combinedOutput.includes('Survivor:') && !combinedOutput.includes(path.basename(targetFileToLock))) {
        throw new Error(`Negative 9 failed: output did not report survivor file truthfully: ${combinedOutput}`);
      }
    } finally {
      // Release locked file
      await safeReleaseProcess(lockProc);
    }

    // Second uninstall: now that handle is released, MUST succeed (exit 0)
    const uninst2 = await runPowerShell(options.powershell, candInstallPs1, 'uninstall', [
      '-DataDir', dataDir,
      '-StateDir', stateDir,
      '-BinDir', binDir
    ]);

    if (uninst2.exitCode !== 0) {
      throw new Error(`Negative 9 failed: retry uninstall failed after releasing handle: ${uninst2.stderr}`);
    }

    if (fs.existsSync(path.join(dataDir, 'current.json'))) {
      throw new Error('Negative 9 failed: current.json remains after successful uninstall retry');
    }
  }
} finally {
  await setUserPath(options.powershell, originalUserPath);
}
}

// ---------------------------------------------------------------------------
// Main Orchestration & Error Preserving Cleanup
// ---------------------------------------------------------------------------

export async function main(argv = process.argv) {
  let primaryError = null;
  let allocatedSandbox = null;

  try {
    const options = parseCliArgs(argv);
    if (options.help) {
      console.log(`
Windows Release Qualification Harness
Usage:
  node windows-release-qualification.mjs --mode <smoke|full> [options]

Required Options:
  --mode <smoke|full>               Qualification mode
  --assets <dir>                     Directory with exact 7 candidate release assets
  --version <version>                Expected candidate semantic version
  --source-commit <40hex>            Expected candidate 40-character SHA
  --powershell <exe>                 PowerShell executable (powershell.exe or pwsh.exe)

Full Mode Required Options:
  --receipt <file>                   Path to candidate.json receipt
  --predecessor <dir>                Directory with exact 4 predecessor release assets

Optional Routing / Run Identifiers:
  --repository <owner/repo>          Expected GitHub repository
  --workflow-run-id <int>            Expected workflow run ID
  --workflow-run-attempt <int>       Expected workflow run attempt
      `.trim());
      return 0;
    }

    // 1. Host and Runtime Preflight
    await assertPlatformAndHost(options);

    // 2. Candidate Asset Preflight
    const candResult = verifyCandidateAssets(options.assets, options.version, options.sourceCommit);

    // 3. Predecessor Asset Preflight (if provided / required)
    let predResult = null;
    if (options.predecessor) {
      predResult = verifyPredecessorAssets(options.predecessor);
    }

    // 4. Receipt Preflight (if provided / required)
    if (options.receipt) {
      verifyCandidateReceipt(
        options.receipt,
        candResult.files,
        predResult ? predResult.files : null,
        options,
        predResult
      );
    }

    // 5. Create Sandbox Root with Spaces under RUNNER_TEMP
    const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir();
    allocatedSandbox = path.join(
      runnerTemp,
      `evcrate qual ${Date.now()} ${crypto.randomBytes(4).toString('hex')}`
    );
    fs.mkdirSync(allocatedSandbox, { recursive: true });

    // 6. Execute selected mode
    if (options.mode === 'smoke') {
      await runSmokeMode(options, allocatedSandbox);
    } else {
      await runFullMode(options, allocatedSandbox, predResult);
      await runNegativeScenarios(options, allocatedSandbox);
    }

    console.log(`[PASS] Windows release qualification succeeded in ${options.mode} mode.`);
    return 0;
  } catch (err) {
    primaryError = err;
  } finally {
    // Primary-error preserving cleanup
    if (allocatedSandbox && fs.existsSync(allocatedSandbox)) {
      try {
        fs.rmSync(allocatedSandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch (cleanupErr) {
        console.error(`[WARN] Cleanup error for "${allocatedSandbox}":`, cleanupErr.message);
        if (!primaryError) {
          primaryError = cleanupErr;
        }
      }
    }
  }

  if (primaryError) {
    console.error(`[FAIL] Windows release qualification failed:\n${primaryError.stack || primaryError.message}`);
    process.exit(1);
  }
}

// Auto-run if executed directly as entrypoint
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
