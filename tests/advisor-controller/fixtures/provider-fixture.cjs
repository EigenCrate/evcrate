'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const FIXTURES_DIR = __dirname;
const FAKE_CODEX_SOURCE = path.join(FIXTURES_DIR, 'fake-codex.cjs');
const FAKE_OMP_SOURCE = path.join(FIXTURES_DIR, 'fake-omp.cjs');

/**
 * Sets up a package-shaped fake backend inside binDir.
 * For codex: creates node_modules/@openai/codex with package.json and copied script.
 * For omp: creates node_modules/omp with package.json and copied script.
 * Creates launcher (.cmd on win32, 0o755 shell script on POSIX).
 */
function setupFakeProvider(binDir, backend = 'codex', options = {}) {
  fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });

  if (backend === 'codex') {
    const pkgDir = path.join(binDir, 'node_modules', '@openai', 'codex');
    const binSubdir = path.join(pkgDir, 'bin');
    fs.mkdirSync(binSubdir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: '@openai/codex',
      version: options.version || '0.157.1',
      bin: { codex: 'bin/codex.js' }
    }, null, 2) + '\n', { mode: 0o600 });
    fs.copyFileSync(FAKE_CODEX_SOURCE, path.join(binSubdir, 'codex.js'));

    if (process.platform === 'win32') {
      fs.writeFileSync(
        path.join(binDir, 'codex.cmd'),
        '@echo off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n'
      );
    } else {
      const launcher = path.join(binDir, 'codex');
      fs.writeFileSync(
        launcher,
        `#!/bin/sh\nexec "${process.execPath}" "${path.join(binSubdir, 'codex.js')}" "$@"\n`,
        { mode: 0o755 }
      );
    }
    return { pkgDir, scriptPath: path.join(binSubdir, 'codex.js') };
  }

  if (backend === 'omp') {
    const pkgDir = path.join(binDir, 'node_modules', 'omp');
    const binSubdir = path.join(pkgDir, 'bin');
    fs.mkdirSync(binSubdir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: 'omp',
      version: options.version || '0.1.0',
      bin: { omp: 'bin/omp.js' }
    }, null, 2) + '\n', { mode: 0o600 });
    fs.copyFileSync(FAKE_OMP_SOURCE, path.join(binSubdir, 'omp.js'));

    if (process.platform === 'win32') {
      fs.writeFileSync(
        path.join(binDir, 'omp.cmd'),
        '@echo off\r\nnode "%~dp0\\node_modules\\omp\\bin\\omp.js" %*\r\n'
      );
    } else {
      const launcher = path.join(binDir, 'omp');
      fs.writeFileSync(
        launcher,
        `#!/bin/sh\nexec "${process.execPath}" "${path.join(binSubdir, 'omp.js')}" "$@"\n`,
        { mode: 0o755 }
      );
    }
    return { pkgDir, scriptPath: path.join(binSubdir, 'omp.js') };
  }

  throw new Error(`Unsupported fake backend: ${backend}`);
}

/**
 * Builds a sanitized environment:
 * - Deduplicates case-insensitive PATH entries (e.g. Path and PATH)
 * - Prepends binDir using path.delimiter
 * - Cleans recursion markers and secrets
 * - Sets HOME, USERPROFILE, TMPDIR, TEMP, TMP
 */
function buildSanitizedEnvironment(home, binDir, additional = {}) {
  const env = {};
  let originalPath = '';

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() === 'path') {
      if (!originalPath && value) originalPath = value;
    } else if (!/(?:^|_)(?:api_key|token|pat|secret|password|passwd|auth|credential)(?:_|$)/iu.test(key)) {
      env[key] = value;
    }
  }

  // Clear recursion markers
  delete env.EVCRATE_ADVISOR_ACTIVE;
  delete env.EVCRATE_ADVISOR_DEPTH;
  delete env.EVCRATE_SESSION_ID;

  // Set home & temp
  const tmpDir = additional.TMPDIR || path.join(home, 'tmp');
  env.HOME = home;
  env.USERPROFILE = home;
  env.TMPDIR = tmpDir;
  env.TEMP = tmpDir;
  env.TMP = tmpDir;

  // Single canonical PATH with binDir prepended
  const nodeBinDir = path.dirname(process.execPath);
  env.PATH = `${binDir}${path.delimiter}${nodeBinDir}${path.delimiter}${originalPath || ''}`;

  // Apply explicit additional variables
  for (const [key, value] of Object.entries(additional)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return env;
}

/**
 * Writes standard advisor-routing.json policy into home/.evcrate/
 */
function writeRoutingPolicy(home, overrides = {}) {
  const evcrateDir = path.join(home, '.evcrate');
  fs.mkdirSync(evcrateDir, { recursive: true, mode: 0o700 });
  const policy = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' },
      ...(overrides.advisor || {})
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000, ...(overrides.wait || {}) },
    history: { retention_days: 30, max_bytes: 104857600, ...(overrides.history || {}) },
    ...overrides
  };
  const policyPath = path.join(evcrateDir, 'advisor-routing.json');
  fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2) + '\n', { mode: 0o600 });
  return policyPath;
}

/**
 * Configures the response state for fake codex provider.
 */
function setFakeCodexState(home, state) {
  const evcrateDir = path.join(home, '.evcrate');
  fs.mkdirSync(evcrateDir, { recursive: true, mode: 0o700 });
  const statePath = path.join(evcrateDir, 'fake-codex-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  return statePath;
}

/**
 * Configures fake codex concern-free response.
 */
function setFakeCodexConcernFreeResponse(home, returnJson = null) {
  const payload = returnJson || {
    recommendation: 'Proceed with verification.',
    rationale: 'All checks passed cleanly.',
    must_fix: [],
    cautions: [],
    assumptions: [],
    success_checks: ['node --version'],
    unresolved_questions: []
  };
  return setFakeCodexState(home, {
    finalCount: 0,
    calls: [],
    returnJson: typeof payload === 'string' ? payload : JSON.stringify(payload)
  });
}

/**
 * Reads fake codex state recorded during invocation.
 */
function getFakeCodexState(home) {
  const statePath = path.join(home, '.evcrate', 'fake-codex-state.json');
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { finalCount: 0, calls: [] };
  }
}

module.exports = {
  setupFakeProvider,
  buildSanitizedEnvironment,
  writeRoutingPolicy,
  setFakeCodexState,
  setFakeCodexConcernFreeResponse,
  getFakeCodexState,
  FAKE_CODEX_SOURCE,
  FAKE_OMP_SOURCE
};
