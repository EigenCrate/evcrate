#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');
const scriptDir = path.dirname(__filename);

function readManagedGuidance() {
  const guidancePath = path.join(scriptDir, "../global-guidance.md");
  if (!fs.existsSync(guidancePath)) return '';
  return fs.readFileSync(guidancePath, 'utf-8').trim();
}

function resolveHookSource() {
  const candidates = [];
  if (process.env.CODEX_PROJECT_DIR) candidates.push(process.env.CODEX_PROJECT_DIR);
  candidates.push(process.cwd());

  for (const start of candidates) {
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {
      const probe = path.join(current, ".claude/hooks/session-init.cjs");
      if (fs.existsSync(probe)) return { projectDir: current, sourceHook: probe };
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  const homeHook = path.join(os.homedir(), ".claude/hooks/session-init.cjs");
  if (fs.existsSync(homeHook)) {
    return { projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(), sourceHook: homeHook };
  }

  return {
    projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(),
    sourceHook: path.join(process.cwd(), ".claude/hooks/session-init.cjs"),
  };
}

const { projectDir, sourceHook } = resolveHookSource();
const result = spawnSync(process.execPath, [sourceHook], {
  cwd: projectDir,
  input,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CODEX_PROJECT_DIR: projectDir,
    EVCRATE_CONFIG_DIR: ".codex",
  },
});

const additionalContext = [(result.stdout || '').trim(), readManagedGuidance()]
  .filter(Boolean)
  .join('\n\n');
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
