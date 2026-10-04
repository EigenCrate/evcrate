import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSessionContext } from './session-context.js';
import type { InstallationRoots } from './session-context-types.js';
import {
  initSessionState,
  readSessionContext,
  refreshSession,
  recordPreCompactState as updatePreCompactState
} from './session-state.js';
import type {
  LifecycleOptions,
  SessionStartPayload,
  SubagentStartPayload,
  UserPromptSubmitPayload,
  PreCompactPayload,
  SessionStartResult,
  SubagentStartResult,
  PromptReminderResult,
  PreCompactResult
} from './lifecycle-types.js';

export type * from './lifecycle-types.js';
export { buildModularizationContext } from './lifecycle-modularization.js';

export function detectPackageManager(projectRoot: string): string {
  try {
    if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) return 'npm';
    if (fs.existsSync(path.join(projectRoot, 'bun.lockb')) || fs.existsSync(path.join(projectRoot, 'bun.lock'))) return 'bun';
  } catch {}
  return 'npm';
}

export function buildSessionStartContext(
  payload: SessionStartPayload,
  roots: InstallationRoots,
  options?: LifecycleOptions
): SessionStartResult {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options?.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options?.qualifiedWorkspaceContract,
      tmpDir: options?.tmpDir
    }
  );

  if (sessionCtx.kind === 'native') {
    const state = initSessionState(sessionCtx, null, options?.now);
    const pm = detectPackageManager(sessionCtx.projectRoot);
    const platform = os.platform();
    const activePlan = state.activePlan ? state.activePlan : 'none';

    const lines = [
      '# EVCrate Local Session Context',
      `- Target: vscode-local (Agent Plugins 1.0)`,
      `- Project root: ${sessionCtx.projectRoot}`,
      `- Platform: ${platform}`,
      `- Package manager: ${pm}`,
      `- Active plan: ${activePlan}`,
      `- State handle: ${sessionCtx.handle}`,
      `- State revision: ${state.revision}`,
      '',
      '## Plan Activation Command',
      'To set or update active plan, run:',
      `node evcrate/scripts/set-active-plan.cjs <plan-path> --context-file "${sessionCtx.handle}" --project-root "${sessionCtx.projectRoot}" --expected-revision ${state.revision}`,
      'To clear active plan, run:',
      `node evcrate/scripts/set-active-plan.cjs --clear --context-file "${sessionCtx.handle}" --project-root "${sessionCtx.projectRoot}" --expected-revision ${state.revision}`
    ];

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: lines.join('\n')
      },
      handle: sessionCtx.handle,
      state
    };
  }

  const statelessLines = [
    '# EVCrate Local Session Context',
    '- Target: vscode-local (Agent Plugins 1.0)',
    `- Session status: stateless (${sessionCtx.reason})`,
    '- Persistence: unavailable (no native session identity or project bound)',
    '- Guidance: Pass explicit project and plan paths to tasks, commands, and subagents.'
  ];

  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: statelessLines.join('\n')
    },
    handle: null,
    state: null
  };
}

export function buildSubagentStartContext(
  payload: SubagentStartPayload,
  roots: InstallationRoots,
  options?: LifecycleOptions
): SubagentStartResult {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options?.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options?.qualifiedWorkspaceContract,
      tmpDir: options?.tmpDir
    }
  );

  if (sessionCtx.kind === 'native') {
    const readRes = readSessionContext(sessionCtx.handle, sessionCtx.projectRoot, options?.now);
    const activePlan = readRes.status === 'ok' && readRes.record.activePlan ? readRes.record.activePlan : 'none';
    const revision = readRes.status === 'ok' ? readRes.record.revision : 'unknown';

    const lines = [
      `# EVCrate Subagent Context: ${payload.agent_type}`,
      `- Agent ID: ${payload.agent_id}`,
      `- Project root: ${sessionCtx.projectRoot}`,
      `- Active plan: ${activePlan}`,
      `- State revision: ${revision}`,
      `- State handle: ${sessionCtx.handle}`
    ];

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: lines.join('\n')
      }
    };
  }

  const lines = [
    `# EVCrate Subagent Context: ${payload.agent_type}`,
    `- Agent ID: ${payload.agent_id}`,
    '- Session status: stateless (no correlated parent session)',
    '- Subagent input: Must carry explicit project and plan parameters in prompt.'
  ];

  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: lines.join('\n')
    }
  };
}

export function buildPromptReminder(
  payload: UserPromptSubmitPayload,
  roots: InstallationRoots,
  options?: LifecycleOptions
): PromptReminderResult {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options?.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options?.qualifiedWorkspaceContract,
      tmpDir: options?.tmpDir
    }
  );

  let planReminder = 'Plan: none';
  if (sessionCtx.kind === 'native') {
    try {
      refreshSession(sessionCtx.handle, sessionCtx.projectRoot, options?.now);
      const readRes = readSessionContext(sessionCtx.handle, sessionCtx.projectRoot, options?.now);
      if (readRes.status === 'ok' && readRes.record.activePlan) {
        planReminder = `Plan: ${readRes.record.activePlan}`;
      }
    } catch {}
  }

  const reminder = [
    '[EVCrate Local Prompt Reminder]',
    `- ${planReminder}`,
    '- Rules: DRY, KISS, YAGNI. Sacrifice grammar for concision in reports. List unresolved questions at the end.'
  ].join('\n');

  return {
    continue: true,
    systemMessage: reminder
  };
}

export function recordPreCompact(
  payload: PreCompactPayload,
  roots: InstallationRoots,
  options?: LifecycleOptions
): PreCompactResult {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options?.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options?.qualifiedWorkspaceContract,
      tmpDir: options?.tmpDir
    }
  );

  if (sessionCtx.kind === 'native') {
    try {
      updatePreCompactState(sessionCtx.handle, sessionCtx.projectRoot, options?.now);
      return {
        continue: true,
        systemMessage: '[EVCrate Local] PreCompact recorded in session state. Active plan preserved.'
      };
    } catch (err: unknown) {
      return {
        continue: true,
        systemMessage: `[EVCrate Local] PreCompact recording failed: ${String(err)}`
      };
    }
  }

  return {
    continue: true,
    systemMessage: '[EVCrate Local] PreCompact: Stateless session, no state record updated.'
  };
}
