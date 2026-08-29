import {
  additionalContext,
  canonicalToolPayload,
  runCanonicalHook,
  sessionId,
} from "../../evcrate/omp-hook-runtime.ts";

export default function (pi: any) {
  pi.on("tool_result", async (event: any, ctx: any) => {
    if (event?.toolName !== "write" && event?.toolName !== "edit") return;
    const payload = canonicalToolPayload(event, ctx);
    const result = await runCanonicalHook("modularization-hook.js", payload, ctx);
    const text = additionalContext(result.stdout) ?? additionalContext(result.stderr);
    if (!text) return;
    return {
      content: [
        ...(Array.isArray(event?.content) ? event.content : []),
        { type: "text", text },
      ],
    };
  });

  pi.on("session_shutdown", async (_event: any, ctx: any) => {
    await runCanonicalHook(
      "session-end.cjs",
      { reason: "shutdown", session_id: sessionId(ctx) },
      ctx,
    );
  });
}
