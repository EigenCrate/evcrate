import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMMAND_TIMEOUT_MS,
  discoverCommandFiles,
  expandCommandBody,
  MAX_COMMAND_OUTPUT_BYTES,
  MAX_COMMAND_OUTPUT_LINES,
  parseCommandFile,
} from "./command-files.js";
import { prependCommandContext } from "./child-context.js";
import { getAgentRoot, getEvcrateRoot, resolveEvcrateMarkers } from "./paths.js";

function boundedCollector() {
  const chunks = [];
  let bytes = 0;
  let lines = 1;
  let truncated = false;
  return {
    write(chunk) {
      if (truncated) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let length = Math.min(buffer.length, MAX_COMMAND_OUTPUT_BYTES - bytes);
      for (let index = 0; index < length; index += 1) {
        if (buffer[index] === 0x0a && lines >= MAX_COMMAND_OUTPUT_LINES) {
          length = index;
          truncated = true;
          break;
        }
        if (buffer[index] === 0x0a) lines += 1;
      }
      if (length) {
        chunks.push(buffer.subarray(0, length));
        bytes += length;
      }
      if (length < buffer.length) truncated = true;
    },
    text: () => Buffer.concat(chunks).toString("utf8"),
  };
}

export function executeBoundedShell(shell, { cwd, env, signal, timeout = COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error("Command execution aborted"));
    const stdout = boundedCollector();
    const stderr = boundedCollector();
    let child;
    let settled = false;
    let timeoutId;
    let killId;
    let termination;
    const killTree = (signalName) => {
      if (!child?.pid) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, signalName);
        else child.kill(signalName);
      } catch {
        try { child.kill(signalName); } catch { /* process has already exited */ }
      }
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      clearTimeout(killId);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const stop = (error) => {
      if (termination) return;
      termination = error;
      killTree("SIGTERM");
      killId = setTimeout(() => killTree("SIGKILL"), 1_000);
    };
    const abort = () => stop(signal.reason || new Error("Command execution aborted"));
    try {
      child = spawn("/bin/sh", ["-c", shell], {
        cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      finish(reject, error);
      return;
    }
    child.stdout.on("data", (chunk) => stdout.write(chunk));
    child.stderr.on("data", (chunk) => stderr.write(chunk));
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code) => {
      if (termination) finish(reject, termination);
      else finish(resolvePromise, { stdout: stdout.text(), stderr: stderr.text(), code });
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (Number.isFinite(timeout) && timeout > 0) {
      timeoutId = setTimeout(() => stop(new Error(`Command timed out after ${timeout}ms`)), timeout);
    }
  });
}

export function commandRoot(agentRoot = getAgentRoot()) {
  return join(getEvcrateRoot(agentRoot), "commands");
}

export function discoverManagedCommands(agentRoot = getAgentRoot()) {
  return discoverCommandFiles(commandRoot(agentRoot));
}

export function findManagedCommand(name, agentRoot = getAgentRoot()) {
  return discoverManagedCommands(agentRoot).find((command) => command.name === name);
}

function parseAllowedTools(source) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return undefined;
  const match = frontmatter.match(/^allowed-tools:\s*(.*)$/m);
  if (!match) return undefined;
  const inline = match[1].trim();
  if (inline) return inline.replace(/^\[|\]$/g, "").split(",").map((name) => name.trim()).filter(Boolean);
  const block = frontmatter.slice(match.index + match[0].length).match(/^(?:\r?\n\s*-\s*[^\r\n]+)+/);
  return block?.[0].split(/\r?\n/).map((line) => line.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
}

export function readManagedCommand(command) {
  const source = readFileSync(command.filePath, "utf8");
  return { ...parseCommandFile(source), allowedTools: parseAllowedTools(source) };
}

export async function expandManagedCommand(command, args, context, options = {}) {
  if (typeof args !== "string") throw new Error("EVCrate commands require raw string arguments");
  const parsed = options.parsed || readManagedCommand(command);
  const agentRoot = options.agentRoot || getAgentRoot();
  const execute = options.execute || ((shell) => executeBoundedShell(shell, {
    cwd: context.cwd,
    env: typeof options.sessionEnv === "function" ? options.sessionEnv() : undefined,
    signal: context.signal,
  }));
  const expandedBody = await expandCommandBody(parsed.body, args, {
    cwd: context.cwd,
    execute,
    resolveMarkers: (text) => resolveEvcrateMarkers(text, agentRoot),
  });
  const body = options.invocation
    ? prependCommandContext(expandedBody, options.invocation)
    : expandedBody;
  return { ...parsed, body };
}

export function registerManagedCommands(pi, options = {}) {
  const registered = new Set();
  const agentRoot = options.agentRoot || getAgentRoot(options.env);
  pi.on("session_start", () => {
    for (const command of discoverManagedCommands(agentRoot)) {
      if (registered.has(command.name)) continue;
      let parsed;
      try { parsed = readManagedCommand(command); } catch { continue; }
      registered.add(command.name);
      pi.registerCommand(command.name, {
        description: parsed.argumentHint ? `${parsed.description} ${parsed.argumentHint}` : parsed.description,
        handler: async (args, context) => {
          const policy = options.operationPolicy;
          const currentDefinition = readManagedCommand(command);
          const token = policy?.begin({ allowedTools: currentDefinition.allowedTools });
          try {
            const current = await expandManagedCommand(command, args, context, {
              ...options,
              pi,
              agentRoot,
              invocation: {
                source: "native-user",
                command: command.canonicalName,
                rawArguments: args,
                handoff: null,
              },
            });
            pi.sendUserMessage(current.body);
          } catch (error) {
            policy?.release(token);
            throw error;
          }
        },
      });
    }
  });
  return { agentRoot, find: (name) => findManagedCommand(name, agentRoot) };
}
