#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

const sourceHook = path.join(__dirname, "privacy-block.cjs.original.cjs");

const hasSymlinkedPathComponent = (candidate) => {
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
};

const isUsableHook = (candidate) => {
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate);
  } catch {
    return false;
  }
};

// Format Antigravity payload for Claude hook
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
       
        const findProjectRoot = () => {
          if (data.workspacePaths && data.workspacePaths.length > 0) {
            return data.workspacePaths[0];
          }
          if (data.cwd) {
            return data.cwd;
          }
          if (process.env.GEMINI_PROJECT_DIR) return process.env.GEMINI_PROJECT_DIR;
          if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
          let current = process.cwd();
          while (true) {
            if (fs.existsSync(path.join(current, '.antigravity')) ||
                fs.existsSync(path.join(current, '.codex')) ||
                fs.existsSync(path.join(current, '.gemini')) ||
                fs.existsSync(path.join(current, '.pi'))) {
              return current;
            }
            if (fs.existsSync(path.join(current, '.agents')) || 
                fs.existsSync(path.join(current, '.git'))) {
              return current;
            }
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
          }
          return process.cwd();
        };

        const projectRoot = findProjectRoot();

        const mapKeys = (obj) => {
          if (typeof obj === "string") {
            let normalized = obj.replace(/\\/g, '/');
            let projNormalized = projectRoot.replace(/\\/g, '/');
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

if (!isUsableHook(sourceHook)) {
  process.stdout.write(JSON.stringify({
    decision: "deny",
    reason: "EVCREATE_HOOK_UNAVAILABLE",
  }) + '\n');
  process.exit(0);
}

const result = spawnSync(process.execPath, [sourceHook], {
  input: claudePayload,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: process.cwd(),
    GEMINI_PROJECT_DIR: process.cwd(),
  },
});

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 0 && !result.error) {
  // Allow
  process.stdout.write(JSON.stringify({ decision: "allow" }) + '\n');
  process.exit(0);
} else {
  // Deny
  process.stdout.write(JSON.stringify({
    decision: "deny",
    reason: reason || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.'
  }) + '\n');
  process.exit(0);
}
