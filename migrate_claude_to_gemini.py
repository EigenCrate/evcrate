import os
import re
import yaml
import shutil
import json
from pathlib import Path

CLAUDE_DIR = ".claude"
GEMINI_DIR = ".gemini"

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
    r"claude": "gemini",
    r"claudekit": "geminikit",
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

def apply_replacements(text):
    if not isinstance(text, str):
        return text
    for pattern, replacement in REPLACEMENTS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text

def clean_destination():
    for subdir in ["agents", "commands", "skills", "workflows"]:
        dest_dir = Path(GEMINI_DIR) / subdir
        if dest_dir.exists():
            print(f"Cleaning destination: {dest_dir}")
            shutil.rmtree(dest_dir)

def parse_markdown_with_frontmatter(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if match:
        frontmatter_raw = match.group(1)
        body = match.group(2)
        try:
            frontmatter = yaml.safe_load(frontmatter_raw)
        except Exception:
            frontmatter = {}
        return frontmatter, body
    return {}, content

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
            f.write("---\n")
            yaml.dump(frontmatter, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            f.write("---\n")
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
            skill_name = "gemini-cli" if skill_dir.name == "claude-code" else re.sub(r"claude", "gemini", skill_dir.name, flags=re.IGNORECASE)
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

def migrate_mcp():
    mcp_example = Path(CLAUDE_DIR) / ".mcp.json.example"
    settings_file = Path(GEMINI_DIR) / "settings.json"
    mcp_config = {}
    if mcp_example.exists():
        with open(mcp_example, "r") as f:
            try: mcp_config = json.load(f).get("mcpServers", {})
            except: pass
    settings = {"model": {"name": "gemini-3.1-flash-lite-preview"}, "mcpServers": mcp_config}
    if settings_file.exists():
        try:
            with open(settings_file, "r") as f:
                existing = json.load(f)
                existing.update(settings)
                settings = existing
        except: pass
    with open(settings_file, "w") as f: json.dump(settings, f, indent=2)
    print("Migrated settings (Gemini 3.1 Flash-Lite)")

if __name__ == "__main__":
    clean_destination()
    migrate_agents()
    migrate_commands()
    migrate_skills()
    migrate_workflows()
    migrate_mcp()
    print("\nMigration complete!")
