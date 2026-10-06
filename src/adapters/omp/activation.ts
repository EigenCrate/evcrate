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
  plan_path: null; phase_path: null; phase_id: null;
};
type ActivationResult = {
  protocol: "evcrate-advice-mode"; version: 1; status: "MODE_READY";
  mode: "off" | "explicit"; reason: "NO_FINAL_FLAG" | "EXPLICIT_FINAL_FLAG";
  work_arguments: string; context: ActivationContext; run: null; error: null;
};
const OUTPUT_LIMIT = 256 * 1024;
const RESULT_KEYS = ["protocol", "version", "status", "mode", "reason", "work_arguments", "context", "run", "error"];
const CONTEXT_KEYS = ["project_root", "command", "work_target", "plan_path", "phase_path", "phase_id"];

function objectWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function validateResult(output: Buffer, context: ActivationContext, raw: string): ActivationResult {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(output);
  if (!text.endsWith("\n")) throw new Error("helper output is not newline terminated");
  const result: unknown = JSON.parse(text);
  if (!objectWithKeys(result, RESULT_KEYS) || result.protocol !== "evcrate-advice-mode" || result.version !== 1
    || result.status !== "MODE_READY" || result.run !== null || result.error !== null
    || typeof result.work_arguments !== "string" || !objectWithKeys(result.context, CONTEXT_KEYS)
    || !CONTEXT_KEYS.every(key => result.context[key] === context[key as keyof ActivationContext])
    || !((result.mode === "off" && result.reason === "NO_FINAL_FLAG" && result.work_arguments === raw)
      || (result.mode === "explicit" && result.reason === "EXPLICIT_FINAL_FLAG"))) {
    throw new Error("helper result does not match the native request contract");
  }
  return result as unknown as ActivationResult;
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
  const timer = setTimeout(() => finish(new Error("helper execution exceeded two seconds")), 2000);
  child.on("error", () => finish(new Error("could not launch the HOME helper with Node")));
  child.stdin.on("error", () => finish(new Error("could not deliver helper input")));
  child.stdout.on("error", () => finish(new Error("could not read helper output")));
  child.stderr.on("error", () => finish(new Error("could not read helper diagnostics")));
  // Drain diagnostics, but never expose helper stderr or supplied error text to users.
  child.stderr.resume();
  child.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > OUTPUT_LIMIT) finish(new Error("helper output exceeded 256 KiB"));
    else if (!settled) chunks.push(chunk);
  });
  child.on("close", (code, signal) => {
    if (settled) return;
    if (code !== 0 || signal !== null) return finish(new Error("HOME helper evaluation failed"));
    try { finish(undefined, validateResult(Buffer.concat(chunks, size), context, raw)); }
    catch { finish(new Error("HOME helper returned invalid activation output")); }
  });
  // All process and stream handlers exist before the input is sent.
  child.stdin.end(wire, "utf8");
  return promise;
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
        let result: ActivationResult | undefined;
        let context: ActivationContext | undefined;
        if (metadata.activation) {
          const home = process.env.HOME ?? (process.platform === "win32" ? homedir() : undefined);
          if (!home || !path.isAbsolute(home)) throw new Error("HOME must be a nonempty absolute path");
          if (!ctx.cwd || !path.isAbsolute(ctx.cwd)) throw new Error("an absolute project cwd is required");
          const helper = path.join(home, ".evcrate/bin/evcrate-advice-mode");
          if (!(await stat(helper).catch(() => null))?.isFile()) throw new Error("the HOME activation helper is missing");
          // Native discovery selects the installation; required resources belong to that same root.
          await readFile(path.join(resources, "workflows/advice-activation.md"));
          await readFile(path.join(resources, "workflows/plan-progress.md"));
          context = { project_root: path.resolve(ctx.cwd), command: metadata.canonicalName,
            work_target: metadata.canonicalName, plan_path: null, phase_path: null, phase_id: null };
          result = await evaluate(helper, context, raw);
        }
        const template = commandBody(await readFile(path.join(resources, "commands", metadata.template), "utf8"));
        const body = substitute(template, result?.work_arguments ?? raw, args);
        if (!result) return body;
        // Cooperative transport metadata, not authentication or a model-child handoff.
        const header = { evcrate_omp_command_context: { protocol: "evcrate-omp-command-context", version: 1,
          source: "native-user", command: metadata.canonicalName, raw_arguments: raw,
          context, activation_result: result, handoff: null } };
        return JSON.stringify(header) + "\n\n" + body;
      } catch (error) {
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
    },
  };
}
`;
