"""Flatten canonical commands and retain transformed workflow assets."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable

from distribution.contracts import render_advisory_interview_workflow, render_inline_advise_command
from pi_adapter.frontmatter import FrontmatterError, split_frontmatter

from .prompts import command_body, first_prose_line, serialize_skill, translate_prompt
from .resources import ResourceError, copy_file, ensure_parent, relative_path, walk_files, write_json


_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _kebab(value: str) -> str:
    value = re.sub(r"(?:__|[_\s]+)", "-", value)
    value = re.sub(r"[^A-Za-z0-9-]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-").lower()


def build_command_map(source: Path) -> dict[str, dict[str, str]]:
    """Return deterministic source-to-personal-skill command mappings."""

    root = source / "commands"
    result: dict[str, dict[str, str]] = {}
    used: dict[str, str] = {}
    for command in walk_files(root):
        relative = relative_path(root, command)
        if relative.suffix.lower() != ".md":
            raise ResourceError(f"Canonical command must be Markdown: {command}")
        parts = relative.with_suffix("").parts
        source_name = ":".join(parts)
        target_name = "evcrate-cmd-" + "-".join(filter(None, (_kebab(part) for part in parts)))
        if not _NAME.fullmatch(target_name) or len(target_name) > 64:
            raise ResourceError(f"Invalid Copilot command skill name: {relative}")
        folded = target_name.casefold()
        if folded in used:
            raise ResourceError(f"Command names collide after Copilot flattening: {used[folded]} and {relative}")
        used[folded] = relative.as_posix()
        result[source_name.casefold()] = {
            "source": relative.as_posix(),
            "sourceName": source_name,
            "target": f"skills/{target_name}/SKILL.md",
            "targetName": target_name,
        }
    return dict(sorted(result.items()))


def convert_commands(source: Path, output: Path, command_map: dict[str, dict[str, str]],
                     transform: Callable[[str], str], workflows: tuple[str, ...]) -> dict[str, object]:
    """Write every Claude command as a user-invocable Copilot skill."""

    root = source / "commands"
    by_source = {entry["source"]: entry for entry in command_map.values()}
    for command in walk_files(root):
        relative = relative_path(root, command)
        entry = by_source[relative.as_posix()]
        raw = command.read_text(encoding="utf-8")
        frontmatter = raw.removeprefix("\ufeff")
        if frontmatter.startswith("---\n"):
            try:
                parsed = split_frontmatter(frontmatter, command)
            except FrontmatterError:
                raise
            fields, body = dict(parsed.fields), parsed.body
        else:
            fields, body = {}, raw
        description = fields.get("description", "").strip()
        source_kind = "frontmatter"
        if not description:
            description, source_kind = first_prose_line(body), "first-prose-line"
        if not description or len(description) > 1024:
            raise ResourceError(f"Invalid Copilot command description: {command}")
        rendered_body = transform(body)
        if relative.as_posix() == "advise.md":
            rendered_body = transform(render_inline_advise_command(body, "copilot", "Copilot user-input flow"))
            description = "Interview-first technical advice; advisor relay is unsupported by Copilot CLI."
        final_description = transform(description).strip()
        if not final_description or len(final_description) > 1024:
            raise ResourceError(f"Invalid translated Copilot command description: {command}")
        fields_out = {
            "name": entry["targetName"],
            "description": final_description,
            "argument-hint": fields.get("argument-hint", ""),
            "user-invocable": True,
            "disable-model-invocation": True,
        }
        target = output / entry["target"]
        ensure_parent(output, target)
        target.write_text(serialize_skill(fields_out, command_body(rendered_body, entry["targetName"], workflows)), encoding="utf-8", newline="\n")
        target.chmod(0o644)
        entry.update({
            "description": str(fields_out["description"]),
            "descriptionSource": source_kind,
            "argumentHint": str(fields_out["argument-hint"]),
        })
    write_json(output / "evcrate" / "command-name-map.json", output, {
        "schema": "evcrate-copilot-command-map-v1",
        "commands": sorted(command_map.values(), key=lambda item: item["source"]),
    })
    return {"commands": command_map, "normalizations": sorted(
        entry["source"] for entry in command_map.values() if entry.get("descriptionSource") == "first-prose-line"
    )}


def convert_workflows(source: Path, output: Path, transform: Callable[[str], str]) -> tuple[str, ...]:
    """Keep canonical workflows as managed Copilot support assets."""

    root = source / "workflows"
    copied: list[str] = []
    for workflow in walk_files(root):
        relative = relative_path(root, workflow)
        if relative.suffix.lower() != ".md":
            raise ResourceError(f"Canonical workflow must be Markdown: {workflow}")
        def render(value: str, relative=relative) -> str:
            if relative.as_posix() == "advisory-interview.md":
                return transform(render_advisory_interview_workflow(value, "copilot"))
            return transform(value)
        copy_file(workflow, output / "evcrate" / "workflows" / relative, output, render)
        copied.append(relative.as_posix())
    return tuple(copied)
