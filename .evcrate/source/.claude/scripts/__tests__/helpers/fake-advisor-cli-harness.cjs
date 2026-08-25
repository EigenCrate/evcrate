'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CONFORMANCE_TABLE
} = require('../../advisor-routing/adapter-contract.cjs');
const {
  DEFAULT_LIMITS,
  createInvocation,
  runInvocation
} = require('../../advisor-routing/runner.cjs');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-advisor-cli.cjs');
const CONFORMANCE_MODES = Object.freeze({
  executable: 'missing',
  version: 'version',
  auth: 'auth',
  model: 'model',
  effort: 'effort',
  'read-only': 'read-only',
  session: 'session',
  output: 'output',
  timeout: 'timeout',
  cancel: 'cancel',
  recursion: 'recursion'
});

function createWorkspace(prefix = 'evcrate-fake-advisor-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.chmodSync(root, 0o700);
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(cwd, { mode: 0o700 });
  return Object.freeze({ root, cwd });
}

function cleanupWorkspace(workspace) {
  if (workspace?.root) fs.rmSync(workspace.root, { recursive: true, force: true });
}

function createFakeInvocation({
  mode = 'success',
  prompt = 'Reply exactly: OK',
  workspace,
  limits = {},
  adapter = 'codex',
  authKeys = []
} = {}) {
  const ownedWorkspace = workspace || createWorkspace();
  const executable = mode === 'missing'
    ? path.join(ownedWorkspace.root, 'missing-advisor-cli')
    : process.execPath;
  const argv = mode === 'missing'
    ? []
    : [FIXTURE, '--mode', mode];
  const invocation = createInvocation({
    adapter,
    executable,
    argv,
    cwd: ownedWorkspace.cwd,
    workspaceRoot: ownedWorkspace.root,
    prompt,
    authKeys,
    limits: { ...DEFAULT_LIMITS, ...limits }
  });
  return Object.freeze({ invocation, workspace: ownedWorkspace, ownedWorkspace: !workspace });
}

async function runFakeMode(mode, options = {}) {
  const fixture = createFakeInvocation({ mode, ...options });
  try {
    return await runInvocation(fixture.invocation, options);
  } finally {
    if (fixture.ownedWorkspace) cleanupWorkspace(fixture.workspace);
  }
}

function conformanceCategories() {
  return Object.freeze(CONFORMANCE_TABLE.map(({ category }) => category));
}

async function runConformanceMatrix(adapter = 'codex', options = {}) {
  const results = [];
  for (const { category, errorCode } of CONFORMANCE_TABLE) {
    const mode = CONFORMANCE_MODES[category];
    const limits = {
      ...options.limits,
      ...(category === 'output'
        ? { maxStdoutBytes: 100_000, maxResultBytes: 100_000 }
        : {}),
      ...(category === 'timeout' || category === 'cancel'
        ? { timeoutMs: 40, killGraceMs: 20 }
        : {})
    };
    const controller = category === 'cancel' ? new AbortController() : null;
    const cancelTimer = controller ? setTimeout(() => controller.abort(), 10) : null;
    let outcome;
    try {
      outcome = await runFakeMode(mode, {
        ...options,
        adapter,
        limits,
        ...(controller ? { signal: controller.signal } : {})
      });
    } finally {
      if (cancelTimer) clearTimeout(cancelTimer);
    }
    let actual = outcome.error?.code;
    let payload;
    if (!actual) {
      try { payload = JSON.parse(outcome.result.stdout); }
      catch { actual = 'OUTPUT_UNSUPPORTED'; }
      if (!actual && payload?.status === 'error') actual = payload.code;
      if (!actual) actual = 'OUTPUT_UNSUPPORTED';
    }
    results.push(Object.freeze({
      adapter,
      category,
      expected: errorCode,
      actual,
      marker: payload?.marker || null
    }));
  }
  return Object.freeze(results);
}

module.exports = {
  CONFORMANCE_MODES,
  FIXTURE,
  cleanupWorkspace,
  conformanceCategories,
  createFakeInvocation,
  createWorkspace,
  runConformanceMatrix,
  runFakeMode
};
