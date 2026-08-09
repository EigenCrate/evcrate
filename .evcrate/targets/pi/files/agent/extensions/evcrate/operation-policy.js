const TOOL_ALIASES = new Map([
  ["askuserquestion", "ask_user_question"],
  ["ask_user_question", "ask_user_question"],
  ["bash", "bash"],
  ["edit", "edit"],
  ["glob", "find"],
  ["grep", "grep"],
  ["read", "read"],
  ["task", "evcrate_subagent"],
  ["write", "write"],
  ["evcratecommand", "evcrate_command"],
  ["evcrate_command", "evcrate_command"],
  ["evcratesubagent", "evcrate_subagent"],
  ["evcrate_subagent", "evcrate_subagent"],
]);

function toolKey(name) {
  return String(name).trim().replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
}

function values(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",");
  return [];
}

function assistantToolCalls(ctx) {
  const entries = ctx?.sessionManager?.buildContextEntries?.()
    ?? ctx?.sessionManager?.getEntries?.()
    ?? [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const message = entries[index]?.message;
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    const calls = message.content.filter((part) => part?.type === "toolCall");
    if (calls.length) return calls;
  }
  return [];
}

export function normalizeAllowedTools(value, availableTools) {
  const available = new Set(availableTools);
  const normalized = [];
  for (const item of values(value)) {
    if (typeof item !== "string" || !item.trim()) continue;
    const name = TOOL_ALIASES.get(toolKey(item)) ?? toolKey(item);
    if (!available.has(name)) throw new Error(`Unsupported EVCrate allowed tool: ${item}`);
    if (!normalized.includes(name)) normalized.push(name);
  }
  return normalized;
}

export function createOperationPolicy(pi) {
  const stack = [];
  const blockedBatchIds = new Set();
  let baseTools;

  function availableTools() {
    const all = pi.getAllTools?.().map((tool) => tool.name) ?? [];
    return all.length ? all : (pi.getActiveTools?.() ?? []);
  }

  function begin({ allowedTools, parentToken } = {}) {
    if (allowedTools === undefined) return parentToken ?? stack.at(-1)?.token;
    const parent = parentToken === undefined ? undefined : stack.find((entry) => entry.token === parentToken);
    if (parentToken !== undefined && !parent) throw new Error("EVCrate operation parent is no longer active");
    if (!parent && stack.length) throw new Error("Concurrent restricted EVCrate operations are not supported");

    const allowed = new Set(normalizeAllowedTools(allowedTools, availableTools()));
    const effective = parent
      ? new Set([...parent.allowed].filter((name) => allowed.has(name)))
      : allowed;
    if (!baseTools) baseTools = [...(pi.getActiveTools?.() ?? [])];
    const token = Symbol("evcrate-operation");
    stack.push({ token, allowed: effective });
    pi.setActiveTools?.([...effective]);
    return token;
  }

  function release(token) {
    const index = stack.findIndex((entry) => entry.token === token);
    if (index < 0) return;
    stack.splice(index, 1);
    const current = stack.at(-1);
    if (current) pi.setActiveTools?.([...current.allowed]);
    else {
      pi.setActiveTools?.(baseTools ?? []);
      baseTools = undefined;
    }
  }

  function cleanup() {
    stack.length = 0;
    blockedBatchIds.clear();
    if (baseTools) pi.setActiveTools?.(baseTools);
    baseTools = undefined;
  }

  function gate(event, ctx) {
    const calls = assistantToolCalls(ctx);
    const ids = calls.map((call) => call.id ?? call.toolCallId).filter((id) => typeof id === "string");
    const mixedDispatcherBatch = calls.length > 1
      && calls.some((call) => (call.name ?? call.toolName) === "evcrate_command");
    if (mixedDispatcherBatch) {
      ids.forEach((id) => blockedBatchIds.add(id));
      return {
        block: true,
        reason: "evcrate_command must be the only tool call in its assistant batch; retry it alone.",
      };
    }
    if (blockedBatchIds.has(event?.toolCallId)) {
      return { block: true, reason: "Rejected sibling of an evcrate_command tool batch." };
    }
    const current = stack.at(-1);
    if (current && !current.allowed.has(event?.toolName)) {
      return { block: true, reason: `Tool '${event?.toolName}' is not allowed by the active EVCrate command.` };
    }
    return undefined;
  }

  return {
    begin,
    release,
    cleanup,
    gate,
    currentToken: () => stack.at(-1)?.token,
    active: () => stack.length > 0,
  };
}

export function registerOperationPolicyGate(pi, policy = createOperationPolicy(pi)) {
  pi.on("tool_call", (event, ctx) => policy.gate(event, ctx));
  pi.on("agent_settled", () => policy.cleanup());
  pi.on("session_shutdown", () => policy.cleanup());
  return policy;
}
