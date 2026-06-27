#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

let workspacePaths = [];
let payloadCwd = null;
try {
  const data = JSON.parse(input);
  if (data) {
    if (data.workspacePaths) workspacePaths = data.workspacePaths;
    if (data.cwd) payloadCwd = data.cwd;
  }
} catch(e) {}

function resolveHookSource() {
  const candidates = [];
  if (process.env.GEMINI_PROJECT_DIR) candidates.push(process.env.GEMINI_PROJECT_DIR);
  if (workspacePaths && workspacePaths.length > 0) {
    for (const p of workspacePaths) candidates.push(p);
  }
  if (payloadCwd) candidates.push(payloadCwd);
  candidates.push(process.cwd());

  for (const start of candidates) {
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {
      const probe = path.join(current, ".claude/hooks/scout-block.cjs");
      if (fs.existsSync(probe)) return { projectDir: current, sourceHook: probe };
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  const homeHook = path.join(os.homedir(), ".claude/hooks/scout-block.cjs");
  if (fs.existsSync(homeHook)) {
    const fallbackDir = (workspacePaths && workspacePaths.length > 0) ? workspacePaths[0] : (payloadCwd || process.env.GEMINI_PROJECT_DIR || process.cwd());
    return { projectDir: fallbackDir, sourceHook: homeHook };
  }

  const fallbackDir = (workspacePaths && workspacePaths.length > 0) ? workspacePaths[0] : (payloadCwd || process.env.GEMINI_PROJECT_DIR || process.cwd());
  return {
    projectDir: fallbackDir,
    sourceHook: path.join(process.cwd(), ".claude/hooks/scout-block.cjs"),
  };
}

const { projectDir, sourceHook } = resolveHookSource();

// Format Antigravity payload for Claude hook & convert paths to relative
let claudePayload = input;
try {
  const data = JSON.parse(input);
  if (data && !data.tool_input) {
    let toolName = "unknown";
    if (data.toolCall && data.toolCall.args) {
      const args = data.toolCall.args;
      if (args.CommandLine) toolName = "run_command";
      else if (args.TargetFile) toolName = "replace_file_content";
      else if (args.Query) toolName = "grep_search";
      else if (args.DirectoryPath) toolName = "list_dir";
      else if (args.AbsolutePath) toolName = "view_file";
      
      const mapKeys = (obj) => {
        if (typeof obj === "string") {
          let normalized = obj.replace(/\\/g, '/');
          let projNormalized = projectDir.replace(/\\/g, '/');
          if (normalized.startsWith(projNormalized)) {
            let rel = normalized.substring(projNormalized.length);
            if (rel.startsWith('/')) rel = rel.substring(1);
            return rel;
          }
          return obj;
        }
        if (Array.isArray(obj)) return obj.map(mapKeys);
        if (typeof obj === "object" && obj !== null) {
          const newObj = {};
          for (const key of Object.keys(obj)) {
            let mappedKey = key;
            if (key === 'AbsolutePath') mappedKey = 'path';
            else if (key === 'TargetFile') mappedKey = 'path';
            else if (key === 'SearchPath') mappedKey = 'path';
            else if (key === 'DirectoryPath') mappedKey = 'path';
            else if (key === 'CommandLine') mappedKey = 'command';
            
            newObj[mappedKey] = mapKeys(obj[key]);
          }
          return newObj;
        }
        return obj;
      };
      
      claudePayload = JSON.stringify({
        tool_name: toolName,
        tool_input: mapKeys(args)
      });
    }
  }
} catch(e) {}

let result = spawnSync(process.execPath, [sourceHook], {
  input: claudePayload,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    GEMINI_PROJECT_DIR: projectDir,
  },
});

// Fallback to global hook if local hook failed to run or crashed (status 1 or error)
if ((result.status === 1 || result.error) && !sourceHook.includes('.gemini/config')) {
  const globalHook = path.join(os.homedir(), ".gemini/config/hooks/scout-block.cjs");
  if (fs.existsSync(globalHook)) {
    const fallbackResult = spawnSync(process.execPath, [globalHook], {
      input: input,
      encoding: 'utf-8',
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
        GEMINI_PROJECT_DIR: projectDir,
      },
    });
    process.stdout.write(fallbackResult.stdout);
    process.exit(fallbackResult.status);
  }
}

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 2 || result.status === 1) {
  process.stdout.write(JSON.stringify({
    decision: 'deny',
    reason: reason || 'Blocked by migrated Claude hook.',
    hookSpecificOutput: {
      hookEventName: "BeforeTool",
    },
  }));
} else {
  process.stdout.write(JSON.stringify({
    decision: 'allow',
    hookSpecificOutput: {
      hookEventName: "BeforeTool",
    },
  }));
}
