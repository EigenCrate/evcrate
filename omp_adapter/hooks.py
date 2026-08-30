"""Translate Claude hook sources and generate native OMP hook modules."""

from __future__ import annotations

from pathlib import Path

from distribution.contracts import render_harness_script_references

from .resources import ResourceError, copy_file, ensure_parent, relative_path, read_json, production_files, write_json


OMP_RUNTIME_HELPER = r'''import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SOURCE_HOOK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "hooks");

function hasSymlinkedAncestor(candidate: string): boolean {
  let current = path.resolve(candidate);
  while (true) {
    try {
      if (lstatSync(current).isSymbolicLink()) return true;
    } catch {
      return true;
    }
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function canonicalHookPath(relative: string): string {
  const candidate = path.resolve(SOURCE_HOOK_ROOT, relative);
  if (!candidate.startsWith(`${SOURCE_HOOK_ROOT}${path.sep}`) || hasSymlinkedAncestor(candidate)) {
    throw new Error(`Unsafe OMP hook path: ${relative}`);
  }
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Missing OMP hook source: ${relative}`);
  return candidate;
}

export interface CanonicalHookResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCanonicalHook(
  relative: string,
  payload: unknown,
  ctx: any,
): Promise<CanonicalHookResult> {
  let script: string;
  try {
    script = canonicalHookPath(relative);
  } catch (error) {
    return { stdout: "", stderr: String(error), code: 127 };
  }
  const cwd = typeof ctx?.cwd === "string" && ctx.cwd ? ctx.cwd : process.cwd();
  const resourceRoot = path.resolve(SOURCE_HOOK_ROOT, "..");
  const env = {
    ...process.env,
    EVCRATE_CONFIG_DIR: ".omp",
    EVCRATE_RESOURCE_ROOT: resourceRoot,
    EVCRATE_GLOBAL_CONFIG_ROOT: path.join(os.homedir(), ".omp", "agent"),
    CLAUDE_PROJECT_DIR: cwd,
    OMP_PROJECT_DIR: cwd,
  };
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    // OMP's execPath is the OMP/Bun CLI; use Node for CommonJS hooks instead of recursively starting OMP.
    const child = spawn("node", [script], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const finish = (result: CanonicalHookResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => finish({ stdout, stderr: `${stderr}${error}`, code: 127 }));
    child.on("close", (code) => finish({ stdout, stderr, code: code ?? 1 }));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ stdout, stderr: `${stderr}OMP canonical hook timed out`, code: 124 });
    }, 25_000);
    try {
      child.stdin.end(JSON.stringify(payload ?? {}));
    } catch (error) {
      child.kill("SIGTERM");
      finish({ stdout, stderr: `${stderr}${error}`, code: 127 });
    }
  });
}

export function sessionFile(ctx: any): string | undefined {
  try {
    const value = ctx?.sessionManager?.getSessionFile?.();
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function sessionId(ctx: any): string {
  const file = sessionFile(ctx);
  return file ? path.basename(file) : "default";
}

function canonicalName(toolName: string): string {
  const names: Record<string, string> = {
    bash: "Bash",
    glob: "Glob",
    grep: "Grep",
    read: "Read",
    edit: "Edit",
    write: "Write",
  };
  return names[toolName] ?? toolName;
}

export function canonicalToolPayload(event: any, ctx: any): Record<string, unknown> {
  const input = { ...(event?.input ?? {}) } as Record<string, unknown>;
  if (input.file_path === undefined && typeof input.path === "string") input.file_path = input.path;
  return {
    tool_name: canonicalName(typeof event?.toolName === "string" ? event.toolName : "unknown"),
    tool_input: input,
    cwd: ctx?.cwd ?? process.cwd(),
  };
}

export function additionalContext(output: string): string | undefined {
  for (const line of output.split("\n").reverse()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed);
      const candidate = value?.hookSpecificOutput?.additionalContext;
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      if (Array.isArray(candidate)) {
        const text = candidate.filter((item: unknown): item is string => typeof item === "string").join("\n").trim();
        if (text) return text;
      }
    } catch {
      // Canonical hooks that emit plain text are handled by the caller.
    }
  }
  return undefined;
}

export function outputText(result: CanonicalHookResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}
'''

OMP_PRE_MODULE = r'''import {
  canonicalToolPayload,
  runCanonicalHook,
  sessionFile,
  sessionId,
} from "../../evcrate/omp-hook-runtime.ts";

export default function (pi: any) {
  let startupContext = "";
  let startupDelivered = false;

  pi.on("session_start", async (_event: any, ctx: any) => {
    const result = await runCanonicalHook(
      "session-init.cjs",
      { source: "startup", session_id: sessionId(ctx) },
      ctx,
    );
    startupContext = result.stdout.trim();
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const parts: string[] = [];
    if (!startupContext) {
      const startup = await runCanonicalHook(
        "session-init.cjs",
        { source: "startup", session_id: sessionId(ctx) },
        ctx,
      );
      startupContext = startup.stdout.trim();
    }
    if (!startupDelivered && startupContext) {
      parts.push(startupContext);
      startupDelivered = true;
    }
    const reminder = await runCanonicalHook(
      "dev-rules-reminder.cjs",
      {
        prompt: event?.prompt ?? "",
        transcript_path: sessionFile(ctx),
      },
      ctx,
    );
    if (reminder.stdout.trim()) parts.push(reminder.stdout.trim());
    if (!parts.length) return;
    return {
      message: {
        customType: "evcrate-context",
        content: parts.join("\n\n"),
        display: false,
      },
    };
  });

  pi.on("session_before_compact", async (_event: any, ctx: any) => {
    await runCanonicalHook(
      "write-compact-marker.cjs",
      {
        source: "compact",
        session_id: sessionId(ctx),
        trigger: "omp",
        context_window: {},
      },
      ctx,
    );
  });
}
'''

OMP_POLICY_MODULE = r'''import {
  canonicalToolPayload,
  outputText,
  runCanonicalHook,
} from "../../evcrate/omp-hook-runtime.ts";

export default function (pi: any) {
  pi.on("tool_call", async (event: any, ctx: any) => {
    const payload = canonicalToolPayload(event, ctx);
    for (const script of ["scout-block.cjs", "privacy-block.cjs"]) {
      const result = await runCanonicalHook(script, payload, ctx);
      if (result.code === 0) continue;
      return {
        block: true,
        reason: outputText(result) || "Blocked by migrated EVCrate security hook.",
      };
    }
  });
}
'''

OMP_POST_MODULE = r'''import {
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
'''


def _translate_hook_source(value: str) -> str:
    """Translate runtime paths and make the EVCrate helper select ``.omp``."""

    rendered = render_harness_script_references(value, "omp")
    rendered = rendered.replace(
        "const VALID_CONFIG_DIRS = new Set(['.claude', '.codex', '.pi']);",
        "const VALID_CONFIG_DIRS = new Set(['.claude', '.codex', '.pi', '.omp']);",
    )
    rendered = rendered.replace(
        "return VALID_CONFIG_DIRS.has(value) ? value : '.claude';",
        "return VALID_CONFIG_DIRS.has(value) ? value : '.omp';",
    )
    rendered = rendered.replace(
        "if (resolveEVCrateConfigDir(value) !== '.pi') return null;\n  return absoluteDirectory(process['env'].EVCRATE_RESOURCE_ROOT)\n    || path.join(os.homedir(), '.pi', 'agent', 'evcrate');",
        "const configDir = resolveEVCrateConfigDir(value);\n  if (configDir !== '.pi' && configDir !== '.omp') return null;\n  const explicit = absoluteDirectory(process['env'].EVCRATE_RESOURCE_ROOT);\n  if (explicit) return explicit;\n  return configDir === '.omp'\n    ? path.join(os.homedir(), '.omp', 'agent', 'evcrate')\n    : path.join(os.homedir(), '.pi', 'agent', 'evcrate');",
    )
    rendered = rendered.replace(
        "const globalRoot = configDir === '.pi'\n    ? absoluteDirectory(process['env'].EVCRATE_GLOBAL_CONFIG_ROOT)\n    : null;",
        "const globalRoot = configDir === '.pi' || configDir === '.omp'\n    ? absoluteDirectory(process['env'].EVCRATE_GLOBAL_CONFIG_ROOT)\n    : null;",
    )
    return rendered
def _translate_script_source(value: str) -> str:
    """Translate helper scripts for both project and global OMP roots."""

    rendered = render_harness_script_references(value, "omp")
    rendered = rendered.replace(
        'if parent.name in {".antigravity", ".codex", ".gemini", ".pi"}:',
        'if parent.name in {".antigravity", ".codex", ".gemini", ".omp", ".pi"}:',
    )
    rendered = rendered.replace(
        "    target_root = script_path.parent.parent\n",
        "    target_root = script_path.parent.parent\n"
        "    if target_root.name == \"evcrate\" and target_root.parent.name == \"agent\" and target_root.parent.parent.name == \".omp\":\n"
        "        target_root = target_root.parent\n"
        "    elif target_root.name == \"evcrate\" and target_root.parent.name == \".omp\":\n"
        "        target_root = target_root.parent\n",
    )
    if "base_path = Path('.omp/commands')" in rendered or "base_path = Path('.omp/skills')" in rendered:
        helper = (
            "def _omp_root() -> Path:\n"
            "    for current in (Path.cwd(), *Path.cwd().parents):\n"
            "        candidate = current / '.omp'\n"
            "        if candidate.is_dir():\n"
            "            return candidate\n"
            "    return Path.home() / '.omp' / 'agent'\n\n"
        )
        rendered = rendered.replace("def main():\n", helper + "def main():\n", 1)
        rendered = rendered.replace("base_path = Path('.omp/commands')", "base_path = _omp_root() / 'commands'")
        rendered = rendered.replace("base_path = Path('.omp/skills')", "base_path = _omp_root() / 'skills'")
        rendered = rendered.replace(
            "output_path = Path('.omp/evcrate/scripts/commands_data.yaml')",
            "output_path = _omp_root() / 'evcrate' / 'scripts' / 'commands_data.yaml'",
        )
        rendered = rendered.replace(
            "output_path = Path('.omp/evcrate/scripts/skills_data.yaml')",
            "output_path = _omp_root() / 'evcrate' / 'scripts' / 'skills_data.yaml'",
        )
    return rendered


def _copy_support_file(source: Path, output: Path, relative: str, transform) -> None:
    if source.is_symlink() or not source.is_file():
        raise ResourceError(f"Canonical support file is missing or unsafe: {source}")
    copy_file(source, output / "evcrate" / "source-metadata" / relative, output, transform)


def convert_hooks_and_scripts(source: Path, output: Path) -> dict[str, object]:
    """Copy non-native closures and generate OMP hook factories."""

    hook_source = source / "hooks"
    script_source = source / "scripts"
    hook_destination = output / "evcrate" / "hooks"
    script_destination = output / "evcrate" / "scripts"
    copied_hooks: list[str] = []
    for source_file in production_files(hook_source):
        relative = relative_path(hook_source, source_file)
        copy_file(source_file, hook_destination / relative, output, _translate_hook_source)
        copied_hooks.append(relative.as_posix())

    copied_scripts: list[str] = []
    for source_file in production_files(script_source):
        relative = relative_path(script_source, source_file)
        if "advise-state" in relative.name:
            continue
        copy_file(source_file, script_destination / relative, output, _translate_script_source)
        copied_scripts.append(relative.as_posix())

    ignore = source / ".evcrateignore"
    copy_file(ignore, output / "evcrate" / ".evcrateignore", output)
    copy_file(source / ".evcrate.json", output / ".evcrate.json", output)
    copy_file(ignore, output / ".evcrateignore", output)

    metadata_files = (
        (source / "settings.json", "claude-settings.json"),
        (source / ".mcp.json.example", ".mcp.json.example"),
    )
    for support, relative in metadata_files:
        if support.is_file() and not support.is_symlink():
            _copy_support_file(support, output, relative, lambda value: render_harness_script_references(value, "omp"))
    for statusline in sorted(source.glob("statusline.*")):
        if statusline.is_file() and not statusline.is_symlink():
            _copy_support_file(statusline, output, f"statusline/{statusline.name}", lambda value: render_harness_script_references(value, "omp"))

    ensure_parent(output, output / "evcrate" / "omp-hook-runtime.ts")
    (output / "evcrate" / "omp-hook-runtime.ts").write_text(OMP_RUNTIME_HELPER, encoding="utf-8", newline="\n")
    (output / "evcrate" / "omp-hook-runtime.ts").chmod(0o644)
    generated_modules = {
        "hooks/pre/evcrate-context.ts": OMP_PRE_MODULE,
        "hooks/pre/evcrate-policy.ts": OMP_POLICY_MODULE,
        "hooks/post/evcrate-results.ts": OMP_POST_MODULE,
    }
    for relative, content in generated_modules.items():
        destination = output / relative
        ensure_parent(output, destination)
        destination.write_text(content, encoding="utf-8", newline="\n")
        destination.chmod(0o644)

    settings = read_json(source / "settings.json", "canonical hook settings")
    events = settings.get("hooks")
    if not isinstance(events, dict):
        raise ResourceError("Canonical hook settings must contain a hooks object")
    event_map: dict[str, object] = {}
    for event_name, entries in sorted(events.items()):
        if not isinstance(entries, list):
            raise ResourceError(f"Canonical hook event must be a list: {event_name}")
        if event_name == "SessionStart":
            target = ["session_start", "before_agent_start"]
            status = "migrated"
        elif event_name == "UserPromptSubmit":
            target = ["before_agent_start"]
            status = "migrated"
        elif event_name == "PreToolUse":
            target = ["tool_call"]
            status = "migrated"
        elif event_name == "PostToolUse":
            target = ["tool_result"]
            status = "migrated"
        elif event_name == "PreCompact":
            target = ["session_before_compact"]
            status = "migrated"
        elif event_name == "SessionEnd":
            target = ["session_shutdown"]
            status = "migrated"
        elif event_name == "SubagentStart":
            target = []
            status = "limited"
        else:
            target = []
            status = "unsupported"
        event_map[event_name] = {
            "targetEvents": target,
            "status": status,
            "sourceEntries": len(entries),
        }
    write_json(output / "evcrate" / "hook-map.json", output, {
        "schema": "evcrate-omp-hook-map-v1",
        "events": event_map,
        "activeModules": sorted(generated_modules),
        "subagentStart": "OMP has no direct agent_type/agent_id hook payload; generic context is handled by before_agent_start.",
    })
    return {
        "hooks": tuple(copied_hooks),
        "scripts": tuple(copied_scripts),
        "modules": tuple(sorted(generated_modules)),
    }
