#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAX_OUTPUT = 16384;
const OPERATIONS = Object.freeze({
  'session-start': ['session-init.cjs', 'dev-rules-reminder.cjs'],
  'subagent-start': ['subagent-init.cjs'],
  'pre-tool-use': ['scout-block.cjs', 'privacy-block.cjs'],
  'scout-block': ['scout-block.cjs'],
  'privacy-block': ['privacy-block.cjs'],
  'post-tool-use': ['modularization-hook.js'],
  'pre-compact': ['write-compact-marker.cjs'],
  'session-end': ['session-end.cjs'],
});

function bounded(value) {
  const text = String(value || '').trim();
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT - 1)}…` : text;
}

function fail(message, code = 2) {
  process.stderr.write(`Copilot hook bridge: ${message}\n`);
  return code;
}

function readPayload() {
  const raw = fs.readFileSync(0, 'utf8').trim();
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('hook payload must be a JSON object');
  }
  return value;
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value) || undefined;
}

function canonicalPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('hook payload must be a JSON object');
  }
  const toolInput = input.tool_input !== undefined
    ? input.tool_input
    : input.toolInput !== undefined
      ? input.toolInput
      : input.input;
  return {
    ...input,
    cwd: firstString(input.cwd, input.workingDirectory, input.working_directory) || process.cwd(),
    session_id: firstString(input.session_id, input.sessionId, input.session?.id),
    agent_type: firstString(input.agent_type, input.agentType, input.agent?.type),
    agent_id: firstString(input.agent_id, input.agentId, input.agent?.id),
    tool_name: firstString(input.tool_name, input.toolName, input.tool?.name),
    tool_input: toolInput,
    transcript_path: firstString(input.transcript_path, input.transcriptPath),
    source: firstString(input.source, input.reason, input.trigger) || 'unknown',
  };
}

function validatePayload(operation, payload) {
  if (!['pre-tool-use', 'scout-block', 'privacy-block', 'post-tool-use'].includes(operation)) return;
  if (typeof payload.tool_name !== 'string' || !payload.tool_name.trim()) {
    throw new Error(`${operation} payload requires a tool name`);
  }
  if (!payload.tool_input || typeof payload.tool_input !== 'object' || Array.isArray(payload.tool_input)) {
    throw new Error(`${operation} payload requires an object tool input`);
  }
}

function childOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!/^[{\[]/.test(text)) return text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`child emitted malformed JSON: ${error.message}`);
  }
  const candidate = parsed?.hookSpecificOutput?.additionalContext ?? parsed?.additionalContext;
  if (typeof candidate === 'string') return candidate.trim();
  if (Array.isArray(candidate) && candidate.every(item => typeof item === 'string')) {
    return candidate.join('\n').trim();
  }
  throw new Error('child JSON omitted additionalContext');
}

function safeCwd(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return process.cwd();
  try { return fs.statSync(value).isDirectory() ? value : process.cwd(); }
  catch { return process.cwd(); }
}

function runOperation(operation, input) {
  const scripts = OPERATIONS[operation];
  if (!scripts) return fail(`unsupported operation: ${operation}`);
  let payload;
  try {
    payload = input === undefined ? readPayload() : canonicalPayload(input);
    validatePayload(operation, payload);
  }
  catch (error) { return fail(error.message); }
  const home = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
  const hookRoot = path.resolve(__dirname);
  const cwd = safeCwd(payload.cwd);
  const env = { ...process.env,
    COPILOT_HOME: home,
    EVCRATE_CONFIG_DIR: '.copilot',
    EVCRATE_GLOBAL_CONFIG_ROOT: home,
    CLAUDE_PROJECT_DIR: cwd,
    COPILOT_PROJECT_DIR: cwd,
  };
  delete env.CLAUDE_ENV_FILE;
  if (payload.session_id) env.EVCRATE_SESSION_ID = payload.session_id;
  const contexts = [];
  for (const script of scripts) {
    const child = path.join(hookRoot, script);
    try {
      if (!fs.statSync(child).isFile()) return fail(`missing hook script: ${script}`, 127);
    } catch { return fail(`missing hook script: ${script}`, 127); }
    const result = spawnSync(process.execPath, [child], {
      cwd, env, input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true,
    });
    if (result.error) return fail(result.error.message, 127);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) return result.status || 1;
    try {
      const context = childOutput(result.stdout);
      if (context) contexts.push(context);
    } catch (error) {
      return fail(error.message);
    }
  }
  const context = bounded(contexts.join('\n\n'));
  if (context) process.stdout.write(`${JSON.stringify({ additionalContext: context })}\n`);
  return 0;
}

function main() {
  try {
    const payload = readPayload();
    const code = runOperation(process.argv[2], payload);
    process.exitCode = code;
  } catch (error) {
    process.exitCode = fail(error.message);
  }
}

module.exports = runOperation;
module.exports.OPERATIONS = OPERATIONS;
module.exports.canonicalPayload = canonicalPayload;
module.exports.childOutput = childOutput;

if (require.main === module) main();
