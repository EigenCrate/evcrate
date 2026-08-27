import os
import re
import shutil
import json
import hashlib
import sys
from pathlib import Path

from distribution.contracts import (
    ADVISOR_BRIDGE_FALLBACK_BLOCK,
    ADVISOR_RUNTIME_FILES,
    advisory_relay_error,
    is_production_runtime_artifact,
    project_advisor_contract,
    render_advisory_interview_workflow,
    render_inline_advise_command,
    render_harness_script_references,
)

DEFAULT_SOURCE_ROOT = Path(__file__).resolve().parent / ".evcrate" / "source"
SOURCE_ROOT = Path(os.environ.get("EVCRATE_SOURCE_DIR", str(DEFAULT_SOURCE_ROOT)))
CLAUDE_DIR = Path(os.environ.get("CLAUDE_SOURCE_DIR", str(SOURCE_ROOT / ".claude")))
GEMINI_DIR = Path(os.environ.get("GEMINI_OUTPUT_DIR", str(SOURCE_ROOT / ".gemini")))
PROJECT_DOCS_DIR = Path(os.environ.get("GEMINI_PROJECT_DOCS_OUTPUT_DIR", str(SOURCE_ROOT)))


def local_output(name: str) -> Path:
    """Return a local artifact path without recreating root discovery paths."""

    return SOURCE_ROOT / name


def source_document(name: str) -> Path:
    return CLAUDE_DIR.parent / name


# Command-line parameter support to generate local or global config baselines
for arg in sys.argv[1:]:
    if arg.lower() in ("--global", "global"):
        if os.environ.get("EVCRATE_ALLOW_DIRECT_GLOBAL") != "1":
            raise SystemExit(
                "Direct --global migration is disabled; use 'python3 distribute.py --publish'. "
                "Set EVCRATE_ALLOW_DIRECT_GLOBAL=1 only for a documented emergency."
            )
        print("WARNING: direct --global migration bypasses distribution verification.", file=sys.stderr)
        GEMINI_DIR = Path.home() / ".gemini"
    elif arg.lower() in ("--local", "local"):
        GEMINI_DIR = local_output(".gemini")

try:
    import yaml
except ModuleNotFoundError as error:
    if error.name == "yaml":
        raise SystemExit("PyYAML is required; run 'python3 -m pip install -r requirements.txt'.") from error
    raise

SKILLS_TO_SKIP = {"claude-code", "skill-creator"}
MCP_SERVERS_TO_SKIP = {"human-mcp"}


def ignore_migration_artifacts(_: str, names: list[str]) -> set[str]:
    """Keep interpreter and coverage by-products out of deterministic targets."""

    return {
        name for name in names
        if (name.startswith("__") and name.endswith("cache__"))
        or name == ".coverage"
        or name.endswith((".pyc", ".pyo"))
    }

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
    r"\bCLAUDE\.md\b": "CLAUDE.md",
    # Match standalone platform prose only; preserve ClaudeKit provenance and
    # external claudekit-cli names.
    r"(?<![A-Za-z0-9_.-])claude(?![A-Za-z0-9_-]|\.(?:com|ai)\b)": "gemini",
    # URL literals are protected before these replacements; keep URL-specific
    # mappings out of this table so canonical URLs remain unchanged.
    r"anthropic": "google",
    r"ANTHROPIC_API_KEY": "GEMINI_API_KEY",
    r"CLAUDE_PROJECT_DIR": "GEMINI_PROJECT_DIR",
    r"CLAUDE_COMMAND": "GEMINI_COMMAND",
    r"SlashCommand": "Custom Command",
    r"Skill tool": "activate_skill tool",
    r"AskUserQuestion": "ask_user",
    r"\$ARGUMENTS": "{{args}}",
    r"\"\$CLAUDE_PROJECT_DIR\"": "\"$GEMINI_PROJECT_DIR\"",
    r"\.claude/workflows/": ".gemini/workflows/",
    r"\.claude/scripts/advisor-bridge\.cjs\b": ".gemini/scripts/advisor-bridge.cjs",
    r"python \.claude/scripts/ev-help\.py\b": "python .gemini/scripts/ev-help.py",
    r"gemini-sonnet": "gemini-3-flash-preview",
    r"gemini-haiku": "gemini-3.1-flash-lite-preview",
    r"gemini-opus": "gemini-3.1-pro-preview",
}

EXTERNAL_SCOUT_STRATEGY_START = "<!-- EXTERNAL_SCOUT_STRATEGY_START -->"
EXTERNAL_SCOUT_STRATEGY_END = "<!-- EXTERNAL_SCOUT_STRATEGY_END -->"
GEMINI_EXTERNAL_SCOUT_STRATEGY = """## External command strategy

Use the read-only primary command for each focused directory search. Prompts must request concise paths and supporting evidence, and must not ask for modifications or credentials. If the primary command is unavailable or fails, use the fallback command once; otherwise do not mix commands based on search count.

```bash
codex exec -m gpt-5.6-luna "[prompt]"
```

```bash
claude -p --model sonnet "[prompt]"
```

Run focused searches in parallel when useful, with a three-minute timeout per command. Do not restart a timed-out command. Fall back to native Glob, Grep, and Read tools when both commands are unavailable, unsafe, or fail."""

TOOL_MAPPING = {
    "Glob": "glob",
    "Grep": "grep_search",
    "Read": "read_file",
    "Write": "write_file",
    "Edit": "replace",
    "Bash": "run_shell_command",
    "AskUserQuestion": "ask_user",
    "WebSearch": "google_web_search",
    "LS": "list_directory",
    "WebFetch": "web_fetch",
    "MultiEdit": "replace",
    "NotebookEdit": "replace",
    "TodoWrite": "write_file",
    "BashOutput": "run_shell_command",
    "KillBash": "run_shell_command",
    "KillShell": "run_shell_command",
    "ListMcpResourcesTool": "run_shell_command",
    "ReadMcpResourceTool": "run_shell_command",
}

VALID_GEMINI_TOOLS = {
    "update_topic", "list_directory", "read_file", "grep_search", "glob",
    "replace", "write_file", "web_fetch", "run_shell_command",
    "list_background_processes", "read_background_output", "google_web_search",
    "ask_user", "enter_plan_mode", "invoke_agent", "activate_skill"
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
GLOBAL_ADVISOR_BRIDGE_PATHS = (
    "~/.claude/scripts/advisor-bridge.cjs",
    "~/.codex/scripts/advisor-bridge.cjs",
    "~/.gemini/scripts/advisor-bridge.cjs",
    "~/.gemini/config/scripts/advisor-bridge.cjs",
    "~/.pi/agent/evcrate/scripts/advisor-bridge.cjs",
)


def apply_target_replacements(text):
    """Apply Gemini naming and migrate ordinary Claude resource references."""

    return apply_replacements(render_harness_script_references(text, "gemini"))

def apply_replacements(text):
    if not isinstance(text, str):
        return text
    fallback_token = "__GEMINI_GLOBAL_ADVISOR_FALLBACK__"
    text = text.replace(ADVISOR_BRIDGE_FALLBACK_BLOCK, fallback_token)
    protected_values = []

    def protect(match):
        protected_values.append(match.group(0))
        return f"__GEMINI_PROTECTED_{len(protected_values) - 1}__"

    # Protect URL literals before adapting nearby platform prose. URL-specific
    # rules are intentionally absent from REPLACEMENTS.
    text = re.sub(r"https?://[^\s<>()]+", protect, text, flags=re.IGNORECASE)
    claude_md_token = "__SOURCE_MEMORY_DOC__"
    text = re.sub(r"\bCLAUDE\.md\b", claude_md_token, text, flags=re.IGNORECASE)
    protected_paths = []
    for index, path in enumerate(GLOBAL_ADVISOR_BRIDGE_PATHS):
        token = f"__GEMINI_GLOBAL_ADVISOR_BRIDGE_{index}__"
        text = text.replace(path, token)
        protected_paths.append((token, path))
    for pattern, replacement in REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = text.replace(claude_md_token, "CLAUDE.md")
    for token, path in protected_paths:
        text = text.replace(token, path)
    for index, value in enumerate(protected_values):
        text = text.replace(f"__GEMINI_PROTECTED_{index}__", value)
    text = text.replace(fallback_token, ADVISOR_BRIDGE_FALLBACK_BLOCK)
    return text

def render_external_scout_strategy(body, strategy):
    """Replace one canonical strategy block after generic rewrites."""

    start_count = body.count(EXTERNAL_SCOUT_STRATEGY_START)
    end_count = body.count(EXTERNAL_SCOUT_STRATEGY_END)
    start_index = body.find(EXTERNAL_SCOUT_STRATEGY_START)
    end_index = body.find(EXTERNAL_SCOUT_STRATEGY_END)
    if start_count != 1 or end_count != 1 or start_index < 0 or end_index < start_index:
        raise ValueError(
            "Malformed scout-external strategy markers: expected exactly one ordered start/end pair"
        )

    block_end = end_index + len(EXTERNAL_SCOUT_STRATEGY_END)
    rendered = (
        f"{EXTERNAL_SCOUT_STRATEGY_START}\n{strategy.strip()}\n"
        f"{EXTERNAL_SCOUT_STRATEGY_END}"
    )
    return body[:start_index] + rendered + body[block_end:]


def _assert_safe_output_root(root, label):
    """Reject output roots or ancestors that could redirect cleanup writes."""

    root = Path(root)
    if os.path.lexists(root) and (root.is_symlink() or not root.is_dir()):
        raise RuntimeError(f"{label} must be a real directory: {root}")
    current = root.parent
    while True:
        if current.is_symlink():
            raise RuntimeError(f"{label} has a symlinked ancestor: {root}")
        if current.parent == current:
            break
        current = current.parent


def _assert_no_symlink_ancestors(path, label):
    current = Path(path).parent
    while True:
        if current.is_symlink():
            raise RuntimeError(f"{label} has a symlinked ancestor: {path}")
        if current.parent == current:
            break
        current = current.parent


def _assert_safe_file_target(path, label):
    """Reject unmanaged file destinations that could follow a symlink."""

    path = Path(path)
    _assert_no_symlink_ancestors(path, label)
    if os.path.lexists(path) and (path.is_symlink() or not path.is_file()):
        raise RuntimeError(f"{label} must be a regular file: {path}")


def _assert_safe_source_tree(root, label):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError(f"{label} must be a real directory: {root}")
    current = root
    while True:
        if current.is_symlink():
            raise RuntimeError(f"{label} has a symlinked ancestor: {root}")
        if current.parent == current:
            break
        current = current.parent
    for path in root.rglob("*"):
        if path.is_symlink():
            raise RuntimeError(f"{label} contains a symlink: {path}")


def _assert_managed_directory(path):
    path = Path(path)
    _assert_no_symlink_ancestors(path, "Managed Gemini path")
    if os.path.lexists(path) and (path.is_symlink() or not path.is_dir()):
        raise RuntimeError(f"Managed Gemini directory is unsafe: {path}")


def _assert_managed_tree(path):
    """Reject symlinked or non-regular entries before clearing a managed tree."""

    path = Path(path)
    _assert_managed_directory(path)
    if not os.path.lexists(path):
        return
    pending = [path]
    while pending:
        current = pending.pop()
        for child in sorted(current.iterdir(), key=lambda item: item.name):
            if child.is_symlink():
                raise RuntimeError(f"Managed Gemini tree contains a symlink: {child}")
            if child.is_dir():
                pending.append(child)
            elif not child.is_file():
                raise RuntimeError(f"Managed Gemini tree contains a non-regular entry: {child}")


def _clear_managed_path(path):
    """Clear a managed path without following symlinks or their targets."""

    path = Path(path)
    _assert_no_symlink_ancestors(path, "Managed Gemini path")
    if not os.path.lexists(path):
        return
    if path.is_symlink() or not path.is_dir():
        path.unlink()
        return
    for child in path.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()


def clean_destination():
    gemini_dir = Path(GEMINI_DIR)
    _assert_safe_output_root(gemini_dir, "Gemini output root")
    managed_dirs = [gemini_dir / subdir for subdir in ["agents", "commands", "hooks", "scripts", "skills", "workflows"]]
    for dest_dir in managed_dirs:
        _assert_managed_tree(dest_dir)
    for name in ["migration-behavior-matrix.json", ".evcrate.json", ".evcrateignore"]:
        _assert_safe_file_target(gemini_dir / name, "Gemini managed file")
    for dest_dir in managed_dirs:
        if os.path.lexists(dest_dir):
            print(f"Cleaning destination: {dest_dir}")
        _clear_managed_path(dest_dir)
    for name in ["migration-behavior-matrix.json", ".evcrate.json", ".evcrateignore"]:
        _clear_managed_path(gemini_dir / name)


def preflight_destination():
    """Validate every unmanaged destination before cleanup can mutate output."""

    gemini_dir = Path(GEMINI_DIR)
    _assert_safe_output_root(gemini_dir, "Gemini output root")
    for subdir in ["agents", "commands", "hooks", "scripts", "skills", "workflows"]:
        _assert_managed_tree(gemini_dir / subdir)
    for name in ["migration-behavior-matrix.json", ".evcrate.json", ".evcrateignore"]:
        _assert_safe_file_target(gemini_dir / name, "Gemini managed file")
    for path, label in (
        (PROJECT_DOCS_DIR / "GEMINI.md", "Project GEMINI.md"),
        (gemini_dir / "settings.json", "Gemini settings.json"),
    ):
        _assert_safe_file_target(path, label)

def parse_markdown_with_frontmatter(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    if not content.startswith("---"):
        return {}, content
    
    parts = re.split(r"^---\s*$", content, maxsplit=2, flags=re.MULTILINE)
    if len(parts) >= 3:
        frontmatter_raw = parts[1]
        body = parts[2].lstrip()
        
        # Try proper YAML first
        try:
            frontmatter = yaml.safe_load(frontmatter_raw)
            if isinstance(frontmatter, dict):
                return frontmatter, body
        except yaml.YAMLError:
            pass
            
        # Fallback to robust naive parser for non-standard YAML (e.g. unquoted colons in values)
        frontmatter = {}
        current_key = None
        for line in frontmatter_raw.splitlines():
            if not line.strip(): continue
            if line.startswith(" ") or line.startswith("\t"):
                if current_key:
                    frontmatter[current_key] += "\n" + line.strip()
                continue
            
            if ":" in line:
                key, value = line.split(":", 1)
                current_key = key.strip()
                frontmatter[current_key] = value.strip()
            else:
                if current_key:
                    frontmatter[current_key] += " " + line.strip()
        
        # Post-process values
        for key, value in frontmatter.items():
            if isinstance(value, str):
                if value.startswith("[") and value.endswith("]"):
                    frontmatter[key] = [item.strip().strip("\"'") for item in value[1:-1].split(",") if item.strip()]
        
        return frontmatter, body
    return {}, content

def write_markdown_frontmatter(data, f):
    f.write("---\n")
    yaml.dump(data, f, allow_unicode=True, sort_keys=False)
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
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not read JSON source {path}") from error

def deep_merge(base, override):
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    merged = dict(base)
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = deep_merge(merged[key], value)
        elif key in merged and isinstance(merged[key], list) and isinstance(value, list):
            # For hooks and similar lists, we want to append or merge by name
            if all(isinstance(x, dict) and "name" in x for x in value):
                # Merge lists of objects with "name" property
                base_list = merged[key]
                new_list = list(base_list)
                for item in value:
                    name = item["name"]
                    # Replace existing item with same name, or append
                    found = False
                    for i, base_item in enumerate(new_list):
                        if isinstance(base_item, dict) and base_item.get("name") == name:
                            new_list[i] = deep_merge(base_item, item)
                            found = True
                            break
                    if not found:
                        new_list.append(item)
                merged[key] = new_list
            else:
                # Fallback to simple replacement for other lists or if no names
                merged[key] = value
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
        "status": "migrated-wrapper" if source_document("CLAUDE.md").exists() else "not-present",
        "target": "GEMINI.md -> @./CLAUDE.md" if source_document("CLAUDE.md").exists() else None,
    }]
    for source in sorted(commands_dir.rglob("*.md")) if commands_dir.exists() else []:
        entries.append({
            "kind": "command-prose",
            "source": str(source.relative_to(commands_dir)).replace("\\", "/"),
            "classification": "command-prose",
            "status": "migrated",
            "target": str(source.relative_to(commands_dir).with_suffix(".toml")).replace("\\", "/"),
        })
    entries.append({
        "kind": "advisory-capability",
        "classification": "target-native",
        "checkpoint": "supported",
        "inline": "supported",
        "relay": "unsupported",
        "relay_error": advisory_relay_error("gemini"),
    })
    entries.extend(build_hook_behavior_entries())
    payload = {
        "target": "gemini",
        "context_file_names": GEMINI_CONTEXT_FILENAMES,
        "unsupported_events": GEMINI_UNSUPPORTED_EVENTS,
        "behaviors": entries,
    }
    with open(Path(GEMINI_DIR) / "migration-behavior-matrix.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")

def write_gemini_memory_wrapper():
    claude_md = source_document("CLAUDE.md")
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
    target = PROJECT_DOCS_DIR / "GEMINI.md"
    _assert_safe_file_target(target, "Project GEMINI.md")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(wrapper), encoding="utf-8")

def write_gemini_hook_assets():
    hooks_dir = Path(GEMINI_DIR) / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_files = {
        "session-start.cjs": create_context_bridge("GEMINI_PROJECT_DIR", "SessionStart", ".gemini/hooks/session-init.cjs"),
        "before-agent.cjs": create_context_bridge("GEMINI_PROJECT_DIR", "BeforeAgent", ".gemini/hooks/dev-rules-reminder.cjs"),
        "before-tool-scout-block.cjs": create_block_bridge("GEMINI_PROJECT_DIR", "BeforeTool", ".gemini/hooks/scout-block.cjs", "before-tool-scout-block.cjs"),
        "before-tool-privacy-block.cjs": create_block_bridge("GEMINI_PROJECT_DIR", "BeforeTool", ".gemini/hooks/privacy-block.cjs", "before-tool-privacy-block.cjs"),
        "session-end.cjs": create_passthrough_bridge("GEMINI_PROJECT_DIR", ".gemini/hooks/claude-session-end.cjs"),
    }
    for name, content in hook_files.items():
        (hooks_dir / name).write_text(content, encoding="utf-8")

def create_context_bridge(project_env_var, hook_event_name, source_rel_path, global_source_rel_path=None):
    global_source_rel_path = global_source_rel_path or source_rel_path
    return """#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const {{ spawnSync }} = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

function hasSymlinkedPathComponent(candidate) {{
  let current = path.resolve(candidate);
  while (true) {{
    let stat;
    try {{
      stat = fs.lstatSync(current);
    }} catch {{
      return true;
    }}
    if (stat.isSymbolicLink()) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }}
}}

function isUsableHook(candidate) {{
  try {{
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate);
  }} catch {{
    return false;
  }}
}}

function isGlobalHookDirectory(candidate) {{
  return path.resolve(__dirname) === path.resolve(path.dirname(candidate));
}}

function isPublishedHomeHook(candidate) {{
  return path.resolve(candidate) === path.resolve(path.join(os.homedir(), {source_rel_path_json}));
}}

function resolveHookSource() {{
  const candidates = [];
  if (process.env.{project_env_var}) candidates.push(process.env.{project_env_var});
  candidates.push(process.cwd());

  for (const start of candidates) {{
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {{
      const probe = path.join(current, {source_rel_path_json});
      if (isUsableHook(probe) && !isPublishedHomeHook(probe)) return {{ projectDir: current, sourceHook: probe }};
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }}
  }}

  const homeHook = path.join(os.homedir(), {global_source_rel_path_json});
  if (isGlobalHookDirectory(homeHook) && isUsableHook(homeHook)) {{
    return {{ projectDir: process.env.{project_env_var} || process.cwd(), sourceHook: homeHook }};
  }}

  return {{
    projectDir: process.env.{project_env_var} || process.cwd(),
    sourceHook: path.join(process.cwd(), {source_rel_path_json}),
  }};
}}

const {{ projectDir, sourceHook }} = resolveHookSource();
if (!isUsableHook(sourceHook)) {{
  process.stdout.write(JSON.stringify({{
    hookSpecificOutput: {{
      hookEventName: {hook_event_name_json},
      additionalContext: '',
    }},
  }}));
  process.exit(0);
}}
const result = spawnSync(process.execPath, [sourceHook], {{
  input,
  encoding: 'utf-8',
  env: {{
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    GEMINI_PROJECT_DIR: projectDir,
    EVCRATE_CONFIG_DIR: '.gemini',
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
        global_source_rel_path_json=json.dumps(global_source_rel_path),
        hook_event_name_json=json.dumps(hook_event_name),
    )


def create_block_bridge(project_env_var, hook_event_name, source_rel_path, wrapper_name):
    hook_name = wrapper_name
    global_source_rel_path = source_rel_path
    return """#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const {{ spawnSync }} = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

function hasSymlinkedPathComponent(candidate) {{
  let current = path.resolve(candidate);
  while (true) {{
    let stat;
    try {{
      stat = fs.lstatSync(current);
    }} catch {{
      return true;
    }}
    if (stat.isSymbolicLink()) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }}
}}

function isUsableHook(candidate) {{
  try {{
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate);
  }} catch {{
    return false;
  }}
}}

function isGlobalHookDirectory(candidate) {{
  return path.resolve(__dirname) === path.resolve(path.dirname(candidate));
}}

function isPublishedHomeHook(candidate) {{
  return path.resolve(candidate) === path.resolve(path.join(os.homedir(), {source_rel_path_json}));
}}

let workspacePaths = [];
let payloadCwd = null;
try {{
  const data = JSON.parse(input);
  if (data) {{
    if (data.workspacePaths) workspacePaths = data.workspacePaths;
    if (data.cwd) payloadCwd = data.cwd;
  }}
}} catch(e) {{}}

function resolveHookSource() {{
  const candidates = [];
  if (process.env.{project_env_var}) candidates.push(process.env.{project_env_var});
  if (workspacePaths && workspacePaths.length > 0) {{
    for (const p of workspacePaths) candidates.push(p);
  }}
  if (payloadCwd) candidates.push(payloadCwd);
  candidates.push(process.cwd());

  for (const start of candidates) {{
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {{
      const probe = path.join(current, {source_rel_path_json});
      if (isUsableHook(probe) && !isPublishedHomeHook(probe)) return {{ projectDir: current, sourceHook: probe }};
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }}
  }}

  const homeHook = path.join(os.homedir(), {global_source_rel_path_json});
  if (isGlobalHookDirectory(homeHook) && isUsableHook(homeHook)) {{
    const fallbackDir = (workspacePaths && workspacePaths.length > 0) ? workspacePaths[0] : (payloadCwd || process.env.{project_env_var} || process.cwd());
    return {{ projectDir: fallbackDir, sourceHook: homeHook }};
  }}

  const fallbackDir = (workspacePaths && workspacePaths.length > 0) ? workspacePaths[0] : (payloadCwd || process.env.{project_env_var} || process.cwd());
  return {{
    projectDir: fallbackDir,
    sourceHook: path.join(process.cwd(), {source_rel_path_json}),
  }};
}}

const {{ projectDir, sourceHook }} = resolveHookSource();

// Format Antigravity payload for Claude hook & convert paths to relative
let claudePayload = input;
try {{
  const data = JSON.parse(input);
  if (data && !data.tool_input) {{
    let toolName = "unknown";
    if (data.toolCall && data.toolCall.args) {{
      const args = data.toolCall.args;
      if (args.CommandLine) toolName = "run_command";
      else if (args.TargetFile) toolName = "replace_file_content";
      else if (args.Query) toolName = "grep_search";
      else if (args.DirectoryPath) toolName = "list_dir";
      else if (args.AbsolutePath) toolName = "view_file";
      
      const mapKeys = (obj) => {{
        if (typeof obj === "string") {{
          let normalized = obj.replace(/\\\\/g, '/');
          let projNormalized = projectDir.replace(/\\\\/g, '/');
          if (normalized.startsWith(projNormalized)) {{
            let rel = normalized.substring(projNormalized.length);
            if (rel.startsWith('/')) rel = rel.substring(1);
            return rel;
          }}
          return obj;
        }}
        if (Array.isArray(obj)) return obj.map(mapKeys);
        if (typeof obj === "object" && obj !== null) {{
          const newObj = {{}};
          for (const key of Object.keys(obj)) {{
            let mappedKey = key;
            if (key === 'AbsolutePath') mappedKey = 'path';
            else if (key === 'TargetFile') mappedKey = 'path';
            else if (key === 'SearchPath') mappedKey = 'path';
            else if (key === 'DirectoryPath') mappedKey = 'path';
            else if (key === 'CommandLine') mappedKey = 'command';
            
            newObj[mappedKey] = mapKeys(obj[key]);
          }}
          return newObj;
        }}
        return obj;
      }};
      
      claudePayload = JSON.stringify({{
        tool_name: toolName,
        tool_input: mapKeys(args)
      }});
    }}
  }}
}} catch(e) {{}}

let activeHook = sourceHook;
if (!isUsableHook(activeHook)) {{
  const globalHook = path.join(os.homedir(), {global_source_rel_path_json});
  if (isGlobalHookDirectory(globalHook) && isUsableHook(globalHook)) {{
    activeHook = globalHook;
  }} else {{
    process.stdout.write(JSON.stringify({{
      decision: 'deny',
      reason: 'EVCREATE_HOOK_UNAVAILABLE',
      hookSpecificOutput: {{
        hookEventName: {hook_event_name_json},
      }},
    }}));
    process.exit(0);
  }}
}}

const result = spawnSync(process.execPath, [activeHook], {{
  input: claudePayload,
  encoding: 'utf-8',
  env: {{
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    GEMINI_PROJECT_DIR: projectDir,
    EVCRATE_CONFIG_DIR: '.gemini',
  }},
}});

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 0 && !result.error) {{
  process.stdout.write(JSON.stringify({{
    decision: 'allow',
    hookSpecificOutput: {{
      hookEventName: {hook_event_name_json},
    }},
  }}));
}} else {{
  process.stdout.write(JSON.stringify({{
    decision: 'deny',
    reason: reason || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.',
    hookSpecificOutput: {{
      hookEventName: {hook_event_name_json},
    }},
  }}));
}}
""".format(
        project_env_var=project_env_var,
        source_rel_path_json=json.dumps(source_rel_path),
        global_source_rel_path_json=json.dumps(global_source_rel_path),
        hook_event_name_json=json.dumps(hook_event_name),
        hook_name=hook_name,
    )


def create_passthrough_bridge(project_env_var, source_rel_path, global_source_rel_path=None):
    global_source_rel_path = global_source_rel_path or source_rel_path
    return """#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const {{ spawnSync }} = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

function hasSymlinkedPathComponent(candidate) {{
  let current = path.resolve(candidate);
  while (true) {{
    let stat;
    try {{
      stat = fs.lstatSync(current);
    }} catch {{
      return true;
    }}
    if (stat.isSymbolicLink()) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }}
}}

function isUsableHook(candidate) {{
  try {{
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate);
  }} catch {{
    return false;
  }}
}}

function isGlobalHookDirectory(candidate) {{
  return path.resolve(__dirname) === path.resolve(path.dirname(candidate));
}}

function isPublishedHomeHook(candidate) {{
  return path.resolve(candidate) === path.resolve(path.join(os.homedir(), {source_rel_path_json}));
}}

function resolveHookSource() {{
  const candidates = [];
  if (process.env.{project_env_var}) candidates.push(process.env.{project_env_var});
  candidates.push(process.cwd());

  for (const start of candidates) {{
    if (!start) continue;
    let current = path.resolve(start);
    while (true) {{
      const probe = path.join(current, {source_rel_path_json});
      if (isUsableHook(probe) && !isPublishedHomeHook(probe)) return {{ projectDir: current, sourceHook: probe }};
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }}
  }}

  const homeHook = path.join(os.homedir(), {global_source_rel_path_json});
  if (isGlobalHookDirectory(homeHook) && isUsableHook(homeHook)) {{
    return {{ projectDir: process.env.{project_env_var} || process.cwd(), sourceHook: homeHook }};
  }}

  return {{
    projectDir: process.env.{project_env_var} || process.cwd(),
    sourceHook: path.join(process.cwd(), {source_rel_path_json}),
  }};
}}

const {{ projectDir, sourceHook }} = resolveHookSource();
if (!isUsableHook(sourceHook)) {{
  process.stderr.write('EVCREATE_HOOK_UNAVAILABLE\\n');
  process.stdout.write(JSON.stringify({{}}));
  process.exit(0);
}}
spawnSync(process.execPath, [sourceHook], {{
  input,
  encoding: 'utf-8',
  env: {{
    ...process.env,
    CLAUDE_PROJECT_DIR: projectDir,
    GEMINI_PROJECT_DIR: projectDir,
    EVCRATE_CONFIG_DIR: '.gemini',
  }},
}});
process.stdout.write(JSON.stringify({{}}));
""".format(
        project_env_var=project_env_var,
        source_rel_path_json=json.dumps(source_rel_path),
        global_source_rel_path_json=json.dumps(global_source_rel_path),
    )

def migrate_agents():
    src_dir = Path(CLAUDE_DIR) / "agents"
    dest_dir = Path(GEMINI_DIR) / "agents"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists(): return
    for file in src_dir.glob("*.md"):
        frontmatter, body = parse_markdown_with_frontmatter(file)
        body = apply_target_replacements(body)
        if file.name == "scout-external.md":
            # Render after generic replacements so the literal fallback is not rewritten.
            body = render_external_scout_strategy(body, GEMINI_EXTERNAL_SCOUT_STRATEGY)
        if file.name == "advisor.md":
            body = project_advisor_contract(body, "gemini")
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
            if isinstance(raw_tools, str):
                tools_list = [t.strip() for t in raw_tools.split(",")]
            elif isinstance(raw_tools, list):
                tools_list = [str(t) for t in raw_tools]
            else:
                tools_list = [str(raw_tools)]
            
            mapped_tools = []
            for t in tools_list:
                gemini_tool = TOOL_MAPPING.get(t, t)
                if gemini_tool in VALID_GEMINI_TOOLS or gemini_tool.startswith("mcp_"):
                    mapped_tools.append(gemini_tool)
            
            frontmatter["tools"] = sorted(list(set(mapped_tools)))
            if not frontmatter["tools"]:
                 frontmatter["tools"] = ["read_file", "glob", "grep_search"]

        for key in list(frontmatter.keys()):
            val = frontmatter[key]
            if isinstance(val, str):
                frontmatter[key] = apply_target_replacements(val)
            elif isinstance(val, list):
                frontmatter[key] = [apply_target_replacements(item) if isinstance(item, str) else item for item in val]
            
            if key in ["Examples", "Context", "user", "assistant"]:
                del frontmatter[key]
        if file.name == "advisor.md":
            frontmatter["description"] = "Use this high-tier mentor for fresh named checkpoints; Gemini rejects interview relay."

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
        if file.name == "advise.md":
            body = render_inline_advise_command(body, "gemini", "ask_user").strip()
        else:
            body = apply_target_replacements(body)
        description = apply_target_replacements(str(frontmatter.get("description", "")))
        if file.name == "advise.md":
            description = "Interview-first technical advice with native inline questioning and explicit relay rejection."
        with open(dest_path, "w", encoding="utf-8") as f:
            write_toml_simple({"description": description, "prompt": body.strip()}, f)
        print(f"Migrated command: {rel_path}")

def migrate_commands_as_native_skills():
    src_dir = Path(CLAUDE_DIR) / "commands"
    dest_dir = Path(GEMINI_DIR) / "skills"
    if not src_dir.exists(): return
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    count = 0
    for source in src_dir.rglob("*.md"):
        rel_path = source.relative_to(src_dir).with_suffix("")
        cmd_name = str(rel_path).replace("\\", "/")
        
        frontmatter, body = parse_markdown_with_frontmatter(source)
        desc = frontmatter.get("description", "Migrated command from .claude")
        
        skill_dir_name = "cmd_" + str(rel_path).replace("\\", "_").replace("/", "_")
        skill_dir = dest_dir / skill_dir_name
        skill_dir.mkdir(parents=True, exist_ok=True)
        
        if cmd_name == "advise":
            body = render_inline_advise_command(body, "gemini", "ask_user").strip()
            desc = "Interview-first technical advice with native inline questioning and explicit relay rejection."
        else:
            body = apply_target_replacements(body)
        
        content = (
            f"---\nname: {skill_dir_name}\ndescription: {desc}\n---\n"
            f"# {skill_dir_name}\n\n"
            f"Command Path: /{cmd_name}\n\n"
            f"Description: {desc}\n\n"
            f"{body}"
        )
        (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")
        count += 1
    print(f"Migrated {count} native skills for commands")

def is_text_file(file_path):
    """Check if a file is likely text-based and not binary."""
    binary_exts = {'.pyc', '.exe', '.dll', '.so', '.dylib', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.coverage', '.pyo'}
    if file_path.suffix.lower() in binary_exts: return False
    try:
        with open(file_path, 'rb') as f:
            chunk = f.read(1024)
            return b'\x00' not in chunk
    except OSError as error:
        raise RuntimeError(f"Could not inspect source file {file_path}") from error

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
            shutil.copytree(skill_dir, dest_skill_dir, dirs_exist_ok=True, ignore=ignore_migration_artifacts)
            for target_file in dest_skill_dir.rglob("*"):
                if target_file.is_file() and is_text_file(target_file):
                    if target_file.name.lower() == "skill.md" and target_file.name != "SKILL.md":
                        new_md_file = target_file.with_name("SKILL.md")
                        target_file.rename(new_md_file)
                        target_file = new_md_file
                    with open(target_file, "r", encoding="utf-8") as f: content = f.read()
                    new_content = apply_target_replacements(content)
                    if new_content != content or target_file.suffix.lower() == ".sh":
                        with open(target_file, "w", encoding="utf-8", newline="\n") as f: f.write(new_content)
            print(f"Migrated skill: {skill_dir.name} -> {skill_name}")

def migrate_workflows():
    src_dir = Path(CLAUDE_DIR) / "workflows"
    dest_dir = Path(GEMINI_DIR) / "workflows"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if not src_dir.exists(): return
    for file in src_dir.glob("*.md"):
        with open(file, "r", encoding="utf-8") as f: content = f.read()
        if file.name == "advisory-interview.md":
            content = render_advisory_interview_workflow(content, "gemini")
        dest_file = dest_dir / file.name
        content = apply_target_replacements(content)
        with open(dest_file, "w", encoding="utf-8") as f: f.write(content)
        print(f"Migrated workflow: {file.name}")


def migrate_evcrate_config():
    """Copy target-local config inputs used by migrated Gemini hooks."""

    for name in (".evcrate.json", ".evcrateignore"):
        source = Path(CLAUDE_DIR) / name
        if not os.path.lexists(source):
            continue
        if source.is_symlink() or not source.is_file():
            raise RuntimeError(f"Canonical EVCrate config input is missing or unsafe: {source}")
        destination = Path(GEMINI_DIR) / name
        _assert_safe_file_target(destination, "Gemini config input")
        _clear_managed_path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        shutil.copymode(source, destination)


def migrate_hook_sources():
    """Copy target-local hook sources and their relative helper closure."""

    source_dir = Path(CLAUDE_DIR) / "hooks"
    dest_dir = Path(GEMINI_DIR) / "hooks"
    if not os.path.lexists(source_dir):
        return
    if source_dir.is_symlink() or not source_dir.is_dir():
        raise RuntimeError(f"Canonical hook directory is missing or unsafe: {source_dir}")
    for source in sorted(source_dir.rglob("*")):
        if source.is_symlink():
            raise RuntimeError(f"Canonical hook is symlinked: {source}")
        if not source.is_file():
            continue
        relative = source.relative_to(source_dir)
        if (
            "__pycache__" in relative.parts
            or relative.suffix.lower() in {".pyc", ".pyo"}
            or any(part in {"__tests__", "tests", "fixtures", "helpers"} for part in relative.parts)
            or is_production_runtime_artifact(relative)
        ):
            continue
        # Gemini generates a wrapper with the canonical session-end filename;
        # keep the source implementation beside it instead of overwriting it.
        destination_relative = (
            Path("claude-session-end.cjs")
            if relative.as_posix() == "session-end.cjs"
            else relative
        )
        destination = dest_dir / destination_relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if is_text_file(source):
            destination.write_text(
                apply_target_replacements(source.read_text(encoding="utf-8")),
                encoding="utf-8",
                newline="\n",
            )
        else:
            destination.write_bytes(source.read_bytes())
        shutil.copymode(source, destination)
        print(f"Migrated hook source: {relative}")


def migrate_scripts():
    src_dir = Path(CLAUDE_DIR) / "scripts"
    dest_dir = Path(GEMINI_DIR) / "scripts"
    dest_dir.mkdir(parents=True, exist_ok=True)
    if src_dir.is_symlink():
        raise RuntimeError(f"Canonical script directory is symlinked: {src_dir}")
    if not src_dir.is_dir(): return
    for source in src_dir.rglob("*"):
        rel_path = source.relative_to(src_dir)
        if "advise-state" in rel_path.name:
            continue
        if rel_path.suffix.lower() in {".pyc", ".pyo"}:
            continue
        if "__pycache__" in rel_path.parts:
            continue
        if any(part in {"__tests__", "tests", "fixtures", "helpers"} for part in rel_path.parts):
            continue
        if is_production_runtime_artifact(rel_path):
            continue
        dest_path = dest_dir / rel_path
        if source.is_symlink():
            raise RuntimeError(f"Canonical script is symlinked: {source}")
        if source.is_dir():
            dest_path.mkdir(parents=True, exist_ok=True)
            continue
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest_path)
        if rel_path.as_posix() in ADVISOR_RUNTIME_FILES:
            # The resolver is one cross-harness contract; product-name rewrites
            # would corrupt its host table, bridge detection, or its static
            # capability document.
            print(f"Migrated advisor runtime: {rel_path}")
            continue
        if is_text_file(dest_path):
            with open(dest_path, "r", encoding="utf-8") as f: content = f.read()
            content = apply_target_replacements(content)
            if rel_path.as_posix() == "ev-help.py":
                # Keep both source and target project variables in the
                # portable discovery tuple for migrated help scripts.
                content = content.replace(
                    '("GEMINI_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR")',
                    '("CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR")',
                    1,
                )
            with open(dest_path, "w", encoding="utf-8") as f: f.write(content)
        print(f"Migrated script: {rel_path}")
    if any((src_dir / relative).is_file() for relative in ADVISOR_RUNTIME_FILES):
        for relative in ADVISOR_RUNTIME_FILES:
            generated = dest_dir / relative
            if not generated.is_file() or generated.is_symlink():
                raise RuntimeError(f"Canonical advisor runtime file is missing or unsafe: {generated}")

def migrate_mcp():
    settings_file = Path(GEMINI_DIR) / "settings.json"
    claude_settings_file = Path(CLAUDE_DIR) / "settings.json"
    _assert_safe_file_target(settings_file, "Gemini settings.json")
    
    # Start with existing Gemini settings or empty
    settings = read_json(settings_file)
    
    # If Claude settings exist, migrate them as a base
    if claude_settings_file.exists():
        claude_settings = read_json(claude_settings_file)
        # Apply replacements to the whole Claude settings dict
        claude_settings_str = json.dumps(claude_settings)
        claude_settings_str = apply_target_replacements(claude_settings_str)
        # Fix the node "..." command patterns that apply_replacements might have missed or partially changed
        claude_settings_str = re.sub(
            r'node\s+\"(\$GEMINI_PROJECT_DIR)\"/\.gemini/hooks/',
            r'\1/.gemini/hooks/',
            claude_settings_str
        )
        # Also handle unquoted node $GEMINI_PROJECT_DIR
        claude_settings_str = re.sub(
            r'node\s+(\$GEMINI_PROJECT_DIR)/\.gemini/hooks/',
            r'\1/.gemini/hooks/',
            claude_settings_str
        )
        
        claude_settings = json.loads(claude_settings_str)
        
        # Map Claude hooks to Gemini hooks
        if "hooks" in claude_settings:
            gemini_hooks = {}
            for claude_event, groups in claude_settings["hooks"].items():
                gemini_event = GEMINI_HOOK_EVENT_MAP.get(claude_event)
                if gemini_event:
                    # Initialize or merge groups
                    if gemini_event not in gemini_hooks:
                        gemini_hooks[gemini_event] = []
                    
                    for group in groups:
                        # Clean up matchers in group
                        if "matcher" in group:
                            matcher = group["matcher"]
                            for old_tool, new_tool in TOOL_MAPPING.items():
                                matcher = re.sub(rf"\b{old_tool}\b", new_tool, matcher)
                            group["matcher"] = matcher
                        
                        # Clean up hooks in group
                        for hook in group.get("hooks", []):
                            # Ensure name exists for merging
                            if "name" not in hook:
                                command = hook.get("command", "")
                                if "session-init" in command: hook["name"] = "claude-session-start"
                                elif "dev-rules" in command: hook["name"] = "claude-user-prompt-submit"
                                elif "scout-block" in command: hook["name"] = "claude-scout-block"
                                elif "privacy-block" in command: hook["name"] = "claude-privacy-block"
                                elif "session-end" in command: hook["name"] = "claude-session-end"
                                else:
                                    # Python hashes vary by process. A digest keeps builds stable.
                                    digest = hashlib.sha256(command.encode("utf-8")).hexdigest()[:8]
                                    hook["name"] = f"migrated-{claude_event.lower()}-{digest}"
                        
                        gemini_hooks[gemini_event].append(group)
            
            claude_settings["hooks"] = gemini_hooks
        
        # Merge Claude settings into our base
        settings = deep_merge(settings, claude_settings)

    # Now apply the hardcoded Gemini overrides/bridges
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
                "matcher": "run_command|grep_search|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file",
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
    
    settings = deep_merge(settings, migration_settings)
    
    # Final cleanup: remove unsupported hook types and ensure everything is Gemini-branded
    if "hooks" in settings:
        for event in list(settings["hooks"].keys()):
            if event in GEMINI_UNSUPPORTED_EVENTS:
                del settings["hooks"][event]
    
    # Remove effortLevel and env as they might be Claude-specific
    for key in ["effortLevel", "env", "includeCoAuthoredBy", "statusLine"]:
        if key in settings:
            del settings[key]

    with open(settings_file, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
    print("Migrated settings (Gemini 3.1 Flash-Lite)")


if __name__ == "__main__":
    _assert_safe_source_tree(CLAUDE_DIR, "Canonical Claude source")
    preflight_destination()
    clean_destination()
    migrate_evcrate_config()
    migrate_agents()
    migrate_commands()
    migrate_commands_as_native_skills()
    migrate_scripts()
    migrate_skills()
    migrate_workflows()
    migrate_hook_sources()
    write_gemini_memory_wrapper()
    write_gemini_hook_assets()
    migrate_mcp()
    write_behavior_matrix()
    print("\nMigration complete!")
