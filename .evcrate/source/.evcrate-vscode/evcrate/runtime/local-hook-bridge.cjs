#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  parseLocalHookInput,
  serializeLocalHookResult,
  serializeLocalHookError
} = require('./local-hook-protocol.cjs');
const { normalizeLocalTool } = require('./local-tool-inputs.cjs');
const { evaluateLocalPolicies, DEFAULT_SCOUT_PATTERNS } = require('./local-policy.cjs');
const { resolveInstallationRoots } = require('./local-session-context.cjs');
const {
  buildSessionStartContext,
  buildSubagentStartContext,
  buildPromptReminder,
  recordPreCompact,
  buildModularizationContext
} = require('./local-lifecycle.cjs');

function loadIgnorePatterns() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '.evcrateignore'),
    path.resolve(__dirname, '..', '.evcrateignore'),
    path.resolve(process.cwd(), '.evcrateignore')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const text = fs.readFileSync(c, 'utf8');
        const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        if (lines.length > 0) return lines;
      }
    } catch {}
  }
  return [...DEFAULT_SCOUT_PATTERNS];
}

function runBridge(expectedEvent, stdinBytes) {
  const payload = parseLocalHookInput(stdinBytes, expectedEvent);
  const eventName = payload.hook_event_name;
  let output = { continue: true };

  let roots = null;
  try {
    roots = resolveInstallationRoots(__filename);
  } catch {}

  switch (eventName) {
    case 'PreToolUse': {
      const toolOp = normalizeLocalTool(
        payload.tool_name,
        payload.tool_input,
        payload.tool_use_id,
        payload.cwd
      );
      const patterns = loadIgnorePatterns();
      const policyResult = evaluateLocalPolicies(toolOp, { patterns });

      if (policyResult.decision === 'deny') {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: policyResult.reason
          },
          systemMessage: policyResult.reason
        };
      } else if (policyResult.decision === 'ask') {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: policyResult.reason
          },
          systemMessage: policyResult.reason
        };
      } else {
        output = {
          continue: true,
          ...(policyResult.systemMessage ? { systemMessage: policyResult.systemMessage } : {})
        };
      }
      break;
    }

    case 'PostToolUse': {
      if (roots) {
        const modResult = buildModularizationContext(payload, roots);
        output = {
          continue: true,
          ...(modResult.systemMessage ? { systemMessage: modResult.systemMessage } : {})
        };
      } else {
        output = { continue: true };
      }
      break;
    }

    case 'SessionStart': {
      if (roots) {
        output = buildSessionStartContext(payload, roots);
      } else {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: 'EVCrate Local qualification context active.'
          }
        };
      }
      break;
    }

    case 'UserPromptSubmit': {
      if (roots) {
        output = buildPromptReminder(payload, roots);
      } else {
        output = { continue: true };
      }
      break;
    }

    case 'PreCompact': {
      if (roots) {
        output = recordPreCompact(payload, roots);
      } else {
        output = { continue: true };
      }
      break;
    }

    case 'SubagentStart': {
      if (roots) {
        output = buildSubagentStartContext(payload, roots);
      } else {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'SubagentStart',
            additionalContext: 'EVCrate subagent context active.'
          }
        };
      }
      break;
    }

    case 'SubagentStop':
    case 'Stop': {
      output = { continue: true };
      break;
    }
  }

  return serializeLocalHookResult(eventName, output);
}

function main() {
  const expectedEvent = process.argv[2];
  let inputBuffer = Buffer.alloc(0);

  try {
    inputBuffer = fs.readFileSync(0);
  } catch (readErr) {
    const errResult = serializeLocalHookError(readErr);
    process.stderr.write(errResult.stderr);
    process.exit(errResult.exitCode);
  }

  try {
    const result = runBridge(expectedEvent, inputBuffer);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  } catch (err) {
    const errResult = serializeLocalHookError(err);
    if (errResult.stdout) process.stdout.write(errResult.stdout);
    if (errResult.stderr) process.stderr.write(errResult.stderr);
    process.exit(errResult.exitCode);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runBridge,
  loadIgnorePatterns
};
