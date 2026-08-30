#!/usr/bin/env python3
"""Staging-only coordinator for the OMP target."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from omp_adapter import contained_omp_output, contained_source
from omp_adapter.agents import convert_agents
from omp_adapter.commands import convert_commands, convert_workflows, translate_prompt
from omp_adapter.hooks import convert_hooks_and_scripts
from omp_adapter.resources import ResourceError, copy_tree, ensure_parent, read_json, write_json
from omp_adapter.skills import convert_skills


_THINKING_LEVELS = {"minimal", "low", "medium", "high", "xhigh"}


def _required_path(name: str, *, directory: bool) -> Path:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is required; direct/global migration is not supported")
    path = Path(value).absolute()
    if path.is_symlink() or (directory and not path.is_dir()) or (not directory and not path.is_file()):
        raise SystemExit(f"{name} is missing or unsafe: {path}")
    return path


def _output_root() -> Path:
    stage = _required_path("OMP_STAGE_ROOT", directory=True)
    output = _required_path("OMP_OUTPUT_DIR", directory=True)
    try:
        return contained_omp_output(stage, output)
    except ValueError as error:
        raise SystemExit(str(error)) from error


def _transform(value: str, command_map) -> str:
    return translate_prompt(value, command_map)


def main(argv: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else argv
    if arguments:
        raise SystemExit("This adapter accepts no direct/global output arguments")
    repository = _required_path("EVCRATE_REPOSITORY", directory=True)
    source_root = _required_path("EVCRATE_SOURCE_DIR", directory=True)
    source = _required_path("CLAUDE_SOURCE_DIR", directory=True)
    try:
        contained_source(repository, source_root, source)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    output = _output_root()
    output.chmod(0o755)

    config = source / ".evcrate.json"
    ignore = source / ".evcrateignore"
    if config.is_symlink() or not config.is_file() or ignore.is_symlink() or not ignore.is_file():
        raise SystemExit("Canonical OMP config inputs are missing or unsafe")
    settings = read_json(source / "settings.json", "canonical Claude settings")
    thinking_level = settings.get("effortLevel")
    if thinking_level is not None and (
        not isinstance(thinking_level, str) or thinking_level not in _THINKING_LEVELS
    ):
        raise ResourceError(f"Unsupported canonical effortLevel for OMP: {thinking_level!r}")

    command_map = convert_commands(source, output)
    agent_audit = convert_agents(
        source,
        output,
        lambda value: _transform(value, command_map),
        thinking_level=thinking_level,
    )
    skill_audit = convert_skills(source, output, lambda value: _transform(value, command_map))
    workflow_audit = convert_workflows(source, output, command_map)
    static_audit = convert_hooks_and_scripts(source, output)
    copy_tree(
        source / "output-styles",
        output / "evcrate" / "output-styles",
        output,
        lambda value: _transform(value, command_map),
    )

    inventory = {
        "schema": "evcrate-omp-migration-v1",
        "source": ".evcrate/source/.claude",
        "target": ".omp",
        "native": {
            "agents": sorted(agent_audit),
            "commands": len(command_map),
            "skills": len(skill_audit.get("native", [])),
        },
        "skillRuntime": {
            "projectRoot": ".omp/skills",
            "homeRoot": "~/.omp/agent/skills",
            "noSkills": (
                "OMP --no-skills disables skill discovery and loading; workflows "
                "must read required SKILL.md files directly or use the archived "
                ".omp/evcrate/skills packages."
            ),
        },
        "managedStatic": {
            "workflows": list(workflow_audit),
            "scripts": list(static_audit["scripts"]),
            "sourceHooks": list(static_audit["hooks"]),
            "outputStyles": sorted(
                path.relative_to(source / "output-styles").as_posix()
                for path in (source / "output-styles").rglob("*")
                if path.is_file() and not path.is_symlink()
            ),
            "archivedSkills": list(skill_audit.get("archived", [])),
        },
        "modelAliases": {
            "opus": "@slow",
            "sonnet": "@default",
            "haiku": "@smol",
            "inherit": "omitted",
        },
        "limitations": {
            "advisorController": "Uses shared ~/.evcrate/bin/evcrate-advisor; OMP is an enabled backend candidate qualified by the central controller.",
            "subagentStart": "OMP has no direct Claude agent_type/agent_id hook payload",
            "settingsLocal": "not activated; source settings.local.json is retained only by the canonical source",
        },
    }
    write_json(output / "evcrate" / "inventory.json", output, inventory)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, ResourceError) as error:
        raise SystemExit(f"OMP adapter failed safely: {error}") from error
