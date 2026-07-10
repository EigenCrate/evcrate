#!/usr/bin/env python3
"""Migrate Claude Code devkit files to Codex CLI conventions."""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Any


CLAUDE_DIR = Path(".claude")
CODEX_DIR = Path(os.environ.get("CODEX_OUTPUT_DIR", ".codex"))
AGENTS_DIR = Path(os.environ.get("AGENTS_OUTPUT_DIR", ".agents"))
PROJECT_DOCS_DIR = Path(os.environ.get("PROJECT_DOCS_OUTPUT_DIR", "."))

import sys
# Command-line parameter support to generate local or global config baselines
for arg in sys.argv[1:]:
    if arg.lower() in ("--global", "global"):
        CODEX_DIR = Path.home() / ".codex"
        AGENTS_DIR = Path.home() / ".agents"
    elif arg.lower() in ("--local", "local"):
        CODEX_DIR = Path(".codex")
        AGENTS_DIR = Path(".agents")

SKILLS_TO_SKIP = {"claude-code", "skill-creator"}
MCP_SERVERS_TO_SKIP = {"human-mcp"}
CODEX_FALLBACK_DOCS = ["CLAUDE.md", "GEMINI.md"]
CODEX_UNSUPPORTED_EVENTS = {
    "SubagentStart": "No Codex hook targets subagent startup; behavior is intentionally dropped.",
    "PreCompact": "No clean Codex analog for Claude PreCompact; behavior is intentionally dropped.",
    "SessionEnd": "Codex exposes no SessionEnd hook in the documented hook set; cleanup is intentionally omitted.",
}

TEXT_BINARY_EXTS = {
    ".coverage",
    ".dll",
    ".dylib",
    ".exe",
    ".gif",
    ".gz",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".pyc",
    ".pyo",
    ".so",
    ".tar",
    ".zip",
}

REPLACEMENTS = {
    r"\.claude/skills": ".agents/skills",
    r"\.claude": ".codex",
    r"\bClaude Code\b": "Codex CLI",
    r"\bclaude-code\b": "codex-cli",
    r"\bClaude\b": "Codex",
    r"\bclaude\b": "codex",
    r"\bAnthropic\b": "OpenAI",
    r"\banthropic\b": "openai",
    r"\bCLAUDE\.md\b": "AGENTS.md",
    r"\bCLAUDE_PROJECT_DIR\b": "CODEX_PROJECT_DIR",
    r"\bCLAUDE_COMMAND\b": "CODEX_COMMAND",
    r"\bANTHROPIC_API_KEY\b": "OPENAI_API_KEY",
    r"\$ARGUMENTS": "{{args}}",
    r"\bTask tool\b": "subagent workflow",
    r"\bTask\(subagent_type=": "Ask Codex to spawn a subagent with type=",
    r"\bAskUserQuestion tool\b": "request_user_input tool",
    r"\bAskUserQuestion\b": "request_user_input",
    r"\bSlashCommands\b": "Codex slash commands",
    r"\bSlashCommand\b": "Codex slash command",
    r"\bCustom Commands\b": "Codex slash commands",
    r"\bTodoWrite\b": "update_plan",
}

MODEL_MAP = {
    # Restore 3-tier model delegation from the .claude baseline:
    #   opus   → gpt-5.5 / high      (heavy reasoning: planner)
    #   sonnet → gpt-5.4 / high      (capable coding: reviewer, debugger, …)
    #   haiku  → gpt-5.4-mini / low  (light/parallel: tester, researcher, …)
    # inherit / "" get explicit pins so every agent is deterministically pinned
    # (Q4): inherit → gpt-5.4 / medium (ui-ux-designer); "" → gpt-5.5 / high
    # (brainstormer, missing model field). gpt-5.3-codex-spark is intentionally
    # excluded (Pro-only preview) and must never be a default tier.
    "opus": ("gpt-5.5", "high"),
    "sonnet": ("gpt-5.4", "high"),
    "haiku": ("gpt-5.4-mini", "low"),
    "inherit": ("gpt-5.4", "medium"),
    "": ("gpt-5.5", "high"),
}

COMMAND_TOKEN_RE = re.compile(r"/[A-Za-z0-9_-]+(?:[:/][A-Za-z0-9_-]+)*")


def apply_replacements(text: str) -> str:
    for pattern, replacement in REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = text.replace(".Codex", ".codex")
    text = re.sub(r"codexkit", "codexkit", text, flags=re.IGNORECASE)
    return text


def collect_migrated_command_paths() -> set[str]:
    commands_dir = CLAUDE_DIR / "commands"
    if not commands_dir.exists():
        return set()
    command_paths: set[str] = set()
    for path in commands_dir.rglob("*.md"):
        rel_command = str(path.relative_to(commands_dir).with_suffix("")).replace(os.sep, "/")
        command_paths.add("/" + rel_command)
        frontmatter, _ = parse_markdown_with_frontmatter(path)
        explicit_name = str(frontmatter.get("name") or "").strip()
        if explicit_name.startswith("/"):
            command_paths.add(explicit_name)
    return command_paths


def canonicalize_command_tokens(text: str, known_commands: set[str]) -> str:
    if not known_commands:
        return text

    def repl(match: re.Match[str]) -> str:
        token = match.group(0)
        canonical = "/" + token[1:].replace(":", "/")
        return canonical if canonical in known_commands else token

    return COMMAND_TOKEN_RE.sub(repl, text)


def rewrite_command_execution_guidance(text: str, known_commands: set[str]) -> str:
    text = canonicalize_command_tokens(text, known_commands)
    replacements = [
        (
            r"(?im)^(\s*(?:[-*]|\d+\.)\s*)Trigger slash command (`/[^`]+`)(.*)$",
            r"\1Use the matching `cmd_*` skill to run \2\3",
        ),
        (
            r"(?im)^(\s*(?:[-*]|\d+\.)\s*)Trigger (`/[^`]+`)(.*)$",
            r"\1Use the matching `cmd_*` skill to run \2\3",
        ),
        (
            r"(?im)(:\s*)Trigger slash command (`/[^`]+`)(.*)$",
            r"\1Use the matching `cmd_*` skill to run \2\3",
        ),
        (
            r"(?im)(:\s*)Trigger (`/[^`]+`)(.*)$",
            r"\1Use the matching `cmd_*` skill to run \2\3",
        ),
        (
            r"(?im)^(\s*(?:[-*]|\d+\.)\s*)Execute Codex slash command:\s*(.*)$",
            r"\1Use the matching `cmd_*` skill to run \2",
        ),
        (
            r"(?im)(:\s*)Execute (`/[^`]+`)(?: Codex slash command)?",
            r"\1use the matching `cmd_*` skill to run \2",
        ),
        (
            r"(?im)\btrigger (`/[^`]+`) slash command\b",
            r"use the matching `cmd_*` skill to run \1",
        ),
        (
            r"(?im)Use (`/[^`]+`) Codex slash command to",
            r"Use the matching `cmd_*` skill to run \1 to",
        ),
        (
            r"(?im)Use (`/[^`]+`) Slash Command to",
            r"Use the matching `cmd_*` skill to run \1 to",
        ),
        (
            r"(?im)(→\s*)(`/[^`]+`)",
            r"\1Use the matching `cmd_*` skill to run \2",
        ),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)
    return text


def is_text_file(path: Path) -> bool:
    if path.suffix.lower() in TEXT_BINARY_EXTS:
        return False
    try:
        return b"\0" not in path.read_bytes()[:1024]
    except OSError:
        return False


def clean_destination() -> None:
    def clear_path(path: Path) -> None:
        if not path.exists():
            return
        if path.is_symlink() or path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
            return
        for child in path.iterdir():
            if child.is_dir() and not child.is_symlink():
                # ignore_errors: FUSE/overlay filesystems may leave transient
                # .fuse_hidden* files that block the final directory removal.
                shutil.rmtree(child, ignore_errors=True)
            else:
                try:
                    child.unlink()
                except OSError:
                    pass

    for path in [
        CODEX_DIR / "agents",
        CODEX_DIR / "bin",
        CODEX_DIR / "hooks",
        CODEX_DIR / "workflows",
        AGENTS_DIR / "skills",
    ]:
        clear_path(path)
    hooks_json = CODEX_DIR / "hooks.json"
    if hooks_json.exists():
        hooks_json.unlink()
    matrix_file = CODEX_DIR / "migration-behavior-matrix.json"
    if matrix_file.exists():
        matrix_file.unlink()
    CODEX_DIR.mkdir(parents=True, exist_ok=True)
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)


def parse_markdown_with_frontmatter(path: Path) -> tuple[dict[str, Any], str]:
    content = path.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if not match:
        return {}, content

    frontmatter: dict[str, Any] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        value = raw_value.strip()
        if value.startswith("[") and value.endswith("]"):
            frontmatter[key.strip()] = [
                item.strip().strip("\"'")
                for item in value.strip("[]").split(",")
                if item.strip()
            ]
        else:
            frontmatter[key.strip()] = value.strip("\"'")
    return frontmatter, match.group(2)


def markdown_frontmatter(metadata: dict[str, Any]) -> str:
    lines = ["---"]
    for key, value in metadata.items():
        if value in (None, "", []):
            continue
        if isinstance(value, list):
            rendered = ", ".join(json.dumps(str(item), ensure_ascii=False) for item in value)
            lines.append(f"{key}: [{rendered}]")
        else:
            lines.append(f"{key}: {json.dumps(str(value), ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines)


def first_paragraph(text: str) -> str:
    for block in re.split(r"\n\s*\n", text.strip()):
        cleaned = re.sub(r"\s+", " ", block).strip()
        if cleaned and not cleaned.startswith("#"):
            return cleaned
    return ""


def normalize_skill_file(path: Path, fallback_name: str) -> None:
    frontmatter, body = parse_markdown_with_frontmatter(path)
    name = str(frontmatter.get("name") or fallback_name)
    description = str(frontmatter.get("description") or first_paragraph(body) or f"Use the {name} skill.")
    description = re.sub(r"\s+", " ", description).strip()
    if len(description) > 1024:
        description = description[:1021].rstrip() + "..."

    normalized = {
        **frontmatter,
        "name": name,
        "description": description,
    }
    path.write_text(f"{markdown_frontmatter(normalized)}\n\n{body.lstrip()}", encoding="utf-8")


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_toml_value(lines: list[str], key: str, value: Any) -> None:
    if not key.startswith("#") and not re.match(r"^[A-Za-z0-9_-]+$", key):
        key = json.dumps(key, ensure_ascii=False)
    if isinstance(value, str):
        lines.append(f"{key} = {toml_string(value)}")
    elif isinstance(value, bool):
        lines.append(f"{key} = {str(value).lower()}")
    else:
        lines.append(f"{key} = {json.dumps(value, ensure_ascii=False)}")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def build_hook_behavior_entries() -> list[dict[str, Any]]:
    settings = read_json(CLAUDE_DIR / "settings.json")
    hook_event_map = {
        "SessionStart": "SessionStart",
        "UserPromptSubmit": "UserPromptSubmit",
        "PreToolUse": "PreToolUse",
    }
    entries: list[dict[str, Any]] = []
    for event_name, matcher_groups in settings.get("hooks", {}).items():
        mapped_event = hook_event_map.get(event_name)
        for matcher_group in matcher_groups:
            for hook in matcher_group.get("hooks", []):
                entry: dict[str, Any] = {
                    "kind": "hook-driven",
                    "source_event": event_name,
                    "source_matcher": matcher_group.get("matcher", "*"),
                    "source_command": hook.get("command", ""),
                }
                if mapped_event:
                    entry.update({
                        "classification": "hook-driven",
                        "status": "migrated",
                        "target_event": mapped_event,
                    })
                    if event_name == "PreToolUse":
                        entry["target_followups"] = ["PermissionRequest"]
                else:
                    entry.update({
                        "classification": "unsupported",
                        "status": "dropped",
                        "reason": CODEX_UNSUPPORTED_EVENTS.get(
                            event_name,
                            "No Codex hook mapping was defined for this Claude event.",
                        ),
                    })
                entries.append(entry)
    return entries


def write_behavior_matrix() -> None:
    entries: list[dict[str, Any]] = [{
        "kind": "memory-file",
        "source": "CLAUDE.md",
        "classification": "memory-file",
        "status": "materialized-copy" if Path("CLAUDE.md").exists() else "not-present",
        "target": "AGENTS.md" if Path("CLAUDE.md").exists() else None,
    }]

    commands_dir = CLAUDE_DIR / "commands"
    if commands_dir.exists():
        for source in sorted(commands_dir.rglob("*.md")):
            rel = source.relative_to(commands_dir).with_suffix("")
            skill_dir_name = "cmd_" + str(rel).replace(os.sep, "_")
            entries.append({
                "kind": "command-prose",
                "source": str(source.relative_to(commands_dir)).replace("\\", "/"),
                "classification": "command-prose",
                "status": "migrated",
                "target": f".agents/skills/{skill_dir_name}/SKILL.md",
            })
    entries.extend(build_hook_behavior_entries())
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "target": "codex",
        "project_doc_fallback_filenames": CODEX_FALLBACK_DOCS,
        "unsupported_events": CODEX_UNSUPPORTED_EVENTS,
        "behaviors": entries,
    }
    (CODEX_DIR / "migration-behavior-matrix.json").write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8",
    )


def migrate_agents() -> None:
    src_dir = CLAUDE_DIR / "agents"
    dest_dir = CODEX_DIR / "agents"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists():
        return
    known_commands = collect_migrated_command_paths()

    for source in sorted(src_dir.glob("*.md")):
        frontmatter, body = parse_markdown_with_frontmatter(source)
        name = apply_replacements(str(frontmatter.get("name") or source.stem))
        description = rewrite_command_execution_guidance(
            apply_replacements(
                str(frontmatter.get("description") or f"Specialized Codex subagent for {name}.")
            ),
            known_commands,
        )
        body = rewrite_command_execution_guidance(apply_replacements(body), known_commands)

        lines: list[str] = []
        write_toml_value(lines, "name", name)
        write_toml_value(lines, "description", description)
        write_toml_value(lines, "developer_instructions", body.strip())

        raw_model = str(frontmatter.get("model", "")).lower()
        if raw_model in MODEL_MAP:
            model, effort = MODEL_MAP[raw_model]
            write_toml_value(lines, "model", model)
            write_toml_value(lines, "model_reasoning_effort", effort)

        if "tools" in frontmatter:
            lines.append("")
            lines.append("# Claude Code tool allowlists do not map directly to Codex custom agents.")
            write_toml_value(lines, "# migrated_claude_tools", str(frontmatter["tools"]))

        (dest_dir / f"{source.stem}.toml").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Migrated agent: {source.name} -> {source.stem}.toml")


def migrate_workflows() -> None:
    workflow_dir = CLAUDE_DIR / "workflows"
    dest_workflows = CODEX_DIR / "workflows"
    dest_workflows.mkdir(parents=True, exist_ok=True)
    known_commands = collect_migrated_command_paths()

    if workflow_dir.exists():
        for source in sorted(workflow_dir.glob("*.md")):
            content = rewrite_command_execution_guidance(
                apply_replacements(source.read_text(encoding="utf-8")),
                known_commands,
            )
            (dest_workflows / source.name).write_text(content, encoding="utf-8")
            print(f"Migrated workflow: {source.name}")


def write_project_agents_md() -> None:
    claude_md = Path("CLAUDE.md")
    if not claude_md.exists():
        return
    target = PROJECT_DOCS_DIR / "AGENTS.md"
    target.write_text(apply_replacements(claude_md.read_text(encoding="utf-8")), encoding="utf-8")
    print(f"Generated project AGENTS.md: {target}")


def migrate_skills() -> None:
    src_dir = CLAUDE_DIR / "skills"
    dest_root = AGENTS_DIR / "skills"
    dest_root.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists():
        return
    known_commands = collect_migrated_command_paths()

    for source in sorted(src_dir.iterdir()):
        if not source.is_dir():
            continue
        if source.name in SKILLS_TO_SKIP:
            print(f"Skipped vendor skill: {source.name}")
            continue
        target_name = re.sub("claude", "codex", source.name, flags=re.IGNORECASE)
        dest = dest_root / target_name
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(source, dest, dirs_exist_ok=True)

        for path in sorted(dest.rglob("*")):
            if not path.is_file():
                continue
            if path.name.lower() == "skill.md" and path.name != "SKILL.md":
                new_path = path.with_name("SKILL.md")
                path.rename(new_path)
                path = new_path
            if is_text_file(path):
                content = path.read_text(encoding="utf-8", errors="ignore")
                path.write_text(
                    rewrite_command_execution_guidance(apply_replacements(content), known_commands),
                    encoding="utf-8",
                )
            if path.name == "SKILL.md":
                normalize_skill_file(path, dest.name)
        print(f"Migrated skill: {source.name} -> {target_name}")


def migrate_commands_as_native_skills() -> None:
    src_dir = CLAUDE_DIR / "commands"
    dest_dir = AGENTS_DIR / "skills"
    if not src_dir.exists():
        return

    known_commands = collect_migrated_command_paths()
    dest_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for source in sorted(src_dir.rglob("*.md")):
        rel_path = source.relative_to(src_dir).with_suffix("")
        cmd_name = str(rel_path).replace("\\", "/")

        frontmatter, body = parse_markdown_with_frontmatter(source)
        command_path = str(frontmatter.get("name") or f"/{cmd_name}").strip()
        desc = apply_replacements(str(frontmatter.get("description", "Migrated command from .claude")).strip())
        body = rewrite_command_execution_guidance(apply_replacements(body), known_commands).strip()

        skill_dir_name = "cmd_" + str(rel_path).replace("\\", "_").replace("/", "_")
        skill_dir = dest_dir / skill_dir_name
        if skill_dir.exists():
            shutil.rmtree(skill_dir, ignore_errors=True)
        skill_dir.mkdir(parents=True, exist_ok=True)

        content = (
            f"---\nname: {skill_dir_name}\ndescription: {desc}\n---\n"
            f"# {skill_dir_name}\n\n"
            f"Command Path: {command_path}\n\n"
            f"Description: {desc}\n\n"
            "Codex note: when this recipe says to run another `/...` command, "
            "invoke the matching `cmd_*` skill for that path.\n\n"
            f"{body}\n"
        )
        (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")
        count += 1
    print(f"Migrated {count} native skills for commands")


def create_context_bridge(
    project_env_var: str,
    hook_event_name: str,
    source_rel_path: str,
    guidance_rel_path: str | None = None,
) -> str:
    return """#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const {{ spawnSync }} = require('child_process');

const input = fs.readFileSync(0, 'utf-8');
{guidance_bootstrap}

function resolveHookSource() {{
  const candidates = [];
  if (process.env.{project_env_var}) candidates.push(process.env.{project_env_var});
  candidates.push(process.cwd());

  for (const start of candidates) {{
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {{
      const probe = path.join(current, {source_rel_path_json});
      if (fs.existsSync(probe)) return {{ projectDir: current, sourceHook: probe }};
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }}
  }}

  const homeHook = path.join(os.homedir(), {source_rel_path_json});
  if (fs.existsSync(homeHook)) {{
    return {{ projectDir: process.env.{project_env_var} || process.cwd(), sourceHook: homeHook }};
  }}

  return {{
    projectDir: process.env.{project_env_var} || process.cwd(),
    sourceHook: path.join(process.cwd(), {source_rel_path_json}),
  }};
}}

const {{ projectDir, sourceHook }} = resolveHookSource();
const result = spawnSync(process.execPath, [sourceHook], {{
  input,
  encoding: 'utf-8',
  env: {{
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CODEX_PROJECT_DIR: projectDir,
  }},
}});

const additionalContext = [(result.stdout || '').trim(){guidance_suffix}]
  .filter(Boolean)
  .join('\\n\\n');
if (!additionalContext) {{
  process.stdout.write(JSON.stringify({{}}));
  process.exit(0);
}}

process.stdout.write(JSON.stringify({{
  hookSpecificOutput: {{
    hookEventName: {hook_event_name_json},
    additionalContext,
  }},
}}));
""".format(
        project_env_var=project_env_var,
        source_rel_path_json=json.dumps(source_rel_path),
        guidance_bootstrap=(
            "const scriptDir = path.dirname(__filename);\n\n"
            "function readManagedGuidance() {\n"
            f"  const guidancePath = path.join(scriptDir, {json.dumps(guidance_rel_path)});\n"
            "  if (!fs.existsSync(guidancePath)) return '';\n"
            "  return fs.readFileSync(guidancePath, 'utf-8').trim();\n"
            "}"
            if guidance_rel_path
            else ""
        ),
        guidance_suffix=", readManagedGuidance()" if guidance_rel_path else "",
        hook_event_name_json=json.dumps(hook_event_name),
    )


def create_pretool_bridge(project_env_var: str, source_rel_path: str) -> str:
    return """#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const {{ spawnSync }} = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

function resolveHookSource() {{
  const candidates = [];
  if (process.env.{project_env_var}) candidates.push(process.env.{project_env_var});
  candidates.push(process.cwd());

  for (const start of candidates) {{
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {{
      const probe = path.join(current, {source_rel_path_json});
      if (fs.existsSync(probe)) return {{ projectDir: current, sourceHook: probe }};
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }}
  }}

  const homeHook = path.join(os.homedir(), {source_rel_path_json});
  if (fs.existsSync(homeHook)) {{
    return {{ projectDir: process.env.{project_env_var} || process.cwd(), sourceHook: homeHook }};
  }}

  return {{
    projectDir: process.env.{project_env_var} || process.cwd(),
    sourceHook: path.join(process.cwd(), {source_rel_path_json}),
  }};
}}

const {{ projectDir, sourceHook }} = resolveHookSource();
const result = spawnSync(process.execPath, [sourceHook], {{
  input,
  encoding: 'utf-8',
  env: {{
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    CODEX_PROJECT_DIR: projectDir,
  }},
}});

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 2) {{
  process.stdout.write(JSON.stringify({{
    hookSpecificOutput: {{
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason || 'Blocked by migrated Claude hook.',
    }},
  }}));
}} else {{
  process.stdout.write(JSON.stringify({{}}));
}}
""".format(
        project_env_var=project_env_var,
        source_rel_path_json=json.dumps(source_rel_path),
    )


def create_permission_request_hook() -> str:
    return """#!/usr/bin/env node
const fs = require('fs');

const input = JSON.parse(fs.readFileSync(0, 'utf-8') || '{}');
const command = String(input.tool_input?.command || '');
const dangerous = /(\\brm\\s+-rf\\b|\\bgit\\s+reset\\s+--hard\\b|\\bmkfs\\b|\\bdd\\s+if=\\/dev\\/zero\\b|:\\s*>\\s*[^\\s]+)/i;

if (!dangerous.test(command)) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest',
    decision: {
      behavior: 'deny',
      message: 'Destructive shell command requires an explicit user-directed workflow review.'
    }
  }
}));
"""


def create_run_node_hook_script() -> str:
    return """#!/usr/bin/env sh
set -eu

script_path="${1:?missing hook script path}"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
runtime_env="${CODEX_RUNTIME_ENV:-$script_dir/../runtime.env}"

if [ -r "$runtime_env" ]; then
  # shellcheck disable=SC1090
  . "$runtime_env"
fi

resolve_executable() {
  for candidate in "$@"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\\n' "$candidate"
      return 0
    fi
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

if node_bin="$(resolve_executable \
  "${CODEX_NODE_BIN:-}" \
  node \
  nodejs \
  /usr/local/bin/node \
  /usr/bin/node \
  "$HOME/.volta/bin/node" \
  "$HOME/.local/bin/node"
)"; then
  "$node_bin" "$script_path"
else
  printf '{}'
  exit 0
fi
"""


def create_run_mcp_package_script() -> str:
    return """#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
runtime_env="${CODEX_RUNTIME_ENV:-$script_dir/../runtime.env}"

if [ -r "$runtime_env" ]; then
  # shellcheck disable=SC1090
  . "$runtime_env"
fi

resolve_executable() {
  for candidate in "$@"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\\n' "$candidate"
      return 0
    fi
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes)
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

package="${1:-}"
if [ -z "$package" ]; then
  echo "Missing MCP package spec." >&2
  exit 64
fi
shift

if launcher="$(resolve_executable "${CODEX_NPX_BIN:-}" npx)"; then
  exec "$launcher" -y "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_PNPM_BIN:-}" pnpm)"; then
  exec "$launcher" dlx "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_BUNX_BIN:-}" bunx)"; then
  exec "$launcher" "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_YARN_BIN:-}" yarn)"; then
  exec "$launcher" dlx "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_COREPACK_BIN:-}" corepack)"; then
  exec "$launcher" pnpm dlx "$package" "$@"
fi

echo "No supported package runner found for MCP package: $package" >&2
exit 127
"""


def write_codex_global_guidance() -> None:
    lines = [
        "## Podman Docker Guidance",
        "",
        "- On Fedora hosts, treat `podman` with `podman-docker` as sufficient for Docker-compatible checks. Do not require Docker Engine if `docker info`, `docker build`, and `docker run` work.",
        "- Before concluding Docker is unavailable, ensure `XDG_RUNTIME_DIR=/run/user/$(id -u)` is exported in the shell running Codex.",
        "- If needed, start the user socket with `systemctl --user start podman.socket` and prefer keeping it enabled for future sessions.",
        "- When validating container availability, run both `docker info` and a real smoke check such as `docker run --rm hello-world` or a minimal `docker build`.",
        "- If `docker` resolves to the Podman compatibility CLI, that is acceptable. The common failure mode is missing runtime environment, not missing Docker Engine.",
    ]
    (CODEX_DIR / "global-guidance.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Generated Codex global guidance: {CODEX_DIR / 'global-guidance.md'}")


def write_codex_hooks() -> None:
    hooks_dir = CODEX_DIR / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    bin_dir = CODEX_DIR / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    hook_files = {
        "session-start.cjs": create_context_bridge(
            "CODEX_PROJECT_DIR",
            "SessionStart",
            ".claude/hooks/session-init.cjs",
            "../global-guidance.md",
        ),
        "user-prompt-submit.cjs": create_context_bridge("CODEX_PROJECT_DIR", "UserPromptSubmit", ".claude/hooks/dev-rules-reminder.cjs"),
        "pretool-scout-block.cjs": create_pretool_bridge("CODEX_PROJECT_DIR", ".claude/hooks/scout-block.cjs"),
        "pretool-privacy-block.cjs": create_pretool_bridge("CODEX_PROJECT_DIR", ".claude/hooks/privacy-block.cjs"),
        "permission-request.cjs": create_permission_request_hook(),
        "run-node-hook.sh": create_run_node_hook_script(),
    }
    for name, content in hook_files.items():
        (hooks_dir / name).write_text(content, encoding="utf-8")
    (bin_dir / "run-mcp-package.sh").write_text(create_run_mcp_package_script(), encoding="utf-8")

    hooks_json = {
        "hooks": {
            "SessionStart": [{
                "matcher": "*",
                "hooks": [{
                    "type": "command",
                    "command": "sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/run-node-hook.sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/session-start.cjs",
                }],
            }],
            "UserPromptSubmit": [{
                "hooks": [{
                    "type": "command",
                    "command": "sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/run-node-hook.sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/user-prompt-submit.cjs",
                }],
            }],
            "PreToolUse": [{
                "matcher": "Bash|Read|Edit|Write|apply_patch|mcp__.*|run_command|grep_search|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file",
                "hooks": [
                    {
                        "type": "command",
                        "command": "sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/run-node-hook.sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/pretool-scout-block.cjs",
                    },
                    {
                        "type": "command",
                        "command": "sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/run-node-hook.sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/pretool-privacy-block.cjs",
                    },
                ],
            }],
            "PermissionRequest": [{
                "matcher": "Bash|run_command",
                "hooks": [{
                    "type": "command",
                    "command": "sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/run-node-hook.sh \"$CODEX_PROJECT_DIR\"/.codex/hooks/permission-request.cjs",
                }],
            }],
        }
    }
    (CODEX_DIR / "hooks.json").write_text(json.dumps(hooks_json, indent=2), encoding="utf-8")
    print(f"Generated Codex hooks: {CODEX_DIR / 'hooks.json'}")


def migrate_mcp_and_config() -> None:
    lines = [
        '# Generated from ".claude" by migrate_claude_to_codex.py',
        "# Parent/main session runs on the strongest model (gpt-5.5) at medium",
        "# reasoning effort; subagents are pinned to cheaper tiers via MODEL_MAP.",
        'model = "gpt-5.5"',
        'model_reasoning_effort = "medium"',
        'plan_mode_reasoning_effort = "medium"',
        'approval_policy = "on-request"',
        'sandbox_mode = "workspace-write"',
        'personality = "pragmatic"',
        "tool_output_token_limit = 8192",
        "",
        "project_doc_fallback_filenames = [\"CLAUDE.md\", \"GEMINI.md\"]",
        "",
        "[agents]",
        "# Keep fan-out bounded; subagents each run their own model/tool loop.",
        "max_threads = 4",
        "max_depth = 1",
        "",
        "[features]",
        "hooks = true",
        "",
    ]

    # Intentionally do not migrate MCP servers from .claude.
    # Codex keeps its own MCP config and should not inherit Claude's servers.

    (CODEX_DIR / "config.toml").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Generated Codex config: {CODEX_DIR / 'config.toml'}")


def main() -> None:
    if not CLAUDE_DIR.exists():
        raise SystemExit("Error: .claude directory not found")
    clean_destination()
    migrate_workflows()
    write_project_agents_md()
    migrate_agents()
    migrate_skills()
    migrate_commands_as_native_skills()
    write_codex_global_guidance()
    write_codex_hooks()
    migrate_mcp_and_config()
    write_behavior_matrix()
    print("\nCodex migration complete.")


if __name__ == "__main__":
    main()
