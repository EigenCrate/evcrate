'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function computeDirectoryHash(root) {
  if (!fs.existsSync(root)) return '0'.repeat(64);
  const entries = [];
  function visit(dir) {
    const names = fs.readdirSync(dir).sort();
    for (const name of names) {
      if (name === 'node_modules' || name === '.git' || name === '.evcrate-publish.lock') continue;
      const fullPath = path.join(dir, name);
      const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        const link = fs.readlinkSync(fullPath);
        entries.push(`l\0${relPath}\0${link}\n`);
      } else if (stat.isDirectory()) {
        entries.push(`d\0${relPath}\n`);
        visit(fullPath);
      } else if (stat.isFile()) {
        const content = fs.readFileSync(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const mode = (stat.mode & 0o777).toString(8);
        entries.push(`f\0${relPath}\0${mode}\0${hash}\n`);
      }
    }
  }
  visit(root);
  entries.sort();
  return crypto.createHash('sha256').update(entries.join('')).digest('hex');
}

function checkNetworkNamespaceSupport() {
  try {
    const result = spawnSync('unshare', ['-rn', '--', 'true'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function createDisposableSandbox() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-linux-verify-'));
  const homeDir = path.join(tmpDir, 'home');
  const dataDir = path.join(tmpDir, 'data');
  const stateDir = path.join(tmpDir, 'state');
  const binDir = path.join(tmpDir, 'bin');
  const unrelatedCwd = path.join(tmpDir, 'unrelated-cwd');
  const nodeOnlyDir = path.join(tmpDir, 'node-only-bin');

  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(unrelatedCwd, { recursive: true });
  fs.mkdirSync(nodeOnlyDir, { recursive: true });

  const excluded = new Set(['npm', 'npx', 'curl', 'wget', 'tar']);
  for (const dir of ['/usr/bin', '/bin']) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (excluded.has(name)) continue;
      const dest = path.join(nodeOnlyDir, name);
      if (!fs.existsSync(dest)) {
        try { fs.symlinkSync(path.join(dir, name), dest); } catch {}
      }
    }
  }
  const nodeSymlink = path.join(nodeOnlyDir, 'node');
  if (!fs.existsSync(nodeSymlink)) {
    fs.symlinkSync(process.execPath, nodeSymlink);
  }
  const sandboxEnv = {
    HOME: homeDir,
    XDG_DATA_HOME: dataDir,
    XDG_STATE_HOME: stateDir,
    PATH: `${nodeOnlyDir}:${binDir}`,
    NPM_CONFIG_REGISTRY: 'http://127.0.0.1:0',
    NODE_ENV: 'production'
  };

  const cleanup = () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  };

  return { tmpDir, homeDir, dataDir, stateDir, binDir, unrelatedCwd, nodeOnlyDir, sandboxEnv, cleanup };
}

module.exports = {
  computeDirectoryHash,
  checkNetworkNamespaceSupport,
  createDisposableSandbox
};
