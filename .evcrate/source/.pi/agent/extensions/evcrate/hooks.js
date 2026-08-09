import hookAdapter from "./hook-adapter.cjs";

const { createHookAdapter } = hookAdapter;

function sessionId(context) {
  return context?.sessionManager?.getSessionId?.() ?? context?.sessionId;
}

function appendContext(content, additionalContext) {
  if (!additionalContext) return content;
  return [...(Array.isArray(content) ? content : []), { type: "text", text: additionalContext }];
}

function notify(context, message) {
  context?.ui?.notify?.(`EVCrate hook: ${message}`, "warning");
}

/** Register the sole Pi lifecycle/tool owner for generated canonical hook entries. */
export function registerHooks(pi, options = {}) {
  const adapter = options.adapter ?? createHookAdapter(options);
  const run = (eventName, event, context) => adapter.run(eventName, {
    ...event,
    sessionId: sessionId(context),
  }, {
    cwd: context?.cwd,
    signal: context?.signal,
    sessionId: sessionId(context),
  });

  pi.on("session_start", async (event, context) => {
    const output = await run("SessionStart", { reason: event?.reason }, context);
    if (output.additionalContext) {
      pi.sendMessage({
        customType: "evcrate-hook-context",
        content: output.additionalContext,
        display: false,
      }, { deliverAs: "nextTurn" });
    }
  });

  pi.on("session_before_compact", async (event, context) => {
    await run("PreCompact", { reason: event?.reason }, context);
  });

  pi.on("session_compact", async (event, context) => {
    await run("PostCompact", { reason: event?.reason }, context);
    await run("SessionStart", { reason: "compact" }, context);
  });

  pi.on("before_agent_start", async (_event, context) => {
    const output = await run("UserPromptSubmit", {}, context);
    if (!output.additionalContext) return undefined;
    return {
      message: {
        customType: "evcrate-hook-context",
        content: output.additionalContext,
        display: false,
      },
    };
  });

  pi.on("tool_call", async (event, context) => {
    const output = await run("PreToolUse", { toolName: event?.toolName, input: event?.input }, context);
    if (output.blockReason) return { block: true, reason: output.blockReason };
    if (output.additionalContext) notify(context, output.additionalContext);
    return undefined;
  });

  pi.on("tool_result", async (event, context) => {
    const output = await run("PostToolUse", { toolName: event?.toolName, input: event?.input }, context);
    if (output.additionalContext) return { content: appendContext(event?.content, output.additionalContext) };
    return undefined;
  });

  pi.on("session_shutdown", async (event, context) => {
    // Pi does not expose Claude's `clear` reason; pass its real shutdown reason.
    await run("SessionEnd", { reason: event?.reason }, context);
    adapter.clearSessionEnv();
    context?.ui?.setStatus?.("evcrate-hooks", undefined);
  });

  return adapter;
}
