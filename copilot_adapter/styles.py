"""Expose canonical output styles as manual Copilot skills."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable

from pi_adapter.frontmatter import FrontmatterError, split_frontmatter

from .prompts import serialize_skill
from .resources import ResourceError, copy_file, ensure_parent, relative_path, walk_files


_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _kebab(value: str) -> str:
    value = re.sub(r"(?:__|[_\s]+)", "-", value)
    value = re.sub(r"[^A-Za-z0-9-]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-").lower()


def _parse(path: Path) -> tuple[dict[str, str], str]:
    try:
        parsed = split_frontmatter(path.read_text(encoding="utf-8"), path)
    except (OSError, UnicodeError, FrontmatterError) as error:
        raise ResourceError(f"Invalid output style: {path}") from error
    description = parsed.fields.get("description", "").strip()
    if not description or len(description) > 1024:
        raise ResourceError(f"Output style requires a description: {path}")
    return dict(parsed.fields), parsed.body


def convert_styles(source: Path, output: Path, transform: Callable[[str], str]) -> list[dict[str, str]]:
    """Create one namespaced, user-invocable skill per canonical style."""

    root = source / "output-styles"
    styles: list[dict[str, str]] = []
    used: set[str] = set()
    for path in walk_files(root):
        relative = relative_path(root, path)
        if relative.suffix.lower() != ".md":
            raise ResourceError(f"Canonical output style must be Markdown: {path}")
        fields, body = _parse(path)
        target_name = "evcrate-style-" + _kebab(relative.stem)
        if not _NAME.fullmatch(target_name) or len(target_name) > 64:
            raise ResourceError(f"Invalid Copilot output-style skill name: {relative}")
        if target_name.casefold() in used:
            raise ResourceError(f"Output style names collide after Copilot namespacing: {relative}")
        used.add(target_name.casefold())
        description = transform(fields["description"]).strip()
        if not description or len(description) > 1024:
            raise ResourceError(f"Invalid translated Copilot output-style description: {path}")
        skill_body = (
            "Apply this style for the current response and the remainder of this session.\n\n"
            + transform(body).lstrip()
        )
        destination = output / "skills" / target_name / "SKILL.md"
        ensure_parent(output, destination)
        destination.write_text(serialize_skill({
            "name": target_name,
            "description": description,
            "user-invocable": True,
            "disable-model-invocation": True,
        }, skill_body), encoding="utf-8", newline="\n")
        destination.chmod(0o644)
        archive = output / "evcrate" / "output-styles" / relative
        copy_file(path, archive, output, transform)
        styles.append({
            "source": relative.as_posix(),
            "target": f"skills/{target_name}/SKILL.md",
            "archive": f"evcrate/output-styles/{relative.as_posix()}",
        })
    return styles
