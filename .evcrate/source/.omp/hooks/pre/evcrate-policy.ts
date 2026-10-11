import { canonicalToolPayload, outputText, runCanonicalHook, type OmpHookContext, type OmpHookEvent, type OmpHookHost } from "../../evcrate/omp-hook-runtime.ts";
export default function (pi: OmpHookHost) {
  pi.on("tool_call", async (event: OmpHookEvent, ctx: OmpHookContext) => { const payload = canonicalToolPayload(event, ctx); for (const script of ["scout-block.cjs", "privacy-block.cjs"]) { const result = await runCanonicalHook(script, payload, ctx); if (result.code === 0) continue; return { block: true, reason: outputText(result) || "Blocked by migrated EVCrate security hook." }; } });
}
