'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { normalizeLocalTool } = require('./local-tool-inputs.cjs');
const { createSessionContext } = require('./local-session-context.cjs');
const {
  initSessionState,
  readSessionContext,
  refreshSession,
  recordPreCompact: updatePreCompactState
} = require('./local-session-state.cjs');

function detectPackageManager(projectRoot) {
  try {
    if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) return 'npm';
    if (fs.existsSync(path.join(projectRoot, 'bun.lockb')) || fs.existsSync(path.join(projectRoot, 'bun.lock'))) return 'bun';
  } catch {}
  return 'npm';
}

function buildSessionStartContext(payload, roots, options) {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options && options.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options && options.qualifiedWorkspaceContract,
      tmpDir: options && options.tmpDir
    }
  );

  if (sessionCtx.kind === 'native') {
    const state = initSessionState(sessionCtx, null, options && options.now);
    const pm = detectPackageManager(sessionCtx.projectRoot);
    const platform = os.platform();
    const activePlan = state.activePlan ? state.activePlan : 'none';

    const lines = [
      '# EVCrate Local Session Context',
      '- Target: vscode-local (Agent Plugins 1.0)',
      '- Project root: ' + sessionCtx.projectRoot,
      '- Platform: ' + platform,
      '- Package manager: ' + pm,
      '- Active plan: ' + activePlan,
      '- State handle: ' + sessionCtx.handle,
      '- State revision: ' + state.revision,
      '',
      '## Plan Activation Command',
      'To set or update active plan, run:',
      'node evcrate/scripts/set-active-plan.cjs <plan-path> --context-file "' + sessionCtx.handle + '" --project-root "' + sessionCtx.projectRoot + '" --expected-revision ' + state.revision,
      'To clear active plan, run:',
      'node evcrate/scripts/set-active-plan.cjs --clear --context-file "' + sessionCtx.handle + '" --project-root "' + sessionCtx.projectRoot + '" --expected-revision ' + state.revision
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
    '- Session status: stateless (' + sessionCtx.reason + ')',
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

function buildSubagentStartContext(payload, roots, options) {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options && options.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options && options.qualifiedWorkspaceContract,
      tmpDir: options && options.tmpDir
    }
  );

  if (sessionCtx.kind === 'native') {
    const readRes = readSessionContext(sessionCtx.handle, sessionCtx.projectRoot, options && options.now);
    const activePlan = readRes.status === 'ok' && readRes.record.activePlan ? readRes.record.activePlan : 'none';
    const revision = readRes.status === 'ok' ? readRes.record.revision : 'unknown';

    const lines = [
      '# EVCrate Subagent Context: ' + payload.agent_type,
      '- Agent ID: ' + payload.agent_id,
      '- Project root: ' + sessionCtx.projectRoot,
      '- Active plan: ' + activePlan,
      '- State revision: ' + revision,
      '- State handle: ' + sessionCtx.handle
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
    '# EVCrate Subagent Context: ' + payload.agent_type,
    '- Agent ID: ' + payload.agent_id,
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

function buildPromptReminder(payload, roots, options) {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options && options.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options && options.qualifiedWorkspaceContract,
      tmpDir: options && options.tmpDir
    }
  );

  let planReminder = 'Plan: none';
  if (sessionCtx.kind === 'native') {
    try {
      refreshSession(sessionCtx.handle, sessionCtx.projectRoot, options && options.now);
      const readRes = readSessionContext(sessionCtx.handle, sessionCtx.projectRoot, options && options.now);
      if (readRes.status === 'ok' && readRes.record.activePlan) {
        planReminder = 'Plan: ' + readRes.record.activePlan;
      }
    } catch {}
  }

  const reminder = [
    '[EVCrate Local Prompt Reminder]',
    '- ' + planReminder,
    '- Rules: DRY, KISS, YAGNI. Sacrifice grammar for concision in reports. List unresolved questions at the end.'
  ].join('\n');

  return {
    continue: true,
    systemMessage: reminder
  };
}

function recordPreCompact(payload, roots, options) {
  const sessionCtx = createSessionContext(
    {
      sessionId: payload.session_id,
      cwd: payload.cwd,
      explicitProjectRoot: options && options.explicitProjectRoot
    },
    roots,
    {
      qualifiedWorkspaceContract: options && options.qualifiedWorkspaceContract,
      tmpDir: options && options.tmpDir
    }
  );

  if (sessionCtx.kind === 'native') {
    try {
      updatePreCompactState(sessionCtx.handle, sessionCtx.projectRoot, options && options.now);
      return {
        continue: true,
        systemMessage: '[EVCrate Local] PreCompact recorded in session state. Active plan preserved.'
      };
    } catch (err) {
      return {
        continue: true,
        systemMessage: '[EVCrate Local] PreCompact recording failed: ' + String(err)
      };
    }
  }

  return {
    continue: true,
    systemMessage: '[EVCrate Local] PreCompact: Stateless session, no state record updated.'
  };
}

function buildModularizationContext(payload, _roots, _options) {
  const toolOp = normalizeLocalTool(
    payload.tool_name,
    payload.tool_input,
    payload.tool_use_id,
    payload.cwd
  );

  if (toolOp.kind !== 'edit') {
    return { continue: true };
  }

  const warnings = [];
  const baseDir = payload.cwd || process.cwd();

  for (let i = 0; i < toolOp.operands.length; i++) {
    const operand = toolOp.operands[i];
    try {
      const fullPath = path.isAbsolute(operand) ? operand : path.resolve(baseDir, operand);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.size < 1024 * 1024) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const loc = content.split('\n').length;
          if (loc > 200) {
            warnings.push(
              '[EVCrate Modularization Warning] File "' + operand + '" has ' + loc + ' LOC (threshold: 200). Consider modularization: analyze logical boundaries, use kebab-case naming, ensure self-documenting names.'
            );
          }
        }
      }
    } catch {}
  }

  if (warnings.length > 0) {
    return {
      continue: true,
      systemMessage: warnings.join('\n'),
      warnings
    };
  }

  return { continue: true };
}

module.exports = {
  detectPackageManager,
  buildSessionStartContext,
  buildSubagentStartContext,
  buildPromptReminder,
  recordPreCompact,
  buildModularizationContext
};
