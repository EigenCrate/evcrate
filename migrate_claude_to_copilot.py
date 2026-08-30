#!/usr/bin/env python3
"""Environment-only staging coordinator for the personal Copilot target."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from copilot_adapter import ResourceError, contained_copilot_output, contained_source
from copilot_adapter.agents import convert_agents, discover_agents
from copilot_adapter.commands import build_command_map, convert_commands, convert_workflows
from copilot_adapter.hooks import convert_hooks_and_scripts
from copilot_adapter.instructions import generate_instructions
from copilot_adapter.inventory import build_inventory
from copilot_adapter.skills import convert_skills, discover_skills
from copilot_adapter.styles import convert_styles
from copilot_adapter.support import convert_support
from copilot_adapter.prompts import translate_prompt


def _required_path(name: str, *, directory: bool) -> Path:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is required; direct/global migration is not supported")
    path = Path(value).absolute()
    if path.is_symlink() or (directory and not path.is_dir()) or (not directory and not path.is_file()):
        raise SystemExit(f"{name} is missing or unsafe: {path}")
    return path


def _output_root() -> Path:
    stage = _required_path("COPILOT_STAGE_ROOT", directory=True)
    output = _required_path("COPILOT_OUTPUT_DIR", directory=True)
    try:
        return contained_copilot_output(stage, output)
    except ValueError as error:
        raise SystemExit(str(error)) from error


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

    # Build every name map before rendering prose so references are deterministic.
    command_map = build_command_map(source)
    agent_map = discover_agents(source)
    skill_map, _, _ = discover_skills(source)
    transform = lambda value: translate_prompt(
        value,
        command_map,
        agent_map=agent_map,
        skill_map=skill_map,
    )

    workflows = convert_workflows(source, output, transform)
    command_audit = convert_commands(source, output, command_map, transform, workflows)
    style_audit = convert_styles(source, output, transform)
    skill_audit = convert_skills(source, output, transform)
    agent_audit = convert_agents(source, output, agent_map, transform)
    hook_audit = convert_hooks_and_scripts(source, output, transform)
    support_audit = convert_support(source, output, transform)
    generate_instructions(source, output, command_map, agent_map, skill_map, workflows, transform)
    inventory = build_inventory(
        source,
        output,
        command_map,
        skill_audit,
        agent_audit,
        hook_audit,
        style_audit,
        workflows,
        support_audit,
    )
    # Keep the command audit live in the coordinator result for callers that import main.
    if not command_audit.get("commands") or inventory.get("schema") != "evcrate-copilot-migration-v1":
        raise ResourceError("Copilot migration produced no command map or inventory")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, ResourceError) as error:
        raise SystemExit(f"Copilot adapter failed safely: {error}") from error
