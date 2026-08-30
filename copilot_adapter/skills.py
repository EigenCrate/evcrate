"""Discover, namespace, and copy Claude skill packages for Copilot."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

from pi_adapter.frontmatter import FrontmatterError, split_frontmatter

from .prompts import translate_prompt
from .resources import ResourceError, copy_file, copy_tree, ensure_parent, relative_path, walk_files, write_json


_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _kebab(value: str) -> str:
    value = re.sub(r"(?:__|[_\s]+)", "-", value)
    value = re.sub(r"[^A-Za-z0-9-]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-").lower()


def _entrypoint(package: Path) -> Path | None:
    # Enumerate actual entries; exists() cannot distinguish case aliases on Windows.
    candidates = [path for path in package.iterdir() if path.name in {"SKILL.md", "skill.md"}]
    if len(candidates) > 1:
        raise ResourceError(f"Skill package has duplicate entrypoints: {package}")
    candidate = candidates[0] if candidates else None
    if candidate is not None and candidate.is_symlink():
        raise ResourceError(f"Symlinked canonical skill entrypoint: {candidate}")
    return candidate


def discover_skills(source: Path) -> tuple[dict[str, str], list[tuple[Path, Path]], list[Path]]:
    """Return name map, native packages, and archived package roots."""

    root = source / "skills"
    if root.is_symlink() or not root.is_dir():
        raise ResourceError(f"Missing or unsafe canonical skill directory: {root}")
    native: list[tuple[Path, Path]] = []
    archived: list[Path] = []
    names: dict[str, str] = {}
    used: dict[str, str] = {}
    for package in sorted(path for path in root.iterdir() if path.is_dir()):
        if package.is_symlink():
            raise ResourceError(f"Symlinked canonical skill package: {package}")
        direct = _entrypoint(package)
        candidates = [(package, direct)] if direct else []
        if not direct:
            nested = sorted(
                path.parent for path in walk_files(package)
                if path.name.casefold() == "skill.md" and path.parent.parent == package
            )
            candidates = [(item, _entrypoint(item)) for item in nested]
            if not candidates:
                archived.append(package)
                continue
            if any(path.parent == package for path in walk_files(package)):
                archived.append(package)
        for skill, marker in candidates:
            if marker is None:
                continue
            source_name = _kebab(skill.name)
            target_name = f"evcrate-{source_name}"
            if not _NAME.fullmatch(target_name) or len(target_name) > 64:
                raise ResourceError(f"Invalid Copilot skill name: {skill}")
            folded = target_name.casefold()
            prior = used.get(folded)
            if prior is not None:
                raise ResourceError(f"Skill names collide after Copilot namespacing: {prior} and {skill}")
            used[folded] = relative_path(root, skill).as_posix()
            names[skill.name.casefold()] = target_name
            native.append((skill, marker))
    return names, native, archived


def _serialize_fields(fields: dict[str, str], body: str, name: str, description: str) -> str:
    rendered = {key: value for key, value in fields.items() if key not in {"name", "description", "model"}}
    rendered = {"name": name, "description": description, **dict(sorted(rendered.items()))}
    lines = ["---"]
    for key, value in rendered.items():
        lines.append(f"{key}: {json.dumps(str(value), ensure_ascii=False)}")
    lines.extend(["---", "", body.rstrip("\n"), ""])
    return "\n".join(lines)


def _copy_native(skill: Path, marker: Path, destination: Path, output: Path,
                  transform: Callable[[str], str], target_name: str) -> tuple[str, ...]:
    try:
        parsed = split_frontmatter(marker.read_text(encoding="utf-8"), marker)
    except (OSError, UnicodeError, FrontmatterError) as error:
        raise ResourceError(f"Invalid skill frontmatter: {marker}") from error
    source_name = parsed.fields.get("name", "").strip()
    description = parsed.fields.get("description", "").strip()
    if not _NAME.fullmatch(source_name) or len(source_name) > 64:
        raise ResourceError(f"Invalid canonical skill name in {marker}: {source_name!r}")
    if not description or len(description) > 1024:
        raise ResourceError(f"Invalid canonical skill description in {marker}")
    final_description = transform(description).strip()
    if not final_description or len(final_description) > 1024:
        raise ResourceError(f"Invalid translated Copilot skill description in {marker}")
    copied: list[str] = []
    for path in walk_files(skill):
        relative = relative_path(skill, path)
        target_relative = Path("SKILL.md") if path == marker else relative
        if path == marker:
            content = _serialize_fields(parsed.fields, transform(parsed.body), target_name, final_description)
            ensure_parent(output, destination / target_relative)
            (destination / target_relative).write_text(content, encoding="utf-8", newline="\n")
            (destination / target_relative).chmod(0o644)
        else:
            copy_file(path, destination / target_relative, output, transform)
        copied.append(target_relative.as_posix())
    return tuple(copied)


def convert_skills(source: Path, output: Path, transform: Callable[[str], str]) -> dict[str, object]:
    """Expose valid packages and archive non-invokable support trees."""

    names, native, archived = discover_skills(source)
    destination = output / "skills"
    archive_destination = output / "evcrate" / "skills"
    native_audit: list[dict[str, object]] = []
    for skill, marker in native:
        target_name = names[skill.name.casefold()]
        files = _copy_native(skill, marker, destination / target_name, output, transform, target_name)
        native_audit.append({
            "source": relative_path(source / "skills", skill).as_posix(),
            "target": f"skills/{target_name}",
            "files": list(files),
        })
    archived_names: list[str] = []
    for package in archived:
        relative = relative_path(source / "skills", package)
        copy_tree(package, archive_destination / relative, output, transform)
        archived_names.append(relative.as_posix())
    root_files: list[str] = []
    for path in walk_files(source / "skills"):
        if path.parent != source / "skills":
            continue
        relative = relative_path(source / "skills", path)
        copy_file(path, archive_destination / relative, output, transform)
        root_files.append(relative.as_posix())
    write_json(output / "evcrate" / "skill-map.json", output, {
        "schema": "evcrate-copilot-skill-map-v1",
        "native": native_audit,
        "archived": sorted(archived_names + root_files),
    })
    return {"native": native_audit, "archived": sorted(archived_names + root_files), "names": names}
