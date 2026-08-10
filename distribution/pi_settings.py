"""Pure planning for EVCrate's shared Pi package settings."""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from typing import Any

from .hashing import canonical_json_bytes

MANAGED_PACKAGES = (
    "npm:pi-subagents@0.44.0",
    "npm:@juicesharp/rpiv-ask-user-question@2.4.0",
    "npm:@juicesharp/rpiv-todo@2.4.0",
)
MANAGED_BASES = tuple(item.rsplit("@", 1)[0] for item in MANAGED_PACKAGES)


class PiSettingsError(ValueError):
    """A malformed or conflicting user-owned Pi settings document."""


@dataclass(frozen=True)
class PiSettingsPlan:
    action: str
    original: bytes | None
    result: bytes | None
    message: str = ""


def managed_settings_fragment() -> dict[str, Any]:
    return {
        "packages": list(MANAGED_PACKAGES),
        "schema": "evcrate-pi-managed-settings-v1",
    }


def _base_identity(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None
    if value.startswith("npm:"):
        at = value.rfind("@")
        if at > 4:
            return value[:at]
    return value


def _identity(entry: Any) -> str | None:
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        for key in ("source", "package", "name"):
            value = entry.get(key)
            if isinstance(value, str):
                return value
    return None


def _replace_identity(entry: Any, package: str) -> Any:
    if not isinstance(entry, dict):
        return package
    updated = copy.deepcopy(entry)
    for key in ("source", "package", "name"):
        if isinstance(updated.get(key), str):
            updated[key] = package
            return updated
    updated["source"] = package
    return updated


def _value_at(data: dict[str, Any], key: str) -> tuple[dict[str, Any], str, Any]:
    parts = key.split(".")
    current = data
    for part in parts[:-1]:
        value = current.get(part)
        if not isinstance(value, dict):
            raise PiSettingsError(f"Pi settings key is not an object path: {key}")
        current = value
    leaf = parts[-1]
    return current, leaf, current.get(leaf)


def _fragment_packages(fragment: bytes | dict[str, Any]) -> tuple[str, ...]:
    try:
        parsed = json.loads(fragment.decode("utf-8")) if isinstance(fragment, bytes) else fragment
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PiSettingsError(f"Managed Pi settings fragment is invalid: {error}") from error
    if not isinstance(parsed, dict) or not isinstance(parsed.get("packages"), list):
        raise PiSettingsError("Managed Pi settings fragment requires a packages list")
    packages = tuple(item for item in parsed["packages"] if isinstance(item, str))
    if packages != MANAGED_PACKAGES:
        raise PiSettingsError("Managed Pi package pins do not match the manifest contract")
    return packages


def plan_pi_settings(
    existing: bytes | None,
    fragment: bytes | dict[str, Any],
    *,
    managed_key: str = "packages",
) -> PiSettingsPlan:
    """Return a deterministic merge plan without touching the filesystem."""

    packages = _fragment_packages(fragment)
    if existing is None:
        data: dict[str, Any] = {}
    else:
        try:
            parsed = json.loads(existing.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PiSettingsError(f"Pi settings are malformed: {error}") from error
        if not isinstance(parsed, dict):
            raise PiSettingsError("Pi settings root must be an object")
        data = parsed
    parent, leaf, current = _value_at(data, managed_key)
    if current is None:
        current = []
    if not isinstance(current, list):
        raise PiSettingsError(f"Pi settings {managed_key} must be a list")

    preserved: list[Any] = []
    templates: dict[str, Any] = {}
    for entry in current:
        identity = _identity(entry)
        base = _base_identity(identity) if identity is not None else None
        if base == "npm:pi-code" or base == "pi-code":
            return PiSettingsPlan("conflict", existing, None, "Remove npm:pi-code manually before publication")
        if base in MANAGED_BASES:
            templates.setdefault(base, entry)
        else:
            preserved.append(entry)
    managed = [
        _replace_identity(templates[base], package) if base in templates else package
        for package, base in zip(packages, MANAGED_BASES, strict=True)
    ]
    merged = preserved + managed
    updated = copy.deepcopy(data)
    parent, leaf, _ = _value_at(updated, managed_key)
    parent[leaf] = merged
    if existing is not None and updated == data:
        return PiSettingsPlan("noop", existing, existing)
    action = "merge-create" if existing is None else "merge-update"
    return PiSettingsPlan(action, existing, canonical_json_bytes(updated))
