"""Namespace Claude agents and audit dropped Copilot-incompatible fields."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

from distribution.contracts import project_advisor_contract
from pi_adapter.frontmatter import FrontmatterError, normalize_lf, split_frontmatter

from .resources import ResourceError, ensure_parent, write_json


_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_TOOL_MAP = {
    "bash": "shell",
    "read": "read",
    "write": "edit",
    "edit": "edit",
    "grep": "search",
    "glob": "search",
    "task": "agent",
    "webfetch": "web",
    "websearch": "web",
    "todowrite": "todo",
}


def _source_tools(value: str) -> list[str]:
    raw = value.strip()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    return [item.strip().strip("\"'").removeprefix("-").strip()
            for item in re.split(r"[,\n]", raw) if item.strip()]


def _map_tools(value: str) -> tuple[list[str], list[str]]:
    mapped: list[str] = []
    dropped: list[str] = []
    for source in _source_tools(value):
        target = _TOOL_MAP.get(source.casefold())
        if target is None:
            dropped.append(source)
        elif target not in mapped:
            mapped.append(target)
    return mapped, dropped


def _agent_files(source: Path) -> list[Path]:
    root = source / "agents"
    if root.is_symlink() or not root.is_dir():
        raise ResourceError(f"Missing or unsafe canonical agent directory: {root}")
    files = sorted(root.glob("*.md"))
    if any(path.is_symlink() or not path.is_file() for path in files):
        raise ResourceError(f"Unsafe canonical agent in {root}")
    return files


def discover_agents(source: Path) -> dict[str, str]:
    """Validate source names and return source-name to Copilot-name map."""

    result: dict[str, str] = {}
    used: dict[str, str] = {}
    for path in _agent_files(source):
        try:
            parsed = split_frontmatter(path.read_text(encoding="utf-8"), path)
        except (OSError, UnicodeError, FrontmatterError) as error:
            raise ResourceError(f"Invalid agent frontmatter: {path}") from error
        name = parsed.fields.get("name", "").strip()
        description = parsed.fields.get("description", "").strip()
        if not _NAME.fullmatch(name) or len(name) > 64:
            raise ResourceError(f"Invalid canonical agent name: {path}")
        if not description:
            raise ResourceError(f"Invalid canonical agent description: {path}")
        target = f"evcrate-{name}"
        if len(target) > 64:
            raise ResourceError(f"Copilot agent name exceeds 64 characters: {path}")
        if target.casefold() in used:
            raise ResourceError(f"Agent names collide after Copilot namespacing: {used[target.casefold()]} and {path}")
        used[target.casefold()] = path.name
        result[name.casefold()] = target
    return dict(sorted(result.items()))


def _serialize(fields: dict[str, object], body: str) -> str:
    lines = ["---", f"name: {json.dumps(str(fields['name']), ensure_ascii=False)}",
             f"description: {json.dumps(str(fields['description']), ensure_ascii=False)}"]
    if fields.get("tools"):
        lines.append(f"tools: [{', '.join(str(item) for item in fields['tools'])}]")
    lines.extend(["---", "", normalize_lf(body).rstrip("\n"), ""])
    return "\n".join(lines)


def convert_agents(source: Path, output: Path, agent_map: dict[str, str],
                   transform: Callable[[str], str]) -> dict[str, object]:
    """Generate Copilot agents and an explicit tool/model translation audit."""

    audit: dict[str, object] = {}
    for path in _agent_files(source):
        parsed = split_frontmatter(path.read_text(encoding="utf-8"), path)
        source_name = parsed.fields["name"].strip()
        target_name = agent_map[source_name.casefold()]
        mapped, dropped = _map_tools(parsed.fields.get("tools", ""))
        body = transform(parsed.body)
        if source_name == "advisor":
            body = project_advisor_contract(body, "copilot")
        description = transform(parsed.fields["description"].strip()).strip()
        if not description:
            raise ResourceError(f"Invalid translated Copilot agent description: {path}")
        fields: dict[str, object] = {"name": target_name, "description": description}
        if mapped:
            fields["tools"] = mapped
        target = output / "agents" / f"{target_name}.agent.md"
        ensure_parent(output, target)
        target.write_text(_serialize(fields, body), encoding="utf-8", newline="\n")
        target.chmod(0o644)
        dropped_fields = ["model"] if parsed.fields.get("model") else []
        dropped_fields.extend(key for key in parsed.fields if key not in {"name", "description", "tools", "model"})
        audit[source_name] = {
            "source": path.name,
            "target": target.relative_to(output).as_posix(),
            "model": {"source": parsed.fields.get("model"), "target": None, "reason": "Copilot inherits the active model"},
            "tools": {"mapped": mapped, "dropped": sorted(dropped)},
            "droppedFields": sorted(set(dropped_fields)),
        }
    write_json(output / "evcrate" / "agent-tool-audit.json", output, {
        "schema": "evcrate-copilot-agent-tool-audit-v1",
        "agents": audit,
    })
    return audit
