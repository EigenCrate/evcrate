import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function getAgentRoot(env = process.env) {
  const home = env.HOME;
  if (!env.PI_CODING_AGENT_DIR && !home) {
    throw new Error("PI_CODING_AGENT_DIR or HOME is required to locate the Pi agent root");
  }
  return resolve(env.PI_CODING_AGENT_DIR || `${home}/.pi/agent`);
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
  return resolve(agentRoot, "evcrate");
}

function commandInstruction(root, reference) {
  if (!reference.startsWith("commands/")) return undefined;
  const commandsRoot = resolve(root, "commands");
  const commandReference = reference.slice("commands/".length);
  if (!commandReference) return undefined;
  const literalReference = commandReference.endsWith(".md")
    ? commandReference
    : `${commandReference}.md`;
  const nestedReference = `${commandReference.replace(/\.md$/, "").split(":").join(sep)}.md`;
  const resolved = [literalReference, nestedReference]
    .map((candidate) => resolveContainedExistingPath(commandsRoot, candidate))
    .find(Boolean);
  if (!resolved) return undefined;
  const name = relative(commandsRoot, resolved)
    .replace(/\.md$/, "")
    .split(sep)
    .join(":");
  return `Invoke \`evcrate_command\` with \`{"name":"${name}","args":""}\`.`;
}

export function resolveEvcrateMarkers(text, agentRoot = getAgentRoot()) {
  const root = getEvcrateRoot(agentRoot);
  return text.replace(/{{evcrate:([^}\r\n]+)}}/g, (marker, rawReference) => {
    const reference = rawReference.trim();
    const command = commandInstruction(root, reference);
    if (command) return command;
    return resolveContainedExistingPath(root, reference) || marker;
  });
}
