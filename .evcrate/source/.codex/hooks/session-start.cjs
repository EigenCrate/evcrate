#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const input = fs.readFileSync(0, 'utf-8');
const guidancePath = path.join(__dirname, "../global-guidance.md");
function readGuidance() { try { return fs.readFileSync(guidancePath, 'utf8').trim(); } catch { return ''; } }

function safeFile(candidate) {
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink(); } catch { return false; }
}
function resolveHook() {
  const starts = [process.env.CODEX_PROJECT_DIR, process.cwd()].filter(Boolean);
  for (const start of starts) {
    let current = path.resolve(start);
    while (true) {
      const candidate = path.join(current, ".codex/hooks/session-init.cjs");
      if (safeFile(candidate) && path.resolve(candidate) !== path.resolve(path.join(os.homedir(), ".codex/hooks/session-init.cjs"))) return { projectDir: current, sourceHook: candidate };
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  return { projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(), sourceHook: path.join(process.cwd(), ".codex/hooks/session-init.cjs") };
}
const { projectDir, sourceHook } = resolveHook();
if (!safeFile(sourceHook)) { process.stdout.write(JSON.stringify({})); process.exit(0); }
const result = spawnSync(process.execPath, [sourceHook], { cwd: projectDir, input, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CODEX_PROJECT_DIR: projectDir, EVCRATE_CONFIG_DIR: '.codex' } });
const additionalContext = [(result.stdout || '').trim(), readGuidance()].filter(Boolean).join('\n\n');
process.stdout.write(additionalContext ? JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }) : JSON.stringify({}));
