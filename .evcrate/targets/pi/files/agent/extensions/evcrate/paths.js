import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { fileURLToPath } from "node:url";
/** Accept the exact resource-root value sometimes passed by child launchers. */
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
