import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseLocalHookInput,
  serializeLocalHookResult,
  serializeLocalHookError,
  LocalHookProtocolError,
  VSCODE_LOCAL_HOOK_EVENTS
} from '../../dist/adapters/vscode/hook-protocol.js';

import {
  convertVscodeHooks
} from '../../dist/adapters/vscode/hooks.js';

import {
  createProjectionBuildContext,
  createStagedRoot,
  loadTargetManifestRegistry
} from '../../dist/index.js';

const repository = process.cwd();
const registry = loadTargetManifestRegistry(join(repository, '.evcrate/targets/manifest.json'));
const canonicalRoot = join(repository, '.evcrate/source/.claude');

test('hook-protocol: parses all 8 supported events with valid payloads', () => {
  const events = [
    { event: 'SessionStart', input: { hook_event_name: 'SessionStart', source: 'new' } },
    { event: 'UserPromptSubmit', input: { hook_event_name: 'UserPromptSubmit', prompt: 'test' } },
    { event: 'PreToolUse', input: { hook_event_name: 'PreToolUse', tool_name: 'read_file', tool_input: { path: 'a.ts' } } },
    { event: 'PostToolUse', input: { hook_event_name: 'PostToolUse', tool_name: 'edit_file', tool_input: { path: 'a.ts' }, tool_response: { ok: true } } },
    { event: 'PreCompact', input: { hook_event_name: 'PreCompact', trigger: 'auto' } },
    { event: 'SubagentStart', input: { hook_event_name: 'SubagentStart', agent_id: 'sub-1', agent_type: 'worker' } },
    { event: 'SubagentStop', input: { hook_event_name: 'SubagentStop', agent_id: 'sub-1', agent_type: 'worker' } },
    { event: 'Stop', input: { hook_event_name: 'Stop', stop_hook_active: true } }
  ];

  for (const { event, input } of events) {
    const parsed = parseLocalHookInput(JSON.stringify(input), event);
    assert.equal(parsed.hook_event_name, event);
  }
});

test('hook-protocol: rejects unknown, legacy, or CLI lowercase event names', () => {
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'preToolUse', tool_name: 'a', tool_input: {} })),
    (err) => err.code === 'UNSUPPORTED_EVENT'
  );
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'sessionStart' })),
    (err) => err.code === 'UNSUPPORTED_EVENT'
  );
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'SessionEnd' })),
    (err) => err.code === 'UNSUPPORTED_EVENT'
  );
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'UnknownEvent' })),
    (err) => err.code === 'UNSUPPORTED_EVENT'
  );
});

test('hook-protocol: rejects event mismatch against expected registered event', () => {
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'SessionStart' }), 'PreToolUse'),
    (err) => err.code === 'EVENT_MISMATCH'
  );
});

test('hook-protocol: rejects missing required fields per event', () => {
  // UserPromptSubmit requires prompt
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'UserPromptSubmit' })),
    (err) => err.code === 'INVALID_PROMPT'
  );
  // PreToolUse requires tool_name and tool_input
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: {} })),
    (err) => err.code === 'INVALID_TOOL_NAME'
  );
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'read_file' })),
    (err) => err.code === 'INVALID_TOOL_INPUT'
  );
  // PostToolUse requires tool_response
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'read_file', tool_input: {} })),
    (err) => err.code === 'INVALID_TOOL_RESPONSE'
  );
  // PreCompact requires trigger
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'PreCompact' })),
    (err) => err.code === 'INVALID_PRE_COMPACT'
  );
  // SubagentStart requires agent_id and agent_type
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'SubagentStart', agent_id: 'a' })),
    (err) => err.code === 'INVALID_AGENT_TYPE'
  );
  // cwd must be string if provided
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'SessionStart', cwd: 12345 })),
    (err) => err.code === 'INVALID_CWD'
  );
  // stop_hook_active must be boolean if provided
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: 'yes' })),
    (err) => err.code === 'INVALID_STOP_HOOK_ACTIVE'
  );
});

test('hook-protocol: rejects malformed JSON and duplicate keys', () => {
  assert.throws(
    () => parseLocalHookInput('not json'),
    (err) => err.code === 'INVALID_JSON'
  );
  assert.throws(
    () => parseLocalHookInput('{"hook_event_name":"Stop","hook_event_name":"Stop"}'),
    (err) => err.code === 'INVALID_JSON'
  );
  assert.throws(
    () => parseLocalHookInput('[1, 2, 3]'),
    (err) => err.code === 'MALFORMED_PAYLOAD'
  );
});

test('hook-protocol: rejects oversized payloads exceeding 1 MiB limit', () => {
  const bigPrompt = 'x'.repeat(1024 * 1024 + 10);
  assert.throws(
    () => parseLocalHookInput(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: bigPrompt })),
    (err) => err.code === 'PAYLOAD_OVERSIZED'
  );
});

test('hook-protocol: serializes valid output envelopes and error diagnostics', () => {
  const result = serializeLocalHookResult('PreToolUse', {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'blocked by policy'
    }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.continue, true);
  assert.equal(parsed.permissionDecision, undefined);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(parsed.hookSpecificOutput.permissionDecisionReason, 'blocked by policy');
  // Error serialization
  const err = new LocalHookProtocolError('TEST_CODE', 'A test error occurred');
  const errResult = serializeLocalHookError(err);
  assert.equal(errResult.exitCode, 2);
  assert.equal(errResult.stdout, '');
  assert.ok(errResult.stderr.includes('TEST_CODE: A test error occurred'));
});

test('vscode-hooks: convertVscodeHooks emits hooks.json, runtime closure scripts, and inventory', () => {
  const stage = createStagedRoot(repository, '.vscode-hooks-test-');
  try {
    const targetManifest = registry.targets.get('vscode');
    assert.ok(targetManifest);

    const context = createProjectionBuildContext(targetManifest, canonicalRoot, stage);
    const audit = convertVscodeHooks(context);

    assert.equal(audit.events.length, 8);
    assert.equal(audit.scripts.length, 9);

    const stageRoot = context.stagePath('.evcrate-vscode');

    // 1. hooks.json
    const hooksJsonPath = join(stageRoot, 'com.github.copilot/hooks/hooks.json');
    assert.ok(existsSync(hooksJsonPath));
    const hooksData = JSON.parse(readFileSync(hooksJsonPath, 'utf8'));
    assert.equal(hooksData.version, 1);
    for (const ev of VSCODE_LOCAL_HOOK_EVENTS) {
      assert.ok(hooksData.hooks[ev], `Missing hook registration for ${ev}`);
      assert.equal(hooksData.hooks[ev][0].type, 'command');
      assert.equal(hooksData.hooks[ev][0].timeout, 30);
      assert.equal(hooksData.hooks[ev][0].command, `node "\${PLUGIN_ROOT}/evcrate/runtime/local-hook-bridge.cjs" ${ev}`);
    }

    // 2. Runtime CJS closure files
    const bridgePath = join(stageRoot, 'evcrate/runtime/local-hook-bridge.cjs');
    const protocolPath = join(stageRoot, 'evcrate/runtime/local-hook-protocol.cjs');
    const inputsPath = join(stageRoot, 'evcrate/runtime/local-tool-inputs.cjs');
    const policyPath = join(stageRoot, 'evcrate/runtime/local-policy.cjs');

    assert.ok(existsSync(bridgePath));
    assert.ok(existsSync(protocolPath));
    assert.ok(existsSync(inputsPath));
    assert.ok(existsSync(policyPath));
    assert.ok(existsSync(join(stageRoot, 'evcrate/runtime/local-session-context.cjs')));
    assert.ok(existsSync(join(stageRoot, 'evcrate/runtime/local-session-state.cjs')));
    assert.ok(existsSync(join(stageRoot, 'evcrate/runtime/local-lifecycle.cjs')));
    assert.ok(existsSync(join(stageRoot, 'evcrate/scripts/set-active-plan.cjs')));
    assert.ok(existsSync(join(stageRoot, 'evcrate/scripts/vscode-session-context.cjs')));

    // 3. .evcrateignore files
    assert.ok(existsSync(join(stageRoot, '.evcrateignore')));
    assert.ok(existsSync(join(stageRoot, 'evcrate/.evcrateignore')));

    // 4. Hook inventory
    const hookInvPath = join(stageRoot, 'evcrate/hook-inventory.json');
    assert.ok(existsSync(hookInvPath));
    const invData = JSON.parse(readFileSync(hookInvPath, 'utf8'));
    assert.equal(invData.registered_events.length, 8);
    assert.equal(invData.unsupported_capabilities.length, 3);
    assert.ok(invData.unsupported_capabilities.some((c) => c.name === 'SessionEnd'));
    assert.ok(invData.unsupported_capabilities.some((c) => c.name === 'StatusLine'));
  } finally {
    stage.cleanup();
  }
});

test('vscode-hooks: subprocess execution of local-hook-bridge.cjs', () => {
  const stage = createStagedRoot(repository, '.vscode-bridge-subproc-');
  try {
    const targetManifest = registry.targets.get('vscode');
    const context = createProjectionBuildContext(targetManifest, canonicalRoot, stage);
    convertVscodeHooks(context);

    const stageRoot = context.stagePath('.evcrate-vscode');
    const bridgeScript = join(stageRoot, 'evcrate/runtime/local-hook-bridge.cjs');

    // Scenario A: Happy path SessionStart
    const resStart = spawnSync(process.execPath, [bridgeScript, 'SessionStart'], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'new' }),
      encoding: 'utf8'
    });
    assert.equal(resStart.status, 0);
    const outStart = JSON.parse(resStart.stdout);
    assert.equal(outStart.continue, true);
    assert.equal(outStart.hookSpecificOutput.hookEventName, 'SessionStart');

    // Scenario B: PreToolUse allowed read
    const resAllow = spawnSync(process.execPath, [bridgeScript, 'PreToolUse'], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'read_file',
        tool_input: { path: 'src/main.ts' }
      }),
      encoding: 'utf8'
    });
    assert.equal(resAllow.status, 0);
    const outAllow = JSON.parse(resAllow.stdout);
    assert.equal(outAllow.continue, true);

    // Scenario C: PreToolUse scout blocked directory (node_modules)
    const resScoutDeny = spawnSync(process.execPath, [bridgeScript, 'PreToolUse'], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'read_file',
        tool_input: { path: 'node_modules/express/index.js' }
      }),
      encoding: 'utf8'
    });
    assert.equal(resScoutDeny.status, 0);
    const outScoutDeny = JSON.parse(resScoutDeny.stdout);
    assert.equal(outScoutDeny.continue, true);
    assert.equal(outScoutDeny.permissionDecision, undefined);
    assert.equal(outScoutDeny.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(outScoutDeny.hookSpecificOutput.permissionDecisionReason.includes('Scout policy blocked'));
    // Scenario D: PreToolUse privacy ask (.env)
    const resPrivacyAsk = spawnSync(process.execPath, [bridgeScript, 'PreToolUse'], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'read_file',
        tool_input: { path: '.env' }
      }),
      encoding: 'utf8'
    });
    assert.equal(resPrivacyAsk.status, 0);
    const outPrivacyAsk = JSON.parse(resPrivacyAsk.stdout);
    assert.equal(outPrivacyAsk.continue, true);
    assert.equal(outPrivacyAsk.permissionDecision, undefined);
    assert.equal(outPrivacyAsk.hookSpecificOutput.permissionDecision, 'ask');
    assert.ok(outPrivacyAsk.hookSpecificOutput.permissionDecisionReason.includes('privacy-sensitive'));
    // Scenario E: Fail closed on malformed input (exit code 2)
    const resMalformed = spawnSync(process.execPath, [bridgeScript, 'PreToolUse'], {
      input: '{ malformed json }',
      encoding: 'utf8'
    });
    assert.equal(resMalformed.status, 2);
    assert.equal(resMalformed.stdout, '');
    assert.ok(resMalformed.stderr.includes('[evcrate-local-hook] INVALID_JSON'));

    // Scenario F: Fail closed on event mismatch (exit code 2)
    const resMismatch = spawnSync(process.execPath, [bridgeScript, 'SessionStart'], {
      input: JSON.stringify({ hook_event_name: 'Stop' }),
      encoding: 'utf8'
    });
    assert.equal(resMismatch.status, 2);
    assert.ok(resMismatch.stderr.includes('EVENT_MISMATCH'));

    // Scenario G: Fail closed on duplicate keys in production bridge (exit code 2)
    const dupPayload = '{"hook_event_name":"PreToolUse","tool_name":"read_file","tool_name":"read_file","tool_input":{"path":"a.ts"}}';
    const resDup = spawnSync(process.execPath, [bridgeScript, 'PreToolUse'], {
      input: dupPayload,
      encoding: 'utf8'
    });
    assert.equal(resDup.status, 2);
    assert.equal(resDup.stdout, '');
    assert.ok(resDup.stderr.includes('Duplicate JSON object key'));
  } finally {
    stage.cleanup();
  }
});
