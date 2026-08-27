#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

function hasSymlinkedPathComponent(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return true;
    }
    if (stat.isSymbolicLink()) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function isUsableHook(candidate) {
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate);
  } catch {
    return false;
  }
}

function isGlobalHookDirectory(candidate) {
  return path.resolve(__dirname) === path.resolve(path.dirname(candidate));
}

function isPublishedHomeHook(candidate) {
  return path.resolve(candidate) === path.resolve(path.join(os.homedir(), ".codex/hooks/scout-block.cjs"));
}

function resolveHookSource() {
  const candidates = [];
  if (process.env.CODEX_PROJECT_DIR) candidates.push(process.env.CODEX_PROJECT_DIR);
  candidates.push(process.cwd());

  for (const start of candidates) {
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {
      const probe = path.join(current, ".codex/hooks/scout-block.cjs");
      if (isUsableHook(probe) && !isPublishedHomeHook(probe)) return { projectDir: current, sourceHook: probe };
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  const homeHook = path.join(os.homedir(), ".codex/hooks/scout-block.cjs");
  if (isGlobalHookDirectory(homeHook) && isUsableHook(homeHook)) {
    return { projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(), sourceHook: homeHook };
  }

  return {
    projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(),
    sourceHook: path.join(process.cwd(), ".codex/hooks/scout-block.cjs"),
  };
}

const { projectDir, sourceHook } = resolveHookSource();

if (!isUsableHook(sourceHook)) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'EVCREATE_HOOK_UNAVAILABLE',
    },
  }));
  process.exit(0);
}

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

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 0 && !result.error) {
  process.stdout.write(JSON.stringify({}));
} else {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.',
    },
  }));
}
