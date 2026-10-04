import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = process.cwd();

function createTempDir(prefix = 'vscode-integration-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function setupMaterializedEnvironment() {
  const root = createTempDir('vscode-installed-env-');
  const projectDir = join(root, 'workspace');
  const foreignCwd = join(root, 'foreign-cwd');
  const pluginDir = join(projectDir, '.evcrate-vscode');

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(foreignCwd, { recursive: true });

  // Copy runtime bundle from source .evcrate-vscode
  const sourceVscode = join(repository, '.evcrate/source/.evcrate-vscode');
  assert.ok(existsSync(sourceVscode), 'Source .evcrate-vscode must exist');
  cpSync(sourceVscode, pluginDir, { recursive: true });

  // Create sample files in workspace
  mkdirSync(join(projectDir, 'src'), { recursive: true });
  mkdirSync(join(projectDir, 'node_modules', 'dep'), { recursive: true });
  mkdirSync(join(projectDir, '.git'), { recursive: true });

  writeFileSync(join(projectDir, 'src', 'index.ts'), 'export const hello = "world";\n');
  writeFileSync(join(projectDir, 'node_modules', 'dep', 'index.js'), 'module.exports = {};\n');
  writeFileSync(join(projectDir, '.git', 'config'), '[core]\n\trepositoryformatversion = 0\n');
  writeFileSync(join(projectDir, '.env'), 'SECRET_TOKEN=xyz123\n');

  const bridgeScript = join(pluginDir, 'evcrate', 'runtime', 'local-hook-bridge.cjs');
  assert.ok(existsSync(bridgeScript), 'Bridge script must be present in materialized environment');

  return {
    root,
    projectDir,
    foreignCwd,
    pluginDir,
    bridgeScript,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

// -----------------------------------------------------------------------------
// 1. Live Bridge Process Smoke (Foreign CWD, all 8 events, exit 2 on child error)
// -----------------------------------------------------------------------------
test('vscode-installed-runtime: live bridge smoke handles all 8 events from foreign CWD', () => {
  const env = setupMaterializedEnvironment();
  try {
    const runBridge = (eventName, inputObj) => {
      return spawnSync(process.execPath, [env.bridgeScript, eventName], {
        cwd: env.foreignCwd,
        input: JSON.stringify(inputObj),
        encoding: 'utf8',
        env: { ...process.env, VSCODE_PROJECT_DIR: env.projectDir }
      });
    };

    // 1. SessionStart
    const resStart = runBridge('SessionStart', {
      hook_event_name: 'SessionStart',
      source: 'new',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resStart.status, 0);
    const outStart = JSON.parse(resStart.stdout);
    assert.equal(outStart.continue, true);
    assert.equal(outStart.hookSpecificOutput?.hookEventName, 'SessionStart');
    assert.ok(outStart.hookSpecificOutput?.additionalContext);

    // 2. UserPromptSubmit
    const resPrompt = runBridge('UserPromptSubmit', {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Check repository status',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resPrompt.status, 0);
    const outPrompt = JSON.parse(resPrompt.stdout);
    assert.equal(outPrompt.continue, true);

    // 3. PreToolUse - Allowed benign read
    const resPreAllow = runBridge('PreToolUse', {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { path: 'src/index.ts' },
      cwd: env.projectDir
    });
    assert.equal(resPreAllow.status, 0);
    const outPreAllow = JSON.parse(resPreAllow.stdout);
    assert.equal(outPreAllow.continue, true);
    assert.notEqual(outPreAllow.hookSpecificOutput?.permissionDecision, 'deny');

    // 4. PreToolUse - Scout blocked directory (node_modules)
    const resPreDeny = runBridge('PreToolUse', {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { path: 'node_modules/dep/index.js' },
      cwd: env.projectDir
    });
    assert.equal(resPreDeny.status, 0);
    const outPreDeny = JSON.parse(resPreDeny.stdout);
    assert.equal(outPreDeny.continue, true);
    assert.equal(outPreDeny.permissionDecision, undefined);
    assert.equal(outPreDeny.hookSpecificOutput?.permissionDecision, 'deny');
    assert.ok(outPreDeny.hookSpecificOutput?.permissionDecisionReason?.includes('Scout policy blocked'));
    // 5. PostToolUse
    const resPost = runBridge('PostToolUse', {
      hook_event_name: 'PostToolUse',
      tool_name: 'read_file',
      tool_input: { path: 'src/index.ts' },
      tool_response: { content: 'export const hello = "world";\n' },
      cwd: env.projectDir
    });
    assert.equal(resPost.status, 0);
    const outPost = JSON.parse(resPost.stdout);
    assert.equal(outPost.continue, true);

    // 6. PreCompact
    const resCompact = runBridge('PreCompact', {
      hook_event_name: 'PreCompact',
      trigger: 'auto',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resCompact.status, 0);
    const outCompact = JSON.parse(resCompact.stdout);
    assert.equal(outCompact.continue, true);

    // 7. SubagentStart
    const resSubagentStart = runBridge('SubagentStart', {
      hook_event_name: 'SubagentStart',
      agent_id: 'subagent-42',
      agent_type: 'worker',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resSubagentStart.status, 0);
    const outSubagentStart = JSON.parse(resSubagentStart.stdout);
    assert.equal(outSubagentStart.continue, true);

    // 8. SubagentStop - Production no-action
    const resSubagentStop = runBridge('SubagentStop', {
      hook_event_name: 'SubagentStop',
      agent_id: 'subagent-42',
      agent_type: 'worker',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resSubagentStop.status, 0);
    const outSubagentStop = JSON.parse(resSubagentStop.stdout);
    assert.equal(outSubagentStop.continue, true);
    assert.equal(outSubagentStop.hookSpecificOutput, undefined);

    // 9. Stop - Production no-action
    const resStop = runBridge('Stop', {
      hook_event_name: 'Stop',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resStop.status, 0);
    const outStop = JSON.parse(resStop.stdout);
    assert.equal(outStop.continue, true);
    assert.equal(outStop.hookSpecificOutput, undefined);
  } finally {
    env.cleanup();
  }
});

test('vscode-installed-runtime: security child error exits 2 on malformed or invalid invocations', () => {
  const env = setupMaterializedEnvironment();
  try {
    // Missing input -> exit 2
    const resNoInput = spawnSync(process.execPath, [env.bridgeScript, 'SessionStart'], {
      cwd: env.foreignCwd,
      input: '',
      encoding: 'utf8'
    });
    assert.equal(resNoInput.status, 2);

    // Unregistered hook event argument -> exit 2
    const resBadArg = spawnSync(process.execPath, [env.bridgeScript, 'InvalidEvent'], {
      cwd: env.foreignCwd,
      input: JSON.stringify({ hook_event_name: 'InvalidEvent' }),
      encoding: 'utf8'
    });
    assert.equal(resBadArg.status, 2);

    // Mismatched hook_event_name -> exit 2
    const resMismatch = spawnSync(process.execPath, [env.bridgeScript, 'SessionStart'], {
      cwd: env.foreignCwd,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'read_file' }),
      encoding: 'utf8'
    });
    assert.equal(resMismatch.status, 2);
  } finally {
    env.cleanup();
  }
});

// -----------------------------------------------------------------------------
// 2. Tool-Consumer Integration Harness (Decision Enforcement & Suppression Proof)
// -----------------------------------------------------------------------------
test('vscode-installed-runtime: tool-consumer executes allowed and suppresses denied/unconfirmed operations', () => {
  const env = setupMaterializedEnvironment();
  try {
    class ControlledToolConsumer {
      constructor(bridgePath, projectRoot) {
        this.bridgePath = bridgePath;
        this.projectRoot = projectRoot;
        this.operationCallCounts = {
          read: 0,
          edit: 0
        };
      }

      queryPreToolUse(toolName, toolInput) {
        const res = spawnSync(process.execPath, [this.bridgePath, 'PreToolUse'], {
          cwd: this.projectRoot,
          input: JSON.stringify({
            hook_event_name: 'PreToolUse',
            tool_name: toolName,
            tool_input: toolInput,
            cwd: this.projectRoot
          }),
          encoding: 'utf8'
        });

        if (res.status !== 0) {
          return { permitted: false, reason: 'bridge_failure' };
        }

        try {
          const parsed = JSON.parse(res.stdout);
          const decision = parsed.hookSpecificOutput?.permissionDecision;
          const reason = parsed.hookSpecificOutput?.permissionDecisionReason;
          if (decision === 'deny') {
            return { permitted: false, decision: 'deny', reason };
          }
          if (decision === 'ask') {
            return { permitted: false, decision: 'ask', reason };
          }
          return { permitted: true, decision: 'none' };
        } catch {
          return { permitted: false, reason: 'parse_error' };
        }
      }

      executeRead(relPath, userConsent = false) {
        const query = this.queryPreToolUse('read_file', { path: relPath });
        if (!query.permitted) {
          if (query.decision === 'ask' && userConsent) {
            // User explicitly consented to 'ask'
          } else {
            // Suppressed by policy
            return { executed: false, reason: query.reason || query.decision };
          }
        }

        this.operationCallCounts.read += 1;
        const fullPath = join(this.projectRoot, relPath);
        const content = readFileSync(fullPath, 'utf8');
        return { executed: true, content };
      }

      executeEdit(relPath, newText, userConsent = false) {
        const query = this.queryPreToolUse('edit_file', { path: relPath, edits: [{ newText }] });
        if (!query.permitted) {
          if (query.decision === 'ask' && userConsent) {
            // User explicitly consented
          } else {
            return { executed: false, reason: query.reason || query.decision };
          }
        }

        this.operationCallCounts.edit += 1;
        const fullPath = join(this.projectRoot, relPath);
        writeFileSync(fullPath, newText);
        return { executed: true };
      }
    }

    const consumer = new ControlledToolConsumer(env.bridgeScript, env.projectDir);

    // Case A: Harmless read of benign file -> executed
    const r1 = consumer.executeRead('src/index.ts');
    assert.equal(r1.executed, true);
    assert.ok(r1.content.includes('export const hello'));
    assert.equal(consumer.operationCallCounts.read, 1);

    // Case B: Denied read of scout-blocked path (node_modules) -> suppressed
    const r2 = consumer.executeRead('node_modules/dep/index.js');
    assert.equal(r2.executed, false);
    assert.ok(r2.reason && r2.reason.includes('Scout policy blocked'));
    assert.equal(consumer.operationCallCounts.read, 1, 'Denied operation must not increment execution count');

    // Case C: Denied edit of sensitive .git/config -> suppressed
    const originalGitConfig = readFileSync(join(env.projectDir, '.git', 'config'), 'utf8');
    const e1 = consumer.executeEdit('.git/config', 'MALICIOUS_OVERWRITE');
    assert.equal(e1.executed, false);
    assert.equal(consumer.operationCallCounts.edit, 0, 'Denied edit must not increment execution count');
    assert.equal(readFileSync(join(env.projectDir, '.git', 'config'), 'utf8'), originalGitConfig, 'Target file bytes must remain untouched');

    // Case D: Privacy-sensitive read of .env without consent -> suppressed
    const r3Unconfirmed = consumer.executeRead('.env', false);
    assert.equal(r3Unconfirmed.executed, false);
    assert.ok(r3Unconfirmed.reason && r3Unconfirmed.reason.includes('privacy-sensitive'));
    assert.equal(consumer.operationCallCounts.read, 1);

    // Case E: Privacy-sensitive read of .env with explicit consent -> executed
    const r3Confirmed = consumer.executeRead('.env', true);
    assert.equal(r3Confirmed.executed, true);
    assert.ok(r3Confirmed.content.includes('SECRET_TOKEN'));
    assert.equal(consumer.operationCallCounts.read, 2);
  } finally {
    env.cleanup();
  }
});
test('vscode-installed-runtime: executes hook commands configured in hooks.json from foreign CWD with PLUGIN_ROOT containing spaces', () => {
  const root = createTempDir('vscode-plugin-spaces-');
  try {
    const foreignWorkspace = join(root, 'foreign workspace');
    const installedPluginDir = join(root, 'installed plugins', 'my evcrate plugin');
    mkdirSync(foreignWorkspace, { recursive: true });
    mkdirSync(installedPluginDir, { recursive: true });

    // Copy plugin files to installedPluginDir
    const sourceVscode = join(repository, '.evcrate/source/.evcrate-vscode');
    cpSync(sourceVscode, installedPluginDir, { recursive: true });

    // Read generated hooks.json
    const hooksJsonPath = join(installedPluginDir, 'com.github.copilot', 'hooks', 'hooks.json');
    assert.ok(existsSync(hooksJsonPath), 'hooks.json must exist');
    const hooksConfig = JSON.parse(readFileSync(hooksJsonPath, 'utf8'));

    // Check SessionStart hook command
    const sessionStartEntry = hooksConfig.hooks.SessionStart[0];
    assert.ok(sessionStartEntry.command.includes('${PLUGIN_ROOT}'), 'Command must use ${PLUGIN_ROOT}');

    // Expand ${PLUGIN_ROOT} as VS Code host does
    const expandedCommand = sessionStartEntry.command.replaceAll('${PLUGIN_ROOT}', installedPluginDir);

    // Execute via shell from foreign workspace CWD with PLUGIN_ROOT in env
    const res = spawnSync(expandedCommand, {
      shell: true,
      cwd: foreignWorkspace,
      input: JSON.stringify({
        hook_event_name: 'SessionStart',
        source: 'new',
        session_id: 'installed-test-session',
        cwd: foreignWorkspace
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PLUGIN_ROOT: installedPluginDir,
        VSCODE_PROJECT_DIR: foreignWorkspace
      }
    });

    assert.equal(res.status, 0, `Execution failed: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput?.hookEventName, 'SessionStart');

    // Also test PreToolUse hook command
    const preToolEntry = hooksConfig.hooks.PreToolUse[0];
    const expandedPreCommand = preToolEntry.command.replaceAll('${PLUGIN_ROOT}', installedPluginDir);
    const preRes = spawnSync(expandedPreCommand, {
      shell: true,
      cwd: foreignWorkspace,
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'read_file',
        tool_input: { path: 'any.txt' },
        cwd: foreignWorkspace
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PLUGIN_ROOT: installedPluginDir,
        VSCODE_PROJECT_DIR: foreignWorkspace
      }
    });

    assert.equal(preRes.status, 0, `PreToolUse execution failed: ${preRes.stderr}`);
    const preParsed = JSON.parse(preRes.stdout);
    assert.equal(preParsed.continue, true);
    assert.equal(preParsed.permissionDecision, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
