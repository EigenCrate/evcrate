import os
import re
import shutil
import json
from pathlib import Path
from datetime import datetime, timezone

CLAUDE_DIR = ".claude"
GEMINI_DIR = ".gemini"
SKILLS_TO_SKIP = {"claude-code", "skill-creator"}
MCP_SERVERS_TO_SKIP = {"human-mcp"}

# Mappings for models and terms
REPLACEMENTS = {
    # API Names and specific string mappings
    r"claude-4-6-opus(?:-[a-z0-9]+)?": "gemini-3.1-pro-preview",
    r"claude-4-6-sonnet(?:-[a-z0-9]+)?": "gemini-3-flash-preview",
    r"claude-4-5-opus(?:-[a-z0-9]+)?": "gemini-3.1-pro-preview",
    r"claude-4-5-haiku(?:-[a-z0-9]+)?": "gemini-3.1-flash-lite-preview",
    r"claude-3-7-sonnet(?:-[a-z0-9]+)?": "gemini-3-flash-preview",
    r"claude-3-5-sonnet(?:-[a-z0-9]+)?": "gemini-3-flash-preview",
    r"claude-3-5-haiku(?:-[a-z0-9]+)?": "gemini-3.1-flash-lite-preview",
    r"claude-3-opus(?:-[a-z0-9]+)?": "gemini-3.1-pro-preview",

    # Human-readable models
    r"claude[\s-]*4[\.\-]*6[\s-]*opus": "gemini 3.1 pro",
    r"claude[\s-]*opus[\s-]*4[\.\-]*6": "gemini 3.1 pro",
    r"claude[\s-]*4[\.\-]*6[\s-]*sonnet": "gemini 3 flash",
    r"claude[\s-]*sonnet[\s-]*4[\.\-]*6": "gemini 3 flash",
    r"claude[\s-]*4[\.\-]*5[\s-]*opus": "gemini 3.1 pro",
    r"claude[\s-]*opus[\s-]*4[\.\-]*5": "gemini 3.1 pro",
    r"claude[\s-]*4[\.\-]*5[\s-]*haiku": "gemini 3.1 flash-lite",
    r"claude[\s-]*haiku[\s-]*4[\.\-]*5": "gemini 3.1 flash-lite",
    r"claude[\s-]*3[\.\-]*7[\s-]*sonnet": "gemini 3 flash",
    r"claude[\s-]*sonnet[\s-]*3[\.\-]*7": "gemini 3 flash",
    r"claude[\s-]*3[\.\-]*5[\s-]*sonnet": "gemini 3 flash",
    r"claude[\s-]*sonnet[\s-]*3[\.\-]*5": "gemini 3 flash",
    r"claude[\s-]*3[\.\-]*5[\s-]*haiku": "gemini 3.1 flash-lite",
    r"claude[\s-]*haiku[\s-]*3[\.\-]*5": "gemini 3.1 flash-lite",
    r"claude[\s-]*3[\s-]*opus": "gemini 3.1 pro",
    r"claude[\s-]*opus[\s-]*3": "gemini 3.1 pro",

    # Truncate dangling versions
    r"opus[\s-]*4[\.\-]*6": "pro",
    r"sonnet[\s-]*4[\.\-]*6": "flash",
    r"opus[\s-]*4[\.\-]*5": "pro",
    r"haiku[\s-]*4[\.\-]*5": "flash-lite",
    r"sonnet[\s-]*3[\.\-]*7": "flash",
    r"sonnet[\s-]*3[\.\-]*5": "flash",
    r"haiku[\s-]*3[\.\-]*5": "flash-lite",
    r"opus[\s-]*3": "pro",
    
    r"4[\.\-]*6[\s-]*opus": "pro",
    r"4[\.\-]*6[\s-]*sonnet": "flash",
    r"4[\.\-]*5[\s-]*opus": "pro",
    r"4[\.\-]*5[\s-]*haiku": "flash-lite",
    r"3[\.\-]*7[\s-]*sonnet": "flash",
    r"3[\.\-]*5[\s-]*sonnet": "flash",
    r"3[\.\-]*5[\s-]*haiku": "flash-lite",
    r"3[\s-]*opus": "pro",

    # Base replacements
    r"sonnet": "flash",
    r"haiku": "flash-lite",
    r"opus": "pro",
    r"claude-code": "gemini-cli",
    r"\bCLAUDE\.md\b": "CLAUDE.md",
    r"claude": "gemini",
    r"anthropic": "google",
    r"console.anthropic.com": "aistudio.google.com",
    r"anthropic-ai/claude-code": "google-gemini/gemini-cli",
    r"ANTHROPIC_API_KEY": "GEMINI_API_KEY",
    r"CLAUDE_PROJECT_DIR": "GEMINI_PROJECT_DIR",
    r"CLAUDE_COMMAND": "GEMINI_COMMAND",
    r"SlashCommand": "Custom Command",
    r"Skill tool": "activate_skill tool",
    r"AskUserQuestion": "ask_user",
    r"\$ARGUMENTS": "{{args}}",
    r"\"\$CLAUDE_PROJECT_DIR\"": "\"$GEMINI_PROJECT_DIR\"",
    r"gemini-sonnet": "gemini-3-flash-preview",
    r"gemini-haiku": "gemini-3.1-flash-lite-preview",
    r"gemini-opus": "gemini-3.1-pro-preview",
}

TOOL_MAPPING = {
    "Glob": "glob",
    "Grep": "grep_search",
    "Read": "read_file",
    "Write": "write_file",
    "Edit": "replace",
    "Bash": "run_shell_command",
    "AskUserQuestion": "ask_user",
    "WebSearch": "google_web_search",
}

GEMINI_CONTEXT_FILENAMES = ["GEMINI.md", "AGENTS.md", "CLAUDE.md"]
GEMINI_HOOK_EVENT_MAP = {
    "SessionStart": "SessionStart",
    "UserPromptSubmit": "BeforeAgent",
    "PreToolUse": "BeforeTool",
    "SessionEnd": "SessionEnd",
}
GEMINI_UNSUPPORTED_EVENTS = {
    "SubagentStart": "No Gemini CLI hook directly targets subagent startup; behavior is intentionally dropped.",
    "PreCompact": "No clean Gemini CLI equivalent for Claude PreCompact; behavior is intentionally dropped.",
}

def apply_replacements(text):
    if not isinstance(text, str):
        return text
    claude_md_token = "__SOURCE_MEMORY_DOC__"
    text = re.sub(r"\bCLAUDE\.md\b", claude_md_token, text, flags=re.IGNORECASE)
    for pattern, replacement in REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = text.replace(claude_md_token, "CLAUDE.md")
    return text

def clean_destination():
    for subdir in ["agents", "commands", "hooks", "scripts", "skills", "workflows"]:
        dest_dir = Path(GEMINI_DIR) / subdir
        if dest_dir.exists():
            print(f"Cleaning destination: {dest_dir}")
            shutil.rmtree(dest_dir)
    matrix_file = Path(GEMINI_DIR) / "migration-behavior-matrix.json"
    if matrix_file.exists():
        matrix_file.unlink()

def parse_markdown_with_frontmatter(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if match:
        frontmatter_raw = match.group(1)
        body = match.group(2)
        frontmatter = {}
        for line in frontmatter_raw.splitlines():
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
        return frontmatter, body
    return {}, content

def write_markdown_frontmatter(data, f):
    f.write("---\n")
    for key, value in data.items():
        if isinstance(value, list):
            rendered = ", ".join(json.dumps(str(item), ensure_ascii=False) for item in value)
            f.write(f"{key}: [{rendered}]\n")
        else:
            f.write(f"{key}: {json.dumps(str(value), ensure_ascii=False)}\n")
    f.write("---\n")

def write_toml_simple(data, f):
    for key, value in data.items():
        if isinstance(value, str):
            if '\n' in value:
                escaped = value.replace('\\', '\\\\').replace('"', '\\"')
                f.write(f'{key} = """{escaped}"""\n')
            else:
                f.write(f'{key} = {json.dumps(value)}\n')
        else:
            f.write(f'{key} = {json.dumps(value)}\n')

def read_json(path):
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

def deep_merge(base, override):
    merged = dict(base)
    for key, value in override.items():
        if isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged

def build_hook_behavior_entries():
    settings = read_json(Path(CLAUDE_DIR) / "settings.json")
    entries = []
    hooks = settings.get("hooks", {})
    for event_name, matcher_groups in hooks.items():
        mapped_event = GEMINI_HOOK_EVENT_MAP.get(event_name)
        for matcher_group in matcher_groups:
            for hook in matcher_group.get("hooks", []):
                entry = {
                    "kind": "hook-driven",
                    "source_event": event_name,
                    "source_matcher": matcher_group.get("matcher", "*"),
                    "source_command": hook.get("command", ""),
                }
                if mapped_event:
                    entry.update({
                        "target_event": mapped_event,
                        "classification": "hook-driven",
                        "status": "migrated",
                    })
                else:
                    entry.update({
                        "classification": "unsupported",
                        "status": "dropped",
                        "reason": GEMINI_UNSUPPORTED_EVENTS.get(
                            event_name,
                            "No Gemini CLI hook mapping was defined for this Claude event.",
                        ),
                    })
                entries.append(entry)
    return entries

def write_behavior_matrix():
    commands_dir = Path(CLAUDE_DIR) / "commands"
    entries = [{
        "kind": "memory-file",
        "source": "CLAUDE.md",
        "classification": "memory-file",
        "status": "migrated-wrapper" if Path("CLAUDE.md").exists() else "not-present",
        "target": "GEMINI.md -> @./CLAUDE.md" if Path("CLAUDE.md").exists() else None,
    }]
    for source in sorted(commands_dir.rglob("*.md")) if commands_dir.exists() else []:
        entries.append({
            "kind": "command-prose",
            "source": str(source.relative_to(commands_dir)).replace("\\", "/"),
            "classification": "command-prose",
            "status": "migrated",
            "target": str(source.relative_to(commands_dir).with_suffix(".toml")).replace("\\", "/"),
        })
    entries.extend(build_hook_behavior_entries())
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "target": "gemini",
        "context_file_names": GEMINI_CONTEXT_FILENAMES,
        "unsupported_events": GEMINI_UNSUPPORTED_EVENTS,
        "behaviors": entries,
    }
    with open(Path(GEMINI_DIR) / "migration-behavior-matrix.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

def write_gemini_memory_wrapper():
    claude_md = Path("CLAUDE.md")
    if not claude_md.exists():
        return
    wrapper = [
        "# Gemini Project Context",
        "",
        "The authoritative project memory file for this migrated workspace remains `CLAUDE.md`.",
        "Gemini should load native context first and then import the source memory document below.",
        "",
        "@./CLAUDE.md",
        "",
    ]
    Path("GEMINI.md").write_text("\n".join(wrapper), encoding="utf-8")

def write_gemini_hook_assets():
    hooks_dir = Path(GEMINI_DIR) / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_files = {
        "session-start.cjs": create_context_bridge("GEMINI_PROJECT_DIR", "SessionStart", ".claude/hooks/session-init.cjs"),
        "before-agent.cjs": create_context_bridge("GEMINI_PROJECT_DIR", "BeforeAgent", ".claude/hooks/dev-rules-reminder.cjs"),
        "before-tool-scout-block.cjs": create_block_bridge("GEMINI_PROJECT_DIR", "BeforeTool", ".claude/hooks/scout-block.cjs"),
        "before-tool-privacy-block.cjs": create_block_bridge("GEMINI_PROJECT_DIR", "BeforeTool", ".claude/hooks/privacy-block.cjs"),
        "session-end.cjs": create_passthrough_bridge("GEMINI_PROJECT_DIR", ".claude/hooks/session-end.cjs"),
    }
    for name, content in hook_files.items():
        (hooks_dir / name).write_text(content, encoding="utf-8")

def create_context_bridge(project_env_var, hook_event_name, source_rel_path):
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
    GEMINI_PROJECT_DIR: projectDir,
  }},
}});

const additionalContext = (result.stdout || '').trim();
const systemMessage = (result.stderr || '').trim();
const payload = {{
  hookSpecificOutput: {{
    hookEventName: {hook_event_name_json},
    additionalContext,
  }},
}};

if (systemMessage) {{
  payload.systemMessage = systemMessage;
}}

process.stdout.write(JSON.stringify(payload));
""".format(
        project_env_var=project_env_var,
        source_rel_path_json=json.dumps(source_rel_path),
        hook_event_name_json=json.dumps(hook_event_name),
    )


def create_block_bridge(project_env_var, hook_event_name, source_rel_path):
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
    GEMINI_PROJECT_DIR: projectDir,
  }},
}});

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 2) {{
  process.stdout.write(JSON.stringify({{
    decision: 'deny',
    reason: reason || 'Blocked by migrated Claude hook.',
    hookSpecificOutput: {{
      hookEventName: {hook_event_name_json},
    }},
  }}));
}} else {{
  process.stdout.write(JSON.stringify({{
    hookSpecificOutput: {{
      hookEventName: {hook_event_name_json},
    }},
  }}));
}}
""".format(
        project_env_var=project_env_var,
        source_rel_path_json=json.dumps(source_rel_path),
        hook_event_name_json=json.dumps(hook_event_name),
    )


def create_passthrough_bridge(project_env_var, source_rel_path):
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
spawnSync(process.execPath, [sourceHook], {{
  input,
  encoding: 'utf-8',
  env: {{
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    GEMINI_PROJECT_DIR: projectDir,
  }},
}});
process.stdout.write(JSON.stringify({{}}));
""".format(
        project_env_var=project_env_var,
        source_rel_path_json=json.dumps(source_rel_path),
    )

def migrate_agents():
    src_dir = Path(CLAUDE_DIR) / "agents"
    dest_dir = Path(GEMINI_DIR) / "agents"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists(): return
    for file in src_dir.glob("*.md"):
        frontmatter, body = parse_markdown_with_frontmatter(file)
        body = apply_replacements(body)
        if "name" not in frontmatter: frontmatter["name"] = file.stem
        if "description" not in frontmatter:
            desc_match = re.search(r"^description:\s*(.*)$", body, re.MULTILINE | re.IGNORECASE)
            if desc_match:
                frontmatter["description"] = desc_match.group(1).strip()
                body = re.sub(r"^description:\s*.*$\n?", "", body, flags=re.MULTILINE | re.IGNORECASE)
            else:
                frontmatter["description"] = f"Subagent {frontmatter['name']}"
        if "tools" in frontmatter:
            raw_tools = frontmatter["tools"]
            tools_list = [t.strip() for t in raw_tools.split(",")] if isinstance(raw_tools, str) else [str(t) for t in (raw_tools if isinstance(raw_tools, list) else [raw_tools])]
            frontmatter["tools"] = [TOOL_MAPPING.get(t, t) for t in tools_list]
        for key in frontmatter:
            if isinstance(frontmatter[key], str): frontmatter[key] = apply_replacements(frontmatter[key])
            elif isinstance(frontmatter[key], list): frontmatter[key] = [apply_replacements(item) if isinstance(item, str) else item for item in frontmatter[key]]
        dest_file = dest_dir / file.name
        with open(dest_file, "w", encoding="utf-8") as f:
            write_markdown_frontmatter(frontmatter, f)
            f.write(body)
        print(f"Migrated agent: {file.name}")

def migrate_commands():
    src_dir = Path(CLAUDE_DIR) / "commands"
    dest_dir = Path(GEMINI_DIR) / "commands"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists(): return
    for file in src_dir.rglob("*.md"):
        rel_path = file.relative_to(src_dir)
        dest_path = dest_dir / rel_path.with_suffix(".toml")
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        frontmatter, body = parse_markdown_with_frontmatter(file)
        body = apply_replacements(body)
        description = apply_replacements(frontmatter.get("description", ""))
        with open(dest_path, "w", encoding="utf-8") as f:
            write_toml_simple({"description": description, "prompt": body.strip()}, f)
        print(f"Migrated command: {rel_path}")

def migrate_commands_as_skill():
    src_dir = Path(CLAUDE_DIR) / "commands"
    if not src_dir.exists(): return

    skill_dir = Path(GEMINI_DIR) / "skills" / "claude-commands"
    references_dir = skill_dir / "references" / "commands"
    workflow_references_dir = skill_dir / "references" / "workflows"
    if skill_dir.exists(): shutil.rmtree(skill_dir)
    references_dir.mkdir(parents=True, exist_ok=True)
    workflow_references_dir.mkdir(parents=True, exist_ok=True)

    workflow_dir = Path(CLAUDE_DIR) / "workflows"
    if workflow_dir.exists():
        for workflow in sorted(workflow_dir.glob("*.md")):
            workflow_references_dir.joinpath(workflow.name).write_text(
                apply_replacements(workflow.read_text(encoding="utf-8")),
                encoding="utf-8",
            )

    command_index = []
    for source in sorted(src_dir.rglob("*.md")):
        rel = source.relative_to(src_dir)
        frontmatter, body = parse_markdown_with_frontmatter(source)
        description = apply_replacements(str(frontmatter.get("description", "")).strip())
        command_body = apply_replacements(body).strip()
        command_name = "/" + str(rel.with_suffix("")).replace("\\", "/")
        command_index.append(f"- `{command_name}`: {description or 'Migrated Claude command'}")

        ref_dest = references_dir / rel
        ref_dest.parent.mkdir(parents=True, exist_ok=True)
        ref_dest.write_text(
            f"# {command_name}\n\nDescription: {description or 'Migrated Claude command'}\n\n{command_body}\n",
            encoding="utf-8",
        )

    skill_md = [
        "---",
        "name: claude-commands",
        'description: "Use when the user asks to run, inspect, or adapt a migrated Claude Code slash command such as /code, /plan, /fix, /test, /docs, /design, /git, /scout, /skill, /cook, or /bootstrap in Gemini CLI."',
        "---",
        "",
        "# Claude Commands",
        "",
        "Use `references/commands/` as reusable prompt recipes for migrated Claude Code commands.",
        "Gemini CLI already exposes native slash commands from `.gemini/commands`, so keep using",
        "those for direct execution. Use this skill when you need the command semantics as a",
        "reference workflow, when adapting a Claude command to Gemini, or when another agent needs",
        "the command instructions as skill context instead of invoking a slash command directly.",
        "",
        "When the user asks for a migrated Claude command, or explicitly mentions this skill with a",
        "command name:",
        "1. Read `references/workflows/development-rules.md`, `references/workflows/orchestration-protocol.md`, `references/workflows/primary-workflow.md`, and `references/workflows/documentation-management.md` as the governing workflow context.",
        "2. Map the requested command path to `references/commands/<command>.md`.",
        "3. Read that command reference file.",
        "4. Substitute any user arguments for `{{args}}`.",
        "5. Either invoke the equivalent native Gemini slash command from `.gemini/commands`, or execute the command intent directly by following the reference instructions.",
        "",
        "Invocation examples:",
        "- `Use claude-commands to inspect /plan`",
        "- `Use claude-commands to adapt /fix/test to Gemini`",
        "- `Use claude-commands as reference for /docs/update`",
        "",
        "## Available Commands",
        "",
        *command_index,
        "",
    ]
    (skill_dir / "SKILL.md").write_text("\n".join(skill_md), encoding="utf-8")
    print(f"Migrated {len(command_index)} commands into skill: claude-commands")

def is_text_file(file_path):
    """Check if a file is likely text-based and not binary."""
    # Common binary extensions to skip
    binary_exts = {'.pyc', '.exe', '.dll', '.so', '.dylib', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.coverage', '.pyo'}
    if file_path.suffix.lower() in binary_exts: return False
    # Check first 1024 bytes for null character
    try:
        with open(file_path, 'rb') as f:
            chunk = f.read(1024)
            return b'\x00' not in chunk
    except: return False

def migrate_skills():
    src_dir = Path(CLAUDE_DIR) / "skills"
    dest_dir = Path(GEMINI_DIR) / "skills"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists(): return
    for skill_dir in src_dir.iterdir():
        if skill_dir.is_dir():
            if skill_dir.name in SKILLS_TO_SKIP:
                print(f"Skipped vendor skill: {skill_dir.name}")
                continue
            skill_name = re.sub(r"claude", "gemini", skill_dir.name, flags=re.IGNORECASE)
            dest_skill_dir = dest_dir / skill_name
            if dest_skill_dir.exists(): shutil.rmtree(dest_skill_dir)
            shutil.copytree(skill_dir, dest_skill_dir)
            for target_file in dest_skill_dir.rglob("*"):
                if target_file.is_file() and is_text_file(target_file):
                    if target_file.name.lower() == "skill.md" and target_file.name != "SKILL.md":
                        new_md_file = target_file.with_name("SKILL.md")
                        target_file.rename(new_md_file)
                        target_file = new_md_file
                    try:
                        with open(target_file, "r", encoding="utf-8") as f: content = f.read()
                        new_content = apply_replacements(content)
                        if new_content != content:
                            with open(target_file, "w", encoding="utf-8") as f: f.write(new_content)
                    except: continue
            print(f"Migrated skill: {skill_dir.name} -> {skill_name}")

def migrate_workflows():
    src_dir = Path(CLAUDE_DIR) / "workflows"
    dest_dir = Path(GEMINI_DIR) / "workflows"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists(): return
    for file in src_dir.glob("*.md"):
        with open(file, "r", encoding="utf-8") as f: content = f.read()
        dest_file = dest_dir / file.name
        with open(dest_file, "w", encoding="utf-8") as f: f.write(apply_replacements(content))
        print(f"Migrated workflow: {file.name}")

def migrate_scripts():
    src_dir = Path(CLAUDE_DIR) / "scripts"
    dest_dir = Path(GEMINI_DIR) / "scripts"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists(): return
    for source in src_dir.rglob("*"):
        rel_path = source.relative_to(src_dir)
        if "__pycache__" in rel_path.parts:
            continue
        dest_path = dest_dir / rel_path
        if source.is_dir():
            dest_path.mkdir(parents=True, exist_ok=True)
            continue
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest_path)
        if is_text_file(dest_path):
            try:
                with open(dest_path, "r", encoding="utf-8") as f: content = f.read()
                with open(dest_path, "w", encoding="utf-8") as f: f.write(apply_replacements(content))
            except: pass
        print(f"Migrated script: {rel_path}")

def migrate_mcp():
    settings_file = Path(GEMINI_DIR) / "settings.json"
    migration_settings = {
        "model": {"name": "gemini-3.1-flash-lite-preview"},
        "context": {"fileName": GEMINI_CONTEXT_FILENAMES},
        "hooks": {
            "SessionStart": [{
                "matcher": "*",
                "hooks": [{
                    "name": "claude-session-start",
                    "type": "command",
                    "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/session-start.cjs",
                }],
            }],
            "BeforeAgent": [{
                "matcher": "*",
                "hooks": [{
                    "name": "claude-user-prompt-submit",
                    "type": "command",
                    "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/before-agent.cjs",
                }],
            }],
            "BeforeTool": [{
                "matcher": "run_shell_command|glob|grep_search|read_file|replace|write_file",
                "hooks": [
                    {
                        "name": "claude-scout-block",
                        "type": "command",
                        "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/before-tool-scout-block.cjs",
                    },
                    {
                        "name": "claude-privacy-block",
                        "type": "command",
                        "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/before-tool-privacy-block.cjs",
                    },
                ],
            }],
            "SessionEnd": [{
                "matcher": "*",
                "hooks": [{
                    "name": "claude-session-end",
                    "type": "command",
                    "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/session-end.cjs",
                }],
            }],
        },
    }
    settings = deep_merge(read_json(settings_file), migration_settings)
    with open(settings_file, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
    print("Migrated settings (Gemini 3.1 Flash-Lite)")

if __name__ == "__main__":
    clean_destination()
    migrate_agents()
    migrate_commands()
    migrate_commands_as_skill()
    migrate_scripts()
    migrate_skills()
    migrate_workflows()
    write_gemini_memory_wrapper()
    write_gemini_hook_assets()
    migrate_mcp()
    write_behavior_matrix()
    print("\nMigration complete!")
