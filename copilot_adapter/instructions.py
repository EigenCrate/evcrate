"""Render the canonical root instructions for GitHub Copilot CLI."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable, Mapping

from .resources import ResourceError, ensure_parent


_WORKFLOW_PATH = re.compile(
    r"`(?P<path>(?:\./)?\.copilot/evcrate/workflows/(?P<name>[A-Za-z0-9_*.-]+))`"
)


def _workflow_reference(match: re.Match[str]) -> str:
    name = match.group("name")
    local = f"`.copilot/evcrate/workflows/{name}`"
    home = f"`~/.copilot/evcrate/workflows/{name}`"
    return f"@evcrate/workflows/{name} (local {local}; otherwise read {home} (the published install))"


def _render_workflow_references(value: str) -> str:
    return _WORKFLOW_PATH.sub(_workflow_reference, value)


def generate_instructions(
    source: Path,
    output: Path,
    command_map: Mapping[str, Mapping[str, str]],
    agent_map: Mapping[str, str],
    skill_map: Mapping[str, str],
    workflows: tuple[str, ...],
    transform: Callable[[str], str],
) -> str:
    """Write the personal instruction file and return its rendered text."""

    del command_map, agent_map, skill_map, workflows
    source_file = source.parent / "CLAUDE.md"
    if source_file.is_symlink() or not source_file.is_file():
        raise ResourceError(f"Canonical instruction file is missing or unsafe: {source_file}")
    try:
        rendered = transform(source_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as error:
        raise ResourceError(f"Canonical instruction file is unreadable: {source_file}") from error
    rendered = rendered.replace("# CLAUDE.md", "# copilot-instructions.md", 1)
    rendered = _render_workflow_references(rendered)
    if "@evcrate/workflows/" not in rendered:
        raise ResourceError("Rendered Copilot instructions do not reference managed workflows")
    destination = output / "copilot-instructions.md"
    ensure_parent(output, destination)
    destination.write_text(rendered.rstrip("\n") + "\n", encoding="utf-8", newline="\n")
    destination.chmod(0o644)
    return rendered
