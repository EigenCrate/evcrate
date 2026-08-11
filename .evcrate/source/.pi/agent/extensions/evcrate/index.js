import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { registerCommandTool } from "./command-tool.js";
import { registerManagedCommands } from "./commands.js";
import { registerDelegationTool } from "./delegation-tool.js";
import { registerOperationPolicyGate } from "./operation-policy.js";
import { registerHooks } from "./hooks.js";
import { getAgentRoot, getEvcrateRoot, normalizeAgentRootEnvironment } from "./paths.js";

function readObject(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** Native Pi entrypoint. The policy gate is registered before every EVCrate tool. */
export default async function evcrateExtension(pi) {
  const agentRoot = getAgentRoot();
  // pi-subagents resolves user skills from PI_CODING_AGENT_DIR during its own
  // startup, so correct an exact EVCrate resource-root override up front.
  normalizeAgentRootEnvironment();
  const resourceRoot = getEvcrateRoot(agentRoot);
  const agentRoles = readObject(join(resourceRoot, "model-roles.json")).agents ?? {};
  const settings = readObject(join(agentRoot, "settings.json"));
  const operationPolicy = registerOperationPolicyGate(pi);
  const hookAdapter = registerHooks(pi, { agentRoot, resourceRoot });
  const childStartRunner = hookAdapter.childStartRunner;
  const runtimeRoots = {
    workflowRoot: join(resourceRoot, "workflows"),
    configRoot: dirname(agentRoot),
    resourceRoot,
  };

  const commands = registerManagedCommands(pi, {
    agentRoot, operationPolicy, sessionEnv: () => hookAdapter.environment(),
  });
  await registerCommandTool(pi, { agentRoot, operationPolicy, find: commands.find });
  const delegate = registerDelegationTool(pi, {
    agentRoles,
    childStartRunner,
    runtimeRoots,
    settings,
  });

  return { agentRoot, resourceRoot, operationPolicy, hookAdapter, childStartRunner, commands, delegate };
}
