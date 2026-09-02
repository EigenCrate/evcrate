#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const input = fs.readFileSync(0, 'utf-8');
function safeFile(candidate) { try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink(); } catch { return false; } }
function resolveHook() {
  const starts = [process.env.CODEX_PROJECT_DIR, process.cwd()].filter(Boolean);
  for (const start of starts) {
    let current = path.resolve(start);
    while (true) {
      const candidate = path.join(current, ".codex/hooks/scout-block.cjs");
      if (safeFile(candidate)) return { projectDir: current, sourceHook: candidate };
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  return { projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(), sourceHook: path.join(process.cwd(), ".codex/hooks/scout-block.cjs") };
}
const { projectDir, sourceHook } = resolveHook();
if (!safeFile(sourceHook)) { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'EVCREATE_HOOK_UNAVAILABLE' } })); process.exit(0); }
const result = spawnSync(process.execPath, [sourceHook], { cwd: projectDir, input, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CODEX_PROJECT_DIR: projectDir, EVCRATE_CONFIG_DIR: '.codex' } });
if (result.status === 0 && !result.error) process.stdout.write(JSON.stringify({}));
else process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: (result.stderr || result.stdout || '').trim() || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.' } }));
