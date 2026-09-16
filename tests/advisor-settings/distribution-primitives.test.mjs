import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { rmSync, statSync } from 'node:fs';
import {
  applyAdvisorPolicy, canonicalAdvisorPolicy, discardAdvisorPolicyStage,
  readAdvisorPolicy, recoverAdvisorPolicy, stageAdvisorPolicy
} from '../../dist/index.js';

const roots = [];
const policy = Object.freeze({
  version: 2,
  advisor: {
    primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
  },
  wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
  history: { retention_days: 30, max_bytes: 104857600 }
});
function temporaryDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-settings-'));
  roots.push(root);
  return root;
}
function code(errorCode) {
  return (error) => error?.code === errorCode;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('policy read, stage, and apply preserve canonical bytes and owner-only mode', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'advisor-routing.json');
  const stateRoot = join(root, 'state');
  const absent = readAdvisorPolicy(destination);
  assert.equal(absent.policy, null);
  const stage = stageAdvisorPolicy(destination, policy, absent.revision, { stateRoot });
  assert.equal(readAdvisorPolicy(destination).policy, null);
  assert.equal(readFileSync(stage.stagedPath).toString(), canonicalAdvisorPolicy(policy).json);
  discardAdvisorPolicyStage(stage);
  assert.throws(() => readlinkSync(stage.stagedPath));
  const applied = applyAdvisorPolicy(destination, policy, absent.revision, { stateRoot });
  assert.deepEqual(applied.policy, policy);
  assert.deepEqual([...applied.bytes], [...canonicalAdvisorPolicy(policy).bytes]);
  assert.equal(statSync(destination).mode & 0o777, process.platform === 'win32' ? 0o666 : 0o600);
  assert.equal(readAdvisorPolicy(destination).mode.mode, process.platform === 'win32' ? 0o666 : 0o600);
});

test('stale revisions and unsafe policy files fail closed without replacement', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'advisor-routing.json');
  const stateRoot = join(root, 'state');
  const absent = readAdvisorPolicy(destination);
  applyAdvisorPolicy(destination, policy, absent.revision, { stateRoot });
  const before = readFileSync(destination);
  assert.throws(() => applyAdvisorPolicy(destination, { ...policy, wait: { ...policy.wait, warn_after_ms: 60000 } }, absent.revision, { stateRoot }), code('CAS_CONFLICT'));
  assert.deepEqual(readFileSync(destination), before);
  if (process.platform !== 'win32') {
    chmodSync(destination, 0o640);
    assert.throws(() => readAdvisorPolicy(destination), code('PATH_UNSAFE'));
  }
});

test('policy replacement boundary recovers the old complete document', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'advisor-routing.json');
  const stateRoot = join(root, 'state');
  const absent = readAdvisorPolicy(destination);
  applyAdvisorPolicy(destination, policy, absent.revision, { stateRoot });
  const before = readFileSync(destination);
  const current = readAdvisorPolicy(destination);
  assert.throws(() => applyAdvisorPolicy(destination, {
    ...policy, advisor: { ...policy.advisor, primary: { ...policy.advisor.primary, model: 'different-model' } }
  }, current.revision, { stateRoot, hooks: { beforePromote: () => { throw new Error('injected boundary'); } } }), code('PUBLICATION_FAILED'));
  assert.deepEqual(readFileSync(destination), before);
  recoverAdvisorPolicy(stateRoot);
  assert.deepEqual(readFileSync(destination), before);
});

test('policy CAS rejects a destination replacement after backup', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'advisor-routing.json');
  const stateRoot = join(root, 'state');
  const absent = readAdvisorPolicy(destination);
  applyAdvisorPolicy(destination, policy, absent.revision, { stateRoot });
  const current = readAdvisorPolicy(destination);
  assert.throws(() => applyAdvisorPolicy(destination, {
    ...policy, advisor: { ...policy.advisor, primary: { ...policy.advisor.primary, model: 'replacement' } }
  }, current.revision, {
    stateRoot,
    hooks: {
      beforePromote: () => {
        writeFileSync(destination, canonicalAdvisorPolicy(policy).bytes);
        chmodSync(destination, 0o600);
      }
    }
  }), code('ROLLBACK_FAILED'));
  const oversized = join(root, 'oversized.json');
  writeFileSync(oversized, 'x'.repeat(16 * 1024 + 1)); chmodSync(oversized, 0o600);
  assert.throws(() => readAdvisorPolicy(oversized), code('SETTINGS_INVALID'));
  assert.deepEqual([...readFileSync(destination)], [...canonicalAdvisorPolicy(policy).bytes]);
});
test('stale apply cleans its stage after a concurrent replacement', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'advisor-routing.json');
  const stateRoot = join(root, 'state');
  const absent = readAdvisorPolicy(destination);
  applyAdvisorPolicy(destination, policy, absent.revision, { stateRoot });
  const current = readAdvisorPolicy(destination);
  assert.throws(() => applyAdvisorPolicy(destination, {
    ...policy, advisor: { ...policy.advisor, primary: { ...policy.advisor.primary, model: 'new-model' } }
  }, current.revision, {
    stateRoot,
    hooks: {
      beforeBackup: () => {
        writeFileSync(destination, canonicalAdvisorPolicy(policy).bytes);
        chmodSync(destination, 0o600);
      }
    }
  }), code('CAS_CONFLICT'));
  assert.equal(readdirSync(root).some((name) => name.startsWith('.advisor-settings-stage-')), false);
});
test('transaction cleanup refuses to recursively remove a replacement directory', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'advisor-routing.json');
  const stateRoot = join(root, 'state');
  const absent = readAdvisorPolicy(destination);
  const stage = stageAdvisorPolicy(destination, policy, absent.revision, { stateRoot });
  rmSync(stage.stagedPath);
  mkdirSync(stage.stagedPath);
  writeFileSync(join(stage.stagedPath, 'sentinel'), 'keep');
  assert.throws(() => discardAdvisorPolicyStage(stage), code('ROLLBACK_FAILED'));
  assert.equal(readFileSync(join(stage.stagedPath, 'sentinel'), 'utf8'), 'keep');
});

test('symlink destinations and malformed policies are rejected', () => {
  const root = temporaryDirectory();
  const real = join(root, 'real.json');
  const link = join(root, 'advisor-routing.json');
  writeFileSync(real, '{}'); symlinkSync(real, link);
  assert.throws(() => readAdvisorPolicy(link), code('PATH_UNSAFE'));
  assert.throws(() => applyAdvisorPolicy(join(root, 'new.json'), { version: 1, advisor: { backend: 'gemini', model: 'm', effort: 'high', timeout_ms: 60000 } }, { kind: 'absent', identity: 'absent' }), code('SETTINGS_INVALID'));
});
