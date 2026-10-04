/**
 * scenario-security-harness-probes.mjs
 *
 * Executes untrusted workspace boundary, wrong harness isolation,
 * and isolated diagnostic protocol probes for Phase 08.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './candidate-identity-provider.mjs';
import { saveReceipt } from './receipt-persistence-manager.mjs';
import {
  buildUntrustedReceipt,
  buildWrongHarnessReceipt,
  buildDiagnosticProbeReceipt
} from './receipt-templates.mjs';

const require = createRequire(import.meta.url);

export function runUntrustedWorkspaceScenario() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-p08-untrusted-'));
  const rawEvents = [];

  try {
    const projectDir = path.join(tmpRoot, 'untrusted-project');
    const pluginDir = path.join(projectDir, '.evcrate-vscode');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode'), pluginDir, { recursive: true });

    const simulatedUntrustedRun = {
      workspaceTrust: false,
      chatUseHooks: false,
      bridgeExecuted: false,
      simulated: true,
      userVisibleBoundary: 'Hooks disabled by workspace trust policy; tools execute with standard editor confirmation'
    };
    rawEvents.push(simulatedUntrustedRun);

    const receipt = buildUntrustedReceipt({ date: new Date().toISOString().slice(0, 10) });
    saveReceipt('untrusted-workspace', receipt, rawEvents);
    return { ok: true, simulated: true };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export function runWrongHarnessScenario() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-p08-wrong-'));
  const rawEvents = [];

  try {
    const projectDir = path.join(tmpRoot, 'project');
    const pluginDir = path.join(projectDir, '.evcrate-vscode');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode'), pluginDir, { recursive: true });

    const adviseSkillPath = path.join(pluginDir, 'skills/cmd-advise/SKILL.md');
    const adviseWorkflowPath = path.join(pluginDir, 'evcrate/workflows/advisory-interview.md');
    const hasSkillRule = fs.existsSync(adviseSkillPath) && fs.readFileSync(adviseSkillPath, 'utf8').includes('ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE');
    const hasWorkflowRule = fs.existsSync(adviseWorkflowPath) && fs.readFileSync(adviseWorkflowPath, 'utf8').includes('ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE');

    // Calculate exact runtime session state path from production session context module
    const { computeProjectKey, computeSessionKey, getSessionStatePath } = require(path.join(pluginDir, 'evcrate/runtime/local-session-context.cjs'));
    const stateBaseDir = path.join(tmpRoot, 'state-check');
    const sessionId = 'sess-wrong-check';
    const projectKey = computeProjectKey(projectDir);
    const sessionKey = computeSessionKey(projectKey, sessionId);
    const exactSessionStatePath = getSessionStatePath(projectKey, sessionKey, stateBaseDir);

    // Verify state does not exist prior to invocation
    const stateExistedBefore = fs.existsSync(exactSessionStatePath);

    // Behavioral verification: ensure prompt with --agent triggers reminder without state mutation in dedicated temp dir
    const bridgeScript = path.join(pluginDir, 'evcrate', 'runtime', 'local-hook-bridge.cjs');
    const resRelay = spawnSync(process.execPath, [bridgeScript, 'UserPromptSubmit'], {
      cwd: projectDir,
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'test --agent',
        session_id: sessionId,
        cwd: projectDir
      }),
      encoding: 'utf8',
      env: { ...process.env, VSCODE_PROJECT_DIR: projectDir, TMPDIR: stateBaseDir }
    });

    const relayOutput = resRelay.status === 0 ? JSON.parse(resRelay.stdout) : null;
    const relayExitPass = resRelay.status === 0 && relayOutput?.continue === true && typeof relayOutput?.systemMessage === 'string' && relayOutput.systemMessage.includes('EVCrate Local Prompt Reminder');

    // Verify exact session state file was NOT created on disk
    const stateExistedAfter = fs.existsSync(exactSessionStatePath);
    const noStateMutationPass = !stateExistedBefore && !stateExistedAfter;

    rawEvents.push({
      test: 'advisorRelayRejection',
      disposition: 'ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE',
      skillEnforced: hasSkillRule,
      workflowEnforced: hasWorkflowRule,
      behavioralExitCode: resRelay.status,
      exactStatePathChecked: exactSessionStatePath,
      noStateMutation: noStateMutationPass
    });

    const checks = {
      hasSkillRule,
      hasWorkflowRule,
      relayExitPass,
      noStateMutationPass
    };

    const allPassed = hasSkillRule && hasWorkflowRule && relayExitPass && noStateMutationPass;
    const receipt = buildWrongHarnessReceipt({ date: new Date().toISOString().slice(0, 10) });
    saveReceipt('wrong-harness-isolation', receipt, rawEvents);
    return { ok: allPassed, checks };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export function runDiagnosticProtocolProbes() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-p08-diag-'));
  const rawEvents = [];

  try {
    const hookScript = path.join(REPO_ROOT, 'tests/fixtures/vscode-local/native-plugin/evcrate/capture-hook.cjs');

    // 1. Stop Blocking Probe
    const resStopBlock = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpRoot, EVCRATE_STOP_BLOCK: '1' },
      encoding: 'utf8'
    });
    const outStopBlock = resStopBlock.status === 0 ? JSON.parse(resStopBlock.stdout) : null;
    const stopBlockPass = resStopBlock.status === 0 && outStopBlock?.hookSpecificOutput?.decision === 'block';
    rawEvents.push({ probe: 'StopBlock', status: resStopBlock.status, output: outStopBlock, pass: stopBlockPass });

    // 2. Stop Loop Guard
    const resStopLoop = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpRoot, EVCRATE_STOP_BLOCK: '1' },
      encoding: 'utf8'
    });
    const outStopLoop = resStopLoop.status === 0 ? JSON.parse(resStopLoop.stdout) : null;
    const stopLoopPass = resStopLoop.status === 0 && outStopLoop?.continue === true && !outStopLoop?.hookSpecificOutput?.decision;
    rawEvents.push({ probe: 'StopLoopGuard', status: resStopLoop.status, output: outStopLoop, pass: stopLoopPass });

    // 3. PreToolUse Deny Probe
    const resPreDeny = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'run_in_terminal', tool_input: { command: 'rm -rf /' } }),
      env: { ...process.env, EVCRATE_CAPTURE_DIR: tmpRoot, EVCRATE_PRE_TOOL_DECISION: 'deny' },
      encoding: 'utf8'
    });
    const outPreDeny = resPreDeny.status === 0 ? JSON.parse(resPreDeny.stdout) : null;
    const preDenyPass = resPreDeny.status === 0 && (outPreDeny?.hookSpecificOutput?.permissionDecision === 'deny' || outPreDeny?.permissionDecision === 'deny');
    rawEvents.push({ probe: 'PreToolDeny', status: resPreDeny.status, output: outPreDeny, pass: preDenyPass });

    const allPassed = stopBlockPass && stopLoopPass && preDenyPass;
    const receipt = buildDiagnosticProbeReceipt({ date: new Date().toISOString().slice(0, 10) });
    saveReceipt('diagnostic-protocol-probes', receipt, rawEvents);
    return { ok: allPassed, checks: { stopBlockPass, stopLoopPass, preDenyPass } };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
