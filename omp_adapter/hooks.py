"""Translate Claude hook sources and generate native OMP hook modules."""

from __future__ import annotations

from pathlib import Path

from distribution.contracts import render_harness_script_references

from .resources import ResourceError, copy_file, ensure_parent, relative_path, read_json, production_files, write_json

import yaml

from .commands import render_command_references


_OMP_COMMAND_MAP_LOADER = r'''
def _load_omp_command_map(commands_dir: Path) -> dict[str, dict]:
    """Load the generated OMP map and prove it matches command files."""
    map_path = commands_dir.parent / "evcrate" / "command-name-map.json"

    def reject_duplicate_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate key: {key}")
            result[key] = value
        return result

    try:
        payload = json.loads(
            map_path.read_text(encoding="utf-8"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (OSError, UnicodeError, ValueError) as error:
        raise RuntimeError(f"Invalid or missing OMP command map: {map_path}") from error
    if (
        not isinstance(payload, dict)
        or set(payload) != {"schema", "commands"}
        or payload["schema"] != "evcrate-omp-command-map-v1"
    ):
        raise RuntimeError(f"Invalid OMP command map schema: {map_path}")
    records = payload["commands"]
    if not isinstance(records, list):
        raise RuntimeError(f"Invalid OMP command map records: {map_path}")

    by_target = {}
    seen_sources = set()
    seen_source_names = set()
    seen_target_names = set()
    for record in records:
        fields = ("source", "sourceName", "target", "targetName")
        if (
            not isinstance(record, dict)
            or set(record) != set(fields)
            or any(not isinstance(record[field], str) for field in fields)
        ):
            raise RuntimeError(f"Invalid OMP command map record: {map_path}")
        source = record["source"]
        source_name = record["sourceName"]
        target = record["target"]
        target_name = record["targetName"]
        source_path = Path(source)
        target_path = Path(target)
        if (
            source != source_name.replace(":", "/") + ".md"
            or not re.fullmatch(r"[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*", source_name)
            or source_path.is_absolute()
            or source_path.as_posix() != source
            or ".." in source_path.parts
            or target != f"{target_name}.md"
            or not re.fullmatch(r"cmd-[A-Za-z0-9][A-Za-z0-9_-]*", target_name)
            or target_path.is_absolute()
            or target_path.as_posix() != target
            or ".." in target_path.parts
            or source_name.casefold() in seen_source_names
            or target_name.casefold() in seen_target_names
        ):
            raise RuntimeError(f"Invalid or duplicate OMP command map record: {map_path}")
        candidate = commands_dir / target_path
        try:
            candidate.relative_to(commands_dir)
        except ValueError as error:
            raise RuntimeError(f"OMP command map target escapes command root: {map_path}") from error
        if candidate.is_symlink() or not candidate.is_file():
            raise RuntimeError(f"OMP command map target is missing or unsafe: {target}")
        by_target[target] = record
        seen_source_names.add(source_name.casefold())
        seen_target_names.add(target_name.casefold())

    command_targets = {
        path.relative_to(commands_dir).as_posix()
        for path in commands_dir.rglob("*.md")
    }
    if command_targets != set(by_target):
        raise RuntimeError(f"OMP command map does not match command files: {map_path}")
    return by_target
'''


def _replace_required_script_marker(value: str, marker: str, replacement: str, label: str) -> str:
    if marker not in value:
        raise ResourceError(f"OMP static transform marker missing: {label}")
    return value.replace(marker, replacement, 1)


def _render_omp_help_source(value: str) -> str:
    rendered = _replace_required_script_marker(
        value,
        "import ast\n",
        "import ast\nimport json\n",
        "ev-help JSON import",
    )
    loader_marker = "def detect_prefix(commands_dir: Path) -> str:\n"
    rendered = _replace_required_script_marker(
        rendered,
        loader_marker,
        _OMP_COMMAND_MAP_LOADER.strip("\n") + "\n\n" + loader_marker,
        "ev-help map loader",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "def discover_commands(commands_dir: Path, prefix: str) -> dict:\n",
        "def discover_commands(commands_dir: Path, prefix: str, command_map: dict | None = None) -> dict:\n",
        "ev-help discovery signature",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    commands = {}\n    categories = {}\n\n    if not commands_dir.exists():",
        "    commands = {}\n    categories = {}\n    mapped_targets = set()\n\n    if not commands_dir.exists():",
        "ev-help discovery state",
    )
    path_block = """        # Get command name from path
        # e.g., fix/fast.md -> fix:fast, plan.md -> plan
        if len(parts) == 1:
            # Root command: plan.md or plan.toml -> plan
            cmd_name = command_file.stem
            category = "core"
        else:
            # Nested command: fix/fast.md -> fix:fast
            category = parts[0]
            cmd_name = ':'.join([*parts[:-1], command_file.stem])
"""
    mapped_path_block = """        if command_map is not None:
            target = rel_path.as_posix()
            record = command_map.get(target)
            if record is None:
                raise RuntimeError(f"OMP command map has no record for {target}")
            mapped_targets.add(target)
            cmd_name = record["targetName"]
            category = _skill_category("/" + record["sourceName"])
        else:
            # Get command name from path
            # e.g., fix/fast.md -> fix:fast, plan.md -> plan
            if len(parts) == 1:
                # Root command: plan.md or plan.toml -> plan
                cmd_name = command_file.stem
                category = "core"
            else:
                # Nested command: fix/fast.md -> fix:fast
                category = parts[0]
                cmd_name = ':'.join([*parts[:-1], command_file.stem])
"""
    rendered = _replace_required_script_marker(
        rendered,
        path_block,
        mapped_path_block,
        "ev-help mapped path",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    # Sort commands within each category\n",
        "    if command_map is not None and mapped_targets != set(command_map):\n"
        "        raise RuntimeError(\"OMP command map does not match discovered commands\")\n\n"
        "    # Sort commands within each category\n",
        "ev-help mapped inventory",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "        formatted_name = f\"/{prefix}{cmd_name}\" if prefix else f\"/{cmd_name}\"\n",
        "        formatted_name = f\"/{cmd_name}\" if command_map is not None else ("
        "f\"/{prefix}{cmd_name}\" if prefix else f\"/{cmd_name}\")\n",
        "ev-help mapped invocation",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    script_path = Path(__file__).resolve()\n    source_kind, source_dir = resolve_command_source(script_path)\n",
        "    script_path = Path(__file__).resolve()\n"
        "    target = advisory_target(script_path)\n"
        "    source_kind, source_dir = resolve_command_source(script_path)\n",
        "ev-help target detection",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    else:\n        prefix = detect_prefix(source_dir)\n        data = discover_commands(source_dir, prefix)\n",
        "    else:\n"
        "        prefix = detect_prefix(source_dir)\n"
        "        try:\n"
        "            command_map = _load_omp_command_map(source_dir) if target == \"omp\" else None\n"
        "        except RuntimeError as error:\n"
        "            print(f\"Error: {error}\", file=sys.stderr)\n"
        "            sys.exit(1)\n"
        "        data = discover_commands(source_dir, prefix, command_map)\n",
        "ev-help map dispatch",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "        show_advisory_guide(prefix, advisory_target(script_path))\n",
        "        show_advisory_guide(prefix, target)\n",
        "ev-help advisory target",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    intent = detect_intent(input_str, list(data[\"categories\"].keys()))\n",
        "    command_names = {\n"
        "        command[\"name\"].lstrip(\"/\").casefold()\n"
        "        for commands in data[\"commands\"].values()\n"
        "        for command in commands\n"
        "    }\n"
        "    normalized_input = input_str.lstrip(\"/\").casefold()\n"
        "    intent = (\n"
        "        \"command\"\n"
        "        if target == \"omp\" and normalized_input in command_names\n"
        "        else detect_intent(input_str, list(data[\"categories\"].keys()))\n"
        "    )\n",
        "ev-help mapped exact lookup",
    )
    return rendered


def _render_omp_scanner_source(value: str) -> str:
    rendered = _replace_required_script_marker(
        value,
        "import re\n",
        "import re\nimport json\nimport sys\n",
        "scan_commands JSON import",
    )
    loader_marker = "def scan_commands(base_path: Path) -> List[Dict]:\n"
    rendered = _replace_required_script_marker(
        rendered,
        loader_marker,
        _OMP_COMMAND_MAP_LOADER.strip("\n") + "\n\n" + loader_marker,
        "scan_commands map loader",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "def scan_commands(base_path: Path) -> List[Dict]:\n",
        "def scan_commands(base_path: Path, command_map: Dict[str, Dict]) -> List[Dict]:\n",
        "scan_commands signature",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    commands = []\n\n    for cmd_file in sorted(base_path.rglob('*.md')):\n",
        "    commands = []\n    mapped_targets = set()\n\n    for cmd_file in sorted(base_path.rglob('*.md')):\n",
        "scan_commands state",
    )
    path_block = """        # Build command name from path
        parts = list(rel_path.parts[:-1]) + [rel_path.stem]
        command_name = '/ck:' + ':'.join(parts)
"""
    mapped_path_block = """        record = command_map.get(rel_path.as_posix())
        if record is None:
            raise RuntimeError(f"OMP command map has no record for {rel_path.as_posix()}")
        mapped_targets.add(rel_path.as_posix())
        command_name = '/' + record['targetName']
        source_parts = record['sourceName'].split(':')
        category = source_parts[0] if len(source_parts) > 1 else 'core'
"""
    rendered = _replace_required_script_marker(
        rendered,
        path_block,
        mapped_path_block,
        "scan_commands mapped path",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "                'category': parts[0] if len(parts) > 1 else 'core'\n",
        "                'category': category\n",
        "scan_commands mapped category",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    return commands\n",
        "    if mapped_targets != set(command_map):\n"
        "        raise RuntimeError('OMP command map does not match discovered commands')\n\n"
        "    return commands\n",
        "scan_commands mapped inventory",
    )
    rendered = _replace_required_script_marker(
        rendered,
        "    if not base_path.exists():\n        print(f\"Error: {base_path} not found\")\n        return\n",
        "    if base_path.is_symlink() or not base_path.is_dir():\n"
        "        print(f\"Error: {base_path} not found\", file=sys.stderr)\n"
        "        raise SystemExit(1)\n",
        "scan_commands base path",
    )
    return _replace_required_script_marker(
        rendered,
        "    commands = scan_commands(base_path)\n",
        "    try:\n"
        "        command_map = _load_omp_command_map(base_path)\n"
        "        commands = scan_commands(base_path, command_map)\n"
        "    except RuntimeError as error:\n"
        "        print(f\"Error: {error}\", file=sys.stderr)\n"
        "        raise SystemExit(1)\n",
        "scan_commands map dispatch",
    )


def _render_omp_command_catalog(value: str, command_map: dict[str, dict[str, str]]) -> str:
    try:
        records = yaml.safe_load(value)
    except yaml.YAMLError as error:
        raise ResourceError("Canonical command catalog is invalid YAML") from error
    if not isinstance(records, list):
        raise ResourceError("Canonical command catalog must be a list")

    by_source = {
        (item["source"], item["sourceName"]): item
        for item in command_map.values()
    }
    transformed = []
    seen = set()
    for record in records:
        if not isinstance(record, dict):
            raise ResourceError("Canonical command catalog contains an invalid record")
        source = record.get("path")
        name = record.get("name")
        if (
            not isinstance(source, str)
            or not isinstance(name, str)
            or not name.startswith("/evcrate:")
        ):
            raise ResourceError("Canonical command catalog record has no exact source identity")
        source_name = name.removeprefix("/evcrate:")
        item = by_source.get((source, source_name))
        if item is None or (source, source_name) in seen:
            raise ResourceError("Canonical command catalog has an unmatched or duplicate command")
        mapped = dict(record)
        mapped["name"] = "/" + item["targetName"]
        mapped["path"] = item["target"]
        transformed.append(mapped)
        seen.add((source, source_name))
    return yaml.safe_dump(
        transformed,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )


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


def _translate_hook_source(
    value: str,
    command_map: dict[str, dict[str, str]],
) -> str:
    """Translate runtime paths and command references for OMP."""

    rendered = render_command_references(
        render_harness_script_references(value, "omp"),
        command_map,
    )
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

def _translate_script_source(
    value: str,
    relative: Path,
    command_map: dict[str, dict[str, str]],
) -> str:
    """Translate helper scripts and catalogs for the generated OMP target."""

    rendered = render_harness_script_references(value, "omp")
    if relative.as_posix() == "commands_data.yaml":
        return _render_omp_command_catalog(rendered, command_map)

    rendered = render_command_references(rendered, command_map)
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
    if relative.as_posix() == "ev-help.py":
        rendered = _render_omp_help_source(rendered)
    elif relative.as_posix() == "scan_commands.py":
        rendered = _render_omp_scanner_source(rendered)
    return rendered


def _copy_support_file(source: Path, output: Path, relative: str, transform) -> None:
    if source.is_symlink() or not source.is_file():
        raise ResourceError(f"Canonical support file is missing or unsafe: {source}")
    copy_file(source, output / "evcrate" / "source-metadata" / relative, output, transform)


def convert_hooks_and_scripts(
    source: Path,
    output: Path,
    command_map: dict[str, dict[str, str]],
) -> dict[str, object]:
    """Copy non-native closures and generate OMP hook factories."""

    hook_source = source / "hooks"
    script_source = source / "scripts"
    hook_destination = output / "evcrate" / "hooks"
    script_destination = output / "evcrate" / "scripts"
    copied_hooks: list[str] = []
    for source_file in production_files(hook_source):
        relative = relative_path(hook_source, source_file)
        copy_file(
            source_file,
            hook_destination / relative,
            output,
            lambda value: _translate_hook_source(value, command_map),
        )
        copied_hooks.append(relative.as_posix())

    copied_scripts: list[str] = []
    for source_file in production_files(script_source):
        relative = relative_path(script_source, source_file)
        if "advise-state" in relative.name:
            continue
        copy_file(
            source_file,
            script_destination / relative,
            output,
            lambda value, relative=relative: _translate_script_source(value, relative, command_map),
        )
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
            _copy_support_file(
                support,
                output,
                relative,
                lambda value: render_command_references(
                    render_harness_script_references(value, "omp"),
                    command_map,
                ),
            )
    for statusline in sorted(source.glob("statusline.*")):
        if statusline.is_file() and not statusline.is_symlink():
            _copy_support_file(
                statusline,
                output,
                f"statusline/{statusline.name}",
                lambda value: render_command_references(
                    render_harness_script_references(value, "omp"),
                    command_map,
                ),
            )

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
