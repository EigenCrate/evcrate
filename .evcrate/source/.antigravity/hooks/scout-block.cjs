#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

const sourceHook = path.join(__dirname, "scout-block.cjs.original.cjs");

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
let projectRoot = process.cwd();
const isWorkspaceDirectory = (candidate) => {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) return false;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
};
try {
  const data = JSON.parse(input);
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const workspaceCandidates = [
      ...(Array.isArray(data.workspacePaths) ? data.workspacePaths : []),
      data.cwd,
      process.env.AGY_PROJECT_DIR,
      process.env.GEMINI_PROJECT_DIR,
      process.env.CLAUDE_PROJECT_DIR,
      process.cwd(),
    ];
    projectRoot = workspaceCandidates.find(isWorkspaceDirectory) || process.cwd();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !data.toolCall || typeof data.toolCall.name !== 'string'
      || !data.toolCall.args || typeof data.toolCall.args !== 'object' || Array.isArray(data.toolCall.args)) {
    throw new Error('Invalid native tool call');
  }
  {
    const args = data.toolCall.args;
    const toolNames = {
      run_command: 'Bash', grep_search: 'Grep', find_by_name: 'Glob', list_dir: 'Glob',
      view_file: 'Read', replace_file_content: 'Edit', multi_replace_file_content: 'Edit', write_to_file: 'Write',
    };
    const toolName = toolNames[data.toolCall.name];
    if (!toolName) throw new Error('Unsupported native tool call');
    const mapKeys = (obj) => {
      if (typeof obj === "string") {
        const normalized = obj.replace(/\\/g, '/');
        const projectNormalized = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
        if (normalized === projectNormalized) return '';
        if (normalized.startsWith(projectNormalized + '/')) return normalized.slice(projectNormalized.length + 1);
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(mapKeys);
      if (typeof obj === "object" && obj !== null) {
        const newObj = {};
        for (const key of Object.keys(obj)) {
          let mappedKey = key;
          if (key === 'AbsolutePath' || key === 'TargetFile') mappedKey = 'file_path';
          else if (key === 'SearchPath' || key === 'SearchDirectory' || key === 'DirectoryPath') mappedKey = 'path';
          else if (key === 'CommandLine') mappedKey = 'command';
          else if (key === 'Pattern') mappedKey = 'pattern';
          newObj[mappedKey] = mapKeys(obj[key]);
        }
        return newObj;
      }
      return obj;
    };

    claudePayload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: data.conversationId,
      transcript_path: data.transcriptPath,
      cwd: projectRoot,
      tool_name: toolName,
      tool_input: mapKeys(args)
    });
  }
} catch {
  process.stdout.write(JSON.stringify({ decision: 'deny', reason: 'EVCREATE_INVALID_TOOL_CALL' }) + '\n');
  process.exit(0);
}
if (!isUsableHook(sourceHook)) {
  process.stdout.write(JSON.stringify({
    decision: "deny",
    reason: "EVCREATE_HOOK_UNAVAILABLE",
  }) + '\n');
  process.exit(0);
}

const result = spawnSync(process.execPath, [sourceHook], {
  cwd: projectRoot,
  input: claudePayload,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectRoot,
    GEMINI_PROJECT_DIR: projectRoot,
    AGY_PROJECT_DIR: projectRoot,
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
