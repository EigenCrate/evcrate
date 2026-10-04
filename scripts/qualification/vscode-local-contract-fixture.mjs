#!/usr/bin/env node
/**
 * vscode-local-contract-fixture.mjs
 *
 * Materializes a disposable, self-contained Agent Plugins 1.0 fixture
 * for VS Code Local runtime contract qualification.
 *
 * Usage:
 *   node scripts/qualification/vscode-local-contract-fixture.mjs \
 *     --destination <absolute-path> \
 *     --capture-directory <absolute-path>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

export const FIXTURE_PLUGIN_JSON = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'evcrate-local',
  version: '1.0.0',
  description: 'EVCrate VS Code Local qualification plugin fixture'
};

export const FIXTURE_HOOKS_JSON = {
  version: 1,
  hooks: {
    SessionStart: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ],
    UserPromptSubmit: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ],
    PreToolUse: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ],
    PostToolUse: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ],
    PreCompact: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ],
    SubagentStart: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ],
    SubagentStop: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ],
    Stop: [
      {
        type: 'command',
        command: 'node evcrate/capture-hook.cjs',
        timeout: 30
      }
    ]
  }
};

export const FIXTURE_BOOTSTRAP_INSTRUCTIONS = `---
applyTo: "**"
description: "Always-on bootstrap qualification rule for EVCrate Local"
---

# EVCrate Local Bootstrap Qualification Rule

Sentinel marker: EVCRATE_LOCAL_BOOTSTRAP_ACTIVE_SENTINEL_261002

This rule must attach automatically without open, attached, or referenced files in VS Code Local.
If this instruction is present in references or agent debug logs, the applyTo: "**" contract passes.
`;

export const FIXTURE_DENY_ALL_AGENT = `---
name: contract-deny-all
description: "Local qualification agent with explicit deny-all tools and subagents"
user-invocable: true
disable-model-invocation: false
tools: []
agents: []
---

You are a test agent for VS Code Local contract qualification.
Your tools and subagents are explicitly configured as empty lists: tools: [] and agents: [].
You must not execute any tools, commands, or subagents.
`;

export const FIXTURE_READER_AGENT = `---
name: contract-reader
description: "Local qualification agent with read-only tool access"
user-invocable: true
disable-model-invocation: true
tools:
  - read_file
agents: []
---

You are a read-only test agent for VS Code Local contract qualification.
You only have read_file access. You must not edit files, run terminal commands, or delegate.
`;

export const FIXTURE_SKILL_ECHO = `---
name: contract-echo
description: "Manual slash-invoked echo skill for argument testing"
user-invocable: true
disable-model-invocation: true
argument-hint: "<input text to echo>"
---

# Contract Echo Skill

When invoked, echo back the user's raw arguments wrapped in sentinel delimiters:
[ARG_START]<<arguments>>[ARG_END]

Read companion specification: [echo-spec](./spec.md)
`;

export const FIXTURE_SKILL_ECHO_SPEC = `# Contract Echo Specification

This file serves as companion reference proof that companion relative files are resolved
correctly from the skill folder.

Companion Sentinel: EVCRATE_ECHO_COMPANION_SENTINEL_OK
`;

export const FIXTURE_SKILL_AUTO = `---
name: contract-auto
description: "Automatic skill that activates only when contract-auto task is requested"
user-invocable: false
disable-model-invocation: false
---

# Contract Auto Skill

This skill is hidden from slash commands (user-invocable: false) and should load
automatically only when the prompt specifically asks to test contract-auto.

Auto Sentinel: EVCRATE_AUTO_SKILL_LOADED_SENTINEL
`;

export const FIXTURE_CAPTURE_HOOK_CJS = `#!/usr/bin/env node
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
      process.stderr.write('capture-hook: invalid JSON input: ' + err.message + '\\n');
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
      fs.appendFileSync(logFile, JSON.stringify(record) + '\\n', { mode: 0o600 });
    } catch (writeErr) {
      process.stderr.write('capture-hook: log write failed: ' + writeErr.message + '\\n');
    }

    // Check for forced error code
    const forcedExit = parseInt(process.env.EVCRATE_HOOK_FORCE_EXIT || '0', 10);
    if (forcedExit !== 0) {
      process.stderr.write('capture-hook: simulated exit code ' + forcedExit + '\\n');
      process.exit(forcedExit);
    }

    // Formulate response per event contract
    const response = computeResponse(eventName, payload);
    process.stdout.write(JSON.stringify(response) + '\\n');
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
`;

export function materializeFixture({ destination, captureDirectory }) {
  if (!destination) {
    throw new Error('Destination directory is required');
  }
  const dest = path.resolve(destination);
  const captureDir = captureDirectory ? path.resolve(captureDirectory) : path.join(dest, '.capture');

  // File mapping inside plugin root
  const files = [
    { rel: 'plugin.json', content: JSON.stringify(FIXTURE_PLUGIN_JSON, null, 2) + '\n', mode: 0o644 },
    { rel: 'skills/contract-echo/SKILL.md', content: FIXTURE_SKILL_ECHO, mode: 0o644 },
    { rel: 'skills/contract-echo/spec.md', content: FIXTURE_SKILL_ECHO_SPEC, mode: 0o644 },
    { rel: 'skills/contract-auto/SKILL.md', content: FIXTURE_SKILL_AUTO, mode: 0o644 },
    { rel: 'com.github.copilot/agents/contract-deny-all.agent.md', content: FIXTURE_DENY_ALL_AGENT, mode: 0o644 },
    { rel: 'com.github.copilot/agents/contract-reader.agent.md', content: FIXTURE_READER_AGENT, mode: 0o644 },
    { rel: 'com.github.copilot/rules/bootstrap.instructions.md', content: FIXTURE_BOOTSTRAP_INSTRUCTIONS, mode: 0o644 },
    { rel: 'com.github.copilot/hooks/hooks.json', content: JSON.stringify(FIXTURE_HOOKS_JSON, null, 2) + '\n', mode: 0o644 },
    { rel: 'evcrate/capture-hook.cjs', content: FIXTURE_CAPTURE_HOOK_CJS, mode: 0o755 }
  ];

  const manifest = {
    created_at: new Date().toISOString(),
    destination: dest,
    capture_directory: captureDir,
    files: []
  };

  for (const f of files) {
    const filePath = path.join(dest, f.rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, f.content, { mode: f.mode });
    const digest = crypto.createHash('sha256').update(f.content, 'utf8').digest('hex');
    manifest.files.push({
      path: f.rel,
      digest,
      bytes: Buffer.byteLength(f.content, 'utf8')
    });
  }

  // Ensure capture directory exists with safe permissions
  fs.mkdirSync(captureDir, { recursive: true, mode: 0o700 });

  return manifest;
}

export function materializeWorkspace({ destination }) {
  const dest = path.resolve(destination);
  fs.mkdirSync(dest, { recursive: true });

  const files = [
    { rel: 'fixture.env', content: 'QUALIFICATION_VAR=harmless_value\nSENTINEL=EVCRATE_SAFE\n' },
    { rel: 'sample.txt', content: 'Safe synthetic text for read/search test.\n' },
    { rel: 'edit-target.txt', content: 'Original line to be replaced in edit test.\n' }
  ];

  const manifest = [];
  for (const f of files) {
    const fullPath = path.join(dest, f.rel);
    fs.writeFileSync(fullPath, f.content, { mode: 0o644 });
    manifest.push({
      path: f.rel,
      digest: crypto.createHash('sha256').update(f.content, 'utf8').digest('hex')
    });
  }
  return manifest;
}

function parseArgs(args) {
  const parsed = {
    destination: null,
    captureDirectory: null,
    withWorkspace: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--destination' || arg === '-d') {
      parsed.destination = args[++i];
    } else if (arg === '--capture-directory' || arg === '-c') {
      parsed.captureDirectory = args[++i];
    } else if (arg === '--with-workspace') {
      parsed.withWorkspace = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function showHelp() {
  console.log(`
Usage:
  node scripts/qualification/vscode-local-contract-fixture.mjs [options]

Options:
  --destination, -d <path>         Absolute or relative destination directory for the fixture plugin (required)
  --capture-directory, -c <path>   Directory where hook logs will be written (default: <destination>/.capture)
  --with-workspace                 Also create a synthetic workspace folder at <destination>-workspace
  --help, -h                       Show this help message
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.destination) {
    showHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const manifest = materializeFixture(opts);
  console.log(JSON.stringify(manifest, null, 2));

  if (opts.withWorkspace) {
    const wsDest = `${opts.destination}-workspace`;
    const wsManifest = materializeWorkspace({ destination: wsDest });
    console.log(`Workspace created at ${wsDest}:`, wsManifest);
  }
}
