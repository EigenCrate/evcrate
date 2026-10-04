#!/usr/bin/env node
/**
 * capture-hook.cjs
 *
 * Local qualification hook recorder.
 * Consumes JSON from stdin, logs a bounded JSONL entry to EVCRATE_CAPTURE_DIR,
 * and emits a valid PascalCase event response to stdout.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function main() {
  let inputBuffer = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (chunk) => {
    inputBuffer += chunk;
  });

  process.stdin.on('end', () => {
    let payload = {};
    try {
      if (inputBuffer.trim()) {
        payload = JSON.parse(inputBuffer);
      }
    } catch (err) {
      process.stderr.write('capture-hook: invalid JSON input: ' + err.message + '\n');
      process.exit(1);
    }

    const eventName = payload.hook_event_name || 'Unknown';
    const timestamp = Date.now();

    // Determine capture directory
    const captureDir = process.env.EVCRATE_CAPTURE_DIR || path.join(os.tmpdir(), 'evcrate-local-capture');
    try {
      fs.mkdirSync(captureDir, { recursive: true, mode: 0o700 });
      const record = {
        timestamp,
        event: eventName,
        payload
      };
      const logFile = path.join(captureDir, 'hook-events.jsonl');
      fs.appendFileSync(logFile, JSON.stringify(record) + '\n', { mode: 0o600 });
    } catch (writeErr) {
      process.stderr.write('capture-hook: log write failed: ' + writeErr.message + '\n');
    }

    // Check for forced error code
    const forcedExit = parseInt(process.env.EVCRATE_HOOK_FORCE_EXIT || '0', 10);
    if (forcedExit !== 0) {
      process.stderr.write('capture-hook: simulated exit code ' + forcedExit + '\n');
      process.exit(forcedExit);
    }

    // Formulate response per event contract
    const response = computeResponse(eventName, payload);
    process.stdout.write(JSON.stringify(response) + '\n');
    process.exit(0);
  });
}

function computeResponse(eventName, payload) {
  switch (eventName) {
    case 'SessionStart':
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'EVCrate Local qualification context active.'
        }
      };

    case 'UserPromptSubmit':
      return {
        continue: true
      };

    case 'PreToolUse': {
      const decision = process.env.EVCRATE_PRE_TOOL_DECISION || 'allow';
      const result = {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: decision,
          permissionDecisionReason: decision === 'deny' ? 'Blocked by diagnostic policy' : undefined
        }
      };
      if (process.env.EVCRATE_REPLACE_TOOL_INPUT) {
        try {
          result.hookSpecificOutput.updatedInput = JSON.parse(process.env.EVCRATE_REPLACE_TOOL_INPUT);
        } catch {}
      }
      return result;
    }

    case 'PostToolUse': {
      if (process.env.EVCRATE_POST_TOOL_BLOCK === '1') {
        return {
          continue: true,
          decision: 'block',
          reason: 'PostToolUse qualification block sentinel'
        };
      }
      return {
        continue: true
      };
    }

    case 'PreCompact':
      return {
        continue: true
      };

    case 'SubagentStart':
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
          additionalContext: 'EVCrate subagent qualification context.'
        }
      };

    case 'SubagentStop': {
      const stopHookActive = Boolean(payload && payload.stop_hook_active);
      if (!stopHookActive && process.env.EVCRATE_SUBAGENT_STOP_BLOCK === '1') {
        return {
          continue: true,
          decision: 'block',
          reason: 'SubagentStop qualification block sentinel'
        };
      }
      return {
        continue: true
      };
    }

    case 'Stop': {
      const stopHookActive = Boolean(payload && payload.stop_hook_active);
      if (!stopHookActive && process.env.EVCRATE_STOP_BLOCK === '1') {
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            decision: 'block',
            reason: 'Stop qualification block sentinel'
          }
        };
      }
      return {
        continue: true
      };
    }

    default:
      return {
        continue: true
      };
  }
}

if (require.main === module) {
  main();
}

module.exports = { computeResponse };
