import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_RETAINED_RELEASE_AGE_MS, publishApply, publishDryRun, publicationStateRoot,
  recoverPublication, resolveInvocationContext
} from '../../dist/index.js';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');
const policyBytes = Buffer.from('{"version":1,"advisor":{"backend":"codex","model":"m","effort":"low","timeout_ms":60000}}\n');

function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

test('OMP publication is real, isolated, recoverable, and retention-bounded', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-publication-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    directory(join(home, '.evcrate'));
    const policy = join(home, '.evcrate', 'advisor-routing.json');
    writeFileSync(policy, policyBytes, { mode: 0o600 });
    chmodSync(policy, 0o600);
    const oldPath = join(home, '.omp', 'agent', '.evcrate.json');
    directory(join(home, '.omp', 'agent'));
    writeFileSync(oldPath, 'user-version\n', { mode: 0o600 });
    chmodSync(oldPath, 0o600);
    const beforePolicyMode = Number(lstatSync(policy).mode) & 0o777;
    const state = publicationStateRoot(home);
    const preview = publishDryRun(context);
    assert.deepEqual(preview.selectedTargets, ['omp']);
    assert.deepEqual(preview.bindingOrder, ['.evcrate/bin', '.omp']);
    assert.equal(existsSync(state), false);
    assert.deepEqual(readFileSync(policy), policyBytes);
    const first = publishApply(context);
    assert.equal(first.selectedTargets[0], 'omp');
    assert.equal(first.retainedReleaseId, first.releaseId);
    assert.equal(readFileSync(policy).equals(policyBytes), true);
    assert.equal(Number(lstatSync(policy).mode) & 0o777, beforePolicyMode);
    assert.notEqual(readFileSync(oldPath, 'utf8'), 'user-version\n');
    assert.equal(existsSync(join(state, `release-${first.releaseId}`)), true);
    assert.equal(JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8')).status, 'complete');
    assert.equal(recoverPublication(context).action, 'none');
    const second = publishApply(context);
    assert.equal(second.retainedReleaseId, first.releaseId);
    assert.equal(existsSync(join(state, `release-${first.releaseId}`)), true);
    const third = publishApply(context, { now: () => Date.now() + MAX_RETAINED_RELEASE_AGE_MS + 1 });
    assert.equal(third.retainedReleaseId, null);
    assert.equal(existsSync(join(state, `release-${first.releaseId}`)), false);
    assert.equal(JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8')).retained_release_id, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('publication returns CAS conflict without masking or deleting an external path', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-publication-cas-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['omp'] });
    let injected = false;
    assert.throws(
      () => publishApply(context, {
        hooks: {
          beforeOperation: () => {
            if (injected) return;
            injected = true;
            directory(join(home, '.evcrate', 'bin'));
            writeFileSync(join(home, '.evcrate', 'bin', 'external'), 'keep\n', { mode: 0o600 });
          }
        }
      }),
      (error) => error?.code === 'CAS_CONFLICT'
    );
    assert.equal(readFileSync(join(home, '.evcrate', 'bin', 'external'), 'utf8'), 'keep\n');
    assert.equal(existsSync(join(publicationStateRoot(home), 'publication-journal.json')), false);
    assert.equal(existsSync(join(publicationStateRoot(home), 'release-marker.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
