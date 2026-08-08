"""Deterministic hashes and safe repository-relative path handling."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
from typing import Any


class HashingError(ValueError):
    """Raised when an artifact cannot be safely or deterministically hashed."""


IGNORED_ARTIFACT_DIRECTORIES = frozenset({"node_modules", "__pycache__"})
IGNORED_SOURCE_DIRECTORIES = frozenset({"dist"})
IGNORED_ARTIFACT_FILES = frozenset({".coverage"})
IGNORED_ARTIFACT_SUFFIXES = frozenset({".pyc", ".pyo"})


def is_ignored_artifact(relative: str | Path) -> bool:
    """Return whether a local compiler or dependency artifact is non-distributable."""

    path = Path(relative)
    return (
        any(part in IGNORED_ARTIFACT_DIRECTORIES for part in path.parts)
        or path.name in IGNORED_ARTIFACT_FILES
        or path.suffix.lower() in IGNORED_ARTIFACT_SUFFIXES
    )


def ignore_artifacts(_: str, names: list[str]) -> set[str]:
    """Provide a ``shutil.copytree`` filter for non-distributable local artifacts."""

    return {name for name in names if is_ignored_artifact(name)}


def is_ignored_source(relative: str | Path) -> bool:
    """Return whether a source-only dependency output should be excluded from hashes."""

    path = Path(relative)
    return is_ignored_artifact(path) or any(part in IGNORED_SOURCE_DIRECTORIES for part in path.parts)


def normalize_relative_path(value: str | Path) -> str:
    """Return a strict, portable repository-relative POSIX path."""

    raw = str(value)
    if not raw or "\x00" in raw or "\\" in raw or raw.startswith("/"):
        raise HashingError(f"Path must be a normalized relative POSIX path: {raw!r}")
    path = PurePosixPath(raw)
    if not path.parts or path.is_absolute() or ":" in path.parts[0] or any(part in {"", ".", ".."} for part in path.parts):
        raise HashingError(f"Path traversal is not allowed: {raw!r}")
    normalized = path.as_posix()
    if normalized != raw or raw.startswith("./") or "//" in raw:
        raise HashingError(f"Path is not normalized: {raw!r}")
    return normalized


def contained_path(root: Path, relative: str | Path, *, must_exist: bool = False) -> Path:
    """Resolve ``relative`` inside ``root`` and reject traversal or symlink escape."""

    candidate = root / normalize_relative_path(relative)
    resolved_root = root.resolve()
    try:
        resolved = candidate.resolve(strict=must_exist)
    except OSError as error:
        raise HashingError(f"Could not resolve {relative!r}: {error}") from error
    try:
        resolved.relative_to(resolved_root)
    except ValueError as error:
        raise HashingError(f"Path escapes its declared root: {relative!r}") from error
    return candidate


def canonical_json_bytes(value: Any) -> bytes:
    """Serialize JSON without formatting or platform-dependent variation."""

    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def hash_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def hash_file(path: Path) -> str:
    if not path.is_file() or path.is_symlink():
        raise HashingError(f"Expected a regular file: {path}")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tree_hash(root: Path) -> str:
    """Hash a tree's paths, empty directories, and file bytes in lexical order."""

    if not root.is_dir() or root.is_symlink():
        raise HashingError(f"Expected a real directory: {root}")
    records: list[bytes] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative_path = path.relative_to(root)
        if is_ignored_artifact(relative_path):
            continue
        relative = normalize_relative_path(relative_path.as_posix())
        if path.is_symlink():
            raise HashingError(f"Symlinks are not allowed in build artifacts: {relative}")
        if path.is_dir():
            records.append(f"d\0{relative}\n".encode())
        elif path.is_file():
            records.append(f"f\0{relative}\0{hash_file(path)}\n".encode())
        else:
            raise HashingError(f"Unsupported artifact path: {relative}")
    return hash_bytes(b"".join(records))


def source_tree_hash(root: Path) -> str:
    """Hash source trees while excluding local dependency and compiler outputs."""

    if not root.is_dir() or root.is_symlink():
        raise HashingError(f"Expected a real directory: {root}")
    records: list[bytes] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root)
        if is_ignored_source(relative):
            continue
        normalized = normalize_relative_path(relative.as_posix())
        if path.is_symlink():
            raise HashingError(f"Symlinks are not allowed in build artifacts: {normalized}")
        if path.is_dir():
            records.append(f"d\0{normalized}\n".encode())
        elif path.is_file():
            records.append(f"f\0{normalized}\0{hash_file(path)}\n".encode())
        else:
            raise HashingError(f"Unsupported artifact path: {normalized}")
    return hash_bytes(b"".join(records))
