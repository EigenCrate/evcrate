"""Project Claude skill packages into OMP's one-level skill layout."""

from __future__ import annotations

import re
from pathlib import Path

from pi_adapter.frontmatter import FrontmatterError, split_frontmatter

from .resources import ResourceError, copy_tree, ensure_parent, relative_path, walk_files, write_json


_SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _skill_manifest(source_root: Path) -> tuple[list[tuple[Path, Path, str]], list[Path]]:
    """Return native package roots and non-native package roots."""

    native: list[tuple[Path, Path, str]] = []
    archive: list[Path] = []
    if source_root.is_symlink() or not source_root.is_dir():
        raise ResourceError(f"Missing or unsafe canonical skill directory: {source_root}")
    top_level = sorted(path for path in source_root.iterdir() if path.is_dir())
    for package in top_level:
        if package.is_symlink():
            raise ResourceError(f"Symlinked canonical skill package is forbidden: {package}")
        direct = package / "SKILL.md"
        lowercase = package / "skill.md"
        if direct.is_file() and not direct.is_symlink():
            native.append((package, package, package.name))
            continue
        if lowercase.is_file() and not lowercase.is_symlink():
            native.append((package, package, package.name))
            continue
        nested = sorted(
            path.parent
            for path in package.rglob("SKILL.md")
            if path.is_file() and not path.is_symlink() and path.parent.parent == package
        )
        if nested:
            for nested_package in nested:
                native.append((nested_package, nested_package, nested_package.name))
            # Any package-level files beside nested packages remain an archive.
            package_files = [
                path for path in walk_files(package)
                if path.parent == package
            ]
            if package_files:
                archive.append(package)
        else:
            archive.append(package)
    return native, archive


def _validate_skill(source_skill: Path, skill_name: str) -> None:
    marker = source_skill / "SKILL.md"
    if not marker.is_file():
        marker = source_skill / "skill.md"
    if marker.is_symlink() or not marker.is_file():
        raise ResourceError(f"Native OMP skill is missing SKILL.md: {source_skill}")
    try:
        parsed = split_frontmatter(marker.read_text(encoding="utf-8"), marker)
    except (OSError, UnicodeError, FrontmatterError) as error:
        raise ResourceError(f"Invalid skill frontmatter: {marker}") from error
    name = parsed.fields.get("name", "").strip().strip("\"'")
    description = parsed.fields.get("description", "").strip()
    if not _SKILL_NAME.fullmatch(name) or len(name) > 64:
        raise ResourceError(f"Invalid OMP skill name in {marker}: {name!r}")
    if not description or description in {"|", ">", "|-", ">-"} or len(description) > 1024:
        raise ResourceError(f"Invalid OMP skill description in {marker}")
    if not _SKILL_NAME.fullmatch(skill_name):
        raise ResourceError(f"Unsafe OMP skill directory name: {skill_name!r}")


def _copy_native_skill(
    source_skill: Path,
    destination: Path,
    output: Path,
    transform,
) -> tuple[str, ...]:
    _validate_skill(source_skill, destination.name)
    copied: list[str] = []
    for source_file in walk_files(source_skill):
        relative = relative_path(source_skill, source_file)
        target_relative = Path("SKILL.md") if relative.as_posix() == "skill.md" else relative
        from .resources import copy_file

        copy_file(source_file, destination / target_relative, output, transform)
        copied.append(target_relative.as_posix())
    return tuple(copied)


def convert_skills(source: Path, output: Path, transform) -> dict[str, object]:
    """Copy native packages and archive non-native source directories safely."""

    source_root = source / "skills"
    native, archive = _skill_manifest(source_root)
    destination = output / "skills"
    archive_destination = output / "evcrate" / "skills"
    used_names: set[str] = set()
    native_audit: list[dict[str, object]] = []
    for source_skill, _, source_name in native:
        target_name = source_name
        if target_name in used_names:
            raise ResourceError(f"Duplicate OMP skill name after flattening: {target_name}")
        used_names.add(target_name)
        files = _copy_native_skill(source_skill, destination / target_name, output, transform)
        native_audit.append({
            "source": relative_path(source_root, source_skill).as_posix(),
            "target": target_name,
            "files": list(files),
        })

    archived: list[str] = []
    for package in archive:
        relative = relative_path(source_root, package)
        copy_tree(package, archive_destination / relative, output, transform)
        archived.append(relative.as_posix())

    # Preserve root-level skill support files (for example .env.example) as
    # managed assets without exposing them to OMP's skill scanner.
    root_files = []
    for source_file in walk_files(source_root):
        if source_file.parent != source_root:
            continue
        relative = relative_path(source_root, source_file)
        from .resources import copy_file

        copy_file(source_file, archive_destination / relative, output, transform)
        root_files.append(relative.as_posix())

    manifest = {
        "schema": "evcrate-omp-skill-map-v1",
        "native": native_audit,
        "archived": sorted(archived + root_files),
    }
    write_json(output / "evcrate" / "skill-map.json", output, manifest)
    return manifest
