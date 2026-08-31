"""Copy hook/script closures and register Copilot-native hook commands."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

from distribution.contracts import render_harness_script_references

from .bridge import BRIDGE_SOURCE
from .resources import ResourceError, copy_file, ensure_parent, production_files, read_json, relative_path, write_json


_EVENT_OPERATIONS = {
    "SessionStart": ("sessionStart", "session-start"),
    "SubagentStart": ("subagentStart", "subagent-start"),
    "PreToolUse": ("preToolUse", "pre-tool-use"),
    "PostToolUse": ("postToolUse", "post-tool-use"),
    "PreCompact": ("preCompact", "pre-compact"),
    "SessionEnd": ("sessionEnd", "session-end"),
}
_UNSUPPORTED_EVENTS = {"UserPromptSubmit"}
_CLAUDE_TOOL_MATCHERS = {
    "bash": ("bash", "powershell"),
    "glob": ("glob",),
    "grep": ("grep", "rg"),
    "read": ("view",),
    "edit": ("edit", "str_replace_editor", "apply_patch"),
    "write": ("create",),
}



def _bridge_command(operation: str) -> str:
    code = (
        "const os=require('node:os');"
        "const path=require('node:path');"
        "const home=process.env.COPILOT_HOME||path.join(os.homedir(),'.copilot');"
        "const bridge=path.resolve(home,'evcrate','hooks','copilot-hook-bridge.cjs');"
        "process.exitCode=require(bridge)(process.argv[1]);"
    )
    return "node -e " + json.dumps(code) + " " + operation


def _native_matcher(event_name: str, value: str | None) -> str | None:
    if event_name in {"SessionStart", "SubagentStart", "SessionEnd"}:
        return None
    if value is None or value in {"", "*", "**"}:
        return None
    if event_name == "PreCompact":
        return value
    tokens = []
    for token in value.split("|"):
        tokens.extend(_CLAUDE_TOOL_MATCHERS.get(token.casefold(), (token,)))
    return "|".join(dict.fromkeys(tokens))

def _translate_hook(value: str, transform: Callable[[str], str], relative: Path) -> str:
    rendered = transform(render_harness_script_references(value, "copilot"))
    if relative.as_posix() == "lib/evcrate-config-utils.cjs":
        rendered = rendered.replace(
            "new Set(['.claude', '.codex', '.pi'])",
            "new Set(['.claude', '.codex', '.pi', '.copilot'])",
        ).replace(
            "return VALID_CONFIG_DIRS.has(value) ? value : '.claude';",
            "return VALID_CONFIG_DIRS.has(value) ? value : '.copilot';",
        )
        rendered = rendered.replace(
            "if (resolveEVCrateConfigDir(value) !== '.pi') return null;\n  return absoluteDirectory(process['env'].EVCRATE_RESOURCE_ROOT)\n    || path.join(os.homedir(), '.pi', 'agent', 'evcrate');",
            "const configDir = resolveEVCrateConfigDir(value);\n"
            "  if (configDir !== '.pi' && configDir !== '.copilot') return null;\n"
            "  return absoluteDirectory(process['env'].EVCRATE_RESOURCE_ROOT)\n"
            "    || (configDir === '.copilot'\n"
            "      ? path.join(process['env'].COPILOT_HOME || path.join(os.homedir(), '.copilot'), 'evcrate')\n"
            "      : path.join(os.homedir(), '.pi', 'agent', 'evcrate'));",
        ).replace(
            "const globalRoot = configDir === '.pi'\n    ? absoluteDirectory(process['env'].EVCRATE_GLOBAL_CONFIG_ROOT)\n    : null;",
            "const globalRoot = configDir === '.pi' || configDir === '.copilot'\n"
            "    ? absoluteDirectory(process['env'].EVCRATE_GLOBAL_CONFIG_ROOT)\n"
            "    : null;",
        )
    if relative.as_posix() == "scout-block.cjs":
        rendered = rendered.replace(
            "const claudeDir = path.dirname(scriptDir); // Go up from hooks/ to .claude/",
            "const copilotDir = path.dirname(path.dirname(scriptDir)); // hooks/ is below evcrate/",
        ).replace("claudeDir", "copilotDir")
    if relative.as_posix() == "session-init.cjs":
        rendered = rendered.replace(
            "const envFile = process.env.COPILOT_ENV_FILE;",
            "const envFile = undefined; // Copilot has no environment-file hook",
        ).replace("CLAUDE_ENV_FILE", "Copilot environment-file hook")
    if relative.as_posix() == "session-end.cjs":
        rendered = rendered.replace(
            " * Fires: When session ends (clear, compact, user exit)",
            " * Fires: When the Copilot session ends",
        ).replace(
            "    // Delete marker on /clear to reset context baseline\n"
            "    // SessionEnd fires with OLD session_id before new session starts\n"
            "    // This ensures clean slate for the next session\n"
            "    if (reason === 'clear' && sessionId) {",
            "    // Remove state for every supported Copilot session-end reason.\n"
            "    if (sessionId) {",
        )
    return rendered


def _translate_static(value: str, transform: Callable[[str], str]) -> str:
    return transform(render_harness_script_references(value, "copilot"))


def _hook_config(events: dict[str, object]) -> dict[str, object]:
    hooks: dict[str, object] = {}
    for event_name, entries in events.items():
        if not isinstance(entries, list) or not all(isinstance(item, dict) for item in entries):
            raise ResourceError(f"Canonical hook event must contain object entries: {event_name}")
        if event_name in _UNSUPPORTED_EVENTS:
            continue
        event_mapping = _EVENT_OPERATIONS.get(event_name)
        if event_mapping is None:
            raise ResourceError(f"Unsupported canonical hook event: {event_name}")
        target_event, operation = event_mapping
        if len(entries) != 1:
            raise ResourceError(
                f"Canonical {event_name} registrations cannot be collapsed safely: expected one registration"
            )
        entry = entries[0]
        raw_hooks = entry.get("hooks")
        if not isinstance(raw_hooks, list) or not all(isinstance(item, dict) for item in raw_hooks):
            raise ResourceError(f"Canonical {event_name} registration has invalid hook commands")
        expected_hooks = 2 if event_name == "PreToolUse" else 1
        if len(raw_hooks) != expected_hooks or any(
            item.get("type") != "command" or not isinstance(item.get("command"), str)
            for item in raw_hooks
        ):
            raise ResourceError(f"Canonical {event_name} hook commands cannot be bridged safely")
        if event_name == "PreToolUse":
            commands = [str(item["command"]) for item in raw_hooks]
            if "scout-block.cjs" not in commands[0] or "privacy-block.cjs" not in commands[1]:
                raise ResourceError("Canonical PreToolUse hooks must run scout before privacy")
        matcher_value = entry.get("matcher")
        if event_name not in {"SessionStart", "SessionEnd"} and not isinstance(matcher_value, str):
            raise ResourceError(f"Canonical {event_name} registration has no source matcher")
        matcher = _native_matcher(event_name, matcher_value)
        registration = {"type": "command", "command": _bridge_command(operation)}
        if matcher is not None:
            registration["matcher"] = matcher
        hooks[target_event] = [registration]
    return {"version": 1, "hooks": hooks}


def _write_bridge(output: Path) -> None:
    destination = output / "evcrate" / "hooks" / "copilot-hook-bridge.cjs"
    ensure_parent(output, destination)
    destination.write_text(BRIDGE_SOURCE, encoding="utf-8", newline="\n")
    destination.chmod(0o755)


def write_managed_settings(output: Path) -> None:
    # The status line is not a hook operation; bootstrap the managed CJS file directly.
    code = (
        "const os=require('node:os');const path=require('node:path');"
        "const home=process.env.COPILOT_HOME||path.join(os.homedir(),'.copilot');"
        "const statusline=path.resolve(home,'evcrate','statusline.cjs');"
        "require(statusline);"
    )
    write_json(output / "evcrate" / "managed-settings.json", output, {
        "includeCoAuthoredBy": False,
        "effortLevel": "high",
        "statusLine": {"type": "command", "command": "node -e " + json.dumps(code)},
    })


def convert_hooks_and_scripts(source: Path, output: Path, transform: Callable[[str], str]) -> dict[str, object]:
    """Copy production closures, static metadata, and native hook registration."""

    copied_hooks: list[str] = []
    for path in production_files(source / "hooks"):
        relative = relative_path(source / "hooks", path)
        copy_file(path, output / "evcrate" / "hooks" / relative, output,
                  lambda value, relative=relative: _translate_hook(value, transform, relative))
        copied_hooks.append(relative.as_posix())
    copied_scripts: list[str] = []
    for path in production_files(source / "scripts"):
        relative = relative_path(source / "scripts", path)
        if "advise-state" in relative.name:
            continue
        copy_file(path, output / "evcrate" / "scripts" / relative, output,
                  lambda value: _translate_static(value, transform))
        copied_scripts.append(relative.as_posix())
    for name in (".evcrateignore",):
        copy_file(source / name, output / "evcrate" / name, output)
        copy_file(source / name, output / name, output)
    _write_bridge(output)
    settings = read_json(source / "settings.json", "canonical hook settings")
    events = settings.get("hooks")
    if not isinstance(events, dict):
        raise ResourceError("Canonical hook settings must contain a hooks object")
    write_json(output / "hooks" / "evcrate.json", output, _hook_config(events))
    registrations = [
        {
            "event": event,
            "targetEvent": _EVENT_OPERATIONS.get(event, (event, ""))[0],
            "index": index,
        }
        for event, entries in sorted(events.items())
        if isinstance(entries, list)
        for index, _ in enumerate(entries)
    ]
    write_managed_settings(output)
    return {
        "hooks": tuple(copied_hooks),
        "scripts": tuple(copied_scripts),
        "events": tuple(sorted(events)),
        "registrations": registrations,
    }
