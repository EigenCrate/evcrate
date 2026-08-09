#!/usr/bin/env python3
"""Staging-only coordinator for the native Pi target."""

from __future__ import annotations

import os
import shutil
import stat
import sys
from pathlib import Path

from distribution.hashing import canonical_json_bytes
from distribution.pi_settings import managed_settings_fragment
from pi_adapter import contained_pi_output, contained_source
from pi_adapter.agents import convert_agents
from pi_adapter.resources import (
    copy_commands_and_workflows,
    copy_hooks_and_scripts,
    copy_skills,
    inventory,
    write_inventory,
)


def _required_path(name: str, *, directory: bool) -> Path:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is required; direct/global migration is not supported")
    path = Path(value).absolute()
    if path.is_symlink() or (directory and not path.is_dir()) or (not directory and not path.is_file()):
        raise SystemExit(f"{name} is missing or unsafe: {path}")
    return path


def _output_root() -> Path:
    stage = _required_path("PI_STAGE_ROOT", directory=True)
    output = _required_path("PI_OUTPUT_DIR", directory=True)
    try:
        return contained_pi_output(stage, output)
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
    config = source / ".evcrate.json"
    ignore = source / ".evcrateignore"
    if config.is_symlink() or not config.is_file() or ignore.is_symlink() or not ignore.is_file():
        raise SystemExit("Canonical Pi config inputs are missing or unsafe")
    for source_file, destination in ((config, output / ".evcrate.json"), (ignore, output / ".evcrateignore")):
        normalized = source_file.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        destination.write_bytes(normalized)
        destination.chmod(stat.S_IMODE(source_file.stat().st_mode))
    resources = inventory(source)
    resource_root = output / "agent/evcrate"
    resource_root.mkdir(parents=True, exist_ok=True)
    resource_root.chmod(0o755)
    settings_fragment = resource_root / "managed-settings.json"
    settings_fragment.write_bytes(canonical_json_bytes(managed_settings_fragment()))
    settings_fragment.chmod(0o644)
    copy_commands_and_workflows(source, output)
    copy_skills(source, output)
    copy_hooks_and_scripts(source, output)
    convert_agents(source, output)
    write_inventory(output / "agent/evcrate/inventory.json", output, resources)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        raise SystemExit(f"Pi adapter failed safely: {error}") from error
