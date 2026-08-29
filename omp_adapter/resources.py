"""Deterministic, path-safe resource copying for the native OMP target."""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from typing import Callable, Iterable

from distribution.advisor_runtime import is_production_runtime_artifact
from distribution.hashing import canonical_json_bytes, is_ignored_artifact
from pi_adapter.frontmatter import normalize_lf


class ResourceError(ValueError):
    """Raised when a canonical resource cannot safely enter the OMP artifact."""


def relative_path(root: Path, path: Path) -> Path:
    try:
        return path.relative_to(root)
    except ValueError as error:
        raise ResourceError(f"Source escaped canonical root: {path}") from error


def walk_files(root: Path) -> list[Path]:
    """Return regular files in stable order, rejecting unsafe entries."""

    if root.is_symlink() or not root.is_dir():
        raise ResourceError(f"Missing or unsafe resource directory: {root}")
    files: list[Path] = []
    for current, directories, filenames in os.walk(root, followlinks=False):
        directory = Path(current)
        relative_directory = relative_path(root, directory)
        kept_directories: list[str] = []
        for name in sorted(directories):
            candidate = directory / name
            if candidate.is_symlink():
                raise ResourceError(f"Symlinked canonical resource is forbidden: {candidate}")
            if is_ignored_artifact(relative_directory / name):
                continue
            kept_directories.append(name)
        directories[:] = kept_directories
        for name in sorted(filenames):
            candidate = directory / name
            relative = relative_directory / name
            if is_ignored_artifact(relative):
                continue
            if candidate.is_symlink():
                raise ResourceError(f"Symlinked canonical resource is forbidden: {candidate}")
            if not candidate.is_file():
                raise ResourceError(f"Unsupported canonical resource type: {candidate}")
            files.append(candidate)
    return files


def production_files(root: Path, *, exclude_runtime: bool = False) -> list[Path]:
    """Return distributable files, excluding tests, fixtures, and generated artifacts."""

    result: list[Path] = []
    for path in walk_files(root):
        relative = relative_path(root, path)
        if any(part in {"__tests__", "tests", "fixtures", "helpers"} for part in relative.parts):
            continue
        if is_production_runtime_artifact(relative):
            continue
        if exclude_runtime:
            from distribution.advisor_runtime import ADVISOR_RUNTIME_FILES

            if relative.as_posix() in ADVISOR_RUNTIME_FILES:
                continue
        result.append(path)
    return result


def ensure_parent(output: Path, destination: Path) -> None:
    """Create destination parents only after proving they remain inside output."""

    try:
        destination.absolute().relative_to(output.absolute())
    except ValueError as error:
        raise ResourceError(f"Output escaped OMP artifact: {destination}") from error
    output.mkdir(parents=True, exist_ok=True)
    if output.is_symlink() or not output.is_dir():
        raise ResourceError(f"OMP output root is missing or unsafe: {output}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    current = destination.parent
    while True:
        if current.is_symlink() or not current.is_dir():
            raise ResourceError(f"Generated output parent is unsafe: {current}")
        if current == output:
            break
        try:
            current.relative_to(output)
        except ValueError as error:
            raise ResourceError(f"Generated output escaped OMP artifact: {destination}") from error
        current = current.parent
    output.chmod(0o755)
    current = destination.parent
    while current != output:
        current.chmod(0o755)
        current = current.parent


def copy_file(
    source: Path,
    destination: Path,
    output: Path,
    transform: Callable[[str], str] | None = None,
) -> None:
    """Copy one regular file with source mode and deterministic text handling."""

    if source.is_symlink() or not source.is_file():
        raise ResourceError(f"Canonical file is missing or unsafe: {source}")
    ensure_parent(output, destination)
    raw = source.read_bytes()
    if transform is None or b"\0" in raw[:1024]:
        destination.write_bytes(raw)
    else:
        try:
            text = normalize_lf(raw.decode("utf-8"))
        except UnicodeDecodeError:
            destination.write_bytes(raw)
        else:
            destination.write_text(normalize_lf(transform(text)), encoding="utf-8", newline="\n")
    destination.chmod(stat.S_IMODE(source.stat().st_mode))


def copy_tree(
    source: Path,
    destination: Path,
    output: Path,
    transform: Callable[[str], str] | None = None,
    *,
    exclude_runtime: bool = False,
) -> tuple[str, ...]:
    """Copy a validated tree and return its relative file inventory."""

    copied: list[str] = []
    for source_file in production_files(source, exclude_runtime=exclude_runtime):
        relative = relative_path(source, source_file)
        copy_file(source_file, destination / relative, output, transform)
        copied.append(relative.as_posix())
    return tuple(copied)


def write_json(destination: Path, output: Path, value: object) -> None:
    """Write canonical JSON below the staged OMP root."""

    ensure_parent(output, destination)
    destination.write_bytes(canonical_json_bytes(value))
    destination.chmod(0o644)


def read_json(path: Path, label: str) -> dict[str, object]:
    if path.is_symlink() or not path.is_file():
        raise ResourceError(f"Missing or unsafe {label}: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ResourceError(f"Invalid {label}: {path}") from error
    if not isinstance(value, dict):
        raise ResourceError(f"{label} must be a JSON object: {path}")
    return value


def source_files(root: Path, names: Iterable[str]) -> tuple[Path, ...]:
    """Resolve named files below a root without permitting traversal."""

    result: list[Path] = []
    for name in names:
        relative = Path(name)
        if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
            raise ResourceError(f"Unsafe canonical resource path: {name}")
        path = root.joinpath(*relative.parts)
        if path.is_symlink() or not path.is_file():
            raise ResourceError(f"Missing or unsafe canonical resource: {path}")
        result.append(path)
    return tuple(result)
