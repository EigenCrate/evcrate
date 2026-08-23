"""Legacy Antigravity HOME adapter kept separate from gate routing."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from distribute_hooks import rewrite_agy_global_paths

from .contracts import project_advisor_contract, render_advisory_interview_workflow, render_inline_advise_command
from .context import DistributionContext
from .hashing import ignore_artifacts


def build_antigravity_config(claude_source: Path, output_root: Path) -> None:
    """Generate the legacy config during Gate 1, never while publishing HOME."""

    target = output_root
    if not claude_source.is_dir() or claude_source.is_symlink():
        raise RuntimeError("Local .claude source is missing or unsafe")
    shutil.copytree(claude_source, target, symlinks=False, ignore=ignore_artifacts)
    _extract_hooks(target)
    _replace_legacy_assets(claude_source, target)
    _project_advisory_workflow(claude_source, target)
    rewrite_agy_global_paths(target, '"$HOME"/.gemini/config/hooks')


def publish_antigravity_config(context: DistributionContext) -> None:
    """Deprecated compatibility entrypoint; Gate 2 must only copy build output."""

    raise RuntimeError("Antigravity generation belongs to --build; use --build then --publish")


def _extract_hooks(target: Path) -> None:
    settings = target / "settings.json"
    if not settings.exists():
        return
    try:
        data = json.loads(settings.read_text(encoding="utf-8"))
        for group in data.get("hooks", {}).get("PreToolUse", []):
            if "matcher" in group:
                group["matcher"] = "run_command|grep_search|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file"
        (target / "hooks.json").write_text(json.dumps({"hooks": data.get("hooks", {})}, indent=2), encoding="utf-8")
    except (json.JSONDecodeError, OSError) as error:
        raise RuntimeError(f"Failed to extract hooks: {error}") from error


def _replace_legacy_assets(source: Path, target: Path) -> None:
    for name in ["settings.json", ".evcrate.json", ".mcp.json.example", "statusline.cjs", "statusline.ps1", "statusline.sh"]:
        path = target / name
        if path.exists():
            path.unlink()
    for name in ["agents", "commands"]:
        path = target / name
        if path.exists():
            shutil.rmtree(path)
    for relay_helper in target.rglob("*advise-state*"):
        if relay_helper.is_file():
            relay_helper.unlink()
    _project_advisor(source, target)
    commands = source / "commands"
    if not commands.exists():
        return
    destination = target / "skills"
    destination.mkdir(parents=True, exist_ok=True)
    for source_file in commands.rglob("*.md"):
        relative = source_file.relative_to(commands).with_suffix("")
        content = source_file.read_text(encoding="utf-8")
        command_path = _command_path(content, relative)
        skill_name = "cmd_" + str(relative).replace("\\", "_").replace("/", "_")
        content = content.replace(
            "python .claude/scripts/ev-help.py",
            "python .antigravity/scripts/ev-help.py",
        )
        if relative.as_posix() == "advise":
            content = render_inline_advise_command(content, "antigravity", "ask_user")
            description = "Interview-first technical advice with native inline questioning and explicit relay rejection"
        else:
            description = _description(content)
        (destination / skill_name).mkdir(parents=True, exist_ok=True)
        (destination / skill_name / "SKILL.md").write_text(
            f"---\nname: {skill_name}\ndescription: {description}\n---\n"
            f"# {skill_name}\n\nCommand Path: {command_path}\n\n"
            f"Description: {description}\n\n{content}",
            encoding="utf-8",
        )


def _project_advisory_workflow(source: Path, target: Path) -> None:
    """Render the shared interview semantics without claiming Claude relay support."""

    canonical = source / "workflows" / "advisory-interview.md"
    if not canonical.is_file():
        return
    destination = target / "workflows" / canonical.name
    destination.write_text(
        render_advisory_interview_workflow(canonical.read_text(encoding="utf-8"), "antigravity"),
        encoding="utf-8",
    )


def _project_advisor(source: Path, target: Path) -> None:
    """Retain the normal advisor as an Antigravity-native checkpoint resource."""

    canonical = source / "agents" / "advisor.md"
    if not canonical.is_file():
        return
    content = canonical.read_text(encoding="utf-8")
    match = re.match(r"^(---\n.*?\n---\n)(.*)$", content, re.DOTALL)
    if not match:
        raise RuntimeError("Canonical advisor frontmatter is malformed")
    frontmatter = re.sub(r"(?m)^model:\s*opus\s*$", "model: pro", match.group(1))
    frontmatter = re.sub(
        r"(?m)^description:.*$",
        "description: Use this high-tier mentor for fresh named checkpoints; Antigravity rejects interview relay.",
        frontmatter,
    )
    destination = target / "agents" / "advisor.md"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        frontmatter + project_advisor_contract(match.group(2), "antigravity"),
        encoding="utf-8",
    )


def _description(content: str) -> str:
    for line in content.splitlines():
        match = re.match(r"^description\s*:\s*(.*)$", line.strip(), re.IGNORECASE)
        if match:
            return match.group(1).strip().strip("\"'")
    return "Migrated command from .claude"


def _command_path(content: str, relative: Path) -> str:
    """Prefer an explicit command name over a filename-derived path."""
    for line in content.splitlines():
        match = re.match(r"^name\s*:\s*(.*)$", line.strip(), re.IGNORECASE)
        if not match:
            continue
        value = match.group(1).strip().strip("\"'")
        if value.startswith("/"):
            return value
    return "/" + str(relative).replace("\\", "/")
