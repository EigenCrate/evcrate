"""Machine-checkable source-to-target coverage for the Copilot adapter."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Mapping


from .resources import ResourceError, relative_path, walk_files, write_json


_DISPOSITIONS = {"native", "managed-static", "approximated", "unsupported"}
_SYNTHETIC_SOURCES = {
    ".evcrate/source/.claude/settings.json#CLAUDE_ENV_FILE",
    ".evcrate/source/.claude/.gitignore",
}


def _source_name(source: Path, path: Path) -> str:
    return f".evcrate/source/.claude/{relative_path(source, path).as_posix()}"


def _entry(source: str, targets: list[str], disposition: str, reason: str = "") -> dict[str, object]:
    if disposition not in _DISPOSITIONS:
        raise ResourceError(f"Invalid Copilot inventory disposition: {disposition}")
    if disposition != "native" and not reason:
        raise ResourceError(f"Non-native Copilot inventory entry needs a reason: {source}")
    return {
        "source": source,
        "target": targets[0] if len(targets) == 1 else targets,
        "targets": targets,
        "disposition": disposition,
        **({"reason": reason} if disposition != "native" else {}),
    }


def _target_path(relative: str) -> str:
    return f".copilot/{relative.lstrip('/')}"


def _target(root: str, relative: str) -> str:
    return f".copilot/{root}/{relative}" if relative else f".copilot/{root}"

def _native_skill_target(relative: str, native: list[dict[str, object]]) -> str | None:
    candidates: list[tuple[int, dict[str, object]]] = []
    for item in native:
        package = str(item["source"]).rstrip("/")
        if relative == package or relative.startswith(package + "/"):
            candidates.append((len(package), item))
    if not candidates:
        return None
    _, item = max(candidates, key=lambda pair: pair[0])
    package = str(item["source"]).rstrip("/")
    relative_file = relative[len(package):].lstrip("/")
    if relative_file.casefold() == "skill.md":
        relative_file = "SKILL.md"
    return _target(str(item["target"]), relative_file)


def _archive_skill_target(relative: str, archived: list[str]) -> str | None:
    candidates = [root.rstrip("/") for root in archived if relative == root or relative.startswith(root.rstrip("/") + "/")]
    if not candidates:
        return None
    return _target("evcrate/skills", relative)


def _target_exists(output: Path, target: str) -> bool:
    path, _, fragment = target.partition("#")
    if path == ".copilot":
        return not fragment and output.is_dir()
    prefix = ".copilot/"
    if not path.startswith(prefix):
        return False
    relative = Path(path.removeprefix(prefix))
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        return False
    candidate = output / relative
    if candidate.is_symlink() or not candidate.is_file():
        return False
    if not fragment:
        return True
    match = re.fullmatch(r"(?P<event>[A-Za-z][A-Za-z0-9]*)(?:\[(?P<index>\d+)\])?", fragment)
    if match is None:
        return False
    try:
        value = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    hooks = value.get("hooks") if isinstance(value, dict) else None
    entries = hooks.get(match["event"]) if isinstance(hooks, dict) else None
    if not isinstance(entries, list):
        return False
    index = match["index"]
    return index is None or int(index) < len(entries)

def _registration_sources(source: Path) -> set[str]:
    settings = source / "settings.json"
    try:
        value = json.loads(settings.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ResourceError(f"Canonical hook settings are unreadable: {settings}") from error
    hooks = value.get("hooks") if isinstance(value, dict) else None
    if not isinstance(hooks, dict):
        raise ResourceError("Canonical hook settings must contain a hooks object")
    return {
        f".evcrate/source/.claude/settings.json#hooks.{event}[{index}]"
        for event, entries in hooks.items()
        if isinstance(entries, list)
        for index, _ in enumerate(entries)
    }


def validate_inventory(source: Path, output: Path, inventory: Mapping[str, object]) -> None:
    """Reject duplicate, stale, missing, or unrecorded source resources."""

    maps = inventory.get("maps")
    if not isinstance(maps, dict) or set(maps) != {"commands", "skills", "agents"}:
        raise ResourceError("Copilot migration inventory maps are incomplete")
    for name in ("commands", "skills", "agents"):
        target = maps.get(name)
        if not isinstance(target, str):
            raise ResourceError(f"Copilot migration inventory map is invalid: {name}")
        target_path = target if target.startswith(".copilot/") else f".copilot/{target}"
        if not _target_exists(output, target_path):
            raise ResourceError(f"Copilot migration inventory map target is missing: {target}")

    entries = inventory.get("entries")
    if not isinstance(entries, list):
        raise ResourceError("Copilot migration inventory requires an entries list")
    sources: list[str] = []
    for item in entries:
        if not isinstance(item, dict) or not isinstance(item.get("source"), str):
            raise ResourceError("Copilot migration inventory contains an invalid entry")
        source_name = str(item["source"])
        if source_name in sources:
            raise ResourceError(f"Duplicate Copilot inventory source: {source_name}")
        sources.append(source_name)
        disposition = item.get("disposition")
        if disposition not in _DISPOSITIONS:
            raise ResourceError(f"Invalid Copilot inventory disposition: {source_name}")
        reason = item.get("reason")
        if disposition != "native" and (not isinstance(reason, str) or not reason.strip()):
            raise ResourceError(f"Copilot inventory reason is missing: {source_name}")
        targets = item.get("targets")
        if not isinstance(targets, list) or not all(isinstance(path, str) for path in targets):
            raise ResourceError(f"Copilot inventory targets are invalid: {source_name}")
        if disposition != "unsupported" and not all(_target_exists(output, path) for path in targets):
            raise ResourceError(f"Copilot inventory target is missing: {source_name}")
    actual = {_source_name(source, path) for path in walk_files(source)}
    instruction = ".evcrate/source/CLAUDE.md"
    actual.add(instruction)
    recorded = set(sources)
    if actual - recorded:
        raise ResourceError("Unrecorded Copilot source resources: " + ", ".join(sorted(actual - recorded)))
    allowed = actual | _SYNTHETIC_SOURCES | _registration_sources(source)
    if recorded - allowed:
        raise ResourceError("Stale Copilot inventory resources: " + ", ".join(sorted(recorded - allowed)))


def build_inventory(
    source: Path,
    output: Path,
    command_map: Mapping[str, Mapping[str, str]],
    skill_audit: Mapping[str, object],
    agent_audit: Mapping[str, object],
    hook_audit: Mapping[str, object],
    style_audit: list[Mapping[str, str]],
    workflows: tuple[str, ...],
    support_audit: Mapping[str, object],
) -> dict[str, object]:
    """Build and validate a deterministic inventory from a fresh source walk."""

    del workflows
    entries: list[dict[str, object]] = []
    by_source: dict[str, dict[str, object]] = {}

    def add(path: str, targets: list[str], disposition: str, reason: str = "") -> None:
        if path in by_source:
            raise ResourceError(f"Duplicate Copilot inventory source: {path}")
        value = _entry(path, targets, disposition, reason)
        by_source[path] = value
        entries.append(value)

    add(".evcrate/source/CLAUDE.md", [".copilot/copilot-instructions.md"], "native")
    for path in walk_files(source / "workflows"):
        relative = relative_path(source / "workflows", path).as_posix()
        add(_source_name(source, path), [_target("evcrate/workflows", relative)], "managed-static", "Copilot CLI has no native workflow loader; the transformed workflow remains managed support.")
    for item in sorted(command_map.values(), key=lambda value: value["source"]):
        add(
            f".evcrate/source/.claude/commands/{item['source']}",
            [_target_path(str(item["target"]))],
            "approximated",
            "Claude command invocation is represented by a user-invocable Copilot skill with an exact raw-argument contract.",
        )

    native = [dict(item) for item in skill_audit.get("native", []) if isinstance(item, dict)]
    archived = [str(item) for item in skill_audit.get("archived", [])]
    for path in walk_files(source / "skills"):
        relative = relative_path(source / "skills", path).as_posix()
        target = _native_skill_target(relative, native) or _archive_skill_target(relative, archived)
        if target is None:
            if any(part in {"tests", "__tests__", "fixtures", "helpers"} for part in Path(relative).parts):
                add(_source_name(source, path), [], "unsupported", "Non-production skill test or fixture is excluded from the published support tree.")
                continue
            raise ResourceError(f"Copilot skill source has no mapping: {relative}")
        disposition = "native" if _native_skill_target(relative, native) else "managed-static"
        reason = "" if disposition == "native" else "Non-invokable skill support is archived without entering Copilot skill discovery."
        add(_source_name(source, path), [target], disposition, reason)

    for name, value in sorted(agent_audit.items()):
        if not isinstance(value, dict):
            raise ResourceError(f"Invalid Copilot agent audit entry: {name}")
        add(
            f".evcrate/source/.claude/agents/{value['source']}",
            [_target_path(str(value["target"]))],
            "approximated",
            "Copilot agent metadata omits Claude model pins and maps only documented tool aliases.",
        )

    copied_hooks = {str(item) for item in hook_audit.get("hooks", ())}
    copied_scripts = {str(item) for item in hook_audit.get("scripts", ())}
    registrations = hook_audit.get("registrations", ())
    if not isinstance(registrations, (list, tuple)):
        raise ResourceError("Invalid Copilot hook registration audit")
    for registration in registrations:
        if (
            not isinstance(registration, dict)
            or not isinstance(registration.get("event"), str)
            or not isinstance(registration.get("targetEvent"), str)
            or not isinstance(registration.get("index"), int)
        ):
            raise ResourceError("Invalid Copilot hook registration")
        event = str(registration["event"])
        target_event = str(registration["targetEvent"])
        source_name = f".evcrate/source/.claude/settings.json#hooks.{event}[{registration['index']}]"
        if event == "UserPromptSubmit":
            add(source_name, [], "unsupported", "Copilot target hooks intentionally omit the Claude-only UserPromptSubmit registration.")
            continue
        add(
            source_name,
            [".copilot/hooks/evcrate.json#" + target_event],
            "approximated",
            "The Claude hook registration is bridged to the corresponding native camelCase Copilot event and source matcher.",
        )
    for path in walk_files(source / "hooks"):
        relative = relative_path(source / "hooks", path).as_posix()
        disposition = "managed-static" if relative in copied_hooks else "unsupported"
        reason = "The production hook entrypoint is executed through the Copilot compatibility bridge." if disposition != "unsupported" else "Non-production hook test or helper is excluded from the bridge closure."
        add(_source_name(source, path), [_target("evcrate/hooks", relative)] if disposition != "unsupported" else [], disposition, reason)
    for path in walk_files(source / "scripts"):
        relative = relative_path(source / "scripts", path).as_posix()
        disposition = "managed-static" if relative in copied_scripts else "unsupported"
        reason = "The production script is retained as managed Copilot support." if disposition != "unsupported" else "Non-production script test or helper is excluded from the published closure."
        add(_source_name(source, path), [_target("evcrate/scripts", relative)] if disposition != "unsupported" else [], disposition, reason)

    style_by_source = {item["source"]: item for item in style_audit}
    for path in walk_files(source / "output-styles"):
        relative = relative_path(source / "output-styles", path).as_posix()
        item = style_by_source.get(relative)
        if item is None:
            raise ResourceError(f"Copilot output style has no mapping: {relative}")
        add(_source_name(source, path), [_target_path(str(item["target"])), _target("evcrate/output-styles", relative)], "approximated", "Copilot has no native output-style loader; the style is also available as a manual skill.")

    add(".evcrate/source/.claude/.evcrate.json", [".copilot/.evcrate.json"], "managed-static", "The target-local EVCrate configuration is consumed by translated scripts.")
    add(".evcrate/source/.claude/.evcrateignore", [".copilot/.evcrateignore", ".copilot/evcrate/.evcrateignore"], "managed-static", "The ignore policy is consumed by the translated hook closure at both target levels.")
    archives = support_audit.get("archives")
    has_source_gitignore = isinstance(archives, list) and "evcrate/source-gitignore" in archives
    if has_source_gitignore:
        add(".evcrate/source/.claude/.gitignore", [".copilot/evcrate/source-gitignore"], "managed-static", "The source-only ignore file is retained for audit and is never loaded as Copilot configuration.")
    else:
        add(".evcrate/source/.claude/.gitignore", [], "unsupported", "npm packaging omits this dotfile; the source-only audit input is unavailable in the packed artifact.")
    add(".evcrate/source/.claude/settings.json", [".copilot/evcrate/claude-settings.json"], "managed-static", "Canonical hook/settings JSON is archived for audit; only EVCrate-owned Copilot settings are activated.")
    add(".evcrate/source/.claude/settings.local.json", [], "unsupported", "Claude local permission patterns are not activated by the personal Copilot target.")
    add(".evcrate/source/.claude/.mcp.json.example", [".copilot/mcp-config.example.json"], "managed-static", "The placeholder example is renamed and retained as opt-in documentation; no live MCP configuration is created.")
    for path in sorted(source.glob("statusline.*")):
        add(f".evcrate/source/.claude/{path.name}", [_target("evcrate", path.name)], "approximated", "The status-line variant is transformed for Copilot session fields and bounded output.")
    add(".evcrate/source/.claude/settings.json#CLAUDE_ENV_FILE", [], "unsupported", "Copilot has no CLAUDE_ENV_FILE propagation hook; the bridge removes that environment dependency.")

    inventory: dict[str, object] = {
        "schema": "evcrate-copilot-migration-v1",
        "source": ".evcrate/source/.claude",
        "target": ".copilot",
        "entries": sorted(entries, key=lambda item: str(item["source"])),
        "maps": {
            "commands": "evcrate/command-name-map.json",
            "skills": "evcrate/skill-map.json",
            "agents": "evcrate/agent-tool-audit.json",
        },
        "support": dict(support_audit),
    }
    validate_inventory(source, output, inventory)
    write_json(output / "evcrate" / "migration-inventory.json", output, inventory)
    return inventory
