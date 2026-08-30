"""Prompt text, path, and frontmatter rendering for Copilot resources."""

from __future__ import annotations

import json
import re
from typing import Mapping

from distribution.contracts import render_harness_script_references


_URI = re.compile(r"(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|//)[^\s<>\"']+", re.IGNORECASE)


def _protect_urls(value: str) -> tuple[str, list[tuple[str, str]]]:
    protected: list[tuple[str, str]] = []

    def replace(match: re.Match[str]) -> str:
        original = match.group(0)
        if original.casefold().startswith("claude:") and not original.casefold().startswith("claude://"):
            return original
        token = f"__EVCRATE_COPILOT_URI_{len(protected)}__"
        protected.append((token, original))
        return token

    return _URI.sub(replace, value), protected


def _restore_urls(value: str, protected: list[tuple[str, str]]) -> str:
    for token, original in protected:
        value = value.replace(token, original)
    return value


def replace_command_paths(value: str, command_map: Mapping[str, Mapping[str, str]]) -> str:
    rendered, protected = _protect_urls(value)
    for item in sorted(command_map.values(), key=lambda entry: len(entry["source"]), reverse=True):
        source = item["source"]
        target = item["target"]
        for prefix, replacement in (
            ("${HOME}/", "${HOME}/.copilot/"),
            ("$HOME/", "$HOME/.copilot/"),
            ("~/", "~/.copilot/"),
            ("./", "./.copilot/"),
            ("", ".copilot/"),
        ):
            rendered = rendered.replace(
                f"{prefix}.claude/commands/{source}",
                f"{replacement}{target}",
            )
    return _restore_urls(rendered, protected)


def render_command_references(value: str, command_map: Mapping[str, Mapping[str, str]]) -> str:
    """Rewrite mapped slash commands while protecting URI path segments."""

    rendered = replace_command_paths(value, command_map)
    rendered, protected = _protect_urls(rendered)
    for item in sorted(command_map.values(), key=lambda entry: len(entry["sourceName"]), reverse=True):
        source_name = item["sourceName"]
        target_name = item["targetName"]
        for form in (source_name, source_name.replace(":", "/")):
            pattern = re.compile(
                rf"(?<![A-Za-z0-9_/:])/(?:evcrate:)?{re.escape(form)}(?![A-Za-z0-9_-])",
                re.IGNORECASE,
            )
            rendered = pattern.sub(f"/{target_name}", rendered)
    return _restore_urls(rendered, protected)


def replace_known_names(value: str, agents: Mapping[str, str], skills: Mapping[str, str]) -> str:
    rendered, protected = _protect_urls(value)
    for source, target in sorted({**agents, **skills}.items(), key=lambda pair: len(pair[0]), reverse=True):
        rendered = re.sub(rf"(?<![A-Za-z0-9_-])`{re.escape(source)}`", f"`{target}`", rendered)
        rendered = re.sub(rf"(?<![A-Za-z0-9_-]){re.escape(source)}(?=\s+agent\b)", target, rendered, flags=re.IGNORECASE)
        rendered = re.sub(
            rf"(subagent_type\s*=\s*[\"']){re.escape(source)}([\"'])",
            rf"\g<1>{target}\g<2>", rendered, flags=re.IGNORECASE,
        )
        rendered = re.sub(
            rf"(skills?/){re.escape(source)}(?=[/\s`)]|$)", rf"\1{target}", rendered, flags=re.IGNORECASE,
        )
    return _restore_urls(rendered, protected)


def translate_prompt(
    value: str,
    command_map: Mapping[str, Mapping[str, str]],
    *,
    agent_map: Mapping[str, str] | None = None,
    skill_map: Mapping[str, str] | None = None,
) -> str:
    """Translate product wording, paths, commands, agents, and skills."""

    rendered = render_command_references(value, command_map)
    rendered = render_harness_script_references(rendered, "copilot")
    rendered = replace_known_names(rendered, agent_map or {}, skill_map or {})
    rendered, protected = _protect_urls(rendered)
    for pattern, replacement in (
        (r"\bClaude Code CLI\b", "GitHub Copilot CLI"),
        (r"\bclaude\.ai/code\b", "GitHub Copilot CLI"),
        (r"\bCLAUDE_PROJECT_DIR\b", "COPILOT_PROJECT_DIR"),
        (r"\bCLAUDE_ENV_FILE\b", "COPILOT_ENV_FILE"),
        (r"\bEVCRATE_CLAUDE_SETTINGS_DIR\b", "EVCRATE_COPILOT_SETTINGS_DIR"),
        (r"\bCLAUDE_PLUGIN_ROOT\b", "COPILOT_PLUGIN_ROOT"),
        (r"\bCLAUDE\.md\b", "copilot-instructions.md"),
        (r"\bClaude Code\b", "GitHub Copilot CLI"),
        (r"\bclaude-code\b", "copilot-cli"),
        (r"\bAnthropic\b", "GitHub"),
        (r"\bSkill tool\b", "Copilot skill"),
        (r"\bTask tool\b", "agent tool"),
        (r"\bAskUserQuestion tool\b", "user-input tool"),
        (r"\bAskUserQuestion\b", "user input"),
        (r"\bSlashCommands\b", "Copilot slash commands"),
        (r"\bSlashCommand\b", "Copilot slash command"),
        (r"\bclaude\b", "copilot"),
    ):
        rendered = re.sub(pattern, replacement, rendered)
    rendered = rendered.replace("Claude", "Copilot")
    return _restore_urls(rendered, protected)


def first_prose_line(body: str) -> str:
    for line in body.splitlines():
        candidate = line.strip()
        if not candidate or candidate.startswith(("#", "```", "<!--")):
            continue
        return re.sub(r"\s+", " ", candidate)[:1024]
    return "EVCrate Copilot command"


def yaml_field(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return json.dumps(str(value), ensure_ascii=False)


def serialize_skill(fields: Mapping[str, object], body: str) -> str:
    lines = ["---"]
    for key in ("name", "description", "argument-hint", "user-invocable", "disable-model-invocation"):
        if key in fields:
            lines.append(f"{key}: {yaml_field(fields[key])}")
    lines.extend(["---", "", body.rstrip("\n"), ""])
    return "\n".join(lines)


def command_body(body: str, target_name: str, workflows: tuple[str, ...]) -> str:
    assets = "\n".join(f"- `@evcrate/workflows/{name}`" for name in workflows)
    return (
        "## Invocation contract\n\n"
        f"The literal `$ARGUMENTS` is the exact raw text following `/{target_name}`. "
        "Do not split, normalize, or discard it before the canonical command parses it.\n\n"
        "Before executing this command, read these EVCrate workflow assets:\n"
        f"{assets}\n\n{body.lstrip()}"
    )
