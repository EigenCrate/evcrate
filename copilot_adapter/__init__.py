"""Staging-only contracts shared by the personal Copilot adapter."""

from __future__ import annotations

from pathlib import Path

from pi_adapter import contained_source, reject_symlinked_ancestors

from .resources import ResourceError

__all__ = ["ResourceError", "contained_copilot_output", "contained_source"]


def contained_copilot_output(stage: Path, output: Path) -> Path:
    """Require an empty Copilot directory inside the active build stage."""

    reject_symlinked_ancestors(stage)
    reject_symlinked_ancestors(output)
    stage = stage.absolute()
    output = output.absolute()
    if not stage.is_dir():
        raise ValueError(f"COPILOT_STAGE_ROOT is missing or unsafe: {stage}")
    if not output.is_dir():
        raise ValueError(f"COPILOT_OUTPUT_DIR is missing or unsafe: {output}")
    if output != stage / ".copilot":
        raise ValueError("COPILOT_OUTPUT_DIR must be exactly COPILOT_STAGE_ROOT/.copilot")
    if any(output.iterdir()):
        raise ValueError(f"COPILOT_OUTPUT_DIR must be empty staging output: {output}")
    return output
