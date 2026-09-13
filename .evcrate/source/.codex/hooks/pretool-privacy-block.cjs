#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const input = fs.readFileSync(0, 'utf-8');
const sourceHook = path.join(__dirname, path.basename(".codex/hooks/privacy-block.cjs"));
function hasSymlinkedPathComponent(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    try { if (fs.lstatSync(current).isSymbolicLink()) return true; } catch { return true; }
    const parent = path.dirname(current); if (parent === current) return false; current = parent;
  }
}
function safeFile(candidate) {
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate); } catch { return false; }
}
const projectDir = process.env.CODEX_PROJECT_DIR || process.cwd();
if (!safeFile(sourceHook)) { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'EVCREATE_HOOK_UNAVAILABLE' } })); process.exit(0); }
const result = spawnSync(process.execPath, [sourceHook], { cwd: projectDir, input, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CODEX_PROJECT_DIR: projectDir, EVCRATE_CONFIG_DIR: '.codex' } });
if (result.status === 0 && !result.error) process.stdout.write(JSON.stringify({}));
else process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: (result.stderr || result.stdout || '').trim() || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.' } }));
