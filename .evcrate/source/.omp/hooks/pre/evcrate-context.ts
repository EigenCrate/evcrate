import { requiredAgentsContext, runCanonicalHook, sessionFile, sessionId, type OmpHookContext, type OmpHookEvent, type OmpHookHost } from "../../evcrate/omp-hook-runtime.ts";
export default function (pi: OmpHookHost) {
  let agentsText: string | undefined; let sessionInitText: string | undefined; let startupDelivered = false; let agentsWarned = false;
  function tryReadAgentsContext(ctx?: OmpHookContext): string | undefined {
    try { const text = requiredAgentsContext(); agentsWarned = false; return text; }
    catch {
      if (!agentsWarned) {
        agentsWarned = true;
        const message = "Required EVCrate AGENTS payload is unsafe or unavailable";
        console.warn(message); ctx?.ui?.notify?.(message, "warning");
      }
      return undefined;
    }
  }
  // Print mode bypasses input and the host swallows lifecycle exceptions.
  // Warn and allow the operation to continue when no AGENTS context was admitted.
  pi.on("before_provider_request", (_event: OmpHookEvent, ctx: OmpHookContext) => {
    if (agentsText !== undefined) return;
    const nextAgents = tryReadAgentsContext(ctx);
    if (nextAgents !== undefined) {
      agentsText = nextAgents;
      startupDelivered = false;
    }
  });
  async function rebuildStartupContext(ctx?: OmpHookContext): Promise<void> {
    const nextAgents = tryReadAgentsContext(ctx);
    const startup = await runCanonicalHook("session-init.cjs", { source: "startup", session_id: sessionId(ctx) }, ctx);
    agentsText = nextAgents;
    sessionInitText = startup.stdout.trim();
    startupDelivered = false;
  }
  pi.on("session_start", async (_event: OmpHookEvent, ctx: OmpHookContext) => { await rebuildStartupContext(ctx); });
  pi.on("input", async (_event: OmpHookEvent, ctx: OmpHookContext) => {
    if (sessionInitText !== undefined && agentsText !== undefined) return;
    await rebuildStartupContext(ctx);
  });
  pi.on("before_agent_start", async (event: OmpHookEvent, ctx: OmpHookContext) => {
    if (sessionInitText === undefined || agentsText === undefined) await rebuildStartupContext(ctx);
    const parts: string[] = [];
    if (!startupDelivered) {
      const startupContext = [agentsText, sessionInitText].filter(Boolean).join("\n\n");
      if (startupContext) parts.push(startupContext);
      startupDelivered = true;
    }
    const reminder = await runCanonicalHook("dev-rules-reminder.cjs", { prompt: event?.prompt ?? "", transcript_path: sessionFile(ctx) }, ctx);
    if (reminder.stdout.trim()) parts.push(reminder.stdout.trim()); if (!parts.length) return;
    return { message: { customType: "evcrate-context", content: parts.join("\n\n"), display: false } };
  });
  pi.on("session_before_compact", async (_event: OmpHookEvent, ctx: OmpHookContext) => {
    await runCanonicalHook("write-compact-marker.cjs", { source: "compact", session_id: sessionId(ctx), trigger: "omp", context_window: {} }, ctx);
    await rebuildStartupContext(ctx);
  });
}
