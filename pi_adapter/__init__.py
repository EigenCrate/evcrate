"""Small, staging-only contracts shared by the native Pi adapter."""

from __future__ import annotations

from pathlib import Path


def reject_symlinked_ancestors(path: Path) -> None:
    probe = path.absolute()
    while True:
        if probe.is_symlink():
            raise ValueError(f"Path contains a symlinked ancestor: {path}")
        if probe.parent == probe:
            return
        probe = probe.parent


def contained_source(repository: Path, source_root: Path, source: Path) -> Path:
    """Require the canonical repository source without symlink traversal."""

    for path in (repository, source_root, source):
        reject_symlinked_ancestors(path)
    repository = repository.absolute()
    source_root = source_root.absolute()
    source = source.absolute()
    expected_root = repository / ".evcrate" / "source"
    expected_source = expected_root / ".claude"
    if source_root != expected_root or source != expected_source:
        raise ValueError("CLAUDE_SOURCE_DIR must be the canonical repository .evcrate/source/.claude")
    if not source.is_dir():
        raise ValueError(f"CLAUDE_SOURCE_DIR is missing or unsafe: {source}")
    return source


def contained_pi_output(stage: Path, output: Path) -> Path:
    """Require the adapter output to be the current stage's .pi root."""

    reject_symlinked_ancestors(stage)
    reject_symlinked_ancestors(output)
    stage = stage.absolute()
    output = output.absolute()
    if not stage.is_dir():
        raise ValueError(f"PI_STAGE_ROOT is missing or unsafe: {stage}")
    if not output.is_dir():
        raise ValueError(f"PI_OUTPUT_DIR is missing or unsafe: {output}")
    if output != stage / ".pi":
        raise ValueError("PI_OUTPUT_DIR must be exactly PI_STAGE_ROOT/.pi")
    if any(output.iterdir()):
        raise ValueError(f"PI_OUTPUT_DIR must be empty staging output: {output}")
    return output
