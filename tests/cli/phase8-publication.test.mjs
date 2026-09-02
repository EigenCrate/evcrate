import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicationPlan, main, recoverPublication, resolveInvocationContext } from '../../dist/index.js';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');
const bindingOrder = ['.evcrate/bin', '.omp'];
const dryRun = Object.freeze({
  buildManifestPath: '.evcrate/build-manifest-omp.json', buildManifestDigest: 'a'.repeat(64),
  selectedTargets: ['omp'], bindingOrder, changes: []
});
const applied = Object.freeze({ ...dryRun, releaseId: 'release-cli-1', retainedReleaseId: null });

function capture() {
  const values = [];
  return { values, output: { isTTY: false, write: (value) => values.push(value) } };
}
function runtime(home, captured, publicationHandler) {
  return {
    packageRoot, cwd: packageRoot, packageVersion: '1.0.0', requestId: () => 'phase8-cli',
    output: captured.output, publicationHandler, home
  };
}
function authorityChanges(home) {
  const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
  const plan = createPublicationPlan(context, join(context.stateRoot, 'release-marker.json'));
  return plan.bindings.flatMap((binding) => binding.operations.map((operation) => ({
    root: operation.localRoot, path: operation.relativePath, action: operation.action
  })));
}

test('top-level publish routes dry-run and apply through the typed resource envelope', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-publish-'));
  try {
    const handler = {
      publishDryRun: () => dryRun,
      publishApply: () => applied,
      recover: () => ({ releaseId: null, action: 'none', selectedTargets: [], bindingOrder: [] })
    };
    const preview = capture();
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'], runtime(home, preview, handler)), 0);
    assert.equal(JSON.parse(preview.values[0]).status, 'preview');
    assert.deepEqual(JSON.parse(preview.values[0]).payload.bindingOrder, bindingOrder);
    const result = capture();
    assert.equal(await main(['publish', '--apply', '--target', 'omp', '--home', home, '--json'], runtime(home, result, handler)), 0);
    assert.equal(JSON.parse(result.values[0]).status, 'published');
    assert.equal(JSON.parse(result.values[0]).payload.releaseId, 'release-cli-1');
    const recovery = capture();
    assert.equal(await main(['recover', '--target', 'omp', '--home', home, '--json'], runtime(home, recovery, handler)), 0);
    const recovered = JSON.parse(recovery.values[0]);
    assert.equal(recovered.status, 'recovered');
    assert.deepEqual(recovered.payload, { releaseId: null, action: 'none', selectedTargets: [], bindingOrder: [] });
    assert.deepEqual(recovered.recovery, { kind: 'none', identity: 'none' });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('default typed publication delegates to the Python authority bridge', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-bridge-'));
  try {
    const captured = capture();
    const calls = [];
    const authority = JSON.stringify(authorityChanges(home));
    const bridgeRuntime = {
      ...runtime(home, captured),
      processRunner: {
        run: async (options) => {
          calls.push(options);
          return { termination: 'completed', exitCode: 0, stdout: authority, stderr: '' };
        }
      }
    };
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'], bridgeRuntime), 0);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(1), ['--publish', '--dry-run', '--json', '--target', 'omp']);
    assert.equal(JSON.parse(captured.values[0]).status, 'preview');
    assert.equal(existsSync(join(home, '.evcrate')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
test('real authority dry-run is exact and leaves HOME and state untouched', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-real-dry-run-'));
  try {
    const captured = capture();
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'],
      runtime(home, captured)), 0);
    assert.equal(JSON.parse(captured.values[0]).status, 'preview');
    assert.equal(existsSync(join(home, '.evcrate')), false);
    assert.equal(existsSync(join(home, '.local')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('real authority apply matches the typed plan on repeat', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-real-apply-'));
  try {
    const applied = capture();
    assert.equal(await main(['publish', '--apply', '--target', 'omp', '--home', home, '--json'],
      runtime(home, applied)), 0);
    assert.equal(JSON.parse(applied.values[0]).status, 'published');
    const repeated = capture();
    assert.equal(await main(['publish', '--dry-run', '--target', 'omp', '--home', home, '--json'],
      runtime(home, repeated)), 0);
    const payload = JSON.parse(repeated.values[0]).payload;
    assert.ok(payload.changes.every(({ action }) => action === 'noop' || action === 'preserve'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
test('authority dry-run path and action mismatches fail before apply', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-bridge-mismatch-'));
  try {
    const captured = capture();
    const calls = [];
    const mismatched = authorityChanges(home);
    mismatched[0] = { ...mismatched[0], path: 'wrong/path' };
    const bridgeRuntime = {
      ...runtime(home, captured),
      processRunner: {
        run: async (options) => {
          calls.push(options);
          return { termination: 'completed', exitCode: 0, stdout: JSON.stringify(mismatched), stderr: '' };
        }
      }
    };
    assert.equal(await main(['publish', '--apply', '--target', 'omp', '--home', home, '--json'], bridgeRuntime), 5);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(captured.values[0]).error.code, 'PUBLICATION_FAILED');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('default typed apply delegates mutation and release identity to Python authority', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-bridge-apply-'));
  try {
    const captured = capture();
    const calls = [];
    const authority = JSON.stringify(authorityChanges(home));
    const bridgeRuntime = {
      ...runtime(home, captured),
      processRunner: {
        run: async (options) => {
          calls.push(options);
          if (calls.length === 2) {
            const state = options.env.EVCRATE_STATE_DIR;
            mkdirSync(state, { recursive: true, mode: 0o700 });
            chmodSync(state, 0o700);
            writeFileSync(join(state, 'release-marker.json'), JSON.stringify({
              schema_version: 1, status: 'complete', release_id: 'release-bridge-1',
              transaction_dir: 'release-release-bridge-1', roots: {}, managed_paths: {},
              previous_managed_paths: {}, operations: [], retained_release_id: null
            }) + '\n', { mode: 0o600 });
          }
          return {
            termination: 'completed', exitCode: 0,
            stdout: calls.length === 1 || calls.length === 3 ? authority : '', stderr: ''
          };
        }
      }
    };
    assert.equal(await main(['publish', '--apply', '--target', 'omp', '--home', home, '--json'], bridgeRuntime), 0);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1].args.slice(1), ['--publish', '--target', 'omp']);
    assert.deepEqual(calls[2].args.slice(1), ['--publish', '--dry-run', '--json', '--target', 'omp']);
    assert.equal(JSON.parse(captured.values[0]).payload.releaseId, 'release-bridge-1');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('typed publication rejects handler output with mismatched binding order', async () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-correlation-'));
  try {
    const captured = capture();
    const handler = {
      publishDryRun: () => ({
        buildManifestPath: '.evcrate/build-manifest.json', buildManifestDigest: 'a'.repeat(64),
        selectedTargets: ['codex', 'omp'], bindingOrder: ['.evcrate/bin', '.omp'], changes: []
      }),
      publishApply: () => applied,
      recover: () => ({ releaseId: null, action: 'none', selectedTargets: [], bindingOrder: [] })
    };
    assert.equal(
      await main(['publish', '--dry-run', '--target', 'codex', '--target', 'omp', '--home', home, '--json'],
        runtime(home, captured, handler)),
      2
    );
    const result = JSON.parse(captured.values[0]);
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'PROTOCOL_INVALID');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('target recovery reads only publication state and leaves advisor settings untouched', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-cli-isolation-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    mkdirSync(join(home, '.evcrate'), { recursive: true, mode: 0o700 });
    const policy = join(home, '.evcrate', 'advisor-routing.json');
    const bytes = Buffer.from('{"version":1,"advisor":{"backend":"codex","model":"m","effort":"low","timeout_ms":60000}}\n');
    writeFileSync(policy, bytes, { mode: 0o600 });
    chmodSync(policy, 0o600);
    const beforeMode = Number(lstatSync(policy).mode) & 0o777;
    const outcome = recoverPublication(context);
    assert.equal(outcome.action, 'none');
    assert.deepEqual(readFileSync(policy), bytes);
    assert.equal(Number(lstatSync(policy).mode) & 0o777, beforeMode);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
