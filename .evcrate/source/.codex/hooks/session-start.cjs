#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const input = fs.readFileSync(0, 'utf-8');
const guidancePath = path.join(__dirname, "../global-guidance.md");
function readGuidance() { try { return fs.readFileSync(guidancePath, 'utf8').trim(); } catch { return ''; } }

const sourceHook = path.join(__dirname, path.basename(".codex/hooks/session-init.cjs"));
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
if (!safeFile(sourceHook)) { process.stdout.write(JSON.stringify({})); process.exit(0); }
const result = spawnSync(process.execPath, [sourceHook], { cwd: projectDir, input, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CODEX_PROJECT_DIR: projectDir, EVCRATE_CONFIG_DIR: '.codex' } });
const additionalContext = [(result.stdout || '').trim(), readGuidance()].filter(Boolean).join('\n\n');
process.stdout.write(additionalContext ? JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }) : JSON.stringify({}));
