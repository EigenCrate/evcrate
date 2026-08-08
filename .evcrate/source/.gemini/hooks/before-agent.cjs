#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

function resolveHookSource() {
  const candidates = [];
  if (process.env.GEMINI_PROJECT_DIR) candidates.push(process.env.GEMINI_PROJECT_DIR);
  candidates.push(process.cwd());

  for (const start of candidates) {
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {
      const probe = path.join(current, ".claude/hooks/dev-rules-reminder.cjs");
      if (fs.existsSync(probe)) return { projectDir: current, sourceHook: probe };
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  const homeHook = path.join(os.homedir(), ".claude/hooks/dev-rules-reminder.cjs");
  if (fs.existsSync(homeHook)) {
    return { projectDir: process.env.GEMINI_PROJECT_DIR || process.cwd(), sourceHook: homeHook };
  }

  return {
    projectDir: process.env.GEMINI_PROJECT_DIR || process.cwd(),
    sourceHook: path.join(process.cwd(), ".claude/hooks/dev-rules-reminder.cjs"),
  };
}

const { projectDir, sourceHook } = resolveHookSource();
const result = spawnSync(process.execPath, [sourceHook], {
  input,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    GEMINI_PROJECT_DIR: projectDir,
  },
});

const additionalContext = (result.stdout || '').trim();
const systemMessage = (result.stderr || '').trim();
const payload = {
  hookSpecificOutput: {
    hookEventName: "BeforeAgent",
    additionalContext,
  },
};

if (systemMessage) {
  payload.systemMessage = systemMessage;
}

process.stdout.write(JSON.stringify(payload));
