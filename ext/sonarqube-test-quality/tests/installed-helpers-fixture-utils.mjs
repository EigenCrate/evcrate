import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Returns a stripped process environment with NODE_PATH, NODE_OPTIONS, and INIT_CWD removed.
 */
export function cleanEnvironment() {
  const env = { ...process.env };
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  delete env.INIT_CWD;
  return env;
}

/**
 * Creates an executable mock Sonar CLI that records received argv/cwd and simulates native responses.
 * When MOCK_SONAR_FAIL_STATUS is set, writes sensitive text to stderr and exits with the given code.
 */
export function createMockSonarExecutable(scriptPath) {
  const content = `#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
const cwd = process.cwd();

if (process.env.MOCK_SONAR_FAIL_STATUS) {
  process.stderr.write('sensitive child internal trace: token=SECRET123\\n');
  process.exit(Number(process.env.MOCK_SONAR_FAIL_STATUS));
}

if (process.env.MOCK_TRACE_FILE) {
  fs.writeFileSync(process.env.MOCK_TRACE_FILE, JSON.stringify({ args, cwd }));
}

const mockResponse = {
  total: 1,
  p: 1,
  ps: 100,
  issues: [
    {
      key: 'AW12345',
      rule: 'java:S1186',
      severity: 'MAJOR',
      component: 'sample:src/App.java',
      project: 'sample',
      line: 42,
      message: 'Add a comment explaining empty method',
      status: 'OPEN'
    }
  ]
};

process.stdout.write(JSON.stringify(mockResponse, null, 2) + '\\n');
process.exit(0);
`;
  fs.writeFileSync(scriptPath, content, { mode: 0o755 });
}

/**
 * Packs the candidate package into an external temp dir and extracts it for testing.
 */
export function setupInstalledClosure(packageRoot, tempBase) {
  const packDir = path.join(tempBase, 'pack');
  const unpackedDir = path.join(tempBase, 'unpacked');
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(unpackedDir, { recursive: true });

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packOutput = execFileSync(npmCmd, ['pack', '--pack-destination', packDir], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: cleanEnvironment(),
  }).trim();

  const tarballFileName = packOutput.split('\n').filter(Boolean).pop().trim();
  const tarballPath = path.join(packDir, tarballFileName);
  const tarballBytes = fs.readFileSync(tarballPath);

  const candidateDigestSha256 = crypto.createHash('sha256').update(tarballBytes).digest('hex');
  const candidateDigestSha512 = crypto.createHash('sha512').update(tarballBytes).digest('hex');

  const listOutput = execFileSync('tar', ['-ztf', tarballPath], { encoding: 'utf8' });
  const tarballEntries = listOutput.split('\n').map((s) => s.trim()).filter(Boolean);

  execFileSync('tar', ['-xzf', tarballPath, '-C', unpackedDir], { encoding: 'utf8' });

  return {
    tarballPath,
    tarballBytes,
    candidateDigestSha256,
    candidateDigestSha512,
    tarballEntries,
    unpackedDir,
    installerCli: path.join(unpackedDir, 'package', 'bin', 'install.js'),
  };
}
