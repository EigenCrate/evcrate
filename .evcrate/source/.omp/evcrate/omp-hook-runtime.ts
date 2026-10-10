import { constants, fstatSync, lstatSync, openSync, readSync, closeSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SOURCE_HOOK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "hooks");
const RESOURCE_ROOT = path.resolve(SOURCE_HOOK_ROOT, "..");
const MAX_AGENTS_BYTES = 256 * 1024;
function hasSymlinkedAncestor(candidate: string): boolean {
  let current = path.resolve(candidate);
  while (true) {
    try { if (lstatSync(current).isSymbolicLink()) return true; } catch { return true; }
    const parent = path.dirname(current); if (parent === current) return false; current = parent;
  }
}
export function requiredAgentsContext(): string {
  const candidate = path.resolve(RESOURCE_ROOT, "AGENTS.md");
  if (path.dirname(candidate) !== RESOURCE_ROOT || hasSymlinkedAncestor(candidate)) throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable");
  let initial; let descriptor: number;
  try {
    initial = lstatSync(candidate);
    if (!initial.isFile() || initial.isSymbolicLink() || initial.size <= 0 || initial.size > MAX_AGENTS_BYTES) throw new Error("invalid payload");
    descriptor = openSync(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch { throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable"); }
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size !== initial.size || opened.dev !== initial.dev || opened.ino !== initial.ino) throw new Error("payload changed");
    const bytes = Buffer.alloc(opened.size);
    for (let offset = 0; offset < bytes.length;) { const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset); if (!count) throw new Error("payload truncated"); offset += count; }
    const final = lstatSync(candidate);
    if (!final.isFile() || final.isSymbolicLink() || final.size !== initial.size || final.dev !== initial.dev || final.ino !== initial.ino) throw new Error("payload changed");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (!text || text.includes("\0")) throw new Error("payload is empty or invalid");
    return text;
  } catch { throw new Error("Required EVCrate AGENTS payload is unsafe or unavailable"); }
  finally { closeSync(descriptor); }
}
function canonicalHookPath(relative: string): string {
  const candidate = path.resolve(SOURCE_HOOK_ROOT, relative);
  if (!candidate.startsWith(SOURCE_HOOK_ROOT + path.sep) || hasSymlinkedAncestor(candidate)) throw new Error("Unsafe OMP hook path: " + relative);
  const stat = lstatSync(candidate); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Missing OMP hook source: " + relative); return candidate;
}
export interface CanonicalHookResult { stdout: string; stderr: string; code: number; }
export async function runCanonicalHook(relative: string, payload: unknown, ctx: any): Promise<CanonicalHookResult> {
  let script: string; try { script = canonicalHookPath(relative); } catch (error) { return { stdout: "", stderr: String(error), code: 127 }; }
  const cwd = typeof ctx?.cwd === "string" && ctx.cwd ? ctx.cwd : process.cwd();
  const resourceRoot = path.resolve(SOURCE_HOOK_ROOT, "..");
  const env = { ...process.env, EVCRATE_CONFIG_DIR: ".omp", EVCRATE_RESOURCE_ROOT: resourceRoot, EVCRATE_GLOBAL_CONFIG_ROOT: path.dirname(resourceRoot), CLAUDE_PROJECT_DIR: cwd, OMP_PROJECT_DIR: cwd };
  return await new Promise((resolve) => {
    let stdout = ""; let stderr = ""; let settled = false;
    const child = spawn("node", [script], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const finish = (result: CanonicalHookResult) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => finish({ stdout, stderr: stderr + String(error), code: 127 })); child.on("close", (code) => finish({ stdout, stderr, code: code ?? 1 }));
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ stdout, stderr: stderr + "OMP canonical hook timed out", code: 124 }); }, 25_000);
    try { child.stdin.end(JSON.stringify(payload ?? {})); } catch (error) { child.kill("SIGTERM"); finish({ stdout, stderr: stderr + String(error), code: 127 }); }
  });
}
export function sessionFile(ctx: any): string | undefined { try { const value = ctx?.sessionManager?.getSessionFile?.(); return typeof value === "string" && value ? value : undefined; } catch { return undefined; } }
export function sessionId(ctx: any): string { const file = sessionFile(ctx); return file ? path.basename(file) : "default"; }
function canonicalName(toolName: string): string { return ({ bash: "Bash", glob: "Glob", grep: "Grep", read: "Read", edit: "Edit", write: "Write" } as Record<string, string>)[toolName] ?? toolName; }
export function canonicalToolPayload(event: any, ctx: any): Record<string, unknown> { const input = { ...(event?.input ?? {}) } as Record<string, unknown>; if (input.file_path === undefined && typeof input.path === "string") input.file_path = input.path; return { tool_name: canonicalName(typeof event?.toolName === "string" ? event.toolName : "unknown"), tool_input: input, cwd: ctx?.cwd ?? process.cwd() }; }
export function additionalContext(output: string): string | undefined { for (const line of output.split("\n").reverse()) { const trimmed = line.trim(); if (!trimmed) continue; try { const value = JSON.parse(trimmed); const candidate = value?.hookSpecificOutput?.additionalContext; if (typeof candidate === "string" && candidate.trim()) return candidate.trim(); if (Array.isArray(candidate)) { const text = candidate.filter((item: unknown): item is string => typeof item === "string").join("\n").trim(); if (text) return text; } } catch { /* plain text */ } } return undefined; }
export function outputText(result: CanonicalHookResult): string { return result.stdout + "\n" + result.stderr; }
