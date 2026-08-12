"use strict";

/** Bounded adapter between Pi events and generated canonical EVCrate hooks. */
const { spawn } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { basename, dirname, isAbsolute, join, relative, resolve } = require("node:path");
const { homedir, tmpdir } = require("node:os");

const HOOK_TIMEOUT_MS = 30_000;
const MAX_HOOK_OUTPUT_BYTES = 64 * 1024;
const MAX_ENV_FILE_BYTES = 16 * 1024;
const SAFETY_FILENAMES = new Set(["scout-block.cjs", "privacy-block.cjs"]);

function normalizeAgentRoot(value) {
  const configured = resolve(value);
  const parent = dirname(configured);
  return basename(configured) === "evcrate" && basename(parent) === "agent"
    ? parent
    : configured;
}

function resolveAgentRoot(options) {
  const configured = options.agentRoot || process.env.PI_CODING_AGENT_DIR;
  if (configured) return normalizeAgentRoot(configured);
  const home = options.home === undefined ? homedir() : options.home;
  if (!home) {
    throw new Error("PI_CODING_AGENT_DIR or HOME is required to locate the Pi agent root");
  }
  return normalizeAgentRoot(join(home, ".pi", "agent"));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containedPath(root, relativePath) {
  if (typeof relativePath !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]*\.c?js$/.test(relativePath)) return undefined;
  const base = realpathSync(root);
  const candidate = resolve(base, relativePath);
  let resolved;
  try { resolved = realpathSync(candidate); } catch { return undefined; }
  const relation = relative(base, resolved);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation)) ? resolved : undefined;
}

function mapToolName(name) {
  const normalized = String(name ?? "").trim();
  if (normalized === "find" || normalized === "ls") return "Glob";
  return normalized ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}` : "Unknown";
}

function mapReason(reason) {
  if (reason === "manual") return "manual";
  if (reason === "threshold" || reason === "overflow") return "auto";
  if (reason === "resume") return "resume";
  if (reason === "compact") return "compact";
  return "startup";
}

function matches(matcher, value) {
  if (matcher === undefined || matcher === null || matcher === "" || matcher === "*") return true;
  try { return new RegExp(`^(?:${matcher})$`).test(value); } catch { return false; }
}

function boundedCollector() {
  const chunks = [];
  let bytes = 0;
  let exceeded = false;
  return {
    write(chunk) {
      if (exceeded) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = MAX_HOOK_OUTPUT_BYTES - bytes;
      if (remaining <= 0) { exceeded = true; return; }
      const clipped = buffer.subarray(0, remaining);
      chunks.push(clipped);
      bytes += clipped.length;
      if (clipped.length !== buffer.length) exceeded = true;
    },
    get text() { return Buffer.concat(chunks).toString("utf8"); },
    get exceeded() { return exceeded; },
  };
}

function killProcessTree(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try { child.kill(signal); } catch { /* process is already gone */ }
  }
}

function executeScript(script, payload, options = {}) {
  const { cwd, env, signal, timeoutMs = HOOK_TIMEOUT_MS } = options;
  return new Promise((resolveResult) => {
    const stdout = boundedCollector();
    const stderr = boundedCollector();
    let child;
    let done = false;
    let failure;
    let killTimer;
    let timeout;
    const finish = (code = null) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      signal?.removeEventListener?.("abort", abort);
      resolveResult({ code, stdout: stdout.text, stderr: stderr.text, failure, exceeded: stdout.exceeded || stderr.exceeded });
    };
    const stop = (reason) => {
      if (failure) return;
      failure = reason;
      killProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => killProcessTree(child, "SIGKILL"), 1_000);
    };
    const abort = () => stop("hook aborted");
    try {
      child = spawn(process.execPath, [script], {
        cwd,
        env,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      failure = `hook spawn failed: ${error.message}`;
      finish();
      return;
    }
    const receive = (collector) => (chunk) => {
      collector.write(chunk);
      if (collector.exceeded) stop("hook output exceeded limit");
    };
    child.stdout.on("data", receive(stdout));
    child.stderr.on("data", receive(stderr));
    child.once("error", (error) => { failure = `hook spawn failed: ${error.message}`; finish(); });
    child.once("close", finish);
    timeout = setTimeout(() => stop(`hook timed out after ${timeoutMs}ms`), timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener?.("abort", abort, { once: true });
    child.stdin.end(JSON.stringify(payload));
  });
}

function parseEnvFile(path) {
  const bytes = readFileSync(path);
  if (bytes.length > MAX_ENV_FILE_BYTES) throw new Error("Session environment file exceeded limit");
  const values = {};
  for (const line of bytes.toString("utf8").split(/\r?\n/)) {
    if (!line) continue;
    const match = /^(EVCRATE_[A-Z0-9_]+)=([^\r\n]*)$/.exec(line);
    if (!match) throw new Error("Session environment file contains an invalid assignment");
    values[match[1]] = match[2];
  }
  return values;
}

function parseOutput(stdout, eventName) {
  const text = stdout.trim();
  if (!text) return { additionalContext: undefined };
  try {
    const parsed = JSON.parse(text);
    if (!isObject(parsed)) throw new Error("Hook JSON output must be an object");
    const additional = parsed.hookSpecificOutput?.additionalContext;
    return { additionalContext: typeof additional === "string" && additional.trim() ? additional.trim() : undefined };
  } catch (error) {
    if (eventName === "SessionStart" || eventName === "UserPromptSubmit") return { additionalContext: text };
    return { error: `Hook emitted malformed JSON: ${error.message}` };
  }
}

function entrySafety(entry, script) {
  return Array.isArray(entry.safetyScripts) && entry.safetyScripts.includes(script)
    || SAFETY_FILENAMES.has(script.split("/").pop());
}

function readMap(resourceRoot) {
  try {
    const map = JSON.parse(readFileSync(join(resourceRoot, "hook-map.json"), "utf8"));
    if (map?.schema !== "evcrate-pi-hook-map-v1" || !isObject(map.events)) {
      return { events: {}, valid: false, error: "Generated hook map has an invalid schema" };
    }
    return { ...map, valid: true };
  } catch (error) {
    return { events: {}, valid: false, error: `Generated hook map is unavailable: ${error.message}` };
  }
}

function createHookAdapter(options = {}) {
  const agentRoot = resolveAgentRoot(options);
  const resourceRoot = options.resourceRoot ?? join(agentRoot, "evcrate");
  const hooksRoot = join(resourceRoot, "hooks");
  const hookMap = options.hookMap
    ? { ...options.hookMap, valid: options.hookMap.schema === "evcrate-pi-hook-map-v1" && isObject(options.hookMap.events) }
    : readMap(resourceRoot);
  let sessionEnv = {};

  function environment(sessionId, extra = {}) {
    return {
      ...process.env,
      ...sessionEnv,
      ...options.env,
      ...extra,
      PI_CODING_AGENT_DIR: agentRoot,
      EVCRATE_CONFIG_DIR: ".pi",
      EVCRATE_GLOBAL_CONFIG_ROOT: dirname(agentRoot),
      EVCRATE_RESOURCE_ROOT: resourceRoot,
      ...(sessionId ? { EVCRATE_SESSION_ID: sessionId } : {}),
    };
  }

  async function run(eventName, event = {}, context = {}) {
    if (eventName === "PreToolUse" && !hookMap.valid) {
      return { blockReason: hookMap.error ?? "Generated hook map is invalid" };
    }
    const reason = event.reason ?? event.source ?? "startup";
    const matcherValue = event.matcherValue ?? (eventName === "PreToolUse" || eventName === "PostToolUse" ? mapToolName(event.toolName) : mapReason(reason));
    const entries = (hookMap.events?.[eventName] ?? []).filter((entry) => isObject(entry) && matches(entry.matcher, matcherValue));
    const sessionId = event.sessionId ?? context.sessionId;
    const input = isObject(event.input) ? { ...event.input } : {};
    if (typeof input.path === "string" && input.file_path === undefined) input.file_path = input.path;
    const payload = {
      hook_event_name: eventName,
      source: matcherValue,
      reason: matcherValue,
      session_id: sessionId,
      cwd: context.cwd,
      ...(eventName === "SubagentStart" ? { agent_type: event.agent ?? "unknown", agent_id: event.agentId ?? "unknown" } : {}),
      ...(eventName === "PreToolUse" || eventName === "PostToolUse" ? { tool_name: mapToolName(event.toolName), tool_input: input } : {}),
    };
    const contexts = [];
    for (const entry of entries) {
      for (const scriptRef of entry.scripts ?? []) {
        const safety = entrySafety(entry, scriptRef);
        const script = containedPath(hooksRoot, scriptRef);
        if (!script || !existsSync(script)) {
          const message = `Generated hook path is unsafe or missing: ${scriptRef}`;
          if (safety) return { blockReason: message, additionalContext: contexts.join("\n\n") || undefined };
          continue;
        }
        let envFile;
        let tempDir;
        try {
          const extraEnv = {};
          if (eventName === "SessionStart") {
            tempDir = mkdtempSync(join(tmpdir(), "evcrate-pi-hook-"));
            envFile = join(tempDir, "session.env");
            writeFileSync(envFile, "", { mode: 0o600 });
            extraEnv.CLAUDE_ENV_FILE = envFile;
          }
          const result = await (options.execute ?? executeScript)(script, payload, {
            cwd: context.cwd ?? process.cwd(), env: environment(sessionId, extraEnv), signal: context.signal, timeoutMs: options.timeoutMs,
          });
          if (result.failure || result.exceeded || result.code !== 0) {
            const message = result.failure || `Hook exited with code ${result.code}${result.stderr ? `: ${result.stderr.trim()}` : ""}`;
            if (safety) return { blockReason: message, additionalContext: contexts.join("\n\n") || undefined };
            continue;
          }
          const output = parseOutput(result.stdout, eventName);
          if (output.error) {
            if (safety) return { blockReason: output.error, additionalContext: contexts.join("\n\n") || undefined };
            continue;
          }
          if (output.additionalContext) contexts.push(output.additionalContext);
          if (envFile) sessionEnv = { ...sessionEnv, ...parseEnvFile(envFile) };
        } catch (error) {
          if (safety) return { blockReason: `Hook adapter failed: ${error.message}`, additionalContext: contexts.join("\n\n") || undefined };
        } finally {
          if (tempDir) rmSync(tempDir, { recursive: true, force: true });
        }
      }
    }
    return { additionalContext: contexts.length ? contexts.join("\n\n") : undefined };
  }

  return {
    agentRoot, resourceRoot,
    get sessionEnv() { return { ...sessionEnv }; },
    clearSessionEnv() { sessionEnv = {}; },
    environment,
    run,
    childStartRunner: async (canonicalEvent) => {
      const request = canonicalEvent?.request ?? {};
      const output = await run("SubagentStart", {
        agent: request.agent, agentId: request.nodeId, sessionId: canonicalEvent?.sessionId,
      }, { cwd: request.cwd, signal: canonicalEvent?.signal, sessionId: canonicalEvent?.sessionId });
      return output.additionalContext ? { hookSpecificOutput: { additionalContext: output.additionalContext } } : undefined;
    },
  };
}

function createChildStartRunner(options = {}) {
  return createHookAdapter(options).childStartRunner;
}

module.exports = { HOOK_TIMEOUT_MS, MAX_HOOK_OUTPUT_BYTES, createChildStartRunner, createHookAdapter, executeScript, mapReason, mapToolName, parseEnvFile, parseOutput };
