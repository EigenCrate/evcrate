"""Byte-preserving JSONC merge plans for target-owned top-level settings."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Mapping, Sequence


class ManagedJsonError(ValueError):
    """Raised when managed JSONC input cannot be safely merged."""


@dataclass(frozen=True)
class ManagedJsonPlan:
    """A pure merge result consumed by the transactional publisher."""

    action: str
    original: bytes | None
    result: bytes
    message: str = ""


def _reject_constant(value: str) -> None:
    raise ManagedJsonError(f"JSON constants are not permitted: {value}")


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ManagedJsonError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _comment_free(text: str) -> str:
    """Blank comments while retaining offsets and line endings."""

    chars = list(text)
    index = 0
    in_string = False
    escaped = False
    while index < len(chars):
        char = chars[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue
        if char == '"':
            in_string = True
            index += 1
            continue
        if char != "/" or index + 1 >= len(chars) or chars[index + 1] not in {"/", "*"}:
            index += 1
            continue
        block = chars[index + 1] == "*"
        chars[index] = " "
        chars[index + 1] = " "
        index += 2
        terminated = not block
        while index < len(chars):
            if not block:
                if chars[index] in {"\r", "\n"}:
                    terminated = True
                    break
                chars[index] = " "
                index += 1
                continue
            if chars[index] == "*" and index + 1 < len(chars) and chars[index + 1] == "/":
                chars[index] = chars[index + 1] = " "
                index += 2
                terminated = True
                break
            if chars[index] not in {"\r", "\n"}:
                chars[index] = " "
            index += 1
        if block and not terminated:
            raise ManagedJsonError("Unterminated JSONC block comment")
    if in_string:
        raise ManagedJsonError("Unterminated JSON string")
    return "".join(chars)


def _remove_trailing_commas(text: str) -> str:
    chars = list(text)
    index = 0
    in_string = False
    escaped = False
    while index < len(chars):
        char = chars[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue
        if char == '"':
            in_string = True
            index += 1
            continue
        if char == ",":
            probe = index + 1
            while probe < len(chars) and chars[probe].isspace():
                probe += 1
            if probe < len(chars) and chars[probe] in "}]":
                chars[index] = " "
        index += 1
    return "".join(chars)


def _parse_text(raw: bytes | str, label: str) -> tuple[str, Any]:
    try:
        text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
    except UnicodeDecodeError as error:
        raise ManagedJsonError(f"{label} is not UTF-8") from error
    if text.startswith("\ufeff"):
        text = text[1:]
    try:
        cleaned = _remove_trailing_commas(_comment_free(text))
        value = json.loads(
            cleaned,
            object_pairs_hook=_pairs,
            parse_constant=_reject_constant,
        )
    except ManagedJsonError:
        raise
    except (TypeError, json.JSONDecodeError) as error:
        raise ManagedJsonError(f"Invalid {label}: {error}") from error
    return text, value


def _top_level_members(text: str) -> tuple[int, int, dict[str, tuple[int, int]]]:
    """Return root braces and original offsets for top-level value spans."""

    cleaned = _remove_trailing_commas(_comment_free(text))
    decoder = json.JSONDecoder(parse_constant=_reject_constant)
    start = len(cleaned) - len(cleaned.lstrip())
    if start >= len(cleaned) or cleaned[start] != "{":
        raise ManagedJsonError("Managed JSON root must be an object")
    cursor = start + 1
    members: dict[str, tuple[int, int]] = {}
    while True:
        while cursor < len(cleaned) and cleaned[cursor].isspace():
            cursor += 1
        if cursor >= len(cleaned):
            raise ManagedJsonError("Unterminated managed JSON object")
        if cleaned[cursor] == "}":
            return start, cursor, members
        try:
            key, key_end = decoder.raw_decode(cleaned, cursor)
        except json.JSONDecodeError as error:
            raise ManagedJsonError(f"Invalid top-level JSON member: {error}") from error
        if not isinstance(key, str):
            raise ManagedJsonError("JSON object keys must be strings")
        cursor = key_end
        while cursor < len(cleaned) and cleaned[cursor].isspace():
            cursor += 1
        if cursor >= len(cleaned) or cleaned[cursor] != ":":
            raise ManagedJsonError(f"Missing colon after top-level key: {key}")
        cursor += 1
        while cursor < len(cleaned) and cleaned[cursor].isspace():
            cursor += 1
        value_start = cursor
        try:
            _, value_end = decoder.raw_decode(cleaned, cursor)
        except json.JSONDecodeError as error:
            raise ManagedJsonError(f"Invalid value for top-level key {key}: {error}") from error
        if key in members:
            raise ManagedJsonError(f"Duplicate JSON key: {key}")
        members[key] = (value_start, value_end)
        cursor = value_end
        while cursor < len(cleaned) and cleaned[cursor].isspace():
            cursor += 1
        if cursor >= len(cleaned):
            raise ManagedJsonError("Unterminated managed JSON object")
        if cleaned[cursor] == ",":
            cursor += 1
            continue
        if cleaned[cursor] == "}":
            return start, cursor, members
        raise ManagedJsonError(f"Expected comma after top-level key {key}")


def _kind(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _render_value(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _newline(text: str) -> str:
    return "\r\n" if "\r\n" in text else "\n"


def _indent(text: str, root_start: int, root_end: int) -> str:
    root = text[root_start:root_end]
    match = re.search(r"(?m)^[ \t]+(?=\")", root)
    if match:
        return match.group(0)
    return "  "


def _insert_missing(
    text: str,
    root_start: int,
    root_end: int,
    members: Mapping[str, tuple[int, int]],
    values: Mapping[str, Any],
    managed_keys: Sequence[str],
) -> str:
    missing = [key for key in managed_keys if key not in members]
    if not missing:
        return text
    body = text[root_start + 1:root_end]
    comment_free = _comment_free(text[:root_end])
    trailing_comma = comment_free.rstrip().endswith(",")
    has_members = bool(members)
    newline = _newline(text)
    multiline = "\r" in body or "\n" in body
    indent = _indent(text, root_start, root_end)
    rendered = [_render_value(values[key]) for key in missing]
    if multiline:
        entries = ("," + newline + indent).join(
            f'"{key}": {value}' for key, value in zip(missing, rendered, strict=True)
        )
        prefix = "" if trailing_comma or not has_members else ","
        insertion = prefix + newline + indent + entries + newline
    else:
        entries = ", ".join(f'"{key}": {value}' for key, value in zip(missing, rendered, strict=True))
        prefix = "" if trailing_comma or not has_members else ", "
        insertion = prefix + entries
    return text[:root_end] + insertion + text[root_end:]


def _validate_keys(managed_keys: Sequence[str], fragment: Any) -> tuple[str, ...]:
    keys = tuple(managed_keys)
    if not keys or len(set(keys)) != len(keys) or any(not isinstance(key, str) or not key or "." in key for key in keys):
        raise ManagedJsonError("managed_keys must be unique non-empty top-level names")
    if not isinstance(fragment, dict):
        raise ManagedJsonError("Managed JSON fragment must be an object")
    if set(fragment) != set(keys):
        raise ManagedJsonError("Managed JSON fragment keys must exactly match managed_keys")
    return keys


def plan_managed_json(
    existing: bytes | None,
    fragment: bytes,
    *,
    managed_keys: Sequence[str],
) -> ManagedJsonPlan:
    """Replace only target-owned top-level values in a valid JSONC object."""

    _, fragment_value = _parse_text(fragment, "managed JSON fragment")
    keys = _validate_keys(managed_keys, fragment_value)
    if existing is None:
        result = ("\ufeff" if fragment.startswith(b"\xef\xbb\xbf") else "") + json.dumps(
            fragment_value, ensure_ascii=False, sort_keys=True, indent=2, separators=(",", ": ")
        ) + "\n"
        return ManagedJsonPlan("create", None, result.encode("utf-8"))

    existing_text, existing_value = _parse_text(existing, "existing managed JSON")
    if not isinstance(existing_value, dict):
        raise ManagedJsonError("Existing managed JSON root must be an object")
    root_start, root_end, members = _top_level_members(existing_text)
    for key in keys:
        if key in existing_value and _kind(existing_value[key]) != _kind(fragment_value[key]):
            raise ManagedJsonError(
                f"Managed JSON key {key!r} changes type from {_kind(existing_value[key])} to {_kind(fragment_value[key])}"
            )
    if all(key in existing_value and existing_value[key] == fragment_value[key] for key in keys):
        return ManagedJsonPlan("noop", existing, existing)

    rendered = existing_text
    replacements: list[tuple[int, int, str]] = []
    for key in keys:
        if key in members:
            start, end = members[key]
            replacements.append((start, end, _render_value(fragment_value[key])))
    for start, end, value in sorted(replacements, reverse=True):
        rendered = rendered[:start] + value + rendered[end:]
    if any(key not in members for key in keys):
        # Re-scan because replacements may have shifted offsets.
        new_root_start, new_root_end, new_members = _top_level_members(rendered)
        rendered = _insert_missing(rendered, new_root_start, new_root_end, new_members, fragment_value, keys)
    if rendered == existing_text:
        return ManagedJsonPlan("noop", existing, existing)
    bom = b"\xef\xbb\xbf" if existing.startswith(b"\xef\xbb\xbf") else b""
    return ManagedJsonPlan("update", existing, bom + rendered.encode("utf-8"))
