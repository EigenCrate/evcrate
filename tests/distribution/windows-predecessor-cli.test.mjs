import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

import {
  BOOTSTRAP_VERSION,
  BOOTSTRAP_KIND
} from '../../scripts/release/predecessor-resolver-core.mjs';

test('CLI: scripts/release/prepare-windows-predecessor.mjs runs as subprocess and prints JSON', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-cli-'));
  const scriptPath = path.resolve('scripts/release/prepare-windows-predecessor.mjs');

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Connection': 'close' });
    res.end(JSON.stringify([]));
  });

  server.unref();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const apiUrl = `http://127.0.0.1:${port}`;

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        scriptPath,
        '--candidate-version', '2.5.0',
        '--output-dir', tmp,
        '--api-url', apiUrl,
        '--repository', 'test/repo',
        '--json'
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_TOKEN: '',
          GH_TOKEN: ''
        }
      }
    );

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.kind, BOOTSTRAP_KIND);
    assert.equal(parsed.version, BOOTSTRAP_VERSION);
    assert.equal(parsed.files.length, 4);
    assert.equal(fs.existsSync(path.join(tmp, 'install.ps1')), true);
  } finally {
    server.closeAllConnections?.();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI: rejects unknown CLI flags with descriptive error', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-cli-err-'));
  const scriptPath = path.resolve('scripts/release/prepare-windows-predecessor.mjs');

  try {
    await assert.rejects(
      () => execFileAsync(
        process.execPath,
        [scriptPath, '--invalid-flag', 'value', '--output-dir', tmp],
        { encoding: 'utf8' }
      ),
      /Unknown argument: "--invalid-flag"/u
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
