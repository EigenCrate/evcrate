"""Staging-only contracts shared by the native OMP adapter."""

from __future__ import annotations

from pathlib import Path

from pi_adapter import contained_source, reject_symlinked_ancestors


__all__ = [
    "contained_omp_output",
    "contained_source",
    "reject_symlinked_ancestors",
]


def contained_omp_output(stage: Path, output: Path) -> Path:
    """Require the adapter output to be the current stage's ``.omp`` root."""

    reject_symlinked_ancestors(stage)
    reject_symlinked_ancestors(output)
    stage = stage.absolute()
    output = output.absolute()
    if not stage.is_dir():
        raise ValueError(f"OMP_STAGE_ROOT is missing or unsafe: {stage}")
    if not output.is_dir():
        raise ValueError(f"OMP_OUTPUT_DIR is missing or unsafe: {output}")
    if output != stage / ".omp":
        raise ValueError("OMP_OUTPUT_DIR must be exactly OMP_STAGE_ROOT/.omp")
    if any(output.iterdir()):
        raise ValueError(f"OMP_OUTPUT_DIR must be empty staging output: {output}")
    return output
