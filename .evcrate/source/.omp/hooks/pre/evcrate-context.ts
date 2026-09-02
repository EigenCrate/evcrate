import { canonicalToolPayload, runCanonicalHook, sessionFile, sessionId } from "../../evcrate/omp-hook-runtime.ts";
export default function (pi: any) {
  let startupContext = ""; let startupDelivered = false;
  pi.on("session_start", async (_event: any, ctx: any) => { const result = await runCanonicalHook("session-init.cjs", { source: "startup", session_id: sessionId(ctx) }, ctx); startupContext = result.stdout.trim(); });
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const parts: string[] = [];
    if (!startupContext) { const startup = await runCanonicalHook("session-init.cjs", { source: "startup", session_id: sessionId(ctx) }, ctx); startupContext = startup.stdout.trim(); }
    if (!startupDelivered && startupContext) { parts.push(startupContext); startupDelivered = true; }
    const reminder = await runCanonicalHook("dev-rules-reminder.cjs", { prompt: event?.prompt ?? "", transcript_path: sessionFile(ctx) }, ctx);
    if (reminder.stdout.trim()) parts.push(reminder.stdout.trim()); if (!parts.length) return;
    return { message: { customType: "evcrate-context", content: parts.join("\n\n"), display: false } };
  });
  pi.on("session_before_compact", async (_event: any, ctx: any) => { await runCanonicalHook("write-compact-marker.cjs", { source: "compact", session_id: sessionId(ctx), trigger: "omp", context_window: {} }, ctx); });
}
