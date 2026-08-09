"""Small, deterministic frontmatter parser for generated Pi resources."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


class FrontmatterError(ValueError):
    """Raised when a resource frontmatter block is unsafe or malformed."""


@dataclass(frozen=True)
class Frontmatter:
    fields: dict[str, str]
    body: str


_FIELD = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):(?:\s?(.*))?$")
_SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_lf(value: str) -> str:
    """Return text with one deterministic newline convention."""

    return value.replace("\r\n", "\n").replace("\r", "\n")


def split_frontmatter(value: str, source: Path) -> Frontmatter:
    """Parse the limited YAML frontmatter used by canonical resources."""

    text = normalize_lf(value)
    if not text.startswith("---\n"):
        raise FrontmatterError(f"Missing frontmatter: {source}")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise FrontmatterError(f"Unterminated frontmatter: {source}")

    fields: dict[str, str] = {}
    lines = text[4:end].split("\n")
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        match = _FIELD.match(line)
        if not match:
            raise FrontmatterError(f"Malformed frontmatter at {source}: {line!r}")
        name, raw_value = match.groups()
        if name in fields:
            raise FrontmatterError(f"Duplicate frontmatter field {name!r}: {source}")
        is_block = raw_value in {">-", ">", "|-", "|"}
        has_nested_value = not raw_value and index + 1 < len(lines) and lines[index + 1][:1].isspace()
        if is_block or has_nested_value:
            index += 1
            block: list[str] = []
            while index < len(lines) and (not lines[index] or lines[index][0].isspace()):
                block.append(lines[index].strip())
                index += 1
            if raw_value and raw_value.startswith("|"):
                fields[name] = "\n".join(block).strip()
            elif is_block:
                fields[name] = " ".join(part for part in block if part).strip()
            else:
                fields[name] = "\n".join(block).strip()
            continue
        fields[name] = _unquote((raw_value or "").strip())
        index += 1
    return Frontmatter(fields, text[end + 5:])


def scalar(value: str) -> str:
    """Render a field as a safe single-line YAML scalar."""

    return " ".join(value.split()).replace('"', '\\"')


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[:1] == value[-1:] and value[:1] in {"'", '"'}:
        return value[1:-1]
    return value


def serialize_frontmatter(fields: dict[str, str], body: str) -> str:
    """Serialize sorted scalar fields without environment-dependent formatting."""

    lines = ["---"]
    for name in sorted(fields):
        value = scalar(fields[name])
        lines.append(f'{name}: "{value}"')
    lines.extend(["---", "", normalize_lf(body).rstrip("\n"), ""])
    return "\n".join(lines)


def validate_skill_frontmatter(value: str, source: Path) -> Frontmatter:
    """Validate Pi skill metadata while retaining the authored document body."""

    parsed = split_frontmatter(value, source)
    name = parsed.fields.get("name", "")
    description = parsed.fields.get("description", "")
    if not _SKILL_NAME.fullmatch(name) or len(name) > 64:
        raise FrontmatterError(f"Invalid Pi skill name in {source}: {name!r}")
    if not description or len(description) > 1024:
        raise FrontmatterError(f"Invalid Pi skill description in {source}")
    return parsed
