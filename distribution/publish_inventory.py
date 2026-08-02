"""Safe inventories for source artifacts and existing HOME bindings."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .contracts import PublishError
from .hashing import hash_bytes, hash_file, normalize_relative_path


@dataclass(frozen=True)
class HomeInventory:
    files: dict[str, bytes]
    paths: set[str]


def artifact_files(root: Path) -> dict[str, bytes]:
    """Read a generated artifact, rejecting every symlink it contains."""

    if root.is_symlink() or not root.is_dir():
        raise PublishError(f"Artifact root is missing or unsafe: {root}")
    result: dict[str, bytes] = {}
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_symlink():
            raise PublishError(f"Artifact contains symlink: {path}")
        if path.is_file():
            result[path.relative_to(root).as_posix()] = path.read_bytes()
    return result


def protected_paths(source: dict[str, bytes], prior: set[str], preserved: set[str]) -> set[str]:
    """Return paths the publisher may create, update, or delete."""

    return (set(source) | prior) - preserved


def prior_managed_paths(managed: object, binding: str) -> set[str]:
    """Validate previously published paths before they affect staging."""

    if not isinstance(managed, dict):
        raise PublishError("Release marker managed paths are invalid")
    values = managed.get(binding, [])
    if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
        raise PublishError(f"Release marker paths are invalid for {binding}")
    try:
        normalized = {normalize_relative_path(value) for value in values}
    except ValueError as error:
        raise PublishError(f"Release marker paths are invalid for {binding}") from error
    if len(normalized) != len(values):
        raise PublishError(f"Release marker paths are invalid for {binding}")
    return normalized


def home_inventory(root: Path, protected: set[str]) -> HomeInventory:
    """Read regular HOME files while rejecting links that overlap managed paths."""

    if root.is_symlink() or not root.is_dir():
        raise PublishError(f"HOME root is missing or unsafe: {root}")
    files: dict[str, bytes] = {}
    paths: set[str] = set()
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            if any(item == relative or item.startswith(relative + "/") for item in protected):
                raise PublishError(f"HOME symlink intersects managed path: {path}")
            paths.add(relative)
        elif path.is_file():
            files[relative] = path.read_bytes()
            paths.add(relative)
    return HomeInventory(files, paths)


def home_tree_hash(root: Path) -> str:
    """Hash a published HOME tree, including preserved symlink targets."""

    if root.is_symlink() or not root.is_dir():
        raise PublishError(f"HOME root is missing or unsafe: {root}")
    records: list[bytes] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = normalize_relative_path(path.relative_to(root).as_posix())
        if path.is_symlink():
            records.append(f"l\0{relative}\0{path.readlink()}\n".encode())
        elif path.is_dir():
            records.append(f"d\0{relative}\n".encode())
        elif path.is_file():
            records.append(f"f\0{relative}\0{hash_file(path)}\n".encode())
        else:
            raise PublishError(f"Unsupported HOME path: {path}")
    return hash_bytes(b"".join(records))
