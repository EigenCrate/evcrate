"""Safe target overlays and parser-backed exact JSON/TOML key patches."""

from __future__ import annotations

import json
import re
import shutil
import tomllib
from pathlib import Path
from typing import Any, Mapping

from .contracts import BuildError
from .hashing import HashingError, contained_path, normalize_relative_path


class OverlayError(BuildError):
    """An unsafe, ambiguous, or invalid target overlay."""


def _assert_real_tree(root: Path) -> None:
    if root.is_symlink() or not root.is_dir():
        raise OverlayError(f"Overlay source must be a real directory: {root}")
    for path in root.rglob("*"):
        if path.is_symlink():
            raise OverlayError(f"Overlay symlinks are not allowed: {path}")


def copy_overlay_files(
    source_root: Path,
    stage_root: Path,
    owner: str,
    owners: dict[str, str],
    declared_paths: tuple[str, ...] = (),
) -> None:
    """Append an overlay tree to a stage; existing files are ownership collisions."""

    _assert_real_tree(source_root)
    sources = sorted(
        (item for item in source_root.rglob("*") if item.is_file()),
        key=lambda item: item.relative_to(source_root).as_posix(),
    )
    actual_paths = {f"files/{source.relative_to(source_root).as_posix()}" for source in sources}
    if actual_paths != set(declared_paths):
        raise OverlayError("Overlay files must exactly match manifest owned_paths")
    stage_root.mkdir(parents=True, exist_ok=True)
    for source in sources:
        relative = normalize_relative_path(source.relative_to(source_root).as_posix())
        destination = contained_path(stage_root, relative)
        if destination.exists() or destination.is_symlink():
            existing_owner = owners.get(relative, "baseline")
            raise OverlayError(f"Overlay collision at {relative}: owned by {existing_owner}")
        if relative in owners:
            raise OverlayError(f"Overlay collision at {relative}: owned by {owners[relative]}")
        if any(parent.is_symlink() for parent in destination.parents if parent != stage_root.parent):
            raise OverlayError(f"Overlay destination is symlinked: {relative}")
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
        except OSError as error:
            raise OverlayError(f"Overlay has a file/directory collision at {relative}") from error
        shutil.copyfile(source, destination)
        owners[relative] = owner


def _parse_document(path: Path) -> tuple[str, dict[str, Any]]:
    try:
        if path.suffix == ".json":
            parsed = json.loads(path.read_text(encoding="utf-8"))
            return "json", _expect_object(parsed, path)
        if path.suffix == ".toml":
            parsed = tomllib.loads(path.read_text(encoding="utf-8"))
            return "toml", _expect_object(parsed, path)
    except (OSError, json.JSONDecodeError, tomllib.TOMLDecodeError) as error:
        raise OverlayError(f"Could not parse {path}: {error}") from error
    raise OverlayError(f"Only JSON and TOML destination patches are supported: {path}")


def _expect_object(value: Any, path: Path) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise OverlayError(f"Expected object root in {path}")
    return value


def _value_at(data: dict[str, Any], key: str) -> tuple[dict[str, Any], str, Any]:
    parts = key.split(".")
    current: dict[str, Any] = data
    for part in parts[:-1]:
        value = current.get(part)
        if not isinstance(value, dict):
            raise OverlayError(f"Patch key does not name an existing object: {key}")
        current = value
    leaf = parts[-1]
    if leaf not in current:
        raise OverlayError(f"Patch key does not exist: {key}")
    return current, leaf, current[leaf]


def _toml_value(value: Any) -> str:
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return str(value).lower()
    if isinstance(value, list):
        return "[" + ", ".join(_toml_value(item) for item in value) + "]"
    raise OverlayError(f"Unsupported TOML patch value: {type(value).__name__}")


def _toml_key(value: str) -> str:
    return value if re.fullmatch(r"[A-Za-z0-9_-]+", value) else json.dumps(value, ensure_ascii=False)


def _write_toml(data: dict[str, Any]) -> str:
    lines: list[str] = []

    def render(section: dict[str, Any], prefix: tuple[str, ...]) -> None:
        scalars = {key: value for key, value in section.items() if not isinstance(value, dict)}
        tables = {key: value for key, value in section.items() if isinstance(value, dict)}
        if prefix:
            lines.append("[" + ".".join(_toml_key(key) for key in prefix) + "]")
        lines.extend(f"{_toml_key(key)} = {_toml_value(value)}" for key, value in sorted(scalars.items()))
        if scalars and tables:
            lines.append("")
        for key, value in sorted(tables.items()):
            render(value, (*prefix, key))

    render(data, ())
    return "\n".join(lines).rstrip() + "\n"


def apply_exact_patch(destination: Path, changes: Mapping[str, Any], allowed_keys: tuple[str, ...] | list[str]) -> None:
    """Replace declared existing scalar/list values without changing their types."""

    if destination.is_symlink() or not destination.is_file():
        raise OverlayError(f"Patch destination must be a regular file: {destination}")
    _, document = _parse_document(destination)
    allowed = set(allowed_keys)
    if not changes or set(changes) != allowed:
        raise OverlayError("Patch changes must match its declared exact keys")
    for key, new_value in changes.items():
        if not isinstance(key, str) or not key or not all(part for part in key.split(".")):
            raise OverlayError(f"Invalid patch key: {key!r}")
        parent, leaf, old_value = _value_at(document, key)
        if type(new_value) is not type(old_value):
            raise OverlayError(f"Patch cannot change type at {key}")
        parent[leaf] = new_value
    if destination.suffix == ".json":
        from .hashing import canonical_json_bytes

        destination.write_bytes(canonical_json_bytes(document))
    else:
        destination.write_text(_write_toml(document), encoding="utf-8")


def apply_patch_file(destination: Path, patch_source: Path, allowed_keys: tuple[str, ...] | list[str]) -> None:
    """Apply a JSON or TOML patch document with a top-level ``set`` object."""

    _, patch = _parse_document(patch_source)
    changes = patch.get("set")
    if not isinstance(changes, dict):
        raise OverlayError(f"Patch source must contain an object named 'set': {patch_source}")
    apply_exact_patch(destination, changes, allowed_keys)
