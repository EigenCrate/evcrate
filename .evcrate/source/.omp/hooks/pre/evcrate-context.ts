import { requiredAgentsContext, runCanonicalHook, sessionFile, sessionId } from "../../evcrate/omp-hook-runtime.ts";
export default function (pi: any) {
  let startupContext: string | undefined; let startupDelivered = false;
  // Print mode bypasses input and the host swallows lifecycle exceptions.
  // Abort the active operation before transport when no context was admitted.
  pi.on("before_provider_request", (_event: unknown, ctx: { abort: () => void; ui?: { notify?: (message: string, kind: string) => void } }) => {
    if (startupContext !== undefined) return;
    ctx.abort();
    const message = "Required EVCrate AGENTS payload is unsafe or unavailable";
    console.error(message); ctx.ui?.notify?.(message, "error");
  });
  async function rebuildStartupContext(ctx: any): Promise<void> {
    startupContext = undefined; startupDelivered = false;
    const agents = requiredAgentsContext();
    const startup = await runCanonicalHook("session-init.cjs", { source: "startup", session_id: sessionId(ctx) }, ctx);
    startupContext = [agents, startup.stdout.trim()].filter(Boolean).join("\n\n");
    startupDelivered = false;
  }
  pi.on("session_start", async (_event: any, ctx: any) => { await rebuildStartupContext(ctx); });
  // Interactive/RPC input can refuse before entering the provider operation.
  pi.on("input", async (_event: unknown, ctx: { ui?: { notify?: (message: string, kind: string) => void } }) => {
    if (startupContext !== undefined) return;
    try { await rebuildStartupContext(ctx); }
    catch {
      const message = "Required EVCrate AGENTS payload is unsafe or unavailable";
      console.error(message); ctx?.ui?.notify?.(message, "error");
      return { handled: true };
    }
  });
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    if (startupContext === undefined) await rebuildStartupContext(ctx);
    const parts: string[] = [];
    if (!startupDelivered) { parts.push(startupContext); startupDelivered = true; }
    const reminder = await runCanonicalHook("dev-rules-reminder.cjs", { prompt: event?.prompt ?? "", transcript_path: sessionFile(ctx) }, ctx);
    if (reminder.stdout.trim()) parts.push(reminder.stdout.trim()); if (!parts.length) return;
    return { message: { customType: "evcrate-context", content: parts.join("\n\n"), display: false } };
  });
  pi.on("session_before_compact", async (_event: any, ctx: any) => {
    startupContext = undefined; startupDelivered = false;
    await runCanonicalHook("write-compact-marker.cjs", { source: "compact", session_id: sessionId(ctx), trigger: "omp", context_window: {} }, ctx);
  });
}
