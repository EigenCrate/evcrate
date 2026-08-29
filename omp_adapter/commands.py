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
        target_name = "__".join(parts)
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
        token = f"__OMP_COMMAND_URL_{len(protected)}__"
        protected.append(match.group(0))
        return token

    rendered = re.sub(r"https?://[^\s<>\"']+", protect, value, flags=re.IGNORECASE)
    for item in sorted(command_map.values(), key=lambda entry: len(entry["sourceName"]), reverse=True):
        source_name = item["sourceName"]
        target_name = item["targetName"]
        pattern = re.compile(
            rf"(?<![A-Za-z0-9_/:])/{re.escape(source_name)}(?![A-Za-z0-9_-])",
            flags=re.IGNORECASE,
        )
        rendered = pattern.sub(f"/{target_name}", rendered)
    for index, original in enumerate(protected):
        rendered = rendered.replace(f"__OMP_COMMAND_URL_{index}__", original)
    return rendered
def _render_omp_advisor_command(value: str) -> str:
    """Replace executable relay instructions with OMP-native advisor dispatch."""

    if "advisor-bridge.cjs" not in value:
        return value
    start = value.find("When explicit advice mode is active")
    end = value.find("## Workflow:", start)
    if start < 0 or end < 0:
        raise ResourceError("OMP command contains an unsupported advisor bridge without a known contract")
    replacement = (
        "When explicit advice mode is active, the advice gate is an executable step, not\n"
        "a writing exercise. After the required terminal review or test evidence exists\n"
        "and before displaying advisor findings, dispatch exactly one blocking native OMP\n"
        "`advisor` subagent with the bounded checkpoint request from the workflow. Do not\n"
        "invoke an executable bridge, external adapter, or fallback route. If a caller\n"
        "requests advisor relay with `--agent`, return\n"
        "`ADVISE_AGENT_RELAY_UNSUPPORTED_OMP` and leave the gate incomplete.\n\n"
    )
    rendered = value[:start] + replacement + value[end:]
    if "advisor-bridge.cjs" in rendered:
        raise ResourceError("OMP command retained an unsupported advisor bridge reference")
    return rendered


def _render_omp_advisor_workflow(value: str) -> str:
    """Keep the mentoring contract while selecting OMP's native advisor path."""

    if "advisor-bridge.cjs" not in value:
        return value
    start = value.find("### Executable harness bridge")
    end = value.find("### Resolve once and choose one branch", start)
    if start < 0 or end < 0:
        raise ResourceError("OMP workflow contains an unsupported advisor bridge without a known contract")
    replacement = (
        "### OMP native dispatch\n\n"
        "OMP has no executable advisor bridge or cross-harness relay adapter. For a\n"
        "named checkpoint, dispatch exactly one blocking native `advisor` subagent\n"
        "through OMP's task mechanism with the bounded checkpoint request, then wait\n"
        "for its terminal structured result. The advisor is read-only, non-binding,\n"
        "and non-recursive. A final standalone `--agent` relay request returns\n"
        "`ADVISE_AGENT_RELAY_UNSUPPORTED_OMP` before delegation or state creation.\n\n"
    )
    rendered = value[:start] + replacement + value[end:]
    external_start = rendered.find("- **External descriptor:**")
    external_end = rendered.find("\n\nBefore either child action", external_start)
    if external_start < 0 or external_end < 0:
        raise ResourceError("OMP workflow is missing its external advisor branch")
    rendered = (
        rendered[:external_start]
        + "- **External descriptor:** unsupported on OMP. Return "
        "`ADVISE_AGENT_RELAY_UNSUPPORTED_OMP` and do not invoke an external adapter."
        + rendered[external_end:]
    )
    rendered = rendered.replace(
        "The `codex` value in the dispatcher-level example above is illustrative; it is\n"
        "not a value to copy into another harness. The executable bridge below binds the\n"
        "actual host from its installed directory.",
        "The `codex` value in the dispatcher-level example above is illustrative; it is\n"
        "not a value to copy into OMP. The native dispatch section below selects OMP's\n"
        "ordinary blocking `advisor` subagent.",
    )
    rendered = rendered.replace(
        "The external adapter must return a legacy `{ \"response\": \"...\" }` result or a\n"
        "complete `evcrate-advisor-result/v1` object. The dispatcher rejects malformed\n"
        "results and adds the original checkpoint to legacy results before returning.",
        "The native OMP advisor must return a complete `evcrate-advisor-result/v1` object.\n"
        "OMP rejects malformed results and preserves the original checkpoint.",
    )
    rendered = rendered.replace(
        "The dispatcher owns validated route selection and the single\n"
        "adapter exception.",
        "OMP owns validated native advisor dispatch and the single blocking result.",
    )
    rendered = rendered.replace("Claude-only interview relay", "unsupported OMP interview relay")
    if "advisor-bridge.cjs" in rendered:
        raise ResourceError("OMP workflow retained an unsupported advisor bridge reference")
    return rendered


def translate_prompt(value: str, command_map: dict[str, dict[str, str]]) -> str:
    """Translate OMP resource paths, command names, and Claude-only tool prose."""

    rendered = render_harness_script_references(value, "omp")
    rendered = _replace_command_references(rendered, command_map)
    rendered = _add_omp_global_workflow_fallback(rendered)
    rendered = rendered.replace("Skill tool", "skill command")
    rendered = rendered.replace("Task tool", "task tool")
    rendered = rendered.replace("AskUserQuestion", "ask the user")
    rendered = rendered.replace("SlashCommand", "OMP command")
    rendered = rendered.replace(
        "require its\nexecutable local bridge for the eventual named checkpoint.",
        "dispatch exactly one blocking native OMP `advisor` subagent for the eventual\nnamed checkpoint.",
    )
    rendered = rendered.replace(
        "terminal `ADVICE_READY` result from the local\nbridge.",
        "terminal structured result from the native OMP `advisor` subagent.",
    )
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
    transformed_body = _render_omp_advisor_command(transformed_body)
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
            elif relative_name == "advisor-mentoring.md":
                rendered = _render_omp_advisor_workflow(rendered)
            return rendered
        copy_file(workflow, destination / relative, output, transform)
        copied.append(relative.as_posix())
    return tuple(copied)
