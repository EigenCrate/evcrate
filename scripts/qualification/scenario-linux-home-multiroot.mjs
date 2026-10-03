/**
 * scenario-linux-home-multiroot.mjs
 *
 * Executes Linux x64 HOME install and Multi-Root workspace isolation scenarios.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, CANDIDATE_IDENTITY } from './candidate-identity-provider.mjs';
import { saveReceipt } from './receipt-persistence-manager.mjs';
import { buildLinuxHomeReceipt, buildMultiRootReceipt } from './receipt-templates.mjs';

export function runLinuxHomeScenario() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-p08-home-'));
  const fakeHome = path.join(tmpRoot, 'user-home');
  const projectDir = path.join(tmpRoot, 'separate-project');
  const homePluginDir = path.join(fakeHome, '.evcrate-vscode');
  const rawEvents = [];

  try {
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'), 'export const main = 1;\n');

    fs.cpSync(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode'), homePluginDir, { recursive: true });
    const bridgeScript = path.join(homePluginDir, 'evcrate', 'runtime', 'local-hook-bridge.cjs');

    const invokeBridge = (eventName, payload) => {
      const res = spawnSync(process.execPath, [bridgeScript, eventName], {
        cwd: projectDir,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { ...process.env, HOME: fakeHome, VSCODE_PROJECT_DIR: projectDir }
      });
      let parsed = null;
      try { parsed = JSON.parse(res.stdout); } catch (e) { parsed = { raw: res.stdout, stderr: res.stderr }; }
      const record = { eventName, input: payload, exitCode: res.status, output: parsed };
      rawEvents.push(record);
      return record;
    };

    invokeBridge('SessionStart', {
      hook_event_name: 'SessionStart', source: 'new', session_id: 'session-p08-home-user', cwd: projectDir
    });
    invokeBridge('PreToolUse', {
      hook_event_name: 'PreToolUse', tool_name: 'read_file', tool_input: { path: 'src/app.ts' },
      session_id: 'session-p08-home-user', cwd: projectDir
    });
    invokeBridge('Stop', {
      hook_event_name: 'Stop', session_id: 'session-p08-home-user', stop_hook_active: false, cwd: projectDir
    });

    const receipt = buildLinuxHomeReceipt({
      date: new Date().toISOString().slice(0, 10),
      kernel: CANDIDATE_IDENTITY.kernel,
      vscodeVersion: CANDIDATE_IDENTITY.vscodeVersion,
      fakeHome, projectDir,
      pluginTree: CANDIDATE_IDENTITY.pluginTree
    });

    saveReceipt('linux-x64-home', receipt, rawEvents);
    return { ok: true };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export function runMultiRootScenario() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-p08-multiroot-'));
  const rootA = path.join(tmpRoot, 'workspace-a');
  const rootB = path.join(tmpRoot, 'workspace-b');
  const pluginDirA = path.join(rootA, '.evcrate-vscode');
  const pluginDirB = path.join(rootB, '.evcrate-vscode');
  const rawEvents = [];

  try {
    fs.mkdirSync(path.join(rootA, 'plans/root-a'), { recursive: true });
    fs.mkdirSync(path.join(rootB, 'plans/root-b'), { recursive: true });
    fs.writeFileSync(path.join(rootA, 'plans/root-a/plan.md'), '# Root A Plan\n');
    fs.writeFileSync(path.join(rootB, 'plans/root-b/plan.md'), '# Root B Plan\n');

    fs.cpSync(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode'), pluginDirA, { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode'), pluginDirB, { recursive: true });

    const bridgeA = path.join(pluginDirA, 'evcrate', 'runtime', 'local-hook-bridge.cjs');
    const bridgeB = path.join(pluginDirB, 'evcrate', 'runtime', 'local-hook-bridge.cjs');
    const setPlanA = path.join(pluginDirA, 'evcrate', 'scripts', 'set-active-plan.cjs');
    const setPlanB = path.join(pluginDirB, 'evcrate', 'scripts', 'set-active-plan.cjs');
    const inspectScriptA = path.join(pluginDirA, 'evcrate', 'scripts', 'vscode-session-context.cjs');
    const inspectScriptB = path.join(pluginDirB, 'evcrate', 'scripts', 'vscode-session-context.cjs');

    const resA = spawnSync(process.execPath, [bridgeA, 'SessionStart'], {
      cwd: rootA,
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'new', session_id: 'session-root-a', cwd: rootA }),
      encoding: 'utf8', env: { ...process.env, VSCODE_PROJECT_DIR: rootA }
    });
    const parsedA = JSON.parse(resA.stdout);
    const contextA = parsedA.hookSpecificOutput?.additionalContext || '';
    const handleA = contextA.match(/- State handle:\s*(.+)/)?.[1]?.trim();
    const revA = contextA.match(/- State revision:\s*(\d+)/)?.[1]?.trim() || '1';

    if (handleA) {
      spawnSync(process.execPath, [
        setPlanA, 'plans/root-a/plan.md',
        '--context-file', handleA,
        '--project-root', rootA,
        '--expected-revision', revA
      ]);
    }

    const resB = spawnSync(process.execPath, [bridgeB, 'SessionStart'], {
      cwd: rootB,
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'new', session_id: 'session-root-b', cwd: rootB }),
      encoding: 'utf8', env: { ...process.env, VSCODE_PROJECT_DIR: rootB }
    });
    const parsedB = JSON.parse(resB.stdout);
    const contextB = parsedB.hookSpecificOutput?.additionalContext || '';
    const handleB = contextB.match(/- State handle:\s*(.+)/)?.[1]?.trim();
    const revB = contextB.match(/- State revision:\s*(\d+)/)?.[1]?.trim() || '1';

    if (handleB) {
      spawnSync(process.execPath, [
        setPlanB, 'plans/root-b/plan.md',
        '--context-file', handleB,
        '--project-root', rootB,
        '--expected-revision', revB
      ]);
    }

    let isolated = false;
    if (handleA && handleB) {
      const queryA = spawnSync(process.execPath, [
        inspectScriptA, 'inspect', '--context-file', handleA, '--project-root', rootA
      ], { encoding: 'utf8' });

      const queryB = spawnSync(process.execPath, [
        inspectScriptB, 'inspect', '--context-file', handleB, '--project-root', rootB
      ], { encoding: 'utf8' });

      const dataA = JSON.parse(queryA.stdout);
      const dataB = JSON.parse(queryB.stdout);
      rawEvents.push({ rootA: dataA, rootB: dataB });
      isolated = dataA.record.activePlan === 'plans/root-a/plan.md' && dataB.record.activePlan === 'plans/root-b/plan.md';
    }

    const receipt = buildMultiRootReceipt({
      date: new Date().toISOString().slice(0, 10),
      rootA, rootB
    });

    saveReceipt('multi-root-workspace', receipt, rawEvents);
    return { ok: isolated };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
