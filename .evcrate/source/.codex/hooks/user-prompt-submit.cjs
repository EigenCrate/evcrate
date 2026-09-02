#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const input = fs.readFileSync(0, 'utf-8');

function safeFile(candidate) {
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink(); } catch { return false; }
}
function resolveHook() {
  const starts = [process.env.CODEX_PROJECT_DIR, process.cwd()].filter(Boolean);
  for (const start of starts) {
    let current = path.resolve(start);
    while (true) {
      const candidate = path.join(current, ".codex/hooks/dev-rules-reminder.cjs");
      if (safeFile(candidate) && path.resolve(candidate) !== path.resolve(path.join(os.homedir(), ".codex/hooks/dev-rules-reminder.cjs"))) return { projectDir: current, sourceHook: candidate };
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  return { projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(), sourceHook: path.join(process.cwd(), ".codex/hooks/dev-rules-reminder.cjs") };
}
const { projectDir, sourceHook } = resolveHook();
if (!safeFile(sourceHook)) { process.stdout.write(JSON.stringify({})); process.exit(0); }
const result = spawnSync(process.execPath, [sourceHook], { cwd: projectDir, input, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CODEX_PROJECT_DIR: projectDir, EVCRATE_CONFIG_DIR: '.codex' } });
const additionalContext = [(result.stdout || '').trim()].filter(Boolean).join('\n\n');
process.stdout.write(additionalContext ? JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }) : JSON.stringify({}));
