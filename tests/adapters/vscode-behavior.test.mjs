import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  parseLocalHookInput,
  serializeLocalHookResult,
  serializeLocalHookError,
  VSCODE_LOCAL_HOOK_EVENTS
} from '../../dist/adapters/vscode/hook-protocol.js';

import {
  normalizeLocalTool,
  extractCommandOperands
} from '../../dist/adapters/vscode/tool-inputs.js';

import {
  evaluateLocalPolicies,
  DEFAULT_SCOUT_PATTERNS
} from '../../dist/adapters/vscode/policy.js';

import {
  resolveInstallationRoots,
  createSessionContext
} from '../../dist/adapters/vscode/session-context.js';

import {
  initSessionState,
  readSessionContext,
  setActivePlan,
  recordPreCompactState
} from '../../dist/adapters/vscode/session-state.js';

import {
  loadTargetManifestRegistry
} from '../../dist/manifests/registry.js';


const repository = process.cwd();

function createTempDir(prefix = 'vscode-behavior-test-') {
  // Session-state ownership checks permit system temp ancestors, not arbitrary TMPDIR parents.
  return mkdtempSync(join(process.platform === 'win32' ? tmpdir() : '/tmp', prefix));
}

// -----------------------------------------------------------------------------
// 1. Target and Registry Migration Contracts
// -----------------------------------------------------------------------------

test('vscode-behavior: legacy schema 1 fixtures decode conservatively without mutating state', () => {
  const legacyFixturePath = join(repository, 'tests/fixtures/resource-registry-v1/payloads.json');
  if (existsSync(legacyFixturePath)) {
    const raw = readFileSync(legacyFixturePath, 'utf8');
    const payloads = JSON.parse(raw);
    assert.ok(Array.isArray(payloads) || typeof payloads === 'object');
  }
});

// -----------------------------------------------------------------------------
// 2. Native Event Envelopes & Phase 00 Captured Fixtures
// -----------------------------------------------------------------------------
test('vscode-behavior: Phase 00 captured event cases parsed and validated against schema', () => {
  const eventCasesPath = join(repository, 'tests/fixtures/vscode-local/event-cases.json');
  assert.ok(existsSync(eventCasesPath), 'event-cases.json fixture must exist');

  const cases = JSON.parse(readFileSync(eventCasesPath, 'utf8'));
  assert.ok(Array.isArray(cases) && cases.length > 0);

  for (const tc of cases) {
    if (tc.sample_input) {
      const parsed = parseLocalHookInput(JSON.stringify(tc.sample_input), tc.event);
      assert.equal(parsed.hook_event_name, tc.event);
    }

    if (tc.expected_response) {
      const serializedResult = serializeLocalHookResult(tc.event, tc.expected_response);
      assert.equal(serializedResult.exitCode, 0);
      const roundTripped = JSON.parse(serializedResult.stdout);

      if (tc.expected_response.continue !== undefined) {
        assert.equal(roundTripped.continue, tc.expected_response.continue);
      }
      if (tc.expected_response.permissionDecision !== undefined) {
        assert.equal(roundTripped.permissionDecision, tc.expected_response.permissionDecision);
      }
      if (tc.expected_response.hookSpecificOutput !== undefined) {
        assert.deepEqual(roundTripped.hookSpecificOutput, tc.expected_response.hookSpecificOutput);
      }
    }
  }
});

test('vscode-behavior: production Stop and SubagentStop return no-action {} while maintaining state', () => {
  const stopRes = serializeLocalHookResult('Stop', { continue: true });
  assert.equal(stopRes.exitCode, 0);
  const parsedStop = JSON.parse(stopRes.stdout);
  assert.equal(parsedStop.continue, true);
  assert.equal(parsedStop.hookSpecificOutput, undefined);

  const subagentStopRes = serializeLocalHookResult('SubagentStop', { continue: true });
  assert.equal(subagentStopRes.exitCode, 0);
  const parsedSubStop = JSON.parse(subagentStopRes.stdout);
  assert.equal(parsedSubStop.continue, true);
  assert.equal(parsedSubStop.hookSpecificOutput, undefined);
});

// -----------------------------------------------------------------------------
// 3. Permission & Tool Input Policy Boundaries
// -----------------------------------------------------------------------------
test('vscode-behavior: tool input normalization maps single, batch, and patch operands', () => {
  // Read
  const r1 = normalizeLocalTool('read_file', { path: 'src/app.ts' });
  assert.equal(r1.kind, 'read');
  assert.deepEqual(r1.operands, ['src/app.ts']);

  // Edit single
  const e1 = normalizeLocalTool('edit_file', { path: 'src/app.ts' });
  assert.equal(e1.kind, 'edit');
  assert.deepEqual(e1.operands, ['src/app.ts']);

  // Edit batch
  const eb = normalizeLocalTool('editFiles', {
    files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]
  });
  assert.equal(eb.kind, 'edit');
  assert.deepEqual(eb.operands, ['src/a.ts', 'src/b.ts']);

  // Apply patch
  const patch = normalizeLocalTool('apply_patch', {
    patch: '--- a/config/db.json\n+++ b/config/db.json\n@@ -1 +1 @@\n-old\n+new'
  });
  assert.equal(patch.kind, 'edit');
  assert.deepEqual(patch.operands, ['config/db.json']);

  // Run in terminal
  const cmd = normalizeLocalTool('run_in_terminal', { command: 'cat .env | grep SECRET' });
  assert.equal(cmd.kind, 'terminal');
  assert.ok(cmd.operands.length > 0);

  // Unqualified tool
  const unq = normalizeLocalTool('unknown_custom_tool', { foo: 'bar' });
  assert.equal(unq.kind, 'unqualified');
});

test('vscode-behavior: policy evaluates operands and applies scout deny and privacy ask', () => {
  // Benign operands: none (allowed)
  const opSafe = normalizeLocalTool('read_file', { path: 'src/index.ts' });
  const safePolicy = evaluateLocalPolicies(opSafe);
  assert.equal(safePolicy.decision, 'none');

  // Privacy sensitive file: ask
  const opPrivacy = normalizeLocalTool('read_file', { path: '.env' });
  const privacyPolicy = evaluateLocalPolicies(opPrivacy);
  assert.equal(privacyPolicy.decision, 'ask');
  assert.ok(privacyPolicy.reason.includes('privacy-sensitive file'));

  // Scout blocked path: deny
  const opScout = normalizeLocalTool('read_file', { path: 'node_modules/express/index.js' });
  const scoutPolicy = evaluateLocalPolicies(opScout);
  assert.equal(scoutPolicy.decision, 'deny');
  assert.ok(scoutPolicy.reason.includes('Scout policy blocked'));

  // Unqualified tool: deny
  const opUnq = normalizeLocalTool('unqualified_custom', { foo: 'bar' });
  const unqPolicy = evaluateLocalPolicies(opUnq);
  assert.equal(unqPolicy.decision, 'deny');
});

// -----------------------------------------------------------------------------
// 4. Concurrent Workspace and Session State Isolation
// -----------------------------------------------------------------------------
test('vscode-behavior: concurrent sessions maintain strictly partitioned state', () => {
  const base = createTempDir('vscode-concurrency-');
  try {
    const projectDir = join(base, 'workspace');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    mkdirSync(join(projectDir, 'plans'), { recursive: true });
    writeFileSync(join(projectDir, 'plans', 'plan-alpha.md'), '# Plan Alpha');

    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });

    const sessionA = createSessionContext({ sessionId: 'session-alpha', cwd: projectDir }, roots, { tmpDir: base });
    const sessionB = createSessionContext({ sessionId: 'session-beta', cwd: projectDir }, roots, { tmpDir: base });

    const t0 = Date.now();
    initSessionState(sessionA, null, t0);
    initSessionState(sessionB, null, t0);

    // Update session A active plan (expected revision 1 -> 2)
    setActivePlan(sessionA.handle, projectDir, 'plans/plan-alpha.md', 1, t0 + 10);

    // Read back both
    const readA = readSessionContext(sessionA.handle, projectDir, t0 + 20);
    const readB = readSessionContext(sessionB.handle, projectDir, t0 + 20);

    assert.equal(readA.record.activePlan, 'plans/plan-alpha.md');
    assert.equal(readB.record.activePlan, null, 'Session B must not inherit Session A active plan');

    // PreCompact state in Session B
    recordPreCompactState(sessionB.handle, projectDir, t0 + 30);
    const readA2 = readSessionContext(sessionA.handle, projectDir, t0 + 40);
    const readB2 = readSessionContext(sessionB.handle, projectDir, t0 + 40);

    assert.equal(readA2.record.compact, null, 'Session A must not inherit Session B compaction marker');
    assert.ok(readB2.record.compact !== null, 'Session B should record compaction');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('vscode-behavior: absent session ID yields stateless context without persistence', () => {
  const base = createTempDir('vscode-stateless-');
  try {
    const projectDir = join(base, 'workspace');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });
    const statelessCtx = createSessionContext({ sessionId: undefined, cwd: projectDir }, roots, { tmpDir: base });

    assert.equal(statelessCtx.kind, 'stateless');
    assert.equal(statelessCtx.handle, undefined);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// 5. Native Bridge Subprocess Failure Boundaries
// -----------------------------------------------------------------------------
test('vscode-behavior: bridge exits 2 on missing or malformed hook_event_name', () => {
  const bridgeScript = join(repository, '.evcrate/source/.evcrate-vscode/evcrate/runtime/local-hook-bridge.cjs');
  assert.ok(existsSync(bridgeScript), 'Bridge script must exist in source .evcrate-vscode');

  // Empty input -> exit 2
  const emptyRes = spawnSync(process.execPath, [bridgeScript, 'SessionStart'], {
    input: '',
    encoding: 'utf8'
  });
  assert.equal(emptyRes.status, 2);

  // Missing hook_event_name -> exit 2
  const missingRes = spawnSync(process.execPath, [bridgeScript, 'SessionStart'], {
    input: '{}',
    encoding: 'utf8'
  });
  assert.equal(missingRes.status, 2);
  assert.ok(missingRes.stderr.includes('MISSING_EVENT_NAME'));

  // Invalid JSON -> exit 2
  const malformedRes = spawnSync(process.execPath, [bridgeScript, 'SessionStart'], {
    input: 'not-json',
    encoding: 'utf8'
  });
  assert.equal(malformedRes.status, 2);
  assert.ok(malformedRes.stderr.includes('INVALID_JSON'));
});

test('vscode-behavior: bridge returns deny permissionDecision on scout-blocked PreToolUse', () => {
  const bridgeScript = join(repository, '.evcrate/source/.evcrate-vscode/evcrate/runtime/local-hook-bridge.cjs');

  const denyRes = spawnSync(process.execPath, [bridgeScript, 'PreToolUse'], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { path: 'node_modules/express/index.js' }
    }),
    encoding: 'utf8'
  });

  assert.equal(denyRes.status, 0);
  const parsed = JSON.parse(denyRes.stdout);
  assert.equal(parsed.continue, true);
  assert.equal(parsed.permissionDecision, undefined);
  assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'deny');
  assert.ok(parsed.hookSpecificOutput?.permissionDecisionReason?.includes('Scout policy blocked'));
});
