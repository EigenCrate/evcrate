import hookAdapter from "./hook-adapter.cjs";
import { readInstalledAgentsDocument } from "./paths.js";
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
  let startupContext;
  let startupDelivered = false;
  const rebuildStartupContext = async (event, context) => {
    startupContext = undefined;
    startupDelivered = false;
    const payload = readInstalledAgentsDocument(adapter.agentRoot);
    const output = await run("SessionStart", { reason: event?.reason }, context);
    startupContext = [payload, output.additionalContext].filter(Boolean).join("\n\n");
    startupDelivered = false;
  };
  const run = (eventName, event, context) => adapter.run(eventName, {
    ...event,
    sessionId: sessionId(context),
  }, {
    cwd: context?.cwd,
    signal: context?.signal,
    sessionId: sessionId(context),
  });

  pi.on("session_start", async (event, context) => {
    await rebuildStartupContext(event, context);
  });

  // Hosts report lifecycle exceptions but continue. Consume rejected input
  // explicitly so a missing required payload cannot reach the provider.
  pi.on("input", async (_event, context) => {
    if (startupContext !== undefined) return undefined;
    try {
      await rebuildStartupContext({ reason: "startup" }, context);
    } catch {
      const message = "Required EVCrate AGENTS payload is unsafe or unavailable";
      console.error(message);
      notify(context, message);
      return { action: "handled" };
    }
    return undefined;
  });

  pi.on("session_before_compact", async (event, context) => {
    await run("PreCompact", { reason: event?.reason }, context);
  });

  pi.on("session_compact", async (event, context) => {
    startupContext = undefined;
    startupDelivered = false;
    await run("PostCompact", { reason: event?.reason }, context);
    await rebuildStartupContext({ reason: "compact" }, context);
  });

  pi.on("before_agent_start", async (_event, context) => {
    if (startupContext === undefined) await rebuildStartupContext({ reason: "startup" }, context);
    const output = await run("UserPromptSubmit", {}, context);
    const parts = [];
    const includesStartup = !startupDelivered;
    if (!startupDelivered) {
      parts.push(startupContext);
      startupDelivered = true;
    }
    if (output.additionalContext) parts.push(output.additionalContext);
    if (!parts.length) return undefined;
    return {
      message: {
        customType: "evcrate-hook-context",
        content: parts.join("\n\n"),
        display: false,
        details: includesStartup ? { evcrateStartup: true, reminder: output.additionalContext ?? "" } : undefined,
      },
    };
  });

  // Compaction can retain an older startup message. Supersede only its startup
  // content in the outgoing context, preserving reminders and session history.
  pi.on("context", (event) => {
    const isStartup = (message) => message.role === "custom"
      && message.customType === "evcrate-hook-context"
      && message.details?.evcrateStartup === true;
    const latest = event.messages.findLastIndex(isStartup);
    if (latest < 0 || event.messages.findIndex(isStartup) === latest) return undefined;
    const messages = [];
    for (let index = 0; index < event.messages.length; index += 1) {
      const message = event.messages[index];
      if (index < latest && isStartup(message)) {
        const reminder = message.details.reminder;
        if (typeof reminder === "string" && reminder) {
          messages.push({ ...message, content: reminder, details: undefined });
        }
      } else {
        messages.push(message);
      }
    }
    return { messages };
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
