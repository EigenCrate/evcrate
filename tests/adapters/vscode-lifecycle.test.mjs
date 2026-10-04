import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildSessionStartContext,
  buildSubagentStartContext,
  buildPromptReminder,
  recordPreCompact,
  buildModularizationContext,
  detectPackageManager
} from '../../dist/adapters/vscode/lifecycle.js';
import {
  resolveInstallationRoots,
  createSessionContext
} from '../../dist/adapters/vscode/session-context.js';
import {
  initSessionState,
  setActivePlan,
  readSessionContext
} from '../../dist/adapters/vscode/session-state.js';
import { LOCAL_HOOK_BRIDGE_SOURCE } from '../../dist/adapters/vscode/runtime-sources.js';

function createTempDir(prefix = 'vscode-lifecycle-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('lifecycle: buildSessionStartContext and package manager detection', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');
    writeFileSync(join(projectDir, 'pnpm-lock.yaml'), '');

    assert.equal(detectPackageManager(projectDir), 'pnpm');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });

    // 1. Native session start
    const resNative = buildSessionStartContext(
      {
        hook_event_name: 'SessionStart',
        source: 'new',
        session_id: 'sess-start-1',
        cwd: projectDir
      },
      roots,
      { tmpDir: base }
    );

    assert.equal(resNative.continue, true);
    assert.equal(resNative.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.ok(resNative.hookSpecificOutput.additionalContext.includes('Target: vscode-local'));
    assert.ok(resNative.hookSpecificOutput.additionalContext.includes('Package manager: pnpm'));
    assert.ok(resNative.hookSpecificOutput.additionalContext.includes('Active plan: none'));
    assert.ok(resNative.hookSpecificOutput.additionalContext.includes('set-active-plan.cjs'));
    assert.ok(resNative.handle);
    assert.ok(resNative.state);

    // 2. Stateless session start (missing session ID)
    const resStateless = buildSessionStartContext(
      {
        hook_event_name: 'SessionStart',
        source: 'new',
        session_id: '',
        cwd: projectDir
      },
      roots,
      { tmpDir: base }
    );
    assert.ok(resStateless.hookSpecificOutput.additionalContext.includes('stateless'));
    assert.equal(resStateless.handle, null);
    assert.equal(resStateless.state, null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('lifecycle: buildSubagentStartContext reflects active plan and parent revision', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    const plansDir = join(projectDir, 'plans', 'feat-x');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, 'plan.md'), '# Feat X');

    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });

    // Setup active plan in session
    const ctx = createSessionContext({ sessionId: 'parent-sess', cwd: projectDir }, roots, { tmpDir: base });
    assert.equal(ctx.kind, 'native');
    initSessionState(ctx, null, 1000);
    setActivePlan(ctx.handle, projectDir, 'plans/feat-x/plan.md', 1, 2000);

    // Subagent start in native session
    const subNative = buildSubagentStartContext(
      {
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-01',
        agent_type: 'planner',
        session_id: 'parent-sess',
        cwd: projectDir
      },
      roots,
      { tmpDir: base, now: 2500 }
    );

    assert.equal(subNative.continue, true);
    assert.equal(subNative.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.ok(subNative.hookSpecificOutput.additionalContext.includes('Agent ID: sub-01'));
    assert.ok(subNative.hookSpecificOutput.additionalContext.includes('planner'));
    assert.ok(subNative.hookSpecificOutput.additionalContext.includes('Active plan: plans/feat-x/plan.md'));
    assert.ok(subNative.hookSpecificOutput.additionalContext.includes('State revision: 2'));

    // Subagent start in stateless session
    const subStateless = buildSubagentStartContext(
      {
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-02',
        agent_type: 'tester',
        session_id: '',
        cwd: projectDir
      },
      roots,
      { tmpDir: base }
    );
    assert.ok(subStateless.hookSpecificOutput.additionalContext.includes('stateless'));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('lifecycle: buildPromptReminder and recordPreCompact update session state', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    const plansDir = join(projectDir, 'plans', 'feat-y');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, 'plan.md'), '# Feat Y');

    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });

    const ctx = createSessionContext({ sessionId: 'sess-reminder', cwd: projectDir }, roots, { tmpDir: base });
    assert.equal(ctx.kind, 'native');
    initSessionState(ctx, 'plans/feat-y/plan.md', 1000);

    // Prompt reminder
    const promptRes = buildPromptReminder(
      {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Implement feature Y',
        session_id: 'sess-reminder',
        cwd: projectDir
      },
      roots,
      { tmpDir: base, now: 2000 }
    );
    assert.equal(promptRes.continue, true);
    assert.ok(promptRes.systemMessage?.includes('Plan: plans/feat-y/plan.md'));
    assert.ok(promptRes.systemMessage?.includes('Rules: DRY, KISS, YAGNI'));

    // PreCompact
    const compactRes = recordPreCompact(
      {
        hook_event_name: 'PreCompact',
        trigger: 'auto',
        session_id: 'sess-reminder',
        cwd: projectDir
      },
      roots,
      { tmpDir: base, now: 3000 }
    );
    assert.equal(compactRes.continue, true);
    assert.ok(compactRes.systemMessage?.includes('PreCompact recorded'));

    // Verify compact sequence in state
    const state = readSessionContext(ctx.handle, projectDir, 3500);
    assert.equal(state.status, 'ok');
    assert.equal(state.record.compact?.sequence, 1);
    assert.equal(state.record.compact?.lastObservedAt, 3000);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('lifecycle: buildModularizationContext emits warning for files over 200 LOC', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });

    // File with 250 LOC
    const largeFile = join(projectDir, 'large-file.ts');
    const lines = Array.from({ length: 250 }, (_, i) => `const x${i} = ${i};`).join('\n');
    writeFileSync(largeFile, lines);

    // File with 50 LOC
    const smallFile = join(projectDir, 'small-file.ts');
    writeFileSync(smallFile, 'const a = 1;\n');

    // 1. Edit tool on large file
    const resLarge = buildModularizationContext(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'edit_file',
        tool_input: { target_file: 'large-file.ts' },
        cwd: projectDir
      },
      roots
    );
    assert.equal(resLarge.continue, true);
    assert.ok(resLarge.systemMessage?.includes('250 LOC (threshold: 200)'));
    assert.ok(resLarge.systemMessage?.includes('Consider modularization'));

    // 2. Edit tool on small file
    const resSmall = buildModularizationContext(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'edit_file',
        tool_input: { target_file: 'small-file.ts' },
        cwd: projectDir
      },
      roots
    );
    assert.equal(resSmall.continue, true);
    assert.equal(resSmall.systemMessage, undefined);

    // 3. Non-edit tool (e.g. read_file)
    const resRead = buildModularizationContext(
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'read_file',
        tool_input: { target_file: 'large-file.ts' },
        cwd: projectDir
      },
      roots
    );
    assert.equal(resRead.continue, true);
    assert.equal(resRead.systemMessage, undefined);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
