"""Convert canonical Claude agents to OMP subagent definitions."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

from distribution.contracts import project_advisor_contract
from pi_adapter.frontmatter import FrontmatterError, normalize_lf, split_frontmatter

from .resources import ResourceError, ensure_parent, write_json


MODEL_MAP = {
    "opus": "@slow",
    "sonnet": "@default",
    "haiku": "@smol",
}

TOOL_MAP = {
    "read": "read",
    "glob": "glob",
    "grep": "grep",
    "bash": "bash",
    "edit": "edit",
    "multiedit": "edit",
    "write": "write",
    "ls": "glob",
    "notebookedit": "edit",
    "webfetch": "read",
    "websearch": "web_search",
    "todowrite": "todo",
}

_AGENT_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def _source_tools(value: str) -> list[str]:
    raw = value.strip()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    return [item.strip().strip("\"'").removeprefix("-").strip() for item in raw.split(",") if item.strip()]


def _map_tools(value: str) -> tuple[list[str], list[str]]:
    mapped: list[str] = []
    dropped: list[str] = []
    for source in _source_tools(value):
        target = TOOL_MAP.get(source.casefold())
        if target is None:
            dropped.append(source)
        elif target not in mapped:
            mapped.append(target)
    return mapped, dropped


def _yaml_string(value: str) -> str:
    return json.dumps(normalize_lf(value), ensure_ascii=False)


def _serialize_agent(fields: dict[str, object], body: str) -> str:
    lines = ["---"]
    for key in ("name", "description", "tools", "model", "thinking-level"):
        value = fields.get(key)
        if value is None:
            continue
        if key == "tools":
            assert isinstance(value, list)
            lines.append(f"{key}: [{', '.join(value)}]")
        else:
            lines.append(f"{key}: {_yaml_string(str(value))}")
    lines.extend(["---", "", normalize_lf(body).rstrip("\n"), ""])
    return "\n".join(lines)


def convert_agents(
    source: Path,
    output: Path,
    transform: Callable[[str], str],
    *,
    description_transform: Callable[[str], str] | None = None,
    thinking_level: str | None = None,
) -> dict[str, object]:
    """Generate OMP agents and auditable model/tool translation metadata."""

    source_root = source / "agents"
    destination = output / "agents"
    if source_root.is_symlink() or not source_root.is_dir():
        raise ResourceError(f"Missing or unsafe canonical agent directory: {source_root}")
    seen_names: set[str] = set()
    audit: dict[str, object] = {}
    for source_path in sorted(source_root.glob("*.md")):
        if source_path.is_symlink() or not source_path.is_file():
            raise ResourceError(f"Unsafe canonical agent: {source_path}")
        try:
            parsed = split_frontmatter(source_path.read_text(encoding="utf-8"), source_path)
        except FrontmatterError:
            raise
        name = parsed.fields.get("name", "").strip()
        description = parsed.fields.get("description", "").strip()
        if not _AGENT_NAME.fullmatch(name):
            raise FrontmatterError(f"Invalid canonical agent name: {source_path}: {name!r}")
        if not description:
            raise FrontmatterError(f"Canonical agent has no description: {source_path}")
        if name in seen_names:
            raise FrontmatterError(f"Duplicate canonical agent name: {name}")
        seen_names.add(name)

        raw_model = parsed.fields.get("model", "").strip().casefold()
        model = MODEL_MAP.get(raw_model) if raw_model and raw_model != "inherit" else None
        if raw_model and raw_model != "inherit" and model is None:
            raise FrontmatterError(f"Unsupported canonical agent model {raw_model!r}: {source_path}")
        tools: list[str] = []
        dropped: list[str] = []
        if "tools" in parsed.fields:
            tools, dropped = _map_tools(parsed.fields["tools"])

        body = transform(parsed.body)
        if name == "advisor":
            body = project_advisor_contract(body, "omp")

        generated_description = (
            description_transform(description)
            if description_transform is not None
            else description
        )
        fields: dict[str, object] = {"name": name, "description": generated_description}
        if tools:
            fields["tools"] = tools
        if model:
            fields["model"] = model
        if thinking_level:
            fields["thinking-level"] = thinking_level
        target = destination / source_path.name
        ensure_parent(output, target)
        target.write_text(_serialize_agent(fields, body), encoding="utf-8", newline="\n")
        target.chmod(0o644)
        audit[name] = {
            "source": source_path.name,
            "model": {"source": raw_model or None, "target": model},
            "tools": {"mapped": tools, "dropped": sorted(dropped)},
            "thinkingLevel": thinking_level,
        }

    write_json(output / "evcrate" / "agent-tool-audit.json", output, {
        "schema": "evcrate-omp-agent-tool-audit-v1",
        "agents": audit,
    })
    return audit
