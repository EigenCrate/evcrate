'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const {
  setupFakeProvider,
  buildSanitizedEnvironment,
  writeRoutingPolicy
} = require('./provider-fixture.cjs');

const PACKAGE_ROOT = path.resolve(__dirname, '../../..');
const DIST_INDEX_URL = pathToFileURL(path.join(PACKAGE_ROOT, 'dist', 'index.js')).href;

let publicationApisPromise = null;
function getPublicationApis() {
  if (!publicationApisPromise) {
    publicationApisPromise = import(DIST_INDEX_URL);
  }
  return publicationApisPromise;
}

/**
 * Creates an isolated test harness with spaces and Unicode in paths.
 */
function createUnicodeTestEnvironment(prefix = 'evcrate-lnx-sp ace-🚀-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = path.join(root, 'h ome-🏠');
  const projectA = path.join(root, 'proj ect-alpha-α');
  const projectB = path.join(root, 'proj ect-beta-β');
  const bin = path.join(root, 'b in-⚙️');
  const tmp = path.join(root, 't mp');

  for (const dir of [home, projectA, projectB, bin, tmp]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Pre-seed routing policy in home
  writeRoutingPolicy(home);

  // Set up fake codex in bin
  setupFakeProvider(bin, 'codex');

  // Build sanitized environment
  const env = buildSanitizedEnvironment(home, bin, { TMPDIR: tmp });

  // Initialize git repositories in both projects
  for (const proj of [projectA, projectB]) {
    fs.writeFileSync(path.join(proj, 'source.txt'), 'initial user source code\n', { mode: 0o600 });
    const gitInit = spawnSync('git', ['init'], { cwd: proj, env });
    assert.equal(gitInit.status, 0, `git init failed: ${gitInit.stderr}`);
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: proj, env });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: proj, env });
    spawnSync('git', ['add', 'source.txt'], { cwd: proj, env });
    spawnSync('git', ['commit', '-m', 'initial'], { cwd: proj, env });
  }

  return {
    root,
    home,
    projectA,
    projectB,
    bin,
    tmp,
    env,
    cleanup() {
      try {
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  };
}

/**
 * Spawns the installed advisor controller through explicit Node.
 */
function invokeController(controllerPath, args, input, options = {}) {
  const { cwd, env, timeout = 30000 } = options;
  const serializedInput = typeof input === 'string' ? input : JSON.stringify(input);

  const res = spawnSync(process.execPath, [controllerPath, ...args], {
    cwd,
    env,
    input: serializedInput,
    encoding: 'utf8',
    timeout,
    shell: false
  });

  const stdout = (res.stdout || '').trim();
  const stderr = (res.stderr || '').trim();
  const lines = stdout ? stdout.split('\n') : [];
  let parsed = null;
  if (lines.length > 0) {
    try {
      parsed = JSON.parse(lines[lines.length - 1]);
    } catch {}
  }

  return {
    exit: res.status,
    signal: res.signal,
    stdout,
    stderr,
    lines,
    value: parsed,
    error: res.error
  };
}

module.exports = {
  PACKAGE_ROOT,
  getPublicationApis,
  createUnicodeTestEnvironment,
  invokeController
};
