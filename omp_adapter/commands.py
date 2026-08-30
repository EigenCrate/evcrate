"""Flatten and translate canonical Claude command prompts for OMP."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable

from distribution.contracts import render_advisory_interview_workflow, render_harness_script_references, render_inline_advise_command
from pi_adapter.frontmatter import FrontmatterError, serialize_frontmatter, split_frontmatter

from .resources import ResourceError, copy_file, ensure_parent, relative_path, walk_files, write_json


_COMMAND_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
_OMP_WORKFLOW_REFERENCE = re.compile(
    r"`(?P<path>(?:\./)?\.omp/evcrate/workflows/(?P<name>[A-Za-z0-9_*.-]+))`"
)

_URI_REFERENCE = re.compile(
    r"(?<![A-Za-z0-9_./:])(?:[A-Za-z][A-Za-z0-9+.-]*:|//)[^\s<>\"']+",
    re.IGNORECASE,
)
_OMP_NO_SKILLS_GUIDANCE = (
    "**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery "
    "and loading. When that flag is active, do not claim automatic skill activation: "
    "read each required migrated `SKILL.md` directly with the read tool from "
    "`./.omp/skills/<skill-name>/SKILL.md`, falling back to "
    "`~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, "
    "consult `./.omp/evcrate/skill-map.json` or "
    "`~/.omp/agent/evcrate/skill-map.json`, then read the archived package under "
    "`./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` "
    "path), then follow the instructions. Without `--no-skills`, use OMP's normal "
    "skill discovery."
)
_SKILL_ACTIVATION_MARKERS = (
    "activate the skills",
    "activate needed skills",
    "activate only needed skills",
    "activate only the skills",
    "activate from catalog",
    "skills catalog",
    "list of skills",
    "skill tool",
)


def _replace_command_file_references(value: str, command_map: dict[str, dict[str, str]]) -> str:
    """Rewrite canonical command-file paths to OMP's flattened layout."""

    protected: list[str] = []

    def protect(match: re.Match[str]) -> str:
        token = f"__OMP_COMMAND_FILE_URI_{len(protected)}__"
        protected.append(match.group(0))
        return token

    rendered = _URI_REFERENCE.sub(protect, value)
    for item in sorted(command_map.values(), key=lambda entry: len(entry["source"]), reverse=True):
        source = item["source"]
        target = item["target"]
        for prefix, replacement in (
            ("${HOME}/", "${HOME}/.omp/agent/"),
            ("$HOME/", "$HOME/.omp/agent/"),
            ("~/", "~/.omp/agent/"),
            ("./", "./.omp/"),
            ("", ".omp/"),
        ):
            rendered = rendered.replace(
                f"{prefix}.claude/commands/{source}",
                f"{replacement}commands/{target}",
            )
    for index, original in enumerate(protected):
        rendered = rendered.replace(f"__OMP_COMMAND_FILE_URI_{index}__", original)
    return rendered


def _add_omp_skill_runtime_guidance(value: str) -> str:
    """Explain how migrated skills remain usable when discovery is disabled."""

    lowered = value.casefold()
    if "omp skill loading (runtime)" in lowered:
        return value
    if not any(marker in lowered for marker in _SKILL_ACTIVATION_MARKERS):
        return value
    return f"{value.rstrip()}\n\n{_OMP_NO_SKILLS_GUIDANCE}\n"


def _add_omp_global_workflow_fallback(value: str) -> str:
    """Make workflow references work for project and HOME-loaded commands."""

    def replace(match: re.Match[str]) -> str:
        if value[match.end():].startswith(" if present; otherwise read"):
            return match.group(0)
        local = match.group("path")
        home = f"~/.omp/agent/evcrate/workflows/{match.group('name')}"
        return f"`{local}` if present; otherwise read `{home}`"

    return _OMP_WORKFLOW_REFERENCE.sub(replace, value)


def build_command_map(source: Path) -> dict[str, dict[str, str]]:
    """Return a deterministic source-command to OMP-command mapping."""

    commands_root = source / "commands"
    files = walk_files(commands_root)
    mapping: dict[str, dict[str, str]] = {}
    target_names: dict[str, str] = {}
    for command in files:
        relative = relative_path(commands_root, command)
        if relative.suffix.lower() != ".md":
            raise ResourceError(f"Canonical command must be Markdown: {command}")
        parts = relative.with_suffix("").parts
        source_name = ":".join(parts)
        target_name = f"cmd-{'__'.join(parts)}"
        if not _COMMAND_NAME.fullmatch(target_name):
            raise ResourceError(f"Canonical command has an unsafe OMP name: {relative}")
        folded = target_name.casefold()
        prior = target_names.get(folded)
        if prior is not None:
            raise ResourceError(f"Command names collide after OMP flattening: {prior} and {relative}")
        target_names[folded] = relative.as_posix()
        mapping[source_name.casefold()] = {
            "source": relative.as_posix(),
            "sourceName": source_name,
            "target": f"{target_name}.md",
            "targetName": target_name,
        }
    return dict(sorted(mapping.items()))


def _replace_command_references(value: str, command_map: dict[str, dict[str, str]]) -> str:
    """Rewrite known Claude colon commands while leaving URLs and prose intact."""

    protected: list[str] = []

    def protect(match: re.Match[str]) -> str:
        token = f"__OMP_COMMAND_URI_{len(protected)}__"
        protected.append(match.group(0))
        return token

    rendered = _URI_REFERENCE.sub(protect, value)
    for item in sorted(command_map.values(), key=lambda entry: len(entry["sourceName"]), reverse=True):
        source_name = item["sourceName"]
        target_name = item["targetName"]
        for command_prefix in ("", "evcrate:"):
            pattern = re.compile(
                rf"(?<![A-Za-z0-9_/:])/{command_prefix}{re.escape(source_name)}(?![A-Za-z0-9_-])",
                flags=re.IGNORECASE,
            )
            rendered = pattern.sub(f"/{target_name}", rendered)
    for index, original in enumerate(protected):
        rendered = rendered.replace(f"__OMP_COMMAND_URI_{index}__", original)
    return rendered


def render_command_references(value: str, command_map: dict[str, dict[str, str]]) -> str:
    """Rewrite mapped command paths and slash invocations in one pass."""

    rendered = _replace_command_file_references(value, command_map)
    return _replace_command_references(rendered, command_map)


def translate_prompt(value: str, command_map: dict[str, dict[str, str]]) -> str:
    """Translate OMP resource paths, command names, and Claude-only tool prose."""

    rendered = render_command_references(value, command_map)
    rendered = render_harness_script_references(rendered, "omp")
    rendered = _add_omp_global_workflow_fallback(rendered)
    rendered = _add_omp_skill_runtime_guidance(rendered)
    rendered = rendered.replace("Skill tool", "OMP command mechanism")
    rendered = rendered.replace("Task tool", "task tool")
    rendered = rendered.replace("AskUserQuestion", "ask the user")
    rendered = rendered.replace("SlashCommand", "OMP command")
    return rendered


def _command_frontmatter(source_path: Path, command_map: dict[str, dict[str, str]]) -> tuple[dict[str, str], str]:
    source = source_path.read_text(encoding="utf-8")
    if source.startswith("---\n"):
        try:
            parsed = split_frontmatter(source, source_path)
        except FrontmatterError:
            raise
        fields = dict(parsed.fields)
        body = parsed.body
    else:
        fields = {}
        body = source
    if isinstance(fields.get("name"), str):
        fields["name"] = render_command_references(fields["name"], command_map)
    transformed_body = translate_prompt(body, command_map)
    if source_path.name == "advise.md" and source_path.parent.name == "commands":
        fields["description"] = "Interview-first technical advice; advisor relay is unsupported by OMP."
        fields["argument-hint"] = "[prompt-or-url]"
        transformed_body = render_inline_advise_command(
            body,
            "omp",
            "native user-input flow",
        )
        transformed_body = translate_prompt(transformed_body, command_map)
    return fields, transformed_body


def convert_commands(
    source: Path,
    output: Path,
    *,
    transform: Callable[[str, dict[str, dict[str, str]]], str] | None = None,
) -> dict[str, dict[str, str]]:
    """Flatten every canonical command into OMP's direct command directory."""

    commands_root = source / "commands"
    destination = output / "commands"
    command_map = build_command_map(source)
    for command in walk_files(commands_root):
        relative = relative_path(commands_root, command)
        item = command_map[":".join(relative.with_suffix("").parts).casefold()]
        fields, body = _command_frontmatter(command, command_map)
        if transform is not None:
            body = transform(body, command_map)
        generated = serialize_frontmatter(fields, body) if fields else body.lstrip()
        target = destination / item["target"]
        ensure_parent(output, target)
        target.write_bytes(generated.encode("utf-8"))
        target.chmod(0o644)
    write_json(output / "evcrate" / "command-name-map.json", output, {
        "schema": "evcrate-omp-command-map-v1",
        "commands": list(command_map.values()),
    })
    return command_map


def convert_workflows(source: Path, output: Path, command_map: dict[str, dict[str, str]]) -> tuple[str, ...]:
    """Retain workflows as managed OMP assets; OMP has no workflow loader."""

    workflows_root = source / "workflows"
    destination = output / "evcrate" / "workflows"
    copied: list[str] = []
    for workflow in walk_files(workflows_root):
        relative = relative_path(workflows_root, workflow)
        if relative.suffix.lower() != ".md":
            raise ResourceError(f"Canonical workflow must be Markdown: {workflow}")
        def transform(value: str, workflow=workflow) -> str:
            rendered = translate_prompt(value, command_map)
            relative_name = relative_path(workflows_root, workflow).as_posix()
            if relative_name == "advisory-interview.md":
                rendered = render_advisory_interview_workflow(rendered, "omp")
                rendered = render_command_references(rendered, command_map)
            return rendered
        copy_file(workflow, destination / relative, output, transform)
        copied.append(relative.as_posix())
    return tuple(copied)
