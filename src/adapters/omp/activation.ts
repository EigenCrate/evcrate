// Native command admission binds resources to the discovered command installation.
export const OMP_COMMAND_RUNTIME = String.raw`import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Metadata {
  name: string;
  canonicalName: string;
  description: string;
  template: string;
}
interface Context {
  cwd: string;
  hasUI?: boolean;
  ui?: { notify(message: string, level: "error"): unknown };
}
type CommandContext = {
  project_root: string; command: string; work_target: string;
  plan_path: null; phase_path: null; phase_id: null;
};

const RESOURCE_LIMIT = 1024 * 1024;
const RESOURCE_MISSING = "a packaged OMP command resource is unreadable; republish it with: evcrate publish --apply --scope home --target omp";

async function readResource(root: string, relative: string): Promise<string> {
  const file = path.join(root, relative);
  let handle;
  try {
    // Inspect every ancestor: neither a leaf nor an installation component may redirect reads.
    const parsed = path.parse(file);
    let current = parsed.root;
    const parts = file.slice(parsed.root.length).split(path.sep);
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]!);
      const entry = await lstat(current);
      if (entry.isSymbolicLink() || (index < parts.length - 1 ? !entry.isDirectory() : !entry.isFile())) {
        throw new Error(RESOURCE_MISSING);
      }
    }
    const initial = await lstat(file);
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const entry = await handle.stat();
    if (!entry.isFile() || entry.dev !== initial.dev || entry.ino !== initial.ino
      || entry.size !== initial.size || entry.size === 0 || entry.size > RESOURCE_LIMIT) throw new Error(RESOURCE_MISSING);
    const bytes = Buffer.alloc(entry.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const chunk = await handle.read(bytes, size, bytes.length - size, null);
      if (!chunk.bytesRead) break;
      size += chunk.bytesRead;
    }
    if (size !== entry.size) throw new Error(RESOURCE_MISSING);
    const final = await lstat(file);
    if (final.isSymbolicLink() || final.dev !== entry.dev || final.ino !== entry.ino || final.size !== entry.size
      || await realpath(file) !== file) throw new Error(RESOURCE_MISSING);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
    if (!text.trim() || text.includes("\0")) throw new Error(RESOURCE_MISSING);
    return text;
  } catch { throw new Error(RESOURCE_MISSING); }
  finally { await handle?.close(); }
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

async function reportError(ctx: Context, detail: string): Promise<undefined> {
  const diagnostic = ("EVCrate command stopped before prompt admission: " + detail).slice(0, 256);
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
    || metadata.template !== metadata.name + ".md") throw new Error("Invalid native command resource binding");
  const resources = path.join(path.dirname(commands), "evcrate");
  return {
    name: metadata.name,
    description: metadata.description,
    async execute(args: string[], ctx: Context, raw?: string): Promise<string | undefined> {
      if (typeof raw !== "string") return reportError(ctx, "original raw string arguments are unavailable");
      if (Buffer.byteLength(raw, "utf8") > 64 * 1024) return reportError(ctx, "raw arguments exceed the 64 KiB bound");
      if (typeof ctx.cwd !== "string" || !ctx.cwd || !path.isAbsolute(ctx.cwd)) {
        return reportError(ctx, "an absolute project cwd is required");
      }
      let projectRoot: string;
      try {
        projectRoot = await realpath(ctx.cwd);
        if (!(await stat(projectRoot)).isDirectory()) return reportError(ctx, "the project cwd is not a directory");
      } catch { return reportError(ctx, "the project cwd is not a directory"); }
      try {
        await readResource(resources, "workflows/documentation-management.md");
        const template = commandBody(await readResource(resources, path.join("commands", metadata.template)));
        const context: CommandContext = { project_root: projectRoot, command: metadata.canonicalName,
          work_target: metadata.canonicalName, plan_path: null, phase_path: null, phase_id: null };
        const header = { evcrate_omp_command_context: { protocol: "evcrate-omp-command-context",
          version: 3, source: "native-user", command: metadata.canonicalName, context } };
        return JSON.stringify(header) + "\n\n" + substitute(template, raw, args);
      } catch { return reportError(ctx, RESOURCE_MISSING); }
    }
  };
}
`;
