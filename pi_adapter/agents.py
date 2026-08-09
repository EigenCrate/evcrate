"""Convert canonical Claude agent definitions to provider-neutral Pi agents."""

from __future__ import annotations

import re
from pathlib import Path

from .frontmatter import FrontmatterError, serialize_frontmatter, split_frontmatter
from .resources import ResourceError, translate_prompt, write_json


MODEL_ROLES = {
    "opus": "strong",
    "sonnet": "standard",
    "haiku": "fast",
    "inherit": "parent",
}
TOOL_MAP = {
    "glob": "find",
    "grep": "grep",
    "read": "read",
    "edit": "edit",
    "multiedit": "edit",
    "write": "write",
    "bash": "bash",
    "ls": "ls",
    "task": "evcrate_subagent",
    "askuserquestion": "ask_user_question",
}
MODEL_TOKEN_REPLACEMENTS = (
    (re.compile(r"\bopus\b", re.IGNORECASE), "strong"),
    (re.compile(r"\bsonnet\b", re.IGNORECASE), "standard"),
    (re.compile(r"\bhaiku\b", re.IGNORECASE), "fast"),
    (re.compile(r"\bclaude-[a-z0-9._-]+\b", re.IGNORECASE), "active-provider model"),
    (re.compile(r"\bgpt-[a-z0-9._-]+\b", re.IGNORECASE), "active-provider model"),
)


def _neutralize_model_tokens(value: str) -> str:
    for pattern, replacement in MODEL_TOKEN_REPLACEMENTS:
        value = pattern.sub(replacement, value)
    return value


def _source_tools(value: str) -> list[str]:
    return [item.strip().removeprefix("-").strip() for item in re.split(r"[,\n]", value) if item.strip()]


def _tools(value: str) -> tuple[list[str], list[str]]:
    mapped: list[str] = []
    dropped: list[str] = []
    for source in _source_tools(value):
        target = TOOL_MAP.get(source.lower())
        if target is None:
            dropped.append(source)
        elif target not in mapped:
            mapped.append(target)
    return mapped, dropped


def convert_agents(source: Path, output: Path) -> None:
    """Generate Pi agent documents, role sidecar, and an unsupported-tool audit."""

    source_root = source / "agents"
    destination = output / "agent" / "agents"
    roles: dict[str, dict[str, str]] = {}
    tool_audit: dict[str, dict[str, list[str]]] = {}
    seen_names: set[str] = set()

    for source_path in sorted(source_root.glob("*.md")):
        if source_path.is_symlink() or not source_path.is_file():
            raise ResourceError(f"Unsafe canonical agent: {source_path}")
        parsed = split_frontmatter(source_path.read_text(encoding="utf-8"), source_path)
        name = parsed.fields.get("name", "")
        if not name or name in seen_names:
            raise FrontmatterError(f"Missing or duplicate agent name: {source_path}")
        seen_names.add(name)
        model = parsed.fields.get("model", "").lower() or "standard"
        role = MODEL_ROLES.get(model, model if model == "standard" else None)
        if role is None:
            raise FrontmatterError(f"Unsupported canonical agent model {model!r}: {source_path}")

        tools, dropped = _tools(parsed.fields.get("tools", ""))
        description = _neutralize_model_tokens(translate_prompt(parsed.fields.get("description", "")))
        body = _neutralize_model_tokens(translate_prompt(parsed.body))
        fields = {"name": name, "description": description}
        if tools:
            fields["tools"] = ", ".join(tools)
        destination.mkdir(parents=True, exist_ok=True)
        destination.chmod(0o755)
        generated = destination / source_path.name
        generated.write_text(serialize_frontmatter(fields, body), encoding="utf-8", newline="\n")
        generated.chmod(0o644)
        roles[name] = {"role": role, "source": "canonical-agent-frontmatter"}
        tool_audit[name] = {"dropped": sorted(dropped), "mapped": tools}

    write_json(output / "agent" / "evcrate" / "model-roles.json", output, {
        "agents": roles,
        "schema": "evcrate-model-roles-v1",
    })
    write_json(output / "agent" / "evcrate" / "agent-tool-audit.json", output, {
        "agents": tool_audit,
        "schema": "evcrate-agent-tool-audit-v1",
    })
