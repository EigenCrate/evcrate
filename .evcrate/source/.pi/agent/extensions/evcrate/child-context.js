import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

import { getAgentRoot, getEvcrateRoot, resolveContainedExistingPath } from "./paths.js";

const CHILD_START_EVENT = "SubagentStart";
const HOOK_TIMEOUT_MS = 30_000;
const MAX_HOOK_OUTPUT_BYTES = 64 * 1024;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Extract only the documented hook field; raw hook data is never forwarded. */
export function parseAdditionalContext(output) {
  const parsed = parseJson(output);
  const value = isObject(parsed) ? parsed : undefined;
  const additionalContext = value?.hookSpecificOutput?.additionalContext;
  return typeof additionalContext === "string" && additionalContext.trim()
    ? additionalContext.trim()
    : undefined;
}

/** Render active roots only; settings and arbitrary hook output stay private. */
export function formatRuntimeRoots(roots = {}) {
  const labels = {
    workflowRoot: "workflow root",
    configRoot: "config root",
    resourceRoot: "resource root",
  };
  return Object.entries(labels).flatMap(([key, label]) => {
    const value = roots[key];
    return typeof value === "string" && value.trim() ? [`Active ${label}: ${value.trim()}`] : [];
  });
}

export function appendChildContext(task, additionalContext, roots) {
  const parts = [task, additionalContext, ...formatRuntimeRoots(roots)].filter(Boolean);
  return parts.join("\n\n");
}

function childStartScripts(resourceRoot) {
  try {
    const map = JSON.parse(readFileSync(join(resourceRoot, "hook-map.json"), "utf8"));
    if (map?.schema !== "evcrate-pi-hook-map-v1") return [];
    const entries = map?.events?.[CHILD_START_EVENT];
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => Array.isArray(entry?.scripts) ? entry.scripts : [])
      .filter((script) => typeof script === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*\.c?js$/.test(script))
      .map((script) => resolveContainedExistingPath(join(resourceRoot, "hooks"), script))
      .filter((script) => script && existsSync(script));
  } catch {
    return [];
  }
}

function hookPayload(canonicalEvent) {
  const request = canonicalEvent?.request ?? {};
  return {
    hook_event_name: CHILD_START_EVENT,
    agent_type: request.agent ?? "unknown",
    agent_id: request.nodeId ?? "unknown",
    cwd: request.cwd,
  };
}

function runNodeScript(script, payload, { cwd, env, signal, timeoutMs = HOOK_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let outputBytes = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
      resolve(stdout);
    };
    const receive = (chunk, isStdout) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (isStdout) stdout += chunk.toString();
      if (outputBytes > MAX_HOOK_OUTPUT_BYTES) child.kill();
    };
    const abort = () => child.kill();
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => receive(chunk, true));
    child.stderr.on("data", (chunk) => receive(chunk, false));
    child.on("error", finish);
    child.on("close", finish);
    if (signal?.aborted) abort();
    else signal?.addEventListener?.("abort", abort, { once: true });
    child.stdin.end(JSON.stringify(payload));
  });
}

/**
 * Build the reusable structured-delegation child-start runner. It has no
 * lifecycle subscription; the delegation owner decides when to invoke it.
 */
export function createChildStartRunner(options = {}) {
  const agentRoot = options.agentRoot ?? getAgentRoot(options.env);
  const resourceRoot = options.resourceRoot ?? getEvcrateRoot(agentRoot);
  const scripts = options.scripts ?? childStartScripts(resourceRoot);
  const execute = options.execute ?? runNodeScript;
  return async (canonicalEvent) => {
    const request = canonicalEvent?.request ?? {};
    const env = {
      ...process.env,
      ...options.env,
      PI_CODING_AGENT_DIR: agentRoot,
      EVCRATE_CONFIG_DIR: ".pi",
      EVCRATE_GLOBAL_CONFIG_ROOT: dirname(agentRoot),
      EVCRATE_RESOURCE_ROOT: resourceRoot,
    };
    const outputs = [];
    for (const script of scripts) {
      const output = await execute(script, hookPayload(canonicalEvent), {
        cwd: request.cwd ?? options.cwd ?? process.cwd(),
        env,
        signal: canonicalEvent?.signal,
        timeoutMs: options.timeoutMs ?? HOOK_TIMEOUT_MS,
      });
      const context = parseAdditionalContext(output);
      if (context) outputs.push(context);
    }
    return outputs.length
      ? { hookSpecificOutput: { additionalContext: outputs.join("\n\n") } }
      : undefined;
  };
}

/** Reusable seam: lifecycle subscribers own invocation timing. */
export async function runChildStart({ runner, canonicalEvent, task, runtimeRoots }) {
  const output = runner ? await runner(canonicalEvent) : undefined;
  const additionalContext = parseAdditionalContext(output);
  return {
    task: appendChildContext(task, additionalContext, runtimeRoots),
    additionalContext,
  };
}
