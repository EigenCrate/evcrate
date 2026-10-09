import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { fileURLToPath } from "node:url";
/** Accept the exact resource-root value sometimes passed by child launchers. */
export const MAX_AGENTS_BYTES = 256 * 1024;

export function normalizeAgentRoot(value) {
  const configured = resolve(value);
  const parent = dirname(configured);
  return basename(configured) === "evcrate" && basename(parent) === "agent"
    ? parent
    : configured;
}

/** Resolve the EVCrate-owned agent root from the loaded extension location. */
export function getInstalledAgentRoot(extensionUrl) {
  const extensionRoot = dirname(fileURLToPath(extensionUrl));
  return normalizeAgentRoot(dirname(dirname(extensionRoot)));
}

/** Correct the environment before third-party Pi extensions resolve skills. */
export function normalizeAgentRootEnvironment(env = process.env) {
  const configured = env.PI_CODING_AGENT_DIR;
  if (!configured) return undefined;
  const normalized = normalizeAgentRoot(configured);
  if (normalized !== resolve(configured)) env.PI_CODING_AGENT_DIR = normalized;
  return normalized;
}

export function getAgentRoot(env = process.env, home) {
  const configured = env.PI_CODING_AGENT_DIR;
  if (configured) return normalizeAgentRoot(configured);
  const fallback = home === undefined
    ? (env === process.env ? homedir() : env.HOME)
    : home;
  if (!fallback) {
    throw new Error("PI_CODING_AGENT_DIR or HOME is required to locate the Pi agent root");
  }
  return normalizeAgentRoot(`${fallback}/.pi/agent`);
}

export function isContained(root, candidate) {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

export function resolveContainedPath(root, reference) {
  if (typeof reference !== "string" || !reference || isAbsolute(reference)) return undefined;
  const candidate = resolve(root, reference);
  return isContained(root, candidate) ? candidate : undefined;
}

export function resolveContainedExistingPath(root, reference) {
  const candidate = resolveContainedPath(root, reference);
  if (!candidate) return undefined;
  try {
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    return isContained(realRoot, realCandidate) ? realCandidate : undefined;
  } catch {
    return undefined;
  }
}

export function getEvcrateRoot(agentRoot = getAgentRoot()) {
  return resolve(normalizeAgentRoot(agentRoot), "evcrate");
}

export function readInstalledAgentsDocument(agentRoot = getAgentRoot()) {
  const root = getEvcrateRoot(agentRoot);
  const candidate = resolve(root, "AGENTS.md");
  if (!isContained(root, candidate)) throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable");
  for (let current = root;; current = dirname(current)) {
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable");
    }
    if (stat.isSymbolicLink()) throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable");
    if (dirname(current) === current) break;
  }
  let initial;
  let descriptor;
  try {
    initial = lstatSync(candidate);
    if (!initial.isFile() || initial.isSymbolicLink() || initial.size <= 0 || initial.size > MAX_AGENTS_BYTES) throw new Error("invalid payload");
    descriptor = openSync(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable");
  }
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== initial.dev || opened.ino !== initial.ino || opened.size !== initial.size) throw new Error("payload changed");
    const bytes = Buffer.alloc(opened.size);
    for (let offset = 0; offset < bytes.length;) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error("payload truncated");
      offset += count;
    }
    const final = lstatSync(candidate);
    if (!final.isFile() || final.isSymbolicLink() || final.dev !== initial.dev || final.ino !== initial.ino || final.size !== initial.size) throw new Error("payload changed");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (!content || content.includes("\0")) throw new Error("invalid payload");
    return resolveEvcrateMarkers(content, agentRoot);
  } catch {
    throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable");
  } finally {
    closeSync(descriptor);
  }
}

function commandInstruction(root, reference) {
  if (!reference.startsWith("commands/")) return undefined;
  const commandsRoot = resolve(root, "commands");
  const commandReference = reference.slice("commands/".length);
  if (!commandReference) return undefined;
  const resolved = resolveContainedExistingPath(commandsRoot, `${commandReference.replace(/\.md$/, "")}.md`);
  if (!resolved) return undefined;
  const name = relative(commandsRoot, resolved).replace(/\.md$/, "");
  if (name.includes(sep)) return undefined;
  return `Invoke \`evcrate_command\` with name \`${name}\`, the intended command text unchanged in \`args\` (empty only when there is none), and the current direct \`handoff\` object when one exists.`;
}

export function resolveEvcrateMarkers(text, agentRoot = getAgentRoot()) {
  const root = getEvcrateRoot(agentRoot);
  return text.replace(/{{evcrate:([^}\r\n]+)}}/g, (_marker, rawReference) => {
    const reference = rawReference.trim();
    const command = commandInstruction(root, reference);
    if (command) return command;
    const resolved = resolveContainedExistingPath(root, reference);
    if (!resolved) throw new Error(`Required EVCrate resource is unavailable: ${reference}`);
    return resolved;
  });
}
