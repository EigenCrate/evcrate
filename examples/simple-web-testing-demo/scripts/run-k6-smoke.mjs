import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

const defaultBaseUrl = 'http://127.0.0.1:4173';
const baseUrl = process.env.BASE_URL || defaultBaseUrl;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function commandExists(command, args = ['version']) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.error?.code !== 'ENOENT' && result.status === 0;
}

function findK6Command() {
  if (commandExists('k6')) {
    return { command: 'k6', usedFallbackPath: false };
  }

  if (process.platform === 'win32') {
    const windowsCandidates = [
      process.env.ProgramFiles && `${process.env.ProgramFiles}\\k6\\k6.exe`,
      process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\k6\\k6.exe`,
    ].filter(Boolean);

    for (const candidate of windowsCandidates) {
      if (existsSync(candidate) && commandExists(candidate)) {
        console.warn(
          `k6 is installed at ${candidate}, but it is not on PATH for this terminal. ` +
            'Continuing with that installed binary; reopen the terminal to refresh PATH if you want `k6 version` to work directly.',
        );
        return { command: candidate, usedFallbackPath: true };
      }
    }
  }

  return undefined;
}

function printInstallHelp() {
  console.error(`
k6 is required for this smoke gate, but the k6 binary was not found on PATH.

k6 is not installed as an npm devDependency. Install the runtime with an OS package manager, then rerun npm run test:k6.

Windows:
  winget install k6.k6
  choco install k6

macOS:
  brew install k6

Linux/Docker:
  See https://grafana.com/docs/k6/latest/set-up/install-k6/
  docker run --rm -i grafana/k6 run - < k6/smoke.js
`);
}

async function waitForPreview(url, previewProcess) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (previewProcess.exitCode !== null) {
      throw new Error('Preview server exited before k6 could run.');
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Preview is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for preview server at ${url}.`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}.`));
    });
  });
}

function startPreview() {
  return spawn(npmCommand, ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    stdio: 'inherit',
    env: process.env,
  });
}

const k6Runtime = findK6Command();

if (!k6Runtime) {
  printInstallHelp();
  process.exit(1);
}

let previewProcess;

try {
  if (!process.env.BASE_URL) {
    previewProcess = startPreview();

    await waitForPreview(baseUrl, previewProcess);
  }

  if (k6Runtime.usedFallbackPath) {
    console.warn('k6 smoke gate is using the discovered Windows install path for this run.');
  }

  await runCommand(k6Runtime.command, ['run', 'k6/smoke.js'], {
    env: { ...process.env, BASE_URL: baseUrl },
  });
} finally {
  if (previewProcess && previewProcess.exitCode === null) {
    previewProcess.kill();
  }
}