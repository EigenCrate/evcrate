#!/usr/bin/env python3
"""
    EVCrate Help Command - All-in-one guide with dynamic command discovery.
Scans .pi/commands/ directory to build catalog at runtime.

Usage:
    python ev-help.py                    # Overview with quick start
    python ev-help.py fix                # Category guide with workflow
    python ev-help.py plan:fast          # Command details
    python ev-help.py debug login error  # Task recommendations
    python ev-help.py auth               # Search (unknown word)
"""

import sys
import re
import io
import ast
import os
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python 3.10 compatibility
    try:
        import tomli as tomllib
    except ModuleNotFoundError:
        tomllib = None

# Fix Windows console encoding for Unicode characters
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


# Output type markers for LLM presentation guidance
# Format: @EVCRATE_OUTPUT_TYPE:<type>
# Types:
#   - comprehensive-docs: Full documentation, show verbatim + add context
#   - category-guide: Workflow guide, show full + explain workflow
#   - command-details: Single command, show + offer to run
#   - search-results: Search matches, show + offer alternatives
#   - task-recommendations: Task-based suggestions, explain reasoning
OUTPUT_TYPES = {
    "comprehensive-docs": "Show FULL output verbatim, then ADD helpful context, examples, and real-world tips",
    "category-guide": "Show complete workflow, then ENHANCE with practical usage scenarios",
    "command-details": "Show command info, then ADD usage examples and related commands",
    "search-results": "Show all matches, then HELP user narrow down or explore",
    "task-recommendations": "Show recommendations, then EXPLAIN why these fit and offer to start",
}


def emit_output_type(output_type: str) -> None:
    """Emit output type marker for LLM presentation guidance."""
    print(f"@EVCRATE_OUTPUT_TYPE:{output_type}")
    print()


# Task keyword mappings for intent detection
TASK_MAPPINGS = {
    "fix": ["fix", "bug", "error", "broken", "issue", "debug", "crash", "fail", "wrong", "not working"],
    "plan": ["plan", "design", "architect", "research", "think", "analyze", "strategy", "how to", "approach"],
    "cook": ["implement", "build", "create", "add", "feature", "code", "develop", "make", "write"],
    "bootstrap": ["start", "new", "init", "setup", "project", "scaffold", "generate", "begin"],
    "test": ["test", "check", "verify", "validate", "spec", "unit", "integration", "coverage"],
    "docs": ["document", "readme", "docs", "explain", "comment", "documentation"],
    "git": ["commit", "push", "pr", "merge", "branch", "pull", "request", "git"],
    "design": ["ui", "ux", "style", "layout", "visual", "css", "component", "page", "responsive"],
    "review": ["review", "audit", "inspect", "quality", "refactor", "clean"],
    "content": ["copy", "text", "marketing", "content", "blog", "seo"],
    "skill": ["skill", "agent", "automate", "workflow"],
    "scout": ["find", "search", "locate", "explore", "scan", "where"],
    "config": ["config", "configure", "settings", "evcrate.json", ".evcrate.json", "setup", "locale", "language", "paths"],
    "coding-level": ["coding", "level", "eli5", "junior", "senior", "lead", "god", "beginner", "expert", "teach", "learn", "explain"],
    # New categories
    "worktree": ["worktree", "parallel", "isolate", "isolation", "concurrent", "multiple branches"],
    "journal": ["journal", "diary", "log", "entry", "reflect", "failure", "lesson"],
    "brainstorm": ["brainstorm", "idea", "ideate", "creative", "explore ideas", "think through"],
    "watzup": ["watzup", "status", "summary", "wrap up", "what's up", "recent", "changes"],
}

# Category workflows and tips
CATEGORY_GUIDES = {
    "fix": {
        "title": "Fixing Issues",
        "workflow": [
            ("Start", "`/fix` \"describe your issue\""),
            ("If stuck", "`/debug` \"more details\""),
            ("Verify", "`/test`"),
        ],
        "tip": "Include error messages for better results",
    },
    "plan": {
        "title": "Planning",
        "workflow": [
            ("Quick plan", "`/plan:fast` \"your task\""),
            ("Deep research", "`/plan:hard` \"complex task\""),
            ("Validate", "`/plan:validate` (interview to confirm decisions)"),
            ("Execute plan", "`/code` (runs the plan)"),
        ],
        "tip": "Use /plan:validate to confirm assumptions before coding",
    },
    "cook": {
        "title": "Implementation",
        "workflow": [
            ("Quick impl", "`/cook` \"your feature\""),
            ("Auto mode", "`/cook:auto` \"trust me bro\""),
            ("Test", "`/test`"),
        ],
        "tip": "Cook is standalone - it plans internally. Use /plan → /code for explicit planning",
    },
    "bootstrap": {
        "title": "Project Setup",
        "workflow": [
            ("Quick start", "`/bootstrap:auto:fast` \"requirements\""),
            ("Full setup", "`/bootstrap` \"detailed requirements\""),
        ],
        "tip": "Include tech stack preferences in description",
    },
    "test": {
        "title": "Testing",
        "workflow": [
            ("Run tests", "`/test`"),
            ("Fix failures", "`/fix:test`"),
        ],
        "tip": "Run tests frequently during development",
    },
    "docs": {
        "title": "Documentation",
        "workflow": [
            ("Initialize", "`/docs:init`"),
            ("Update", "`/docs:update`"),
        ],
        "tip": "Keep docs close to code for accuracy",
    },
    "git": {
        "title": "Git Workflow",
        "workflow": [
            ("Commit", "`/git:cm`"),
            ("Push", "`/git:cp`"),
            ("PR", "`/git:pr`"),
        ],
        "tip": "Commit often with clear messages",
    },
    "design": {
        "title": "Design",
        "workflow": [
            ("Quick design", "`/design:fast` \"description\""),
            ("From screenshot", "`/design:screenshot` <path>"),
            ("3D design", "`/design:3d` \"description\""),
        ],
        "tip": "Reference existing designs for consistency",
    },
    "review": {
        "title": "Code Review",
        "workflow": [
            ("Full review", "`/review:codebase`"),
        ],
        "tip": "Review before merging to main",
    },
    "content": {
        "title": "Content Creation",
        "workflow": [
            ("Quick copy", "`/content:fast` \"requirements\""),
            ("Quality copy", "`/content:good` \"requirements\""),
            ("Optimize", "`/content:cro`"),
        ],
        "tip": "Know your audience before writing",
    },
    "skill": {
        "title": "Skill Management",
        "workflow": [
            ("Create", "`/skill:create`"),
            ("Optimize", "`/skill:optimize`"),
        ],
        "tip": "Skills extend agent capabilities",
    },
    "scout": {
        "title": "Codebase Exploration",
        "workflow": [
            ("Find files", "`/scout` \"what to find\""),
            ("External tools", "`/scout:ext` \"query\""),
        ],
        "tip": "Be specific about what you're looking for",
    },
    "coding-level": {
        "title": "Coding Level (Adaptive Communication)",
        "workflow": [
            ("Disabled", "`codingLevel: -1` (default, no injection)"),
            ("ELI5", "`codingLevel: 0` (analogies, baby steps)"),
            ("Junior", "`codingLevel: 1` (WHY before HOW)"),
            ("Mid-Level", "`codingLevel: 2` (patterns, trade-offs)"),
            ("Senior", "`codingLevel: 3` (production code, ops)"),
            ("Tech Lead", "`codingLevel: 4` (risk matrix, strategy)"),
            ("God Mode", "`codingLevel: 5` (code first, no fluff)"),
        ],
        "tip": "Set in .evcrate.json. Guidelines auto-inject on session start",
    },
    "config": {
        "title": "EVCrate Configuration (.evcrate.json)",
        "workflow": [
            ("Global", "Set user prefs in `~/.pi/.evcrate.json`"),
            ("Local", "Override per-project in `./.pi/.evcrate.json`"),
            ("Resolution", "DEFAULT → global → local (deep merge)"),
        ],
        "tip": "Global config works in fresh dirs; local overrides for projects",
    },
    # New category guides (workflow-first approach)
    "worktree": {
        "title": "Git Worktrees (Parallel Development)",
        "workflow": [
            ("Create worktree", "`/worktree` \"feature description\""),
            ("Work in isolation", "cd to worktree, implement, test"),
            ("Review & merge", "`/git:pr` from worktree → merge → cleanup"),
            ("List worktrees", "`/worktree list`"),
            ("Remove worktree", "`/worktree remove <name>`"),
        ],
        "tip": "Use worktrees for parallel features without stashing. Each worktree = isolated branch + clean working directory",
    },
    "journal": {
        "title": "Technical Journaling",
        "workflow": [
            ("Write entry", "`/journal`"),
            ("Document failures", "Capture what went wrong with emotional honesty"),
            ("Lessons learned", "Turn setbacks into future guidance"),
        ],
        "tip": "Use after repeated test failures, critical bugs, or architectural pivots. Raw honesty = future wisdom",
    },
    "brainstorm": {
        "title": "Brainstorming & Ideation",
        "workflow": [
            ("Quick brainstorm", "`/brainstorm \"your question\"`"),
            ("Explore approaches", "Get 2-3 viable solutions with trade-offs"),
            ("Challenge assumptions", "Receive brutally honest feedback"),
        ],
        "tip": "Respects codingLevel. Set `codingLevel: 0` for ELI5 explanations or `5` for expert-only mode",
    },
    "watzup": {
        "title": "Session Review & Wrap-up",
        "workflow": [
            ("Review changes", "`/watzup`"),
            ("Get summary", "See what was done, what files changed"),
            ("Next steps", "Receive suggestions for what to do next"),
        ],
        "tip": "Run before ending session to capture progress and plan next steps",
    }
}


def detect_prefix(commands_dir: Path) -> str:
    """Detect if commands use /evcrate: prefix based on directory structure."""
    evcrate_commands_dir = commands_dir / "evcrate"
    return "evcrate:" if evcrate_commands_dir.exists() and evcrate_commands_dir.is_dir() else ""


def parse_frontmatter(file_path: Path) -> dict:
    """Parse YAML frontmatter from a markdown file."""
    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception:
        return {}

    # Check for frontmatter
    if not content.startswith('---'):
        return {}

    # Find closing ---
    end_idx = content.find('---', 3)
    if end_idx == -1:
        return {}

    frontmatter = content[3:end_idx].strip()
    result = {}

    for line in frontmatter.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            result[key.strip()] = value.strip()

    return result


def parse_command_metadata(file_path: Path) -> dict:
    """Read command metadata from Claude Markdown or migrated TOML files."""
    if file_path.suffix == ".toml":
        try:
            content = file_path.read_text(encoding="utf-8")
        except OSError:
            return {}
        if tomllib is None:
            match = re.search(r"^description\s*=\s*(\".*\")\s*$", content, re.MULTILINE)
            if not match:
                return {}
            try:
                return {"description": ast.literal_eval(match.group(1))}
            except (SyntaxError, ValueError):
                return {}
        try:
            return tomllib.loads(content)
        except (OSError, tomllib.TOMLDecodeError):
            return {}
    return parse_frontmatter(file_path)


COMMAND_PATH_RE = re.compile(r"(?im)^\s*Command Path:\s*(/\S+)")


def _normalize_command_path(command_path: str) -> str:
    """Use the canonical colon form for commands stored as skill paths."""
    command_path = command_path.strip()
    if not command_path.startswith("/"):
        return ""
    command_name = command_path[1:]
    if command_name.startswith("evcrate:"):
        return command_path
    return "/" + command_name.replace("/", ":")


def _skill_category(command_name: str) -> str:
    """Match command-file categories, including root evcrate-prefixed commands."""
    name = command_name.removeprefix("/")
    if name.startswith("evcrate:") or ":" not in name:
        return "core"
    return name.split(":", 1)[0]


def discover_skill_commands(skills_dir: Path) -> dict:
    """Discover migrated cmd_* skills through their embedded Command Path."""
    commands = {}
    categories = {}
    if not skills_dir.is_dir():
        return {"commands": commands, "categories": categories}

    for skill_file in sorted(skills_dir.glob("cmd_*/SKILL.md")):
        metadata = parse_command_metadata(skill_file)
        description = metadata.get("description", "")
        match = COMMAND_PATH_RE.search(skill_file.read_text(encoding="utf-8"))
        if not description or not match:
            continue

        command_name = _normalize_command_path(match.group(1))
        if not command_name:
            continue
        category = _skill_category(command_name)
        clean_desc = re.sub(r"^[^\w\s]+\s*", "", description).strip()
        commands.setdefault(category, []).append({
            "name": command_name,
            "description": clean_desc,
            "category": category,
        })
        categories.setdefault(category, category.title())

    for category in commands:
        commands[category].sort(key=lambda command: command["name"])
    return {"commands": commands, "categories": categories}


def _candidate_roots(*roots: Path) -> list[Path]:
    """Return unique roots plus their parents for project-local execution."""
    candidates = []
    for root in roots:
        try:
            current = root.expanduser().resolve()
        except OSError:
            continue
        for candidate in (current, *current.parents):
            if candidate not in candidates:
                candidates.append(candidate)
    return candidates


def resolve_command_source(script_path: Path) -> tuple[str, Path]:
    """Find canonical commands or a generated target's command skills."""
    target_root = script_path.parent.parent
    direct_commands = target_root / "commands"
    if direct_commands.is_dir():
        return "commands", direct_commands

    # Antigravity removes commands while retaining generated cmd_* skills.
    direct_skills = target_root / "skills"
    if target_root.name == "antigravity" and direct_skills.is_dir():
        return "skills", direct_skills

    project_roots = [
        Path(value)
        for name in ("CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR")
        if (value := os.environ.get(name))
    ]
    project_roots.extend((target_root.parent, Path.cwd()))
    for project_root in _candidate_roots(*project_roots):
        commands_dir = project_root / ".pi" / "commands"
        if commands_dir.is_dir():
            return "commands", commands_dir

    # Codex publishes generated command skills as a sibling .agents tree.
    codex_skills = target_root.parent / ".agents" / "skills"
    if target_root.name == ".codex" and codex_skills.is_dir():
        return "skills", codex_skills

    if direct_skills.is_dir():
        return "skills", direct_skills
    return "", target_root / "commands"


def discover_commands(commands_dir: Path, prefix: str) -> dict:
    """Scan command files and build the command catalog."""
    commands = {}
    categories = {}

    if not commands_dir.exists():
        return {"commands": commands, "categories": categories}

    command_files = sorted(
        [*commands_dir.rglob("*.md"), *commands_dir.rglob("*.toml")]
    )
    for command_file in command_files:
        # Skip non-command files
        rel_path = command_file.relative_to(commands_dir)
        parts = rel_path.parts

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

        # Parse frontmatter
        fm = parse_command_metadata(command_file)
        description = fm.get('description', '')

        # Skip if no description (not a real command)
        if not description:
            continue

        # Clean description (remove emoji indicators)
        clean_desc = re.sub(r'^[^\w\s]+\s*', '', description).strip()

        # Format command name with prefix
        formatted_name = f"/{prefix}{cmd_name}" if prefix else f"/{cmd_name}"

        # Add to commands
        if category not in commands:
            commands[category] = []

        commands[category].append({
            "name": formatted_name,
            "description": clean_desc,
            "category": category,
        })

        # Track categories
        if category not in categories:
            categories[category] = category.title()

    # Sort commands within each category
    for cat in commands:
        commands[cat].sort(key=lambda x: x["name"])

    return {"commands": commands, "categories": categories}


def detect_intent(input_str: str, categories: list) -> str:
    """Smart auto-detection of user intent."""
    if not input_str:
        return "overview"

    input_lower = input_str.lower()
    words = input_str.split()

    # Multiple words = likely task description (even if first word is a category)
    # e.g., "test my login" should be task, not category "test"
    if len(words) >= 2:
        # Exception: if it looks like a command (has colon), treat as command
        if ':' in input_str:
            return "command"
        return "task"

    # Single word: check if it's a known category from discovered commands
    if input_lower in [c.lower() for c in categories]:
        return "category"

    # Check if it's a known category from CATEGORY_GUIDES (includes non-command categories)
    if input_lower in [c.lower() for c in CATEGORY_GUIDES.keys()]:
        return "category"

    # Check if it looks like a command (has colon)
    if ':' in input_str:
        return "command"

    return "search"


def show_overview(data: dict, prefix: str) -> None:
    """Display overview with quick start guide."""
    emit_output_type("category-guide")

    commands = data["commands"]
    categories = data["categories"]
    total = sum(len(cmds) for cmds in commands.values())
    help_cmd = f"/{prefix}evcrate-help" if prefix else "/evcrate-help"

    print("# EVCrate Commands")
    print()
    print(f"{total} commands across {len(categories)} categories.")
    print()
    print("**Quick Start:**")
    print(f"- `/{prefix}cook` - Implement features (standalone)")
    print(f"- `/{prefix}plan` + `/{prefix}code` - Plan then execute")
    print(f"- `/{prefix}fix` - Fix bugs intelligently")
    print(f"- `/{prefix}test` - Run and analyze tests")
    print()
    print("**Common Workflows:**")
    print(f"- New feature: `/{prefix}plan` → `/{prefix}code` → `/{prefix}test` → `/{prefix}git:pr`")
    print(f"- Bug fix: `/{prefix}debug` → `/{prefix}fix` → `/{prefix}test` → `/{prefix}git:cm`")
    print(f"- Review: `/{prefix}scout` → `/{prefix}review` → `/{prefix}watzup`")
    print()
    print("**Categories:**")
    for cat_key in sorted(categories.keys()):
        count = len(commands.get(cat_key, []))
        print(f"- `{cat_key}` ({count})")
    print()
    print("**Usage:**")
    print(f"- `{help_cmd} <category>` - Category guide with workflow")
    print(f"- `{help_cmd} <command>` - Command details")
    print(f"- `{help_cmd} <task description>` - Recommendations")
    print()
    print("**Tips:**")
    print(f"- Unclear about approach? → `/{prefix}brainstorm` first")
    print(f"- Agent generated report? → `/{prefix}preview` to view")
    print("- Add `ultrathink` for deep analysis (more tokens)")
    print("- `:parallel` variants (e.g., `/code:parallel`) = faster but more tokens, check quota")


def show_category_guide(data: dict, category: str, prefix: str) -> None:
    """Display category guide with workflow and tips."""
    emit_output_type("category-guide")

    categories = data["categories"]
    commands = data["commands"]

    # Find matching category (case-insensitive) - check both discovered and CATEGORY_GUIDES
    cat_key = None
    for key in categories:
        if key.lower() == category.lower():
            cat_key = key
            break

    # Also check CATEGORY_GUIDES for categories without discovered commands (worktree, etc.)
    if not cat_key:
        for key in CATEGORY_GUIDES.keys():
            if key.lower() == category.lower():
                cat_key = key
                break

    if not cat_key:
        all_cats = set(categories.keys()) | set(CATEGORY_GUIDES.keys())
        print(f"Category '{category}' not found.")
        print()
        print("Available: " + ", ".join(f"`{c}`" for c in sorted(all_cats)))
        return

    cmds = commands.get(cat_key, [])
    guide = CATEGORY_GUIDES.get(cat_key, {})

    print(f"# {guide.get('title', cat_key.title())}")
    print()

    # Workflow first (most important)
    if "workflow" in guide:
        print("**Workflow:**")
        for step, cmd in guide["workflow"]:
            print(f"- {step}: {cmd}")
        print()

    # Commands list (only if we have discovered commands for this category)
    if cmds:
        print("**Commands:**")
        for cmd in cmds:
            print(f"- `{cmd['name']}` - {cmd['description']}")

    # Tip at the end
    if "tip" in guide:
        print()
        print(f"*Tip: {guide['tip']}*")


def show_command(data: dict, command: str, prefix: str) -> None:
    """Display command details."""
    emit_output_type("command-details")

    commands = data["commands"]

    # Normalize search term
    search = command.lower().replace("/evcrate:", "").replace("/", "").replace(":", "")

    found = None
    for cmds in commands.values():
        for cmd in cmds:
            # Normalize command name for comparison
            name = cmd["name"].lower().replace("/evcrate:", "").replace("/", "").replace(":", "")
            if name == search:
                found = cmd
                break
        if found:
            break

    if not found:
        print(f"Command '{command}' not found.")
        print()
        do_search(data, command.replace(":", " "), prefix)
        return

    print(f"# `{found['name']}`")
    print()
    print(found['description'])
    print()
    print(f"**Category:** {found['category']}")
    print()
    print(f"**Usage:** `{found['name']} <your-input>`")

    # Show related commands (same category)
    cat = found['category']
    if cat in commands:
        related = [c for c in commands[cat] if c['name'] != found['name']][:3]
        if related:
            related_names = ", ".join(f"`{r['name']}`" for r in related)
            print()
            print(f"**Related:** {related_names}")


def advisory_target(script_path: Path) -> str:
    """Infer the generated host from the portable help script location."""

    for parent in (script_path.parent, *script_path.parents):
        if parent.name in {".antigravity", ".codex", ".gemini", ".pi"}:
            return parent.name.removeprefix(".")
    return "cla" + "ude"


def show_advisory_guide(prefix: str, target: str) -> None:
    """Explain checkpoint, inline, and target-accurate relay capabilities."""
    relay_target = "cla" + "ude"
    supports_relay = target == relay_target
    emit_output_type("command-details")
    command = f"/{prefix}advise" if prefix else "/advise"
    print(f"# `{command}`")
    print()
    if supports_relay:
        print(f"Interview-first technical advice with an optional {relay_target.title()}-only relay.")
    else:
        print("Interview-first technical advice with a native inline interview.")
    print()
    print("**Usage:**")
    print(f"- `{command} <prompt-or-url>` - inline interview in the main session")
    if supports_relay:
        print(f"- `{command} <prompt-or-url> --agent` - {relay_target.title()} relay v1")
    else:
        error = f"ADVISE_AGENT_RELAY_UNSUPPORTED_{target.upper()}"
        print(f"- `{command} <prompt-or-url> --agent` - rejects with `{error}`")
    print()
    print("**Interview contract:** one question per turn, explicit reframe confirmation, eight discovery-question cap, two reframe cycles, and a linked sanitized report.")
    print()
    if supports_relay:
        unsupported_targets = ("codex", "pi", "gemini", "antigravity")
        projected_names = ", ".join(name.title() for name in unsupported_targets)
        print(f"**Relay capability:** `--agent` is supported only by {relay_target.title()} relay v1. {projected_names} must reject it explicitly; they must not silently run inline or create relay state.")
    else:
        print(f"**Relay capability:** this {target} projection rejects `--agent` before advisor delegation or relay-state creation. Run `{command} <prompt-or-url>` for inline advice.")
    print()
    if supports_relay:
        print(f"**State retention ({relay_target.title()} relay only):** paused/failed relay state is retained for seven days; completed relay state leaves a 24-hour tombstone.")
    else:
        print("**State retention:** this projection creates no relay state.")
    print()
    print("`--advice` is a separate one-shot checkpoint counsel mode for implementation commands. `@advisor` is ordinary input and never activates supervision.")


def do_search(data: dict, term: str, prefix: str) -> None:
    """Search commands by keyword."""
    emit_output_type("search-results")

    commands = data["commands"]
    term_lower = term.lower()
    matches = []

    for cmds in commands.values():
        for cmd in cmds:
            if term_lower in cmd["name"].lower() or term_lower in cmd["description"].lower():
                matches.append(cmd)

    if not matches:
        print(f"No commands found for '{term}'.")
        print()
        print("Try browsing categories: " + ", ".join(f"`{c}`" for c in sorted(data["categories"].keys())))
        return

    print(f"# Search: {term}")
    print()
    print(f"Found {len(matches)} matches:")
    for cmd in matches[:8]:
        print(f"- `{cmd['name']}` - {cmd['description']}")


def recommend_task(data: dict, task: str, prefix: str) -> None:
    """Recommend commands for a task description."""
    emit_output_type("task-recommendations")

    commands = data["commands"]
    task_lower = task.lower()

    # Score categories by keyword matches (use word boundary to avoid substring false positives)
    # e.g., "git" should not match "digital", "fail" should not match "available"
    scores = {}
    for cat, keywords in TASK_MAPPINGS.items():
        score = 0
        for kw in keywords:
            # Multi-word keywords: exact substring match is fine
            if ' ' in kw:
                if kw in task_lower:
                    score += 1
            # Single-word keywords: require word boundary match
            else:
                if re.search(r'\b' + re.escape(kw) + r'\b', task_lower):
                    score += 1
        if score > 0:
            scores[cat] = score

    if not scores:
        print(f"Not sure about: {task}")
        print()
        print("Try being more specific, or browse categories: " + ", ".join(f"`{c}`" for c in sorted(data["categories"].keys())))
        return

    sorted_cats = sorted(scores.items(), key=lambda x: -x[1])
    top_cat = sorted_cats[0][0]
    guide = CATEGORY_GUIDES.get(top_cat, {})

    print(f"# Recommended for: {task}")
    print()

    # Show workflow first (most actionable)
    if "workflow" in guide:
        print("**Workflow:**")
        for step, cmd in guide["workflow"][:3]:
            print(f"- {step}: {cmd}")
        print()

    # Show relevant commands
    print("**Commands:**")
    shown = 0
    for cat, _ in sorted_cats[:2]:
        if cat in commands:
            for cmd in commands[cat][:2]:
                print(f"- `{cmd['name']}` - {cmd['description']}")
                shown += 1
                if shown >= 4:
                    break
        if shown >= 4:
            break

    if "tip" in guide:
        print()
        print(f"*Tip: {guide['tip']}*")


def show_config_guide() -> None:
    """Display comprehensive .evcrate.json configuration guide."""
    emit_output_type("comprehensive-docs")

    print("# EVCrate Configuration (.evcrate.json)")
    print()
    print("**Locations (cascading resolution):**")
    print("- Global: `~/.pi/.evcrate.json` (user preferences)")
    print("- Local: `./.pi/.evcrate.json` (project overrides)")
    print()
    print("**Resolution Order:** `DEFAULT → global → local`")
    print("- Global config sets user defaults")
    print("- Local config overrides for specific projects")
    print("- Deep merge: nested objects merge recursively")
    print()
    print("**Purpose:** Customize plan naming, paths, locale, and hook behavior.")
    print()
    print("---")
    print()
    print("## Quick Start")
    print()
    print("**Global config** (`~/.pi/.evcrate.json`) - your preferences:")
    print("```json")
    print('{')
    print('  "locale": {')
    print('    "thinkingLanguage": "en",')
    print('    "responseLanguage": "vi"')
    print('  },')
    print('  "plan": { "issuePrefix": "GH-" }')
    print('}')
    print("```")
    print()
    print("**Local override** (`./.pi/.evcrate.json`) - project-specific:")
    print("```json")
    print('{')
    print('  "plan": { "issuePrefix": "JIRA-" },')
    print('  "paths": { "docs": "documentation" }')
    print('}')
    print("```")
    print()
    print("---")
    print()
    print("## Full Schema")
    print()
    print("```json")
    print('{')
    print('  "plan": {')
    print('    "namingFormat": "{date}-{issue}-{slug}",  // Plan folder naming')
    print('    "dateFormat": "YYMMDD-HHmm",              // Date format in names')
    print('    "issuePrefix": "GH-",                     // Issue ID prefix (null = #)')
    print('    "reportsDir": "reports",                  // Reports subfolder')
    print('    "resolution": {')
    print('      "order": ["session", "branch"],  // Resolution chain')
    print('      "branchPattern": "(?:feat|fix|...)/.+"  // Branch slug regex')
    print('    },')
    print('    "validation": {')
    print('      "mode": "prompt",       // "auto" | "prompt" | "off"')
    print('      "minQuestions": 3,      // Min questions to ask')
    print('      "maxQuestions": 8,      // Max questions to ask')
    print('      "focusAreas": ["assumptions", "risks", "tradeoffs", "architecture"]')
    print('    }')
    print('  },')
    print('  "paths": {')
    print('    "docs": "docs",     // Documentation directory')
    print('    "plans": "plans"    // Plans directory')
    print('  },')
    print('  "locale": {')
    print('    "thinkingLanguage": null, // Language for reasoning ("en" recommended)')
    print('    "responseLanguage": null  // Language for output ("vi", "fr", etc.)')
    print('  },')
    print('  "trust": {')
    print('    "passphrase": null,   // Secret for testing context injection')
    print('    "enabled": false      // Enable trust verification')
    print('  },')
    print('  "project": {')
    print('    "type": "auto",           // "monorepo", "single-repo", "auto"')
    print('    "packageManager": "auto", // "npm", "pnpm", "yarn", "auto"')
    print('    "framework": "auto"       // "next", "react", "vue", "auto"')
    print('  },')
    print('  "codingLevel": -1  // Adaptive communication (-1 to 5)')
    print('}')
    print("```")
    print()
    print("---")
    print()
    print("## Key Concepts")
    print()
    print("**Plan Resolution Chain:**")
    print("1. `session` - Check session temp file for active plan")
    print("2. `branch` - Match git branch slug to plan folder")
    print()
    print("**Naming Format Variables:**")
    print("- `{date}` - Formatted date (per dateFormat)")
    print("- `{issue}` - Issue ID with prefix")
    print("- `{slug}` - Descriptive slug from branch or input")
    print()
    print("**Language Settings:**")
    print("- `thinkingLanguage` - Language for internal reasoning (\"en\" recommended)")
    print("- `responseLanguage` - Language for user-facing output (\"vi\", \"fr\", etc.)")
    print()
    print("When both are set, Claude thinks in one language but responds in another.")
    print("This improves precision (English) while maintaining natural output (your language).")
    print()
    print("**Plan Validation:**")
    print("- `mode: \"prompt\"` - Ask user after plan creation (default)")
    print("- `mode: \"auto\"` - Always run validation interview")
    print("- `mode: \"off\"` - Skip; user runs `/plan:validate` manually")
    print()
    print("Validation interviews the user with critical questions to confirm")
    print("assumptions, risks, and architectural decisions before implementation.")
    print()
    print("**Coding Level (Adaptive Communication):**")
    print("- `-1` = Disabled (default) - no injection, saves tokens")
    print("- `0` = ELI5 - analogies, baby steps, check-ins")
    print("- `1` = Junior - WHY before HOW, pitfalls, takeaways")
    print("- `2` = Mid-Level - patterns, trade-offs, scalability")
    print("- `3` = Senior - trade-offs table, production code, ops")
    print("- `4` = Tech Lead - executive summary, risk matrix, business impact")
    print("- `5` = God Mode - code first, minimal prose, no hand-holding")
    print()
    print("Guidelines auto-inject on session start. Commands like `/brainstorm` respect them.")
    print()
    print("---")
    print()
    print("## Edge Cases & Validation")
    print()
    print("**Path Handling:**")
    print("- Trailing slashes normalized (`plans/` → `plans`)")
    print("- Empty/whitespace-only paths fall back to defaults")
    print("- Absolute paths supported (e.g., `/home/user/all-plans`)")
    print("- Path traversal (`../`) blocked for relative paths")
    print("- Null bytes and control chars rejected")
    print()
    print("**Slug Sanitization:**")
    print("- Invalid filename chars removed: `< > : \" / \\ | ? *`")
    print("- Non-alphanumeric replaced with hyphen")
    print("- Multiple hyphens collapsed: `foo---bar` → `foo-bar`")
    print("- Leading/trailing hyphens removed")
    print("- Max 100 chars to prevent filesystem issues")
    print()
    print("**Naming Pattern Validation:**")
    print("- Pattern must contain `{slug}` placeholder")
    print("- Result must be non-empty after variable substitution")
    print("- Unresolved placeholders (except `{slug}`) trigger error")
    print("- Malformed JSON config falls back to defaults")
    print()
    print("**Consolidated Plans (advanced):**")
    print("```json")
    print('{')
    print('  "paths": {')
    print('    "plans": "/home/user/all-my-plans"')
    print('  }')
    print('}')
    print("```")
    print("Absolute paths allow storing all plans in one location across projects.")
    print()
    print("---")
    print()
    print("## Examples")
    print()
    print("**Global install user (fresh directories work):**")
    print("```bash")
    print("# ~/.pi/.evcrate.json - applies everywhere")
    print("cd /tmp/new-project && claude  # Uses global config")
    print("```")
    print()
    print("**Project with local override:**")
    print("```bash")
    print("# Global: issuePrefix = \"GH-\"")
    print("# Local (.pi/.evcrate.json): issuePrefix = \"JIRA-\"")
    print("# Result: issuePrefix = \"JIRA-\" (local wins)")
    print("```")
    print()
    print("**Deep merge behavior:**")
    print("```")
    print("Global: { plan: { issuePrefix: \"GH-\", dateFormat: \"YYMMDD\" } }")
    print("Local:  { plan: { issuePrefix: \"JIRA-\" } }")
    print("Result: { plan: { issuePrefix: \"JIRA-\", dateFormat: \"YYMMDD\" } }")
    print("```")
    print()
    print("*Tip: Config is optional - all fields have sensible defaults.*")


def show_coding_level_guide() -> None:
    """Display comprehensive codingLevel configuration guide."""
    emit_output_type("comprehensive-docs")

    print("# Coding Level (Adaptive Communication)")
    print()
    print("Adjusts EVCrate's communication style based on user's experience level.")
    print("Guidelines auto-inject on SessionStart. Commands respect them.")
    print()
    print("---")
    print()
    print("## Levels")
    print()
    print("| Level | Name | Description |")
    print("|-------|------|-------------|")
    print("| **-1** | **Disabled** | Default - no injection, saves tokens |")
    print("| 0 | ELI5 | Zero experience - analogies, baby steps, check-ins |")
    print("| 1 | Junior | 0-2 years - WHY before HOW, pitfalls, takeaways |")
    print("| 2 | Mid-Level | 3-5 years - patterns, trade-offs, scalability |")
    print("| 3 | Senior | 5-8 years - trade-offs table, production code, ops |")
    print("| 4 | Tech Lead | 8-15 years - executive summary, risk matrix, strategy |")
    print("| 5 | God Mode | 15+ years - code first, minimal prose, no fluff |")
    print()
    print("---")
    print()
    print("## Configuration")
    print()
    print("**Set in `.evcrate.json`:**")
    print("```json")
    print('{')
    print('  "codingLevel": 0')
    print('}')
    print("```")
    print()
    print("**Location (cascading):**")
    print("- Global: `~/.pi/.evcrate.json` - personal preference")
    print("- Local: `./.pi/.evcrate.json` - project override")
    print()
    print("---")
    print()
    print("## How It Works")
    print()
    print("1. SessionStart hook reads `codingLevel` from `.evcrate.json`")
    print("2. If 0-5, injects guidelines from `.pi/agent/evcrate/output-styles/coding-level-*.md`")
    print("3. Commands like `/brainstorm` follow the injected guidelines")
    print()
    print("**Token Efficiency:**")
    print("- `-1` (default): Zero injection, zero overhead")
    print("- `0-5`: Only selected level's guidelines injected (not all)")
    print()
    print("---")
    print()
    print("## Level Details")
    print()
    print("### Level 0 (ELI5)")
    print("- **MUST** use real-world analogies (labeled boxes, recipes)")
    print("- **MUST** define every technical term")
    print("- **MUST** use \"we\" language")
    print("- **MUST** end with check-in: \"Does this make sense?\"")
    print("- **MUST** comment every line of code")
    print("- Structure: Big Picture → Analogy → Baby Steps → Try It → Check-In")
    print()
    print("### Level 1 (Junior)")
    print("- Explain WHY before HOW")
    print("- Define technical terms on first use")
    print("- Include common pitfalls section")
    print("- Add Key Takeaways and Learn More links")
    print("- Structure: Context → Approach → Implementation → Pitfalls → Takeaways")
    print()
    print("### Level 2 (Mid-Level)")
    print("- Discuss design patterns and when to use them")
    print("- Highlight trade-offs explicitly")
    print("- Consider scalability implications")
    print("- Reference patterns by name")
    print("- Structure: Approach → Design → Implementation → Edge Cases")
    print()
    print("### Level 3 (Senior)")
    print("- Lead with trade-offs table")
    print("- Show production-ready code")
    print("- Discuss operational concerns (monitoring, logging)")
    print("- Flag security implications")
    print("- **NEVER** explain basic concepts")
    print("- Structure: Trade-offs → Implementation → Ops → Security")
    print()
    print("### Level 4 (Tech Lead)")
    print("- Executive summary first (3-4 sentences)")
    print("- Risk assessment matrix (Likelihood × Impact)")
    print("- Strategic options comparison")
    print("- Business impact analysis")
    print("- Identify decisions needing stakeholder alignment")
    print("- Structure: Summary → Risks → Options → Approach → Business Impact")
    print()
    print("### Level 5 (God Mode)")
    print("- Answer exactly what was asked, nothing more")
    print("- Code first, minimal prose")
    print("- No explanations unless asked")
    print("- **NEVER** use filler phrases")
    print("- Trust their judgment completely")
    print()
    print("---")
    print()
    print("## Customization")
    print()
    print("Guidelines live in `.pi/agent/evcrate/output-styles/coding-level-*.md`")
    print("Edit these files directly to customize behavior per level.")
    print()
    print("*Tip: Use `-1` (disabled) unless you're teaching or want guided explanations.*")


def main():
    script_path = Path(__file__).resolve()
    source_kind, source_dir = resolve_command_source(script_path)
    if not source_dir.is_dir():
        print("Error: no .pi/commands or generated command skills directory found.")
        sys.exit(1)

    if source_kind == "skills":
        prefix = ""
        data = discover_skill_commands(source_dir)
    else:
        prefix = detect_prefix(source_dir)
        data = discover_commands(source_dir, prefix)

    if not data["commands"]:
        print(f"No commands found in {source_dir}.")
        sys.exit(1)

    # Parse input
    args = sys.argv[1:]
    input_str = " ".join(args).strip()

    # Special case: config documentation (not a command category)
    if input_str.lower() in ["config", "configuration", ".evcrate.json", "evcrate.json"]:
        show_config_guide()
        return

    # Special case: coding level documentation
    if input_str.lower() in ["coding-level", "codinglevel", "coding level", "level", "eli5", "god mode"]:
        show_coding_level_guide()
        return

    # Advisory surfaces need capability and migration guidance beyond metadata.
    if input_str.lower() in ["advise", "/advise", "advice", "/advice"]:
        show_advisory_guide(prefix, advisory_target(script_path))
        return

    # Detect intent and route
    intent = detect_intent(input_str, list(data["categories"].keys()))

    if intent == "overview":
        show_overview(data, prefix)
    elif intent == "category":
        show_category_guide(data, input_str, prefix)
    elif intent == "command":
        show_command(data, input_str, prefix)
    elif intent == "task":
        recommend_task(data, input_str, prefix)
    else:
        do_search(data, input_str, prefix)


if __name__ == "__main__":
    main()
