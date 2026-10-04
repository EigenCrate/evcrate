/**
 * scenario-linux-project.mjs
 *
 * Executes Linux x64 project install scenarios across hook lifecycle,
 * policy evaluation, privacy/scout rules, and child error boundaries.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, CANDIDATE_IDENTITY } from './candidate-identity-provider.mjs';
import { saveReceipt } from './receipt-persistence-manager.mjs';
import { buildLinuxProjectReceipt } from './receipt-templates.mjs';

export function runLinuxProjectScenario() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-p08-project-'));
  const projectDir = path.join(tmpRoot, 'project');
  const pluginDir = path.join(projectDir, '.evcrate-vscode');
  const foreignCwd = path.join(tmpRoot, 'foreign-cwd');
  const rawEvents = [];

  try {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(foreignCwd, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'node_modules', 'heavy-dep'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'dist', 'bundle'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'plans/p08'), { recursive: true });

    fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), 'export const active = true;\n');
    fs.writeFileSync(path.join(projectDir, '.env'), 'SECRET_KEY=fixture-marker-1234\n');
    fs.writeFileSync(path.join(projectDir, 'credentials.json'), '{"apiKey":"marker-secret-5678"}\n');
    fs.writeFileSync(path.join(projectDir, 'node_modules', 'heavy-dep', 'large.js'), '// heavy content\n');
    fs.writeFileSync(path.join(projectDir, 'dist', 'bundle', 'app.js'), '// generated bundle\n');
    fs.writeFileSync(path.join(projectDir, 'plans/p08/plan.md'), '# Project Plan\n');

    fs.cpSync(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode'), pluginDir, { recursive: true });

    const hooksJsonPath = path.join(pluginDir, 'com.github.copilot', 'hooks', 'hooks.json');
    const hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
    const bridgeScript = path.join(pluginDir, 'evcrate', 'runtime', 'local-hook-bridge.cjs');
    const setActivePlanScript = path.join(pluginDir, 'evcrate', 'scripts', 'set-active-plan.cjs');

    const invokeBridge = (eventName, payload, envOverrides = {}) => {
      const hookEntry = hooksConfig.hooks[eventName]?.[0];
      const cmd = hookEntry?.command
        ? hookEntry.command.replaceAll('${PLUGIN_ROOT}', pluginDir)
        : `node "${path.join(pluginDir, 'evcrate', 'runtime', 'local-hook-bridge.cjs')}" ${eventName}`;

      const res = spawnSync(cmd, {
        shell: true,
        cwd: foreignCwd,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: {
          ...process.env,
          PLUGIN_ROOT: pluginDir,
          VSCODE_PROJECT_DIR: projectDir,
          ...envOverrides
        }
      });
      let parsed = null;
      try { parsed = JSON.parse(res.stdout); } catch (e) {
        parsed = { raw: res.stdout, stderr: res.stderr, status: res.status };
      }
      const record = { eventName, input: payload, exitCode: res.status, output: parsed };
      rawEvents.push(record);
      return record;
    };

    // 1. SessionStart
    const sessionStart = invokeBridge('SessionStart', {
      hook_event_name: 'SessionStart', source: 'new', session_id: 'session-p08-linux-proj', cwd: projectDir
    });

    const contextText = sessionStart.output?.hookSpecificOutput?.additionalContext || '';
    const matchHandle = contextText.match(/- State handle:\s*(.+)/);
    const matchRev = contextText.match(/- State revision:\s*(\d+)/);
    const handle = matchHandle ? matchHandle[1].trim() : null;
    const rev = matchRev ? matchRev[1].trim() : '1';

    // 2. Set active plan via CLI script
    let planRes = { status: 1 };
    if (handle) {
      planRes = spawnSync(process.execPath, [
        setActivePlanScript, 'plans/p08/plan.md',
        '--context-file', handle,
        '--project-root', projectDir,
        '--expected-revision', rev
      ], { encoding: 'utf8' });
      rawEvents.push({ step: 'setActivePlan', exitCode: planRes.status, stdout: planRes.stdout?.trim() });
    }

    // 3. UserPromptSubmit & 4. Allowed read
    invokeBridge('UserPromptSubmit', {
      hook_event_name: 'UserPromptSubmit', prompt: 'Execute plan step 2.1',
      session_id: 'session-p08-linux-proj', cwd: projectDir
    });
    const toolReadAllow = invokeBridge('PreToolUse', {
      hook_event_name: 'PreToolUse', tool_name: 'read_file', tool_input: { path: 'src/index.ts' },
      session_id: 'session-p08-linux-proj', cwd: projectDir
    });

    // 5. Scout denial on heavy directory & 6. Privacy ask on sensitive file
    const toolHeavyDeny = invokeBridge('PreToolUse', {
      hook_event_name: 'PreToolUse', tool_name: 'read_file', tool_input: { path: 'node_modules/heavy-dep/large.js' },
      session_id: 'session-p08-linux-proj', cwd: projectDir
    });
    const toolEnvAsk = invokeBridge('PreToolUse', {
      hook_event_name: 'PreToolUse', tool_name: 'read_file', tool_input: { path: '.env' },
      session_id: 'session-p08-linux-proj', cwd: projectDir
    });

    // 7. Benign read PostToolUse & 8. Over-threshold edit PostToolUse
    const postToolRead = invokeBridge('PostToolUse', {
      hook_event_name: 'PostToolUse', tool_name: 'read_file',
      tool_input: { path: 'src/index.ts' },
      tool_response: { content: 'export const active = true;' },
      session_id: 'session-p08-linux-proj', cwd: projectDir
    });

    const linesOverThreshold = Array.from({ length: 250 }, (_, i) => `// line ${i}`).join('\n');
    fs.writeFileSync(path.join(projectDir, 'src', 'large-component.ts'), linesOverThreshold);
    const postToolEdit = invokeBridge('PostToolUse', {
      hook_event_name: 'PostToolUse', tool_name: 'edit_file',
      tool_input: { path: 'src/large-component.ts', content: linesOverThreshold },
      tool_response: { success: true }, session_id: 'session-p08-linux-proj', cwd: projectDir
    });

    // 9. PreCompact, 10. SubagentStart, 11. SubagentStop, 12. Stop
    const preCompact = invokeBridge('PreCompact', {
      hook_event_name: 'PreCompact', trigger: 'token_limit',
      session_id: 'session-p08-linux-proj', cwd: projectDir
    });
    const subagentStart = invokeBridge('SubagentStart', {
      hook_event_name: 'SubagentStart', agent_id: 'subagent-01', agent_type: 'tester', agent_name: 'tester',
      parent_session_id: 'session-p08-linux-proj', session_id: 'session-p08-linux-proj-sub1', cwd: projectDir
    });
    const subagentStop = invokeBridge('SubagentStop', {
      hook_event_name: 'SubagentStop', agent_id: 'subagent-01', agent_type: 'tester', agent_name: 'tester',
      session_id: 'session-p08-linux-proj-sub1', stop_hook_active: false, cwd: projectDir
    });
    const stopRes = invokeBridge('Stop', {
      hook_event_name: 'Stop', session_id: 'session-p08-linux-proj', stop_hook_active: false, cwd: projectDir
    });

    // 13. Security child error -> exit 2 deny on mismatched event invocation
    const resSecChild = spawnSync(process.execPath, [bridgeScript, 'SessionStart'], {
      cwd: foreignCwd,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'read_file' }),
      encoding: 'utf8',
      env: { ...process.env, VSCODE_PROJECT_DIR: projectDir }
    });
    rawEvents.push({ step: 'securityChildError', exitCode: resSecChild.status, stderr: resSecChild.stderr?.trim() });

    const checks = {
      sessionStartPass: sessionStart.exitCode === 0 && sessionStart.output.continue === true,
      planSetPass: planRes.status === 0,
      readAllowPass: toolReadAllow.exitCode === 0 && toolReadAllow.output.continue === true,
      scoutDenyPass: toolHeavyDeny.exitCode === 2 || (toolHeavyDeny.output?.hookSpecificOutput?.permissionDecision === 'deny') || (toolHeavyDeny.output?.permissionDecision === 'deny'),
      privacyAskPass: toolEnvAsk.output?.hookSpecificOutput?.permissionDecision === 'ask' || toolEnvAsk.output?.permissionDecision === 'ask',
      postToolReadPass: postToolRead.exitCode === 0 && postToolRead.output?.continue === true,
      postToolEditWarning: typeof postToolEdit.output?.systemMessage === 'string' &&
        postToolEdit.output.systemMessage.includes('Modularization Warning'),
      preCompactPass: preCompact.exitCode === 0 && preCompact.output?.continue === true,
      subagentStartPass: subagentStart.exitCode === 0 && subagentStart.output?.continue === true,
      subagentStopPass: subagentStop.exitCode === 0 && subagentStop.output?.continue === true,
      stopPass: stopRes.exitCode === 0 && stopRes.output?.continue === true,
      secChildErrorHandled: resSecChild.status === 2
    };

    const receipt = buildLinuxProjectReceipt({
      date: new Date().toISOString().slice(0, 10),
      kernel: CANDIDATE_IDENTITY.kernel,
      vscodeVersion: CANDIDATE_IDENTITY.vscodeVersion,
      vscodeCommit: CANDIDATE_IDENTITY.vscodeCommit,
      copilotChatVersion: CANDIDATE_IDENTITY.copilotChatVersion,
      copilotRuntime: CANDIDATE_IDENTITY.copilotRuntime,
      projectDir, foreignCwd,
      digests: CANDIDATE_IDENTITY.digests, pluginTree: CANDIDATE_IDENTITY.pluginTree
    });

    saveReceipt('linux-x64-project', receipt, rawEvents);
    return { ok: true, checks };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
