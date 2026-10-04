import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initSessionState,
  readSessionContext,
  setActivePlan,
  clearActivePlan,
  refreshSession,
  recordPreCompactState,
  forgetSession,
  sweepExpiredSessions,
  countUserSessions,
  SessionStateError,
  EXPIRY_DURATION_MS
} from '../../dist/adapters/vscode/session-state.js';
import {
  resolveInstallationRoots,
  createSessionContext
} from '../../dist/adapters/vscode/session-context.js';

function createTempDir(prefix = 'vscode-state-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('session-state: initSessionState and readSessionContext lifecycle', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });
    const ctx = createSessionContext({ sessionId: 'sess-1', cwd: projectDir }, roots, { tmpDir: base });
    assert.equal(ctx.kind, 'native');

    const t0 = 1000000;
    const initial = initSessionState(ctx, null, t0);
    assert.equal(initial.version, 1);
    assert.equal(initial.target, 'vscode');
    assert.equal(initial.revision, 1);
    assert.equal(initial.activePlan, null);
    assert.equal(initial.lastSeenAt, t0);
    assert.equal(initial.compact, null);

    // Read back
    const read1 = readSessionContext(ctx.handle, projectDir, t0);
    assert.equal(read1.status, 'ok');
    assert.equal(read1.record.revision, 1);

    // Re-init unexpired state refreshes lastSeenAt without incrementing revision
    const t1 = t0 + 1000;
    const refreshed = initSessionState(ctx, null, t1);
    assert.equal(refreshed.revision, 1);
    assert.equal(refreshed.lastSeenAt, t1);

    // Missing handle
    const readMissing = readSessionContext(join(base, 'nonexistent.json'), projectDir);
    assert.equal(readMissing.status, 'error');
    assert.equal(readMissing.code, 'SESSION_CONTEXT_UNAVAILABLE');

    // Project mismatch
    const otherProject = join(base, 'other-proj');
    mkdirSync(otherProject, { recursive: true });
    const readMismatch = readSessionContext(ctx.handle, otherProject, t1);
    assert.equal(readMismatch.status, 'error');
    assert.equal(readMismatch.code, 'SESSION_CONTEXT_PROJECT_MISMATCH');

    // Expiry check (7 days + 1 ms)
    const tExpired = t1 + EXPIRY_DURATION_MS + 1;
    const readExpired = readSessionContext(ctx.handle, projectDir, tExpired);
    assert.equal(readExpired.status, 'error');
    assert.equal(readExpired.code, 'SESSION_CONTEXT_EXPIRED');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('session-state: setActivePlan, clearActivePlan and CAS revision conflict', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const plansDir = join(projectDir, 'plans', 'my-feature');
    mkdirSync(plansDir, { recursive: true });
    const planFile = join(plansDir, 'plan.md');
    writeFileSync(planFile, '# Plan');

    const pluginDir = join(projectDir, '.evcrate-vscode');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });
    const ctx = createSessionContext({ sessionId: 'sess-plan', cwd: projectDir }, roots, { tmpDir: base });

    initSessionState(ctx, null, 1000);

    // 1. Set active plan with expected revision 1 -> advances to revision 2
    const updated = setActivePlan(ctx.handle, projectDir, 'plans/my-feature/plan.md', 1, 2000);
    assert.equal(updated.revision, 2);
    assert.equal(updated.activePlan, 'plans/my-feature/plan.md');
    assert.equal(updated.lastSeenAt, 2000);

    // 2. Setting again with stale revision 1 throws REVISION_CONFLICT
    assert.throws(() => {
      setActivePlan(ctx.handle, projectDir, 'plans/my-feature/plan.md', 1, 3000);
    }, (err) => err instanceof SessionStateError && err.code === 'SESSION_CONTEXT_REVISION_CONFLICT');

    // 3. Setting with unsafe traversal path throws PLAN_PATH_UNSAFE
    assert.throws(() => {
      setActivePlan(ctx.handle, projectDir, '../outside-plan.md', 2, 3000);
    }, (err) => err instanceof SessionStateError && err.code === 'PLAN_PATH_UNSAFE');

    // 4. Clear active plan with revision 2 -> advances to revision 3
    const cleared = clearActivePlan(ctx.handle, projectDir, 2, 4000);
    assert.equal(cleared.revision, 3);
    assert.equal(cleared.activePlan, null);
    assert.equal(cleared.lastSeenAt, 4000);

    // 5. PreCompact recording updates compact sequence without changing active plan
    const compacted = recordPreCompactState(ctx.handle, projectDir, 5000);
    assert.equal(compacted.revision, 3);
    assert.equal(compacted.compact?.sequence, 1);
    assert.equal(compacted.compact?.lastObservedAt, 5000);

    // 6. Refresh session updates lastSeenAt
    const refreshed = refreshSession(ctx.handle, projectDir, 6000);
    assert.equal(refreshed.lastSeenAt, 6000);

    // 7. Forget session deletes record file
    forgetSession(ctx.handle, projectDir, 3);
    assert.equal(existsSync(ctx.handle), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('session-state: retention sweep and capacity limits', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });

    const ctx1 = createSessionContext({ sessionId: 'sess-old', cwd: projectDir }, roots, { tmpDir: base });
    const ctx2 = createSessionContext({ sessionId: 'sess-fresh', cwd: projectDir }, roots, { tmpDir: base });

    const now = 1000000000;
    const oldTime = now - EXPIRY_DURATION_MS - 1000;

    initSessionState(ctx1, null, oldTime);
    initSessionState(ctx2, null, now);

    const userDir = join(base, 'evcrate', 'vscode', 'v1', ctx1.handle.split('/')[ctx1.handle.split('/').length - 3]);

    const initialCounts = countUserSessions(userDir);
    assert.equal(initialCounts.total, 2);

    // Sweep removes only expired record (ctx1)
    const swept = sweepExpiredSessions(userDir, 64, now);
    assert.equal(swept, 1);
    assert.equal(existsSync(ctx1.handle), false);
    assert.equal(existsSync(ctx2.handle), true);

    const afterCounts = countUserSessions(userDir);
    assert.equal(afterCounts.total, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
