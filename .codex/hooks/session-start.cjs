#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');
const projectDir = process.env.CODEX_PROJECT_DIR || process.cwd();
const sourceHook = path.join(projectDir, ".claude/hooks/session-init.cjs");
const result = spawnSync(process.execPath, [sourceHook], {
  input,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CODEX_PROJECT_DIR: projectDir,
  },
});

const additionalContext = (result.stdout || '').trim();
if (!additionalContext) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext,
  },
}));
