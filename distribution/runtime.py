"""Stage and bundle declared target runtimes without shipping dependencies."""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .contracts import BuildError
from .hashing import HashingError, contained_path, normalize_relative_path


@dataclass(frozen=True)
class RuntimeSpec:
    source: str
    destination: str
    entry: str
    registry_source: str


def load_runtime_spec(value: Any) -> RuntimeSpec | None:
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {"source", "destination", "entry", "registry_source"}:
        raise BuildError("runtime must declare source, destination, entry, and registry_source")
    try:
        source = normalize_relative_path(value["source"])
        destination = normalize_relative_path(value["destination"])
        entry = normalize_relative_path(value["entry"])
        registry_source = normalize_relative_path(value["registry_source"])
    except (HashingError, TypeError) as error:
        raise BuildError(f"Invalid runtime path: {error}") from error
    if not source.startswith("runtime/") or not destination.startswith("runtime/") or not entry.startswith("dist/"):
        raise BuildError("runtime paths must use the declared runtime source, destination, and dist entry")
    return RuntimeSpec(source, destination, entry, registry_source)


def _assert_real_tree(root: Path) -> None:
    if root.is_symlink() or not root.is_dir():
        raise BuildError(f"Runtime source must be a real directory: {root}")
    for item in root.rglob("*"):
        if any(part in {"node_modules", "dist"} for part in item.relative_to(root).parts):
            continue
        if item.is_symlink():
            raise BuildError(f"Runtime source cannot contain symlinks: {item}")


def _run_runtime_command(arguments: list[str], destination: Path) -> None:
    try:
        subprocess.run(arguments, cwd=destination, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        raise BuildError(f"Runtime build failed with exit code {error.returncode}") from error
    except OSError as error:
        raise BuildError(f"Runtime build could not start: {error}") from error


def stage_runtime(repository: Path, source_root: Path, primary_root: Path, spec: RuntimeSpec) -> tuple[str, ...]:
    """Copy a clean runtime source, create its bundle, and return owned files."""

    source = contained_path(source_root, spec.source, must_exist=True)
    destination = contained_path(primary_root, spec.destination)
    registry = contained_path(repository, spec.registry_source, must_exist=True)
    _assert_real_tree(source)
    if destination.exists() or destination.is_symlink():
        raise BuildError(f"Runtime destination already exists: {spec.destination}")
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns("node_modules", "dist", "test"))
    if not registry.is_file() or registry.is_symlink():
        raise BuildError("Runtime registry source must be a regular file")
    shutil.copyfile(registry, destination / "registry.json")
    (destination / "runtime-context.json").write_text(
        json.dumps({"schema_version": 1, "repository_root": str(repository.resolve())}, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    _run_runtime_command(["npm", "ci", "--ignore-scripts", "--no-audit"], destination)
    _run_runtime_command(["npm", "run", "build"], destination)
    dependencies = destination / "node_modules"
    if dependencies.exists():
        shutil.rmtree(dependencies)
    entry = contained_path(destination, spec.entry, must_exist=True)
    if not entry.is_file() or entry.is_symlink():
        raise BuildError(f"Runtime entry is missing or unsafe: {spec.entry}")
    owned: list[str] = []
    for item in sorted(destination.rglob("*"), key=lambda path: path.relative_to(primary_root).as_posix()):
        if item.is_symlink():
            raise BuildError(f"Runtime artifact cannot contain symlinks: {item}")
        if item.is_file():
            owned.append(item.relative_to(primary_root).as_posix())
    return tuple(owned)
