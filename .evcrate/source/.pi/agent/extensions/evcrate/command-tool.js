import { expandManagedCommand, findManagedCommand, readManagedCommand } from "./commands.js";
import { getAgentRoot } from "./paths.js";

export const MAX_COMMAND_DEPTH = 8;
export const MAX_COMMAND_INVOCATIONS = 12;

export function createCommandDispatchState() {
  return { count: 0, names: new Set() };
}

export async function dispatchManagedCommand({ name, args = "" }, context, options = {}) {
  const state = options.state || createCommandDispatchState();
  const agentRoot = options.agentRoot || getAgentRoot();
  const find = options.find || ((commandName) => findManagedCommand(commandName, agentRoot));
  if (typeof name !== "string" || !name) throw new Error("evcrate_command requires a discovered command name");
  if (state.count >= (options.maxDepth || MAX_COMMAND_DEPTH)) throw new Error("evcrate_command maximum nesting depth reached");
  if (state.count >= (options.maxInvocations || MAX_COMMAND_INVOCATIONS)) throw new Error("evcrate_command invocation limit reached");
  if (state.names.has(name)) throw new Error(`evcrate_command cycle detected at ${name}`);
  const command = find(name);
  if (!command) throw new Error(`Unknown EVCrate command: ${name}`);
  const parsed = options.read ? options.read(command) : readManagedCommand(command);
  if (parsed.disableModelInvocation) throw new Error(`EVCrate command disables model invocation: ${name}`);
  state.count += 1;
  state.names.add(name);
  try {
    const expanded = await (options.expand || expandManagedCommand)(command, args, context, { ...options, agentRoot });
    return { command: name, body: expanded.body, state };
  } catch (error) {
    state.count -= 1;
    state.names.delete(name);
    throw error;
  }
}

export async function registerCommandTool(pi, options = {}) {
  const { Type } = await import("typebox");
  const state = createCommandDispatchState();
  const agentRoot = options.agentRoot || getAgentRoot(options.env);
  pi.on("agent_start", () => {
    state.count = 0;
    state.names.clear();
  });
  pi.on("agent_settled", () => {
    state.count = 0;
    state.names.clear();
  });
  pi.registerTool({
    name: "evcrate_command",
    label: "EVCrate Command",
    description: "Expand one discovered EVCrate command for this agent run.",
    parameters: Type.Object({
      name: Type.String({ description: "Discovered EVCrate command name, without a slash" }),
      args: Type.Optional(Type.String({ description: "Raw command arguments" })),
    }),
    async execute(_id, params, _signal, _update, context) {
      const command = findManagedCommand(params.name, agentRoot);
      if (!command) throw new Error(`Unknown EVCrate command: ${params.name}`);
      const parsed = options.read ? options.read(command) : readManagedCommand(command);
      const policy = options.operationPolicy;
      const token = policy?.begin({
        allowedTools: parsed.allowedTools,
        parentToken: policy?.currentToken(),
      });
      try {
        const result = await dispatchManagedCommand({ name: params.name, args: params.args || "" }, context, {
          ...options,
          pi,
          agentRoot,
          state,
          find: () => command,
          read: () => parsed,
          expand: async (found, args, ctx, expandOptions) => {
            const current = options.expand
              ? await options.expand(found, args, ctx, { ...expandOptions, parsed })
              : await expandManagedCommand(found, args, ctx, { ...expandOptions, parsed });
            if (current.disableModelInvocation) throw new Error(`EVCrate command disables model invocation: ${params.name}`);
            return current;
          },
        });
        return { content: [{ type: "text", text: result.body }], details: { command: result.command } };
      } catch (error) {
        policy?.release(token);
        throw error;
      }
    },
  });
  return state;
}
