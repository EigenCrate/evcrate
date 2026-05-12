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
SKILLS_TO_SKIP = {"claude-code", "skill-creator"}
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
    r"\bAskUserQuestion tool\b": "ask the user directly",
    r"\bAskUserQuestion\b": "user input prompt",
    r"\bSlashCommands\b": "Codex slash commands",
    r"\bSlashCommand\b": "Codex slash command",
    r"\bCustom Commands\b": "Codex slash commands",
    r"\bTodoWrite\b": "update_plan",
}

MODEL_MAP = {
    # Keep migrated subagents close to Claude Code's token-conscious model tiers.
    # Nano is cheapest and still supports shell/apply-patch/skills/MCP; mini is
    # the default subagent-capable coding model for more involved work.
    "opus": ("gpt-5.4-mini", "medium"),
    "sonnet": ("gpt-5.4-mini", "low"),
    "haiku": ("gpt-5.4-nano", "low"),
}


def apply_replacements(text: str) -> str:
    for pattern, replacement in REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = text.replace(".Codex", ".codex")
    text = re.sub(r"codexkit", "codexkit", text, flags=re.IGNORECASE)
    return text


def is_text_file(path: Path) -> bool:
    if path.suffix.lower() in TEXT_BINARY_EXTS:
        return False
    try:
        return b"\0" not in path.read_bytes()[:1024]
    except OSError:
        return False


def clean_destination() -> None:
    for path in [
        CODEX_DIR / "agents",
        CODEX_DIR / "hooks",
        CODEX_DIR / "workflows",
        AGENTS_DIR / "skills",
    ]:
        if path.exists():
            shutil.rmtree(path)
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
            entries.append({
                "kind": "command-prose",
                "source": str(source.relative_to(commands_dir)).replace("\\", "/"),
                "classification": "command-prose",
                "status": "migrated",
                "target": f".agents/skills/claude-commands/references/commands/{str(source.relative_to(commands_dir)).replace(os.sep, '/')}",
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

    for source in sorted(src_dir.glob("*.md")):
        frontmatter, body = parse_markdown_with_frontmatter(source)
        name = apply_replacements(str(frontmatter.get("name") or source.stem))
        description = apply_replacements(
            str(frontmatter.get("description") or f"Specialized Codex subagent for {name}.")
        )
        body = apply_replacements(body)

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

    if workflow_dir.exists():
        for source in sorted(workflow_dir.glob("*.md")):
            content = apply_replacements(source.read_text(encoding="utf-8"))
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

    for source in sorted(src_dir.iterdir()):
        if not source.is_dir():
            continue
        if source.name in SKILLS_TO_SKIP:
            print(f"Skipped vendor skill: {source.name}")
            continue
        target_name = re.sub("claude", "codex", source.name, flags=re.IGNORECASE)
        dest = dest_root / target_name
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(source, dest)

        for path in sorted(dest.rglob("*")):
            if not path.is_file():
                continue
            if path.name.lower() == "skill.md" and path.name != "SKILL.md":
                new_path = path.with_name("SKILL.md")
                path.rename(new_path)
                path = new_path
            if is_text_file(path):
                content = path.read_text(encoding="utf-8", errors="ignore")
                path.write_text(apply_replacements(content), encoding="utf-8")
            if path.name == "SKILL.md":
                normalize_skill_file(path, dest.name)
        print(f"Migrated skill: {source.name} -> {target_name}")


def migrate_commands_as_skill() -> None:
    src_dir = CLAUDE_DIR / "commands"
    if not src_dir.exists():
        return

    skill_dir = AGENTS_DIR / "skills" / "claude-commands"
    references_dir = skill_dir / "references" / "commands"
    workflow_references_dir = skill_dir / "references" / "workflows"
    if skill_dir.exists():
        shutil.rmtree(skill_dir)
    references_dir.mkdir(parents=True, exist_ok=True)
    workflow_references_dir.mkdir(parents=True, exist_ok=True)

    workflow_dir = CLAUDE_DIR / "workflows"
    if workflow_dir.exists():
        for workflow in sorted(workflow_dir.glob("*.md")):
            workflow_references_dir.joinpath(workflow.name).write_text(
                apply_replacements(workflow.read_text(encoding="utf-8")),
                encoding="utf-8",
            )

    command_index: list[str] = []
    for source in sorted(src_dir.rglob("*.md")):
        rel = source.relative_to(src_dir)
        frontmatter, body = parse_markdown_with_frontmatter(source)
        description = apply_replacements(str(frontmatter.get("description", "")).strip())
        skill_body = apply_replacements(body).strip()
        command_name = "/" + str(rel.with_suffix("")).replace("\\", "/")
        command_index.append(f"- `{command_name}`: {description or 'Migrated Claude command'}")

        skill_dest = references_dir / rel
        skill_dest.parent.mkdir(parents=True, exist_ok=True)
        skill_dest.write_text(
            f"# {command_name}\n\nDescription: {description or 'Migrated Claude command'}\n\n{skill_body}\n",
            encoding="utf-8",
        )

    skill_md = [
        "---",
        "name: claude-commands",
        "description: Use when the user asks to run, inspect, or adapt a migrated Claude Code slash command such as /code, /plan, /fix, /test, /docs, /design, /git, /scout, /skill, /cook, or /bootstrap in Codex CLI.",
        "---",
        "",
        "# Claude Commands",
        "",
        "Use `references/commands/` as reusable prompt recipes for migrated Claude Code commands. Codex CLI 0.130.0 does not load custom slash commands from `.codex/commands`, so invoke these through this skill instead.",
        "",
        "When the user asks for a migrated command, or explicitly mentions this skill with a command name:",
        "1. Read `references/workflows/development-rules.md`, `references/workflows/orchestration-protocol.md`, `references/workflows/primary-workflow.md`, and `references/workflows/documentation-management.md` as the governing workflow context.",
        "2. Map the requested command path to `references/commands/<command>.md`.",
        "3. Read that command reference file.",
        "4. Substitute any user arguments for `{{args}}`.",
        "5. Execute the command as normal Codex instructions, following the workflow context and using the closest Codex capability for Claude-only tools.",
        "",
        "Invocation examples:",
        "- `$claude-commands run /plan implement authentication`",
        "- `$claude-commands /fix/test failing auth tests`",
        "- `Use claude-commands to run /docs/update`",
        "",
        "## Available Commands",
        "",
        *command_index,
        "",
    ]
    (skill_dir / "SKILL.md").write_text("\n".join(skill_md), encoding="utf-8")
    print(f"Migrated {len(command_index)} commands into skill: claude-commands")


def create_context_bridge(project_env_var: str, hook_event_name: str, source_rel_path: str) -> str:
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

const additionalContext = (result.stdout || '').trim();
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


def write_codex_hooks() -> None:
    hooks_dir = CODEX_DIR / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_files = {
        "session-start.cjs": create_context_bridge("CODEX_PROJECT_DIR", "SessionStart", ".claude/hooks/session-init.cjs"),
        "user-prompt-submit.cjs": create_context_bridge("CODEX_PROJECT_DIR", "UserPromptSubmit", ".claude/hooks/dev-rules-reminder.cjs"),
        "pretool-scout-block.cjs": create_pretool_bridge("CODEX_PROJECT_DIR", ".claude/hooks/scout-block.cjs"),
        "pretool-privacy-block.cjs": create_pretool_bridge("CODEX_PROJECT_DIR", ".claude/hooks/privacy-block.cjs"),
        "permission-request.cjs": create_permission_request_hook(),
    }
    for name, content in hook_files.items():
        (hooks_dir / name).write_text(content, encoding="utf-8")

    hooks_json = {
        "hooks": {
            "SessionStart": [{
                "matcher": "*",
                "hooks": [{
                    "type": "command",
                    "command": "node \"$CODEX_PROJECT_DIR\"/.codex/hooks/session-start.cjs",
                }],
            }],
            "UserPromptSubmit": [{
                "hooks": [{
                    "type": "command",
                    "command": "node \"$CODEX_PROJECT_DIR\"/.codex/hooks/user-prompt-submit.cjs",
                }],
            }],
            "PreToolUse": [{
                "matcher": "Bash|Read|Edit|Write|apply_patch|mcp__.*",
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"$CODEX_PROJECT_DIR\"/.codex/hooks/pretool-scout-block.cjs",
                    },
                    {
                        "type": "command",
                        "command": "node \"$CODEX_PROJECT_DIR\"/.codex/hooks/pretool-privacy-block.cjs",
                    },
                ],
            }],
            "PermissionRequest": [{
                "matcher": "Bash",
                "hooks": [{
                    "type": "command",
                    "command": "node \"$CODEX_PROJECT_DIR\"/.codex/hooks/permission-request.cjs",
                }],
            }],
        }
    }
    (CODEX_DIR / "hooks.json").write_text(json.dumps(hooks_json, indent=2), encoding="utf-8")
    print(f"Generated Codex hooks: {CODEX_DIR / 'hooks.json'}")


def migrate_mcp_and_config() -> None:
    mcp_file = CLAUDE_DIR / ".mcp.json.example"
    servers: dict[str, Any] = {}
    if mcp_file.exists():
        try:
            servers = json.loads(mcp_file.read_text(encoding="utf-8")).get("mcpServers", {})
        except json.JSONDecodeError:
            servers = {}

    lines = [
        '# Generated from ".claude" by migrate_claude_to_codex.py',
        "# Token-conscious default: use mini for the main session and reserve",
        "# heavier models for explicit /model switches when a task needs them.",
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
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

    for name, config in sorted(servers.items()):
        safe_name = str(name).replace('"', '\\"')
        lines.append(f'[mcp_servers."{safe_name}"]')
        if "command" in config:
            write_toml_value(lines, "command", str(config["command"]))
        if "args" in config:
            write_toml_value(lines, "args", config["args"])
        if "cwd" in config:
            write_toml_value(lines, "cwd", str(config["cwd"]))
        if "url" in config:
            write_toml_value(lines, "url", str(config["url"]))
        if "env" in config and isinstance(config["env"], dict):
            env = {str(k): apply_replacements(str(v)) for k, v in config["env"].items()}
            lines.append(f'[mcp_servers."{safe_name}".env]')
            for env_key, env_value in sorted(env.items()):
                write_toml_value(lines, env_key, env_value)
        lines.append("")

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
    migrate_commands_as_skill()
    write_codex_hooks()
    migrate_mcp_and_config()
    write_behavior_matrix()
    print("\nCodex migration complete.")


if __name__ == "__main__":
    main()
