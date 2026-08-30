"""Deterministic canonical-resource inventory and Pi projection helpers."""

from __future__ import annotations

import json
import os
import re
import stat
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Callable, Collection

from distribution.contracts import (
    render_harness_script_references,
    render_advisory_interview_workflow,
    render_inline_advise_command,
)
from distribution.advisor_controller import is_production_controller_artifact
from distribution.hashing import is_ignored_artifact
from .frontmatter import FrontmatterError, normalize_lf, split_frontmatter, validate_skill_frontmatter


class ResourceError(ValueError):
    """Raised when a canonical resource cannot safely enter the Pi artifact."""


@dataclass(frozen=True)
class ResourceInventory:
    commands: tuple[str, ...]
    workflows: tuple[str, ...]
    agents: tuple[str, ...]
    skills: tuple[str, ...]
    scripts: tuple[str, ...]
    hooks: tuple[str, ...]


LEGACY_SKILL = Path("claude-code/skill.md")
_PATH_TRANSLATIONS = (
    (re.compile(r"(?<![~A-Za-z0-9_./-])(?:\./)?\.claude/workflows/([^\s)`\]\"']+)"), r"{{evcrate:workflows/\1}}"),
    (re.compile(r"(?<![~A-Za-z0-9_./-])(?:\./)?\.claude/scripts/([^\s)`\]\"']+)"), r"{{evcrate:scripts/\1}}"),
    (re.compile(r"(?<![~A-Za-z0-9_./-])(?:\./)?\.claude/hooks/([^\s)`\]\"']+)"), r"{{evcrate:hooks/\1}}"),
)
# These are project-local paths that can appear in portable command, agent,
# and skill prose. Pi's generated resources live below its own agent tree, so
# retaining a literal ``.claude`` path would send the user back to the
# canonical source tree instead of the installed target.
_PI_LOCAL_PATH_TRANSLATIONS = (
    (".claude/commands", ".pi/agent/evcrate/commands"),
    (".claude/agents", ".pi/agent/agents"),
    (".claude/skills", ".pi/agent/skills"),
    (".claude/workflows", ".pi/agent/evcrate/workflows"),
    (".claude/scripts", ".pi/agent/evcrate/scripts"),
    (".claude/hooks", ".pi/agent/evcrate/hooks"),
    (".claude/output-styles", ".pi/agent/evcrate/output-styles"),
    (".claude/.evcrate.json", ".pi/.evcrate.json"),
    (".claude/.mcp.json", ".pi/.mcp.json"),
    (".claude/.env", ".pi/.env"),
)
_TOOL_TRANSLATIONS = (
    (re.compile(r"\bAskUserQuestion\b"), "ask_user_question"),
    (re.compile(r"\bTask\b"), "evcrate_subagent"),
    (re.compile(r"\bWebSearch\b|\bWebFetch\b"), "web research"),
    (re.compile(r"\bSkill tool\b"), "Pi skill"),
)
_COMMAND_NAME = r"[a-z0-9][a-z0-9:_-]*"
_QUOTED_COMMAND_REFERENCE = re.compile(
    rf"`/(?P<name>{_COMMAND_NAME})(?P<args>[^`\n]*)`", re.IGNORECASE
)
_BARE_COMMAND_REFERENCE = re.compile(
    rf"(?<![\w/:<])/(?P<name>{_COMMAND_NAME})(?![a-z0-9:_-]|\*)", re.IGNORECASE
)
_DIRECTIVE_VERB = re.compile(r"\b(?:trigger|invoke|execute|run|dispatch|call)\b", re.IGNORECASE)
_SLASH_COMMAND_PHRASE = re.compile(r"\bslash\s*[- ]?commands?\b", re.IGNORECASE)
_USE_DIRECTIVE = re.compile(r"\buse\b", re.IGNORECASE)
_NON_DIRECTIVE_COMMAND_PROSE = re.compile(
    r"\b(?:command\s*[- ]?path|discover(?:y|ing)?|available|examples?)\b", re.IGNORECASE
)
_FENCE = re.compile(r"^\s*(?:`{3,}|~{3,})")
_URL = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)


def _command_names(commands: Collection[str]) -> frozenset[str]:
    return frozenset(command.replace("/", ":").lower() for command in commands)


def _markdown_link_reference(value: str, position: int) -> bool:
    opening = value.rfind("[", 0, position)
    return opening >= 0 and value.find("]", opening) >= position


def _translate_directive_line(line: str, commands: frozenset[str]) -> str:
    if not commands or _NON_DIRECTIVE_COMMAND_PROSE.search(line):
        return line
    if not (_DIRECTIVE_VERB.search(line) or (_USE_DIRECTIVE.search(line) and _SLASH_COMMAND_PHRASE.search(line))):
        return line

    def quoted(command: re.Match[str]) -> str:
        name = command["name"].lower()
        if name not in commands or _markdown_link_reference(line, command.start()):
            return command[0]
        return f"{{{{evcrate:commands/{name}}}}}{command['args']}"

    translated = _QUOTED_COMMAND_REFERENCE.sub(quoted, line)

    def bare(command: re.Match[str]) -> str:
        name = command["name"].lower()
        if name not in commands or _markdown_link_reference(translated, command.start()):
            return command[0]
        if command.start() and translated[command.start() - 1] in "[(":
            return command[0]
        return f"{{{{evcrate:commands/{name}}}}}"

    return _BARE_COMMAND_REFERENCE.sub(bare, translated)


def _translate_nested_commands(value: str, commands: Collection[str]) -> str:
    """Mark known model-directed slash directives, preserving literal prose."""

    known_commands = _command_names(commands)
    fenced = False
    translated: list[str] = []
    for line in value.splitlines(keepends=True):
        if _FENCE.match(line):
            fenced = not fenced
        translated.append(line if fenced else _translate_directive_line(line, known_commands))
    return "".join(translated)


def _relative(root: Path, path: Path) -> Path:
    try:
        return path.relative_to(root)
    except ValueError as error:
        raise ResourceError(f"Source escaped canonical root: {path}") from error


def _walk_files(root: Path) -> list[Path]:
    """Return regular files in stable order, rejecting every unsafe entry."""

    if root.is_symlink() or not root.is_dir():
        raise ResourceError(f"Missing or unsafe resource directory: {root}")
    files: list[Path] = []
    for current, directories, filenames in os.walk(root, followlinks=False):
        directory = Path(current)
        directories[:] = sorted(
            name for name in directories
            if not is_ignored_artifact(Path(current).relative_to(root) / name)
        )
        filenames[:] = sorted(
            name for name in filenames
            if not is_ignored_artifact(Path(current).relative_to(root) / name)
        )
        for name in directories + filenames:
            candidate = directory / name
            if candidate.is_symlink():
                raise ResourceError(f"Symlinked canonical resource is forbidden: {candidate}")
        for name in filenames:
            candidate = directory / name
            if not candidate.is_file():
                raise ResourceError(f"Unsupported canonical resource type: {candidate}")
            files.append(candidate)
    return files


def _markdown_inventory(root: Path) -> tuple[str, ...]:
    files = _walk_files(root)
    paths = [str(_relative(root, item).with_suffix("")) for item in files if item.suffix == ".md"]
    if len(paths) != len(set(paths)):
        raise ResourceError(f"Duplicate logical resource name below {root}")
    return tuple(sorted(paths))


def inventory(source: Path) -> ResourceInventory:
    """Inventory the canonical source tree and validate source frontmatter."""

    commands = _markdown_inventory(source / "commands")
    workflows = _markdown_inventory(source / "workflows")
    agents = _markdown_inventory(source / "agents")
    if len(agents) != len(set(agents)):
        raise ResourceError("Duplicate logical agent name")

    skills = [str(package) for package in _skill_packages(source / "skills")]

    scripts = tuple(
        str(_relative(source / "scripts", item))
        for item in _walk_files(source / "scripts")
        if not is_production_controller_artifact(_relative(source / "scripts", item))
    )
    hooks = tuple(
        str(_relative(source / "hooks", item))
        for item in _walk_files(source / "hooks")
        if not any(part in {"__tests__", "tests", "fixtures", "helpers"}
                   for part in _relative(source / "hooks", item).parts)
    )
    return ResourceInventory(commands, workflows, agents, tuple(sorted(skills)), scripts, hooks)


def translate_prompt(value: str, commands: Collection[str] = ()) -> str:
    """Translate only named compatibility tokens, never broad product prose."""

    translated = normalize_lf(value)
    protected_urls: list[tuple[str, str]] = []

    def protect_url(match: re.Match[str]) -> str:
        token = f"__PI_URL_{len(protected_urls)}__"
        protected_urls.append((token, match[0]))
        return token

    translated = _URL.sub(protect_url, translated)
    for pattern, replacement in _PATH_TRANSLATIONS:
        translated = pattern.sub(replacement, translated)
    for prefix in ("$HOME", "${HOME}", "~"):
        for separator in ("/", "\\"):
            for suffix in ("scripts", "hooks", "workflows", "output-styles", ".env", ".mcp.json"):
                target_suffix = (
                    f".pi/{suffix}"
                    if suffix in {".env", ".mcp.json"}
                    else f".pi/agent/evcrate/{suffix}"
                )
                translated = translated.replace(
                    f"{prefix}{separator}.claude{separator}{suffix}",
                    f"{prefix}{separator}{target_suffix.replace('/', separator)}",
                )

    def translate_global_components(match: re.Match[str]) -> str:
        base = match.group("base")
        quote = match.group("quote")
        suffix = match.group("suffix")
        if suffix == "skills":
            parts = (".pi", "agent", "skills")
        elif suffix in {"scripts", "hooks", "workflows", "output-styles"}:
            parts = (".pi", "agent", "evcrate", suffix)
        else:
            parts = (".pi", suffix)
        return base + "".join(f" / {quote}{part}{quote}" for part in parts)

    translated = re.sub(
        r"(?P<base>home|Path\.home\(\)|os\.homedir\(\))"
        r"\s*/\s*(?P<quote>['\"])\.claude(?P=quote)"
        r"\s*/\s*(?P=quote)(?P<suffix>skills|scripts|hooks|workflows|output-styles|\.env|\.evcrate\.json|\.mcp\.json)(?P=quote)",
        translate_global_components,
        translated,
    )
    # Both project and global skill references live below Pi's agent root.
    # Handle global prefixes before the project form.
    for prefix in ("$HOME", "${HOME}", "~"):
        translated = translated.replace(
            f"{prefix}/.claude/skills", f"{prefix}/.pi/agent/skills"
        )
    translated = translated.replace(".claude/skills", ".pi/agent/skills")
    translated = translated.replace(".claude/.evcrate.json", ".pi/.evcrate.json")
    translated = translated.replace(".claude/.mcp.json", ".pi/.mcp.json")
    translated = translated.replace(".claude/.env", ".pi/.env")
    # Rewrite direct project paths that are not one of the command markers
    # above (for example ``./.claude/commands/scout.md`` in agent guidance).
    # Rewrite direct project paths while preserving Windows separators.
    for source, replacement in _PI_LOCAL_PATH_TRANSLATIONS:
        translated = translated.replace(source, replacement)
        translated = translated.replace(
            source.replace("/", "\\"), replacement.replace("/", "\\")
        )
    translated = re.sub(
        r"(?<![A-Za-z0-9_])\.claude(?=(?:[/\\]|['\"`\)\]\}]|\s|$))",
        ".pi",
        translated,
    )
    translated = _translate_nested_commands(translated, commands)
    for pattern, replacement in _TOOL_TRANSLATIONS:
        translated = pattern.sub(replacement, translated)
    for token, url in protected_urls:
        translated = translated.replace(token, url)
    return translated


def _translate_pi_skill(value: str) -> str:
    """Translate skill text and preserve Pi's project-level environment root."""

    component_pattern = re.compile(
        r"(?P<base>[A-Za-z_][A-Za-z0-9_.]*)\s*/\s*"
        r"(?P<quote>['\"])\.claude(?P=quote)\s*/\s*"
        r"(?P=quote)(?P<suffix>skills|scripts|hooks|workflows|output-styles|\.env|\.evcrate\.json|\.mcp\.json)(?P=quote)"
    )

    def render_components(match: re.Match[str]) -> str:
        suffix = match["suffix"]
        if suffix == "skills":
            components = (".pi", "agent", "skills")
        elif suffix in {"scripts", "hooks", "workflows", "output-styles"}:
            components = (".pi", "agent", "evcrate", suffix)
        else:
            components = (".pi", suffix)
        quote = match["quote"]
        return match["base"] + "".join(f" / {quote}{part}{quote}" for part in components)

    translated = component_pattern.sub(render_components, value)
    translated = translate_prompt(translated)
    # These two skills derive the harness root from their emitted package
    # depth. Pi puts packages below ``.pi/agent/skills`` while project-level
    # configuration remains in ``.pi``.
    translated = translated.replace(
        "path.resolve(skillsDir, '..')",
        "path.resolve(skillsDir, '../..')",
    ).replace(
        'path.resolve(skillsDir, "..")',
        'path.resolve(skillsDir, "../..")',
    )
    translated = translated.replace(
        'script_dir.parent.parent.parent / ".env"',
        'script_dir.parent.parent.parent.parent / ".env"',
    ).replace(
        "script_dir.parent.parent.parent / '.env'",
        "script_dir.parent.parent.parent.parent / '.env'",
    )
    # The canonical skill scripts derive the global config directory as the
    # parent of ``.claude/skills``. Pi inserts an additional ``agent`` level,
    # so the equivalent ``.pi`` directory is one parent farther away.
    translated = translated.replace(
        "claude_dir = skills_dir.parent",
        "claude_dir = skills_dir.parent.parent",
    )
    return translated


def _contained(root: Path, destination: Path) -> None:
    try:
        destination.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise ResourceError(f"Output escaped Pi artifact: {destination}") from error


def _ensure_parent(output: Path, destination: Path) -> None:
    _contained(output, destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    current = destination.parent
    while current != output:
        current.chmod(0o755)
        current = current.parent
    output.chmod(0o755)


def _copy_file(source: Path, destination: Path, output: Path, transform: Callable[[str], str] | None = None) -> None:
    _ensure_parent(output, destination)
    if transform is None:
        destination.write_bytes(source.read_bytes())
    else:
        raw = source.read_bytes()
        if b"\0" in raw[:1024]:
            # A transformed tree can still contain binary skill assets (for
            # example fonts and images). Preserve those bytes exactly.
            destination.write_bytes(raw)
        else:
            try:
                value = normalize_lf(raw.decode("utf-8"))
            except UnicodeDecodeError:
                destination.write_bytes(raw)
            else:
                destination.write_text(transform(value), encoding="utf-8", newline="\n")
    destination.chmod(stat.S_IMODE(source.stat().st_mode))


def copy_tree(source: Path, destination: Path, output: Path, transform: Callable[[str], str] | None = None) -> None:
    """Copy a validated tree with stable contents and executable modes."""

    for item in _walk_files(source):
        relative = _relative(source, item)
        _copy_file(item, destination / relative, output, transform)


def copy_markdown(source: Path, destination: Path, output: Path, commands: Collection[str] = ()) -> None:
    def transform(item: Path, value: str) -> str:
        relative = _relative(source, item)
        if relative.as_posix() == "advise.md" and source.name == "commands":
            return (
                "---\n"
                "description: Interview-first technical advice with native inline questioning and explicit relay rejection\n"
                "argument-hint: [prompt-or-url] [--agent]\n"
                "---\n\n"
                + render_inline_advise_command(value, "pi", "ask_user_question")
            )
        if relative.as_posix() == "advisory-interview.md" and source.name == "workflows":
            value = render_advisory_interview_workflow(value, "pi")
        return translate_prompt(value, commands)

    for item in _walk_files(source):
        if item.suffix == ".md":
            _copy_file(
                item,
                destination / _relative(source, item),
                output,
                lambda value, item=item: transform(item, value),
            )


def copy_commands_and_workflows(source: Path, output: Path, commands: Collection[str]) -> None:
    """Copy commands and workflows using the canonical command inventory."""

    root = output / "agent" / "evcrate"
    copy_markdown(source / "commands", root / "commands", output, commands)
    copy_markdown(source / "workflows", root / "workflows", output, commands)


def _skill_packages(source_root: Path) -> tuple[Path, ...]:
    """Return validated package roots; unrelated files beside packages are not skills."""

    packages: list[Path] = []
    for item in _walk_files(source_root):
        relative = _relative(source_root, item)
        if relative == LEGACY_SKILL:
            continue
        if item.name == "SKILL.md":
            validate_skill_frontmatter(item.read_text(encoding="utf-8"), item)
            packages.append(relative.parent)
    if len(packages) != len(set(packages)):
        raise ResourceError("Duplicate logical Pi skill name")
    return tuple(sorted(packages))


def _in_skill_package(relative: Path, packages: Collection[Path]) -> bool:
    return any(relative.parts[:len(package.parts)] == package.parts for package in packages)


def copy_skills(source: Path, output: Path) -> None:
    """Copy files belonging to validated uppercase SKILL.md packages only."""

    source_root = source / "skills"
    destination = output / "agent" / "skills"
    packages = _skill_packages(source_root)
    for item in _walk_files(source_root):
        relative = _relative(source_root, item)
        if _in_skill_package(relative, packages):
            _copy_file(
                item,
                destination / relative,
                output,
                lambda value: _translate_pi_skill(value),
            )


def copy_hooks_and_scripts(source: Path, output: Path) -> None:
    """Copy complete canonical closures; scout needs a colocated ignore file."""

    root = output / "agent" / "evcrate"
    for item in _walk_files(source / "hooks"):
        relative = _relative(source / "hooks", item)
        if any(part in {"__tests__", "tests", "fixtures", "helpers"} for part in relative.parts):
            continue
        _copy_file(
            item,
            root / "hooks" / relative,
            output,
            lambda value: render_harness_script_references(value, "pi"),
        )
    scripts = source / "scripts"
    for item in _walk_files(scripts):
        relative = _relative(scripts, item)
        if "advise-state" not in item.name and not is_production_controller_artifact(relative):
            _copy_file(
                item,
                root / "scripts" / relative,
                output,
                lambda value: render_harness_script_references(value, "pi"),
            )
    _copy_file(source / ".evcrateignore", root / ".evcrateignore", output)
    write_json(root / "hook-map.json", output, hook_map(source))


def write_json(destination: Path, output: Path, value: object) -> None:
    _ensure_parent(output, destination)
    destination.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    destination.chmod(0o644)


def _hook_relative_path(root: Path, value: str) -> str:
    candidate = PurePosixPath(value.replace("\\", "/"))
    if candidate.is_absolute() or not candidate.parts or any(part in {".", ".."} for part in candidate.parts):
        raise ResourceError(f"Unsafe canonical hook path: {value}")
    target = root.joinpath(*candidate.parts)
    try:
        target.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise ResourceError(f"Canonical hook path escaped root: {value}") from error
    if target.is_symlink() or not target.is_file():
        raise ResourceError(f"Missing or unsafe canonical hook path: {value}")
    return candidate.as_posix()


def hook_map(source: Path) -> dict[str, object]:
    """Derive native hook entries from canonical settings instead of a fixed list."""

    settings_path = source / "settings.json"
    if settings_path.is_symlink() or not settings_path.is_file():
        raise ResourceError(f"Missing or unsafe canonical hook settings: {settings_path}")
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
        hooks = settings["hooks"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise ResourceError(f"Invalid canonical hook settings: {settings_path}") from error
    if not isinstance(hooks, dict):
        raise ResourceError("Canonical hook settings must be an object")

    events: dict[str, list[dict[str, object]]] = {}
    command_pattern = re.compile(r"\.claude/hooks/([^\"'\s]+)")
    for event in sorted(hooks):
        entries = hooks[event]
        if not isinstance(entries, list):
            raise ResourceError(f"Hook event must be a list: {event}")
        mapped: list[dict[str, object]] = []
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("hooks"), list):
                raise ResourceError(f"Invalid hook entry for {event}")
            scripts: list[str] = []
            for handler in entry["hooks"]:
                command = handler.get("command") if isinstance(handler, dict) else None
                match = command_pattern.search(command or "")
                if not match:
                    raise ResourceError(f"Unsupported canonical hook command for {event}")
                scripts.append(_hook_relative_path(source / "hooks", match.group(1)))
            # Preserve canonical handler order: hook order can be semantically meaningful.
            safety_scripts = [
                script for script in scripts
                if Path(script).name in {"scout-block.cjs", "privacy-block.cjs"}
            ]
            mapped.append({
                "matcher": entry.get("matcher", "*"),
                "scripts": scripts,
                "safetyScripts": safety_scripts,
            })
        events[event] = mapped
    return {"schema": "evcrate-pi-hook-map-v1", "events": events}


def write_inventory(destination: Path, output: Path, resources: ResourceInventory) -> None:
    """Write auditable source/output logical inventories in deterministic order."""

    generated_scripts = tuple(item for item in resources.scripts if "advise-state" not in Path(item).name)
    inventory = {
        "agents": list(resources.agents),
        "advisoryCapabilities": {
            "checkpoint": "supported",
            "inline": "supported",
            "relay": "unsupported",
            "relayError": "ADVISE_AGENT_RELAY_UNSUPPORTED_PI",
        },
        "commands": list(resources.commands),
        "hooks": list(resources.hooks),
        "legacySkillExcluded": str(LEGACY_SKILL),
        "scripts": list(generated_scripts),
        "skills": list(resources.skills),
        "workflows": list(resources.workflows),
    }
    write_json(destination, output, inventory)
