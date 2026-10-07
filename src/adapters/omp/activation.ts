// Native OMP command admission; the HOME helper remains the sole mode evaluator.
export const OMP_COMMAND_RUNTIME = String.raw`import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Metadata {
  name: string;
  canonicalName: string;
  description: string;
  activation: boolean;
  template: string;
}
interface Context {
  cwd: string;
  hasUI?: boolean;
  ui?: { notify(message: string, level: "error"): unknown };
}
type ActivationContext = {
  project_root: string; command: string; work_target: string;
  plan_path: string | null; phase_path: string | null; phase_id: string | null;
};
type ActivationResult = {
  protocol: "evcrate-advice-mode"; version: 1; status: "MODE_READY";
  mode: "off" | "explicit";
  reason: "NO_FINAL_FLAG" | "EXPLICIT_FINAL_FLAG";
  work_arguments: string; context: ActivationContext; run: null; error: null;
};

const OUTPUT_LIMIT = 256 * 1024;
const RESULT_KEYS = ["protocol", "version", "status", "mode", "reason", "work_arguments", "context", "run", "error"];
const CONTEXT_KEYS = ["project_root", "command", "work_target", "plan_path", "phase_path", "phase_id"];
const REPUBLISH = "evcrate publish --apply --scope home --target omp";
// Diagnostics stay below the 200-character notice cap so the repair command is never truncated.
const NODE_MISSING = "Node >=22.19.0 not found on PATH; install a supported Node.js and make node available on PATH, then retry";
const HELPER_MISSING = "the HOME activation helper is missing; install or republish it with: " + REPUBLISH;
const RESOURCE_MISSING = "a packaged OMP command resource is unreadable; republish it with: " + REPUBLISH;
const helperFailure = (reason: string) => new Error("HOME activation helper failed: " + reason);

function objectWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// A native user entry is always evaluated with a null handoff: only off or explicit with no run can result.
function validateNativeResult(output: Buffer, context: ActivationContext, raw: string): ActivationResult {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(output);
  if (!text.endsWith("\n")) throw new Error("helper output is not newline terminated");
  const result: unknown = JSON.parse(text);
  if (!objectWithKeys(result, RESULT_KEYS)) throw new Error("helper result does not match the native admission contract");
  const resultContext = result.context;
  if (result.protocol !== "evcrate-advice-mode" || result.version !== 1
    || result.status !== "MODE_READY" || result.error !== null || result.run !== null
    || typeof result.work_arguments !== "string" || !objectWithKeys(resultContext, CONTEXT_KEYS)
    || !CONTEXT_KEYS.every(key => resultContext[key] === context[key as keyof ActivationContext])) {
    throw new Error("helper result does not match the native admission contract");
  }
  const r = result as ActivationResult;
  if (!((r.mode === "off" && r.reason === "NO_FINAL_FLAG" && r.work_arguments === raw)
    || (r.mode === "explicit" && r.reason === "EXPLICIT_FINAL_FLAG"))) {
    throw new Error("helper result does not match the native admission contract");
  }
  return r;
}

function evaluate(helper: string, context: ActivationContext, raw: string): Promise<ActivationResult> {
  const wire = JSON.stringify({ protocol: "evcrate-advice-mode", version: 1,
    raw_arguments: raw, context, handoff: null });
  if (Buffer.byteLength(wire) > 64 * 1024) throw new Error("request exceeds the 64 KiB bound");
  const { promise, resolve, reject } = Promise.withResolvers<ActivationResult>();
  const child = spawn("node", [helper], { shell: false, cwd: context.project_root,
    env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  const chunks: Buffer[] = [];
  let size = 0;
  let settled = false;
  const finish = (error?: Error, result?: ActivationResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) child.kill("SIGKILL");
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    if (error) reject(error); else resolve(result!);
  };
  const timer = setTimeout(() => finish(helperFailure("no result within two seconds")), 2000);
  // The project cwd is validated before spawn, so ENOENT here means the node executable itself was not found.
  child.on("error", (error: NodeJS.ErrnoException) => finish(error.code === "ENOENT" ? new Error(NODE_MISSING) : helperFailure("could not be started")));
  child.stdin.on("error", () => finish(helperFailure("could not receive its request")));
  child.stdout.on("error", () => finish(helperFailure("its output could not be read")));
  child.stderr.on("error", () => finish(helperFailure("its diagnostics could not be read")));
  // Drain diagnostics, but never expose helper stderr or supplied error text to users.
  child.stderr.resume();
  child.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > OUTPUT_LIMIT) finish(helperFailure("output exceeded 256 KiB"));
    else if (!settled) chunks.push(chunk);
  });
  child.on("close", (code, signal) => {
    if (settled) return;
    if (code !== 0 || signal !== null) return finish(helperFailure("nonzero exit or signal"));
    try { finish(undefined, validateNativeResult(Buffer.concat(chunks, size), context, raw)); }
    catch { finish(helperFailure("returned invalid activation output")); }
  });
  // All process and stream handlers exist before the input is sent.
  child.stdin.end(wire, "utf8");
  return promise;
}

async function readResource(file: string): Promise<string> {
  try { return await readFile(file, "utf8"); }
  catch { throw new Error(RESOURCE_MISSING); }
}
function commandBody(content: string): string {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(content);
  return frontmatter ? content.slice(frontmatter[0].length) : content;
}
function substitute(body: string, raw: string, args: readonly string[]): string {
  return body.replace(/\$@\[(\d+)(?::(\d*))?\]|\$\{ARGUMENTS:-([^}]*)\}|\$ARGUMENTS\b|\$@|\$\{(\d+):-([^}]*)\}|\$(\d+)/gu,
    (match, start, length, fallback, position, positionalFallback, simplePosition) => {
      if (start !== undefined) {
        const index = Number(start) - 1;
        return index < 0 ? "" : args.slice(index, length ? index + Number(length) : undefined).join(" ");
      }
      const index = position ?? simplePosition;
      return index === undefined ? (raw || fallback || "") : (args[Number(index) - 1] ?? positionalFallback ?? "");
    });
}

function buildHeader(command: string, context: ActivationContext, result: ActivationResult) {
  return {
    evcrate_omp_command_context: {
      protocol: "evcrate-omp-command-context",
      version: 2,
      source: "native-user",
      command,
      mode: result.mode,
      reason: result.reason,
      context,
      run: result.run
    }
  };
}

async function reportError(ctx: Context, error: unknown): Promise<undefined> {
  const detail = error instanceof Error && !('code' in error)
    ? error.message.replace(/[\r\n]/gu, " ").slice(0, 200) : "required command resource is unreadable";
  const diagnostic = "EVCrate command stopped before prompt admission: " + detail;
  if (ctx.hasUI === false || !ctx.ui || typeof ctx.ui.notify !== "function") {
    process.stderr.write(diagnostic + "\n");
  } else {
    await ctx.ui.notify(diagnostic, "error");
  }
  return undefined;
}

export function createCommand(metadata: Metadata, moduleUrl: string) {
  const directory = path.dirname(fileURLToPath(moduleUrl));
  const commands = path.dirname(directory);
  if (path.basename(commands) !== "commands" || path.basename(directory) !== metadata.name
    || path.basename(metadata.template) !== metadata.template) throw new Error("Invalid native command resource binding");
  const resources = path.join(path.dirname(commands), "evcrate");
  return {
    name: metadata.name,
    description: metadata.description,
    async execute(args: string[], ctx: Context, raw?: string): Promise<string | undefined> {
      try {
        if (typeof raw !== "string") throw new Error("original raw string arguments are unavailable");
        let admitted: { context: ActivationContext; result: ActivationResult } | undefined;
        if (metadata.activation) {
          const home = process.env.HOME ?? (process.platform === "win32" ? homedir() : undefined);
          if (!home || !path.isAbsolute(home)) throw new Error("HOME must be a nonempty absolute path");
          if (!ctx.cwd || !path.isAbsolute(ctx.cwd)) throw new Error("an absolute project cwd is required");
          const projectRoot = path.resolve(ctx.cwd);
          if (!(await stat(projectRoot).catch(() => null))?.isDirectory()) throw new Error("the project cwd is not a directory");
          const helper = path.join(home, ".evcrate/bin/evcrate-advice-mode");
          if (!(await stat(helper).catch(() => null))?.isFile()) throw new Error(HELPER_MISSING);
          // Native discovery selects the installation; required resources belong to that same root.
          await readResource(path.join(resources, "workflows/advice-activation.md"));
          await readResource(path.join(resources, "workflows/plan-progress.md"));
          const context: ActivationContext = { project_root: projectRoot, command: metadata.canonicalName,
            work_target: metadata.canonicalName, plan_path: null, phase_path: null, phase_id: null };
          admitted = { context, result: await evaluate(helper, context, raw) };
        }
        const template = commandBody(await readResource(path.join(resources, "commands", metadata.template)));
        if (!admitted) return substitute(template, raw, args);
        const body = substitute(template, admitted.result.work_arguments, args);
        return JSON.stringify(buildHeader(metadata.canonicalName, admitted.context, admitted.result)) + "\n\n" + body;
      } catch (error) {
        return reportError(ctx, error);
      }
    }
  };
}

`;
