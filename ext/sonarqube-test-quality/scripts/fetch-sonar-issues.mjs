#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants, promises as fs, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

export const HELP = `Usage: node fetch-sonar-issues.mjs --project-key <key> [options]
       node fetch-sonar-issues.mjs --help

Options:
  --project-key <key>   SonarQube project key (required).
  --branch <branch>     Optional target branch.
  --statuses <statuses> Optional comma-separated issue statuses.
  --severities <sevs>   Optional comma-separated issue severities.
  --format <fmt>        Output format: toon (default), json, or table.
  --output <path>       Destination file path. If omitted, writes directly to stdout.
  --cwd <path>          Execution directory for child process (relative to caller CWD).
  --sonar-path <path>   Explicit path to native Sonar CLI executable.
  --help                Show this help; use alone.

Path Resolution:
  - Relative --cwd resolves against initial caller working directory.
  - Relative --output resolves against effective child working directory.
  - Relative --sonar-path resolves against initial caller working directory.

Output & File Staging:
  - Spools child stdout to unique sibling staging file with exclusive POSIX 0600 mode.
  - Replaces destination only upon child exit code 0 and successful stream close.
  - Prior target file is untouched if child fails, is terminated, or writing fails.
  - Replacing an existing regular output tightens permissions to (existingMode & 0600).
  - Destination must not be a symbolic link or non-regular file.
  - Output parent directory must exist and be owner-controlled (operator prerequisite on POSIX and Windows).

Diagnostics & Intentional Changes from .ps1:
  - Node >=22.19.0 ESM execution without PowerShell dependency.
  - No implicit OPEN,CONFIRMED default statuses; underlying CLI defaults apply.
  - Byte-preserving output without newline or text re-encoding.
  - Fixed categorized diagnostics ([argument], [launch], [signal], [child], [publication]).
  - Child stderr is drained silently without leaking query or session secrets.
  - Child exit integer is propagated directly; wrapper errors exit 1.
`;

const ALLOWED_FLAGS = {
  '--project-key': 'projectKey',
  '--branch': 'branch',
  '--statuses': 'statuses',
  '--severities': 'severities',
  '--format': 'format',
  '--output': 'output',
  '--cwd': 'cwd',
  '--sonar-path': 'sonarPath',
};

export class HelperError extends Error {
  constructor(category, message) {
    super(message);
    this.name = 'HelperError';
    this.category = category;
  }
}

export function parseArguments(args) {
  if (args.length === 1 && args[0] === '--help') {
    return { help: true };
  }
  if (args.includes('--help')) {
    throw new HelperError('argument', 'Option --help must be used alone.');
  }

  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const key = Object.hasOwn(ALLOWED_FLAGS, flag) ? ALLOWED_FLAGS[flag] : null;
    if (!key) {
      throw new HelperError('argument', 'Unsupported option.');
    }
    if (Object.hasOwn(options, key)) {
      throw new HelperError('argument', 'Repeated option.');
    }
    const value = args[++i];
    if (value === undefined || value === '') {
      throw new HelperError('argument', 'Missing value for option.');
    }
    if (value.startsWith('-')) {
      throw new HelperError('argument', 'Invalid value for option.');
    }
    options[key] = value;
  }

  if (!options.projectKey) {
    throw new HelperError('argument', 'Option --project-key is required.');
  }

  options.format = options.format ?? 'toon';
  if (!['toon', 'json', 'table'].includes(options.format)) {
    throw new HelperError('argument', 'Unsupported format; expected toon, json, or table.');
  }

  if (options.sonarPath && /\.(cmd|bat)$/i.test(options.sonarPath)) {
    throw new HelperError('argument', 'Windows batch and command scripts (.bat, .cmd) are not supported as Sonar launchers; specify a native executable (.exe) or install the native Sonar CLI.');
  }

  return options;
}

async function validateWorkingDir(initialCallerCwd, argCwd) {
  const childCwd = argCwd ? resolve(initialCallerCwd, argCwd) : initialCallerCwd;
  let stat;
  try {
    stat = await fs.stat(childCwd);
  } catch {
    throw new HelperError('launch', 'Specified working directory does not exist or is not a directory.');
  }
  if (!stat.isDirectory()) {
    throw new HelperError('launch', 'Specified working directory does not exist or is not a directory.');
  }
  return childCwd;
}

async function validateExecutable(initialCallerCwd, sonarPath) {
  if (sonarPath) {
    const resolvedPath = resolve(initialCallerCwd, sonarPath);
    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      throw new HelperError('launch', 'Specified Sonar CLI executable does not exist or is not a regular file.');
    }
    if (!stat.isFile()) {
      throw new HelperError('launch', 'Specified Sonar CLI executable does not exist or is not a regular file.');
    }
    return resolvedPath;
  }
  return process.platform === 'win32' ? 'sonar.exe' : 'sonar';
}

async function preflightDestination(childCwd, outputPath) {
  if (!outputPath) return null;
  const resolvedOutput = resolve(childCwd, outputPath);
  const parentDir = dirname(resolvedOutput);

  let parentStat;
  try {
    parentStat = await fs.stat(parentDir);
  } catch {
    throw new HelperError('publication', 'Output parent directory does not exist or is not a directory.');
  }
  if (!parentStat.isDirectory()) {
    throw new HelperError('publication', 'Output parent directory does not exist or is not a directory.');
  }

  let existingMode = null;
  try {
    const targetStat = await fs.lstat(resolvedOutput);
    if (targetStat.isSymbolicLink()) {
      throw new HelperError('publication', 'Output destination must not be a symbolic link.');
    }
    if (!targetStat.isFile()) {
      throw new HelperError('publication', 'Output destination exists and is not a regular file.');
    }
    existingMode = targetStat.mode;
  } catch (err) {
    if (err instanceof HelperError) throw err;
    if (err.code !== 'ENOENT') {
      throw new HelperError('publication', 'Failed to inspect output destination.');
    }
  }

  return { resolvedOutput, parentDir, existingMode };
}

async function removeStagingFile(stagingPath) {
  if (!stagingPath) return;
  try {
    await fs.unlink(stagingPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write('fetch-sonar-issues: [publication error] Failed to clean up temporary staging file.\n');
    }
  }
}

export async function fetchSonarIssues(args, env = process.env) {
  const options = parseArguments(args);
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const initialCallerCwd = process.cwd();
  const childCwd = await validateWorkingDir(initialCallerCwd, options.cwd);
  const executable = await validateExecutable(initialCallerCwd, options.sonarPath);
  const destInfo = await preflightDestination(childCwd, options.output);

  const childArgs = ['list', 'issues', '-p', options.projectKey, '--format', options.format];
  if (options.branch) childArgs.push('--branch', options.branch);
  if (options.statuses) childArgs.push('--statuses', options.statuses);
  if (options.severities) childArgs.push('--severities', options.severities);

  let stagingPath = null;
  let stagingHandle = null;

  if (destInfo) {
    const rand = randomBytes(6).toString('hex');
    stagingPath = resolve(destInfo.parentDir, `.${basename(destInfo.resolvedOutput)}.${process.pid}.${Date.now()}.${rand}.tmp`);
    try {
      stagingHandle = await fs.open(stagingPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    } catch {
      throw new HelperError('publication', 'Failed to create exclusive staging file.');
    }
  }

  return new Promise((resolveResult, rejectResult) => {
    let ioFailure = false;
    let childExited = false;
    let exitCode = null;
    let exitSignal = null;
    let streamFinished = false;
    let settled = false;
    let child = null;

    const stopChildSafely = () => {
      if (child && !childExited && child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGTERM'); } catch {}
        const forceTimer = setTimeout(() => {
          if (child && !childExited && child.exitCode === null && child.signalCode === null) {
            try { child.kill('SIGKILL'); } catch {}
          }
        }, 500);
        forceTimer.unref();
      }
    };

    async function cleanupAndSettle(error) {
      if (settled) return;
      settled = true;
      stopChildSafely();
      if (stagingHandle) {
        try { await stagingHandle.close(); } catch {}
        stagingHandle = null;
      }
      await removeStagingFile(stagingPath);
      rejectResult(error);
    }

    try {
      child = spawn(executable, childArgs, {
        cwd: childCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env,
      });
    } catch {
      cleanupAndSettle(new HelperError('launch', 'Sonar CLI executable could not be launched.'));
      return;
    }

    child.stderr.resume();
    child.on('error', () => {
      cleanupAndSettle(new HelperError('launch', 'Sonar CLI executable could not be launched.'));
    });

    const outDestination = stagingHandle ? stagingHandle.createWriteStream() : process.stdout;
    const pipelineOptions = stagingHandle ? {} : { end: false };

    pipeline(child.stdout, outDestination, pipelineOptions)
      .then(() => {
        streamFinished = true;
        checkCompletion();
      })
      .catch(() => {
        ioFailure = true;
        stopChildSafely();
        checkCompletion();
      });

    child.on('close', (code, signal) => {
      childExited = true;
      exitCode = code;
      exitSignal = signal;
      checkCompletion();
    });

    async function checkCompletion() {
      if (!childExited || (!streamFinished && !ioFailure)) return;
      if (settled) return;
      settled = true;

      if (stagingHandle) {
        try { await stagingHandle.close(); } catch {}
        stagingHandle = null;
      }

      if (ioFailure) {
        await removeStagingFile(stagingPath);
        process.stderr.write('fetch-sonar-issues: [publication error] Failed writing output data.\n');
        resolveResult(1);
        return;
      }

      if (exitSignal !== null) {
        await removeStagingFile(stagingPath);
        process.stderr.write(`fetch-sonar-issues: [signal termination] Child process terminated by signal: ${exitSignal}\n`);
        resolveResult(1);
        return;
      }

      if (exitCode !== 0) {
        await removeStagingFile(stagingPath);
        process.stderr.write(`fetch-sonar-issues: [child failure] Sonar CLI exited with status ${exitCode}\n`);
        resolveResult(exitCode);
        return;
      }

      if (destInfo) {
        try {
          try {
            const recheckStat = await fs.lstat(destInfo.resolvedOutput);
            if (recheckStat.isSymbolicLink() || !recheckStat.isFile()) {
              await removeStagingFile(stagingPath);
              process.stderr.write('fetch-sonar-issues: [publication error] Output destination changed during execution and is invalid.\n');
              resolveResult(1);
              return;
            }
          } catch (recheckErr) {
            if (recheckErr.code !== 'ENOENT') {
              await removeStagingFile(stagingPath);
              process.stderr.write('fetch-sonar-issues: [publication error] Failed to inspect output destination.\n');
              resolveResult(1);
              return;
            }
          }

          if (process.platform !== 'win32') {
            const targetMode = destInfo.existingMode !== null ? (destInfo.existingMode & 0o600) : 0o600;
            await fs.chmod(stagingPath, targetMode);
          }

          await fs.rename(stagingPath, destInfo.resolvedOutput);
        } catch {
          await removeStagingFile(stagingPath);
          process.stderr.write('fetch-sonar-issues: [publication error] Failed to replace output file.\n');
          resolveResult(1);
          return;
        }
      }

      resolveResult(0);
    }
  });
}

function directlyInvoked() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (directlyInvoked()) {
  fetchSonarIssues(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const category = error instanceof HelperError ? error.category : 'internal';
      const message = error instanceof HelperError ? error.message : 'An unexpected error occurred.';
      process.stderr.write(`fetch-sonar-issues: [${category} error] ${message}\n`);
      process.exitCode = 1;
    });
}
