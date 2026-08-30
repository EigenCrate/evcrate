"""Build the Antigravity resource projection without advisor runtime copies."""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from distribute_hooks import rewrite_agy_global_paths

from .contracts import (
    add_global_workflow_fallback,
    is_production_controller_artifact,
    project_advisor_contract,
    render_advisory_interview_workflow,
    render_harness_script_references,
    render_inline_advise_command,
)
from .context import DistributionContext
from .hashing import ignore_artifacts


def _ignore_runtime_tests(_: str, names: list[str]) -> set[str]:
    return ignore_artifacts(_, names) | {
        name for name in names
        if name in {"__tests__", "tests", "fixtures", "helpers"}
        or is_production_controller_artifact(name)
        or name == "settings.local.json"
    }


def build_antigravity_config(claude_source: Path, output_root: Path) -> None:
    _assert_safe_source_tree(claude_source, "Canonical Claude source")
    _assert_safe_output_root(output_root, "Antigravity output root")
    shutil.copytree(claude_source, output_root, symlinks=False, ignore=_ignore_runtime_tests)
    _extract_hooks(output_root)
    _replace_legacy_assets(claude_source, output_root)
    _project_advisory_workflow(claude_source, output_root)
    _rewrite_harness_references(output_root)
    rewrite_agy_global_paths(output_root, '"$HOME"/.gemini/config/hooks')


def publish_antigravity_config(context: DistributionContext) -> None:
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


def _rewrite_harness_references(target: Path) -> None:
    for path in sorted(target.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"Generated Antigravity output contains a symlink: {path}")
        if not path.is_file():
            continue
        try:
            raw = path.read_bytes()
            if b"\0" in raw[:1024]:
                continue
            content = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        except OSError as error:
            raise RuntimeError(f"Failed to read copied Antigravity resource {path}: {error}") from error
        rendered = render_harness_script_references(content, "antigravity")
        if path.suffix.lower() == ".sh":
            rendered = rendered.replace("\r\n", "\n").replace("\r", "\n")
        if rendered != content or path.suffix.lower() == ".sh":
            path.write_text(rendered, encoding="utf-8", newline="\n")


def _assert_safe_output_root(root: Path, label: str) -> None:
    if os.path.lexists(root) and (root.is_symlink() or not root.is_dir()):
        raise RuntimeError(f"{label} must be a real directory: {root}")
    current = root.parent
    while True:
        if current.is_symlink():
            raise RuntimeError(f"{label} has a symlinked ancestor: {root}")
        if current.parent == current:
            break
        current = current.parent


def _assert_no_symlink_ancestors(path: Path, label: str) -> None:
    current = path.parent
    while True:
        if current.is_symlink():
            raise RuntimeError(f"{label} has a symlinked ancestor: {path}")
        if current.parent == current:
            break
        current = current.parent


def _assert_safe_source_tree(root: Path, label: str) -> None:
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError(f"{label} must be a real directory: {root}")
    for path in root.rglob("*"):
        if path.is_symlink():
            raise RuntimeError(f"{label} contains a symlink: {path}")


def _assert_managed_directory(path: Path) -> None:
    _assert_no_symlink_ancestors(path, "Managed Antigravity path")
    if os.path.lexists(path) and (path.is_symlink() or not path.is_dir()):
        raise RuntimeError(f"Managed Antigravity directory is unsafe: {path}")


def _clear_managed_path(path: Path) -> None:
    _assert_no_symlink_ancestors(path, "Managed Antigravity path")
    if not os.path.lexists(path):
        return
    if path.is_symlink() or not path.is_dir():
        path.unlink()
    else:
        shutil.rmtree(path)


def _replace_legacy_assets(source: Path, target: Path) -> None:
    _assert_safe_output_root(target, "Antigravity output root")
    for name in ["agents", "commands", "hooks", "scripts", "skills", "workflows"]:
        _assert_managed_directory(target / name)
    for name in ["settings.json", ".mcp.json.example", "statusline.cjs", "statusline.ps1", "statusline.sh"]:
        _clear_managed_path(target / name)
    for name in ["agents", "commands"]:
        _assert_managed_directory(target / name)
        _clear_managed_path(target / name)
    for relay_helper in target.rglob("*advise-state*"):
        if relay_helper.is_symlink() or relay_helper.is_file():
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
        content = content.replace("python .claude/scripts/ev-help.py", "python .antigravity/scripts/ev-help.py")
        content = add_global_workflow_fallback(content.replace(".claude/workflows/", ".antigravity/workflows/"), "antigravity")
        if relative.as_posix() == "advise":
            content = render_inline_advise_command(content, "antigravity", "ask_user")
            description = "Interview-first technical advice with native inline questioning and explicit relay rejection"
        else:
            description = _description(content)
        (destination / skill_name).mkdir(parents=True, exist_ok=True)
        (destination / skill_name / "SKILL.md").write_text(
            f"---\nname: {skill_name}\ndescription: {description}\n---\n"
            f"# {skill_name}\n\nCommand Path: {command_path}\n\nDescription: {description}\n\n{content}",
            encoding="utf-8",
        )


def _project_advisory_workflow(source: Path, target: Path) -> None:
    canonical = source / "workflows" / "advisory-interview.md"
    if not canonical.is_file():
        return
    destination = target / "workflows" / canonical.name
    destination.write_text(add_global_workflow_fallback(render_advisory_interview_workflow(canonical.read_text(encoding="utf-8"), "antigravity"), "antigravity"), encoding="utf-8")


def _project_advisor(source: Path, target: Path) -> None:
    canonical = source / "agents" / "advisor.md"
    if not canonical.is_file():
        return
    content = canonical.read_text(encoding="utf-8")
    match = re.match(r"^(---\n.*?\n---\n)(.*)$", content, re.DOTALL)
    if not match:
        raise RuntimeError("Canonical advisor frontmatter is malformed")
    frontmatter = re.sub(r"(?m)^model:\s*opus\s*$", "model: pro", match.group(1))
    frontmatter = re.sub(r"(?m)^description:.*$", "description: Use this high-tier mentor for fresh named checkpoints; Antigravity uses the central controller.", frontmatter)
    destination = target / "agents" / "advisor.md"
    destination.parent.mkdir(parents=True, exist_ok=True)
    body = project_advisor_contract(match.group(2), "antigravity")
    destination.write_text(frontmatter + add_global_workflow_fallback(body, "antigravity"), encoding="utf-8")


def _description(content: str) -> str:
    for line in content.splitlines():
        match = re.match(r"^description\s*:\s*(.*)$", line.strip(), re.IGNORECASE)
        if match:
            return match.group(1).strip().strip("\"'")
    return "Migrated command from .claude"


def _command_path(content: str, relative: Path) -> str:
    for line in content.splitlines():
        match = re.match(r"^name\s*:\s*(.*)$", line.strip(), re.IGNORECASE)
        if match and match.group(1).strip().strip("\"'").startswith("/"):
            return match.group(1).strip().strip("\"'")
    return "/" + str(relative).replace("\\", "/")
