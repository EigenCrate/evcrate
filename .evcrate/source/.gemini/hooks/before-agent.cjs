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
  return path.resolve(candidate) === path.resolve(path.join(os.homedir(), ".gemini/hooks/dev-rules-reminder.cjs"));
}

function resolveHookSource() {
  const candidates = [];
  if (process.env.GEMINI_PROJECT_DIR) candidates.push(process.env.GEMINI_PROJECT_DIR);
  candidates.push(process.cwd());

  for (const start of candidates) {
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {
      const probe = path.join(current, ".gemini/hooks/dev-rules-reminder.cjs");
      if (isUsableHook(probe) && !isPublishedHomeHook(probe)) return { projectDir: current, sourceHook: probe };
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  const homeHook = path.join(os.homedir(), ".gemini/hooks/dev-rules-reminder.cjs");
  if (isGlobalHookDirectory(homeHook) && isUsableHook(homeHook)) {
    return { projectDir: process.env.GEMINI_PROJECT_DIR || process.cwd(), sourceHook: homeHook };
  }

  return {
    projectDir: process.env.GEMINI_PROJECT_DIR || process.cwd(),
    sourceHook: path.join(process.cwd(), ".gemini/hooks/dev-rules-reminder.cjs"),
  };
}

const { projectDir, sourceHook } = resolveHookSource();
if (!isUsableHook(sourceHook)) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "BeforeAgent",
      additionalContext: '',
    },
  }));
  process.exit(0);
}
const result = spawnSync(process.execPath, [sourceHook], {
  input,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    GEMINI_PROJECT_DIR: projectDir,
    EVCRATE_CONFIG_DIR: '.gemini',
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
