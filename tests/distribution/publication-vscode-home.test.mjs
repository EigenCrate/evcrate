import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ControlPlaneError, publishApply, publishDryRun,
  publicationStateRoot, resolveInvocationContext
} from '../../dist/index.js';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url)).replace(/[/\\]$/u, '');
const policyBytes = Buffer.from('{"version":1,"advisor":{"backend":"codex","model":"m","effort":"low","timeout_ms":60000}}\n');

function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

test('VS Code target HOME publication is isolated, idempotent, and retention-bounded', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-vscode-home-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['vscode'] });
    directory(join(home, '.evcrate'));
    const policy = join(home, '.evcrate', 'advisor-routing.json');
    writeFileSync(policy, policyBytes, { mode: 0o600 });
    chmodSync(policy, 0o600);

    const state = publicationStateRoot(home);
    const preview = publishDryRun(context);

    assert.equal(preview.scope, 'home');
    assert.deepEqual(preview.phases[0].selectedTargets, []);
    assert.deepEqual(preview.phases[0].bindingOrder, ['.evcrate/bin']);
    assert.deepEqual(preview.phases[1].selectedTargets, ['vscode']);
    assert.deepEqual(preview.phases[1].bindingOrder, ['.evcrate-vscode']);
    assert.equal(existsSync(state), false);

    const first = publishApply(context);
    const firstRelease = first.phases[0].releaseId;

    assert.equal(first.phases[1].selectedTargets[0], 'vscode');
    assert.equal(first.phases[1].releaseId, firstRelease);
    assert.equal(first.phases[0].retainedReleaseId, null);
    assert.equal(first.phases[1].retainedReleaseId, null);

    const vscodeRoot = join(home, '.evcrate-vscode');
    assert.equal(existsSync(vscodeRoot), true);
    assert.equal(existsSync(join(vscodeRoot, 'plugin.json')), true);
    assert.equal(existsSync(join(vscodeRoot, 'evcrate', 'examples', 'vscode-settings.example.json')), true);
    assert.equal(existsSync(join(vscodeRoot, 'evcrate', 'examples', 'activation-guide.md')), true);
    assert.equal(existsSync(join(vscodeRoot, 'evcrate', 'examples', 'mcp-servers.example.json')), true);
    assert.equal(existsSync(join(vscodeRoot, 'evcrate', 'scripts', 'vscode-session-context.cjs')), true);
    assert.equal(existsSync(join(vscodeRoot, 'evcrate', 'scripts', 'set-active-plan.cjs')), true);

    if (process.platform !== 'win32') {
      const scriptStat = lstatSync(join(vscodeRoot, 'evcrate', 'scripts', 'vscode-session-context.cjs'));
      assert.notEqual(Number(scriptStat.mode) & 0o111, 0, 'script must be executable');
    }

    assert.equal(existsSync(join(home, '.copilot')), false);
    assert.equal(existsSync(join(home, '.claude')), false);
    assert.equal(existsSync(join(home, '.vscode')), false);
    assert.equal(existsSync(join(home, '.evcrate', 'bin', 'evcrate-advisor')), true);

    const marker = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
    assert.equal(marker.schema_version, 2);
    assert.equal(marker.scope, 'home');
    assert.equal(marker.records.shared.status, 'complete');
    assert.equal(marker.records.harness.status, 'complete');
    assert.equal(marker.records.shared.retained_release_id, null);
    assert.equal(marker.records.harness.retained_release_id, null);

    const second = publishApply(context);
    assert.equal(second.phases[1].selectedTargets[0], 'vscode');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('VS Code publication rejects unmanaged collision when reject_unmanaged_collisions is active', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-vscode-collision-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['vscode'] });
    const vscodeRoot = join(home, '.evcrate-vscode');
    directory(vscodeRoot);

    const collidingFile = join(vscodeRoot, 'plugin.json');
    writeFileSync(collidingFile, '{"unmanagedCollision": true}\n', { mode: 0o600 });

    const preview = publishDryRun(context);
    const harnessPhase = preview.phases[1];
    const collisionOp = harnessPhase.changes.find((c) => c.path === '.evcrate-vscode/plugin.json');
    assert.ok(collisionOp, 'must plan an operation for .evcrate-vscode/plugin.json');
    assert.equal(collisionOp.action, 'conflict');

    assert.throws(
      () => publishApply(context),
      (err) => err instanceof ControlPlaneError && (err.code === 'CAS_CONFLICT' || err.code === 'PUBLICATION_FAILED')
    );
    assert.equal(readFileSync(collidingFile, 'utf8'), '{"unmanagedCollision": true}\n');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('VS Code publication detects post-plan CAS modification', () => {
  const home = mkdtempSync(join(tmpdir(), 'evcrate-vscode-cas-'));
  try {
    const context = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['vscode'] });
    publishApply(context);

    const managedFile = join(home, '.evcrate-vscode', 'plugin.json');
    assert.equal(existsSync(managedFile), true);
    writeFileSync(managedFile, '{"tampered":true}\n');

    let threw = false;
    try {
      publishApply(context, {
        hooks: {
          beforeOperation: (op) => {
            if (op.relativePath === 'plugin.json') {
              writeFileSync(managedFile, '{"concurrentWrite":true}\n');
            }
          }
        }
      });
    } catch (err) {
      threw = true;
      assert.ok(err instanceof ControlPlaneError);
    }
    assert.ok(threw, 'must fail on CAS mismatch');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
