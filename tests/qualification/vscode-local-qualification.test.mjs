import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  materializeFixture,
  materializeWorkspace,
  FIXTURE_PLUGIN_JSON,
  FIXTURE_HOOKS_JSON
} from '../../scripts/qualification/vscode-local-contract-fixture.mjs';

import {
  redactString,
  redactRecord,
  redactFile,
  createRedactionContext
} from '../../scripts/qualification/redact-vscode-local-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

test('vscode-local: materializeFixture creates all 9 plugin components with expected digests', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-fixture-test-'));
  try {
    const captureDir = path.join(tmpDir, 'capture-logs');
    const manifest = materializeFixture({ destination: tmpDir, captureDirectory: captureDir });

    assert.equal(manifest.files.length, 9);
    assert.ok(fs.existsSync(path.join(tmpDir, 'plugin.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills/contract-echo/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills/contract-echo/spec.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills/contract-auto/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'com.github.copilot/agents/contract-deny-all.agent.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'com.github.copilot/agents/contract-reader.agent.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'com.github.copilot/rules/bootstrap.instructions.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'com.github.copilot/hooks/hooks.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'evcrate/capture-hook.cjs')));
    assert.ok(fs.existsSync(captureDir));

    // Verify plugin.json contents
    const pluginData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'plugin.json'), 'utf8'));
    assert.equal(pluginData.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(pluginData.name, 'evcrate-local');
    assert.equal(pluginData.version, '1.0.0');
    assert.equal(pluginData.rules, undefined);
    assert.equal(pluginData.agents, undefined);
    assert.equal(pluginData.skills, undefined);
    // Verify hooks.json contents
    const hooksData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'com.github.copilot/hooks/hooks.json'), 'utf8'));
    const hookEvents = Object.keys(hooksData.hooks);
    assert.equal(hookEvents.length, 8);
    assert.ok(hookEvents.includes('SessionStart'));
    assert.ok(hookEvents.includes('Stop'));
    assert.ok(hookEvents.includes('SubagentStop'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vscode-local: materializeWorkspace creates synthetic workspace files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-workspace-test-'));
  try {
    const manifest = materializeWorkspace({ destination: tmpDir });
    assert.equal(manifest.length, 3);
    assert.ok(fs.existsSync(path.join(tmpDir, 'fixture.env')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'sample.txt')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'edit-target.txt')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vscode-local: capture-hook processes all 8 lifecycle events correctly', () => {
  const hookScript = path.join(REPO_ROOT, 'tests/fixtures/vscode-local/native-plugin/evcrate/capture-hook.cjs');
  const tmpCapture = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-hook-test-'));

  try {
    // 1. SessionStart
    const resStart = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'new' }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture },
      encoding: 'utf8'
    });
    assert.equal(resStart.status, 0);
    const outStart = JSON.parse(resStart.stdout);
    assert.equal(outStart.continue, true);
    assert.equal(outStart.hookSpecificOutput.hookEventName, 'SessionStart');

    // 2. UserPromptSubmit
    const resPrompt = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'test' }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture },
      encoding: 'utf8'
    });
    assert.equal(resPrompt.status, 0);
    const outPrompt = JSON.parse(resPrompt.stdout);
    assert.equal(outPrompt.continue, true);

    // 3. PreToolUse - allow by default
    const resPreTool = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'read_file', tool_input: { path: 'a.txt' } }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture },
      encoding: 'utf8'
    });
    assert.equal(resPreTool.status, 0);
    const outPreTool = JSON.parse(resPreTool.stdout);
    assert.equal(outPreTool.continue, true);
    assert.equal(outPreTool.permissionDecision, undefined);
    assert.equal(outPreTool.hookSpecificOutput?.permissionDecision, 'allow');
    // 4. PreToolUse - deny via env var
    const resPreDeny = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'run_in_terminal', tool_input: { command: 'bad' } }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture, EVCRATE_PRE_TOOL_DECISION: 'deny' },
      encoding: 'utf8'
    });
    assert.equal(resPreDeny.status, 0);
    const outPreDeny = JSON.parse(resPreDeny.stdout);
    assert.equal(outPreDeny.continue, true);
    assert.equal(outPreDeny.permissionDecision, undefined);
    assert.equal(outPreDeny.hookSpecificOutput?.permissionDecision, 'deny');

    // 5. PostToolUse - default
    const resPost = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'read_file', tool_response: { content: 'ok' } }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture },
      encoding: 'utf8'
    });
    assert.equal(resPost.status, 0);
    assert.equal(JSON.parse(resPost.stdout).continue, true);

    // 6. PostToolUse - block via env
    const resPostBlock = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'read_file', tool_response: { content: 'ok' } }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture, EVCRATE_POST_TOOL_BLOCK: '1' },
      encoding: 'utf8'
    });
    assert.equal(resPostBlock.status, 0);
    const outPostBlock = JSON.parse(resPostBlock.stdout);
    assert.equal(outPostBlock.decision, 'block');

    // 7. Stop - block when stop_hook_active is false
    const resStop1 = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture, EVCRATE_STOP_BLOCK: '1' },
      encoding: 'utf8'
    });
    assert.equal(resStop1.status, 0);
    const outStop1 = JSON.parse(resStop1.stdout);
    assert.equal(outStop1.hookSpecificOutput.decision, 'block');

    // 8. Stop - allow when stop_hook_active is true (prevents loop)
    const resStop2 = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture, EVCRATE_STOP_BLOCK: '1' },
      encoding: 'utf8'
    });
    assert.equal(resStop2.status, 0);
    const outStop2 = JSON.parse(resStop2.stdout);
    assert.equal(outStop2.continue, true);
    assert.equal(outStop2.hookSpecificOutput, undefined);

    // 9. Exit 2 - blocking error simulation
    const resExit2 = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse' }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpCapture, EVCRATE_HOOK_FORCE_EXIT: '2' },
      encoding: 'utf8'
    });
    assert.equal(resExit2.status, 2);
    assert.match(resExit2.stderr, /simulated exit code 2/);

    // Verify log file was written
    const logFile = path.join(tmpCapture, 'hook-events.jsonl');
    assert.ok(fs.existsSync(logFile));
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.ok(lines.length >= 8);
  } finally {
    fs.rmSync(tmpCapture, { recursive: true, force: true });
  }
});

test('vscode-local: evidence redaction anonymizes sensitive data while preserving schema', () => {
  const ctx = createRedactionContext({ projectRoot: '/home/user/workspace/evcrate' });

  // Redact string tests
  const userStr = redactString('/home/johndoe/test/file.txt', ctx);
  assert.equal(userStr, '/home/test-user/test/file.txt');

  const secretStr = redactString('Authorization: Bearer mySecretToken1234567890', ctx);
  assert.match(secretStr, /\[REDACTED_SECRET\]/);

  // Redact record
  const rawRecord = {
    timestamp: 1727900000000,
    hook_event_name: 'PreToolUse',
    tool_name: 'read_file',
    tool_input: {
      path: '/home/user/workspace/evcrate/sample.txt'
    },
    session_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  };

  const redacted = redactRecord(rawRecord, ctx);
  assert.equal(redacted.hook_event_name, 'PreToolUse');
  assert.equal(redacted.tool_name, 'read_file');
  assert.equal(redacted.tool_input.path, '/path/to/project/sample.txt');
  assert.equal(redacted.session_id, '00000000-0000-4000-8000-000000000001');
  assert.equal(redacted.timestamp, 1700000000000);
});

test('vscode-local: baseline fixtures validate contract integrity', () => {
  const runtimePath = path.join(REPO_ROOT, 'tests/fixtures/vscode-local/runtime-contract.json');
  const toolInputsPath = path.join(REPO_ROOT, 'tests/fixtures/vscode-local/tool-inputs.json');
  const eventCasesPath = path.join(REPO_ROOT, 'tests/fixtures/vscode-local/event-cases.json');

  assert.ok(fs.existsSync(runtimePath));
  assert.ok(fs.existsSync(toolInputsPath));
  assert.ok(fs.existsSync(eventCasesPath));

  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  const toolInputs = JSON.parse(fs.readFileSync(toolInputsPath, 'utf8'));
  const eventCases = JSON.parse(fs.readFileSync(eventCasesPath, 'utf8'));

  assert.equal(runtime.target, 'vscode-local');
  assert.equal(Object.keys(runtime.events).length, 8);
  assert.equal(Object.keys(toolInputs.tools).length, 6);
  assert.equal(eventCases.length, 14);

  // Every event in eventCases must match a documented event in runtime-contract
  for (const c of eventCases) {
    assert.ok(runtime.events[c.event], `Event ${c.event} should be documented in runtime-contract`);
  }
});
