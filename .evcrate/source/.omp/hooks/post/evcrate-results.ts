import { additionalContext, canonicalToolPayload, runCanonicalHook, sessionId, type OmpHookContext, type OmpHookEvent, type OmpHookHost } from "../../evcrate/omp-hook-runtime.ts";
export default function (pi: OmpHookHost) {
  pi.on("tool_result", async (event: OmpHookEvent, ctx: OmpHookContext) => { if (event?.toolName !== "write" && event?.toolName !== "edit") return; const result = await runCanonicalHook("modularization-hook.js", canonicalToolPayload(event, ctx), ctx); const text = additionalContext(result.stdout) ?? additionalContext(result.stderr); if (!text) return; return { content: [...(Array.isArray(event?.content) ? event.content : []), { type: "text", text }] }; });
  pi.on("session_shutdown", async (_event: OmpHookEvent, ctx: OmpHookContext) => { await runCanonicalHook("session-end.cjs", { reason: "shutdown", session_id: sessionId(ctx) }, ctx); });
}
