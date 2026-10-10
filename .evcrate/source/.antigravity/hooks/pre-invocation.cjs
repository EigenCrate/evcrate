#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const maxBytes = 256 * 1024;
const contextHookTimeoutMs = 25_000;
const decoder = new TextDecoder('utf-8', { fatal: true });
const fail = (reason) => {
  process.stderr.write('EVCREATE_CONTEXT_REJECTED: ' + reason + '\n');
  process.exit(2);
};
const assertSafePath = (candidate) => {
  let current = path.resolve(candidate);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Unsafe installed context path');
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
};
const readBounded = (fd) => {
  const bytes = Buffer.alloc(maxBytes + 1);
  let size = 0;
  while (size < bytes.length) {
    const count = fs.readSync(fd, bytes, size, bytes.length - size, null);
    if (count === 0) break;
    size += count;
  }
  if (size > maxBytes) throw new Error('Context exceeds byte limit');
  return decoder.decode(bytes.subarray(0, size));
};
const installedInstructions = () => {
  const filename = path.join(__dirname, '..', 'AGENTS.md');
  assertSafePath(filename);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) throw new Error('Invalid installed instructions');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error('Installed instructions changed');
    const text = readBounded(fd);
    assertSafePath(filename);
    if (!text.trim() || text.includes('\0')) throw new Error('Empty or invalid installed instructions');
    return text;
  } finally {
    fs.closeSync(fd);
  }
};
const isDirectory = (candidate) => {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
};
const canonicalContext = (hookFile, event, payload, projectRoot) => {
  const sourceHook = path.join(__dirname, hookFile + '.original.cjs');
  assertSafePath(sourceHook);
  if (!fs.lstatSync(sourceHook).isFile()) throw new Error('Context hook unavailable');
  const result = spawnSync(process.execPath, [sourceHook], {
    cwd: projectRoot,
    input: JSON.stringify({ ...payload, hook_event_name: event }),
    maxBuffer: maxBytes,
    timeout: contextHookTimeoutMs,
    // A synchronous deadline cannot escalate after SIGTERM; SIGKILL guarantees completion.
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectRoot,
      GEMINI_PROJECT_DIR: projectRoot,
      AGY_PROJECT_DIR: projectRoot,
      EVCRATE_SESSION_ID: payload.session_id,
    },
  });
  if (result.error || result.status !== 0) throw new Error('Context hook failed');
  const stderr = decoder.decode(result.stderr || Buffer.alloc(0)).trim();
  // Canonical hooks report caught failures on stderr even when they exit zero.
  if (stderr) throw new Error('Context hook reported an error: ' + stderr.slice(0, 2048));
  const stdout = decoder.decode(result.stdout || Buffer.alloc(0)).trim();
  let context = stdout;
  // Canonical hooks emit text today; accept only their additionalContext envelope if structured.
  if (/^[{\[]/u.test(stdout)) {
    const output = JSON.parse(stdout);
    const specific = output && output.hookSpecificOutput;
    if (!output || typeof output !== 'object' || Array.isArray(output)
        || (output.decision !== undefined && output.decision !== 'allow')
        || (output.continue !== undefined && output.continue !== true)
        || !specific || typeof specific !== 'object' || Array.isArray(specific)
        || specific.hookEventName !== event || typeof specific.additionalContext !== 'string') {
      throw new Error('Invalid context hook output');
    }
    context = specific.additionalContext;
  }
  if (context.includes('\0')) throw new Error('Invalid context hook text');
  return context;
};
try {
  // Node resolves symlinked entrypoints before setting __dirname; inspect the invoked path too.
  assertSafePath(process.argv[1]);
  const data = JSON.parse(readBounded(0));
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Number.isSafeInteger(data.invocationNum) || data.invocationNum < 0
      || typeof data.conversationId !== 'string' || !data.conversationId
      || !Array.isArray(data.workspacePaths)) {
    throw new Error('Invalid native invocation');
  }
  // Native rules own instruction injection. This gate verifies this installation only.
  installedInstructions();
  const projectRoot = data.workspacePaths.find(isDirectory);
  if (!projectRoot) throw new Error('Context workspace unavailable');
  const payload = {
    cwd: projectRoot,
    session_id: data.conversationId,
    transcript_path: data.transcriptPath,
  };
  const contexts = [];
  // Official invocationNum is zero-indexed. No native field proves resume/clear/compact.
  if (data.invocationNum === 0) {
    contexts.push(canonicalContext('session-init.cjs', 'SessionStart', { ...payload, source: 'startup' }, projectRoot));
  }
  contexts.push(canonicalContext('dev-rules-reminder.cjs', 'UserPromptSubmit', payload, projectRoot));
  if (contexts.reduce((size, text) => size + Buffer.byteLength(text, 'utf8'), 0) > maxBytes) {
    throw new Error('Combined context exceeds byte limit');
  }
  process.stdout.write(JSON.stringify({
    injectSteps: contexts.filter(Boolean).map((ephemeralMessage) => ({ ephemeralMessage })),
  }) + '\n');
} catch (error) {
  fail(error instanceof Error ? error.message : 'Context unavailable');
}
