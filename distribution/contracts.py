"""Stable contracts shared by distribution command gates."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import re

from .advisor_controller import is_production_controller_artifact
from .hashing import is_ignored_artifact


ADVISORY_CAPABILITY_BLOCK_START = "<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->"
ADVISORY_CAPABILITY_BLOCK_END = "<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->"
_CANONICAL_ADVISORY_CAPABILITIES = (
    "<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n"
    "<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->"
)
_RELAY_ERRORS = {
    "antigravity": "ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY",
    "codex": "ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX",
    "copilot": "ADVISE_AGENT_RELAY_UNSUPPORTED_COPILOT",
    "gemini": "ADVISE_AGENT_RELAY_UNSUPPORTED_GEMINI",
    "omp": "ADVISE_AGENT_RELAY_UNSUPPORTED_OMP",
    "pi": "ADVISE_AGENT_RELAY_UNSUPPORTED_PI",
}
_WORKFLOW_ROOTS = {
    "codex": (".codex/workflows", "~/.codex/workflows"),
    "antigravity": (".antigravity/workflows", "~/.gemini/config/workflows"),
    "omp": (".omp/evcrate/workflows", "~/.omp/agent/evcrate/workflows"),
    "copilot": (".copilot/evcrate/workflows", "~/.copilot/evcrate/workflows"),
}
_ADVISORY_WORKFLOW_NAMES = ("advisor-mentoring.md", "advisory-interview.md")


class DistributionAction(str, Enum):
    BUILD = "build"
    CHECK = "check"
    PUBLISH = "publish"
    ALL = "all"
    RECOVER = "recover"


class DistributionError(RuntimeError):
    """Expected distribution failure with a stable command exit code."""

    exit_code = 1


class BuildError(DistributionError):
    exit_code = 2


class PublishError(DistributionError):
    exit_code = 3


def advisory_relay_error(target: str) -> str:
    """Return the stable unsupported-relay code for a generated target."""

    try:
        return _RELAY_ERRORS[target]
    except KeyError as error:
        raise ValueError(f"Unknown advisory target: {target}") from error


def add_global_workflow_fallback(text: str, target: str) -> str:
    """Make generated workflow references work for local and HOME installs."""

    try:
        local_root, home_root = _WORKFLOW_ROOTS[target]
    except KeyError as error:
        raise ValueError(f"Unknown workflow target: {target}") from error

    for workflow_name in _ADVISORY_WORKFLOW_NAMES:
        local_ref = f"`{local_root}/{workflow_name}`"
        home_ref = f"`{home_root}/{workflow_name}`"
        fallback = f"{local_ref} if present; otherwise read {home_ref} (the published install)"
        if fallback not in text:
            text = text.replace(local_ref, fallback)
    return text




_SCRIPT_RESOURCE_SUFFIXES = (
    "output-styles",
    "workflows",
    "scripts",
    "hooks",
    "skills",
    ".evcrate.json",
    ".mcp.json",
    ".env",
)
_SCRIPT_RESOURCE_ROOTS = {
    "claude": ".claude",
    "codex": ".codex",
    "gemini": ".gemini",
    "antigravity": ".antigravity",
    "omp": ".omp",
    "pi": ".pi",
    "copilot": ".copilot",
}
_CLAUDE_PATH_REFERENCE = re.compile(
    r"(?<![A-Za-z0-9_])\.claude(?=[/\\])"
)
_URI_REFERENCE = re.compile(
    r"(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|//)[^\s<>\"']+",
    re.IGNORECASE,
)


def _script_resource_path(target: str, scope: str, suffix: str) -> str:
    """Return the target path for one ordinary-script resource suffix."""

    root = _SCRIPT_RESOURCE_ROOTS[target]
    if target == "codex" and suffix == "skills":
        return ".agents/skills"
    if target == "pi":
        if suffix == "skills":
            return ".pi/agent/skills"
        if suffix in {"scripts", "hooks", "workflows", "output-styles"}:
            return f".pi/agent/evcrate/{suffix}"
        return f".pi/{suffix}"
    if target == "omp":
        global_prefix = ".omp/agent" if scope == "global" else ".omp"
        if suffix == "skills":
            return f"{global_prefix}/skills"
        if suffix in {"scripts", "hooks", "workflows", "output-styles"}:
            return f"{global_prefix}/evcrate/{suffix}"
        return f"{global_prefix}/{suffix}"
    if target == "copilot":
        if suffix == "skills":
            return ".copilot/skills"
        if suffix in {"scripts", "hooks", "workflows", "output-styles"}:
            return f".copilot/evcrate/{suffix}"
        return f".copilot/{suffix}"
    if target == "antigravity" and scope == "global":
        return f".gemini/config/{suffix}"
    return f"{root}/{suffix}"


def render_harness_script_references(text: str, target: str) -> str:
    """Translate Claude resource paths in ordinary harness script text.

    Only ordinary harness resources are projected here. The shared controller
    remains at the managed ``~/.evcrate/bin`` path for every target.
    """

    if target not in _SCRIPT_RESOURCE_ROOTS:
        raise ValueError(f"Unknown harness script target: {target}")
    protected_urls: list[tuple[str, str]] = []
    rendered = text

    def protect_url(match: re.Match[str]) -> str:
        token = f"__EVCRATE_HARNESS_URL_{len(protected_urls)}__"
        protected_urls.append((token, match.group(0)))
        return token

    rendered = _URI_REFERENCE.sub(protect_url, rendered)

    for prefix in ("~", "$HOME", "${HOME}"):
        for suffix in sorted(_SCRIPT_RESOURCE_SUFFIXES, key=len, reverse=True):
            rendered = rendered.replace(
                f"{prefix}/.claude/{suffix}",
                f"{prefix}/{_script_resource_path(target, 'global', suffix)}",
            )
        global_root = (
            ".omp/agent"
            if target == "omp"
            else (_SCRIPT_RESOURCE_ROOTS[target] if target != "antigravity" else ".gemini/config")
        )
        rendered = rendered.replace(
            f"{prefix}/.claude",
            f"{prefix}/{global_root}",
        )

    for suffix in sorted(_SCRIPT_RESOURCE_SUFFIXES, key=len, reverse=True):
        rendered = rendered.replace(
            f".claude/{suffix}",
            _script_resource_path(target, "local", suffix),
        )

    join_pattern = re.compile(
        r"path\.join\(\s*(?P<base>os\.homedir\(\)|process\.cwd\(\))\s*,\s*"
        r"(?P<quote>['\"])\.claude(?P=quote)\s*,\s*(?P=quote)(?P<suffix>"
        + "|".join(re.escape(item) for item in _SCRIPT_RESOURCE_SUFFIXES)
        + r")(?P=quote)"
    )

    def render_join(match: re.Match[str]) -> str:
        scope = "global" if match.group("base") == "os.homedir()" else "local"
        quote = match.group("quote")
        components = _script_resource_path(target, scope, match.group("suffix")).split("/")
        return (
            f"path.join({match.group('base')}"
            + "".join(f", {quote}{part}{quote}" for part in components)
        )

    rendered = join_pattern.sub(render_join, rendered)

    component_pattern = re.compile(
        r"(?P<base>home|Path\.home\(\)|os\.homedir\(\)|process\.cwd\(\)|project_root|directory|current|"
        r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)"
        r"\s*/\s*(?P<quote>['\"])\.claude(?P=quote)"
        r"\s*/\s*(?P=quote)(?P<suffix>"
        + "|".join(re.escape(item) for item in _SCRIPT_RESOURCE_SUFFIXES)
        + r")(?P=quote)"
    )

    def render_components(match: re.Match[str]) -> str:
        scope = "global" if match.group("base") in {"home", "Path.home()", "os.homedir()"} else "local"
        quote = match.group("quote")
        components = _script_resource_path(target, scope, match.group("suffix")).split("/")
        return match.group("base") + "".join(f" / {quote}{part}{quote}" for part in components)

    rendered = component_pattern.sub(render_components, rendered)
    local_root = _SCRIPT_RESOURCE_ROOTS[target]
    rendered = re.sub(
        r"(?<![A-Za-z0-9_])\.claude(?=(?:[/\\]|['\"`\)\]\}]|\s|$))",
        local_root,
        rendered,
    )
    if target in {"codex", "gemini"}:
        # Codex and Gemini keep skills in a sibling native root while their
        # harness-global env file remains under the primary runtime directory.
        # Translate parent-derived paths as well as literal `.claude` paths.
        target_root = _SCRIPT_RESOURCE_ROOTS[target]
        env_name = "." + "env"
        rendered = re.sub(
            r"(?m)^(?P<indent>\s*)claude_dir\s*=\s*skills_dir\.parent(?P<comment>\s*#.*)?$",
            lambda match: (
                f"{match.group('indent')}harness_dir = skills_dir.parent.parent / \"{target_root}\""
                f"{match.group('comment') or ''}"
            ),
            rendered,
        )
        rendered = rendered.replace("claude_dir", "harness_dir")
        rendered = re.sub(
            r"(?m)^(?P<indent>\s*)const\s+claudeDir\s*=\s*"
            r"path\.resolve\(skillsDir,\s*['\"]\.\.['\"]\);(?P<comment>.*)$",
            lambda match: (
                f"{match.group('indent')}const harnessDir = path.resolve("
                f"skillsDir, '..', '..', '{target_root}');{match.group('comment')}"
            ),
            rendered,
        )
        rendered = rendered.replace("claudeDir", "harnessDir")
        rendered = re.sub(
            r"script_dir\.parent\.parent\.parent\s*/\s*(?P<quote>['\"])(?P<env>[^'\"]+)(?P=quote)",
            lambda match: (
                "script_dir.parent.parent.parent.parent / "
                f"{match.group('quote')}{target_root}{match.group('quote')} / "
                f"{match.group('quote')}{match.group('env')}{match.group('quote')}"
                if match.group('env') == env_name
                else match.group(0)
            ),
            rendered,
        )
    for token, url in protected_urls:
        rendered = rendered.replace(token, url)
    return rendered
def validate_harness_resource_projection(
    source_root: Path,
    output_root: Path,
    target: str,
    *,
    check_resource_closure: bool = True,
) -> None:
    """Verify that generated target files do not retain central Claude paths."""

    if target not in _SCRIPT_RESOURCE_ROOTS:
        raise ValueError(f"Unknown harness script target: {target}")
    if output_root.is_symlink() or not output_root.is_dir():
        raise ValueError(f"Generated {target} output root is missing or unsafe: {output_root}")

    def production_files(root: Path) -> tuple[Path, ...]:
        if not root.exists():
            return ()
        if root.is_symlink() or not root.is_dir():
            raise ValueError(f"Canonical {target} resource root is missing or unsafe: {root}")
        files: list[Path] = []
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                raise ValueError(f"Canonical {target} resource is symlinked: {path}")
            if not path.is_file():
                continue
            relative = path.relative_to(root)
            if (
                is_ignored_artifact(relative)
                or is_production_controller_artifact(relative)
                or "advise-state" in relative.name
                or any(part in {"__tests__", "tests", "fixtures", "helpers"} for part in relative.parts)
            ):
                continue
            files.append(relative)
        return tuple(files)

    def target_resource_root(kind: str) -> Path:
        if target == "pi":
            return output_root / "agent" / "evcrate" / kind
        if target in {"omp", "copilot"}:
            return output_root / "evcrate" / kind
        return output_root / kind

    if check_resource_closure:
        for kind in ("scripts", "hooks"):
            source_dir = source_root / kind
            target_dir = target_resource_root(kind)
            for relative in production_files(source_dir):
                target_relative = relative
                if target == "gemini" and kind == "hooks" and relative.as_posix() == "session-end.cjs":
                    target_relative = Path("claude-session-end.cjs")
                destination = target_dir / target_relative
                if destination.is_symlink() or not destination.is_file():
                    raise ValueError(f"{target} resource closure is incomplete: {destination}")

        for name in (".evcrate.json", ".evcrateignore"):
            config = source_root / name
            if config.is_file() and not config.is_symlink():
                destination = output_root / name
                if destination.is_symlink() or not destination.is_file():
                    raise ValueError(f"{target} target-local config input is missing or unsafe: {destination}")

        if target in {"pi", "copilot"}:
            nested_ignore = target_resource_root("hooks").parent / ".evcrateignore"
            if nested_ignore.is_symlink() or not nested_ignore.is_file():
                raise ValueError(f"{target} hook-local ignore file is missing or unsafe: {nested_ignore}")

    for path in sorted(output_root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(output_root)
        if relative in {Path("migration-behavior-matrix.json"), Path("evcrate/migration-inventory.json")}:
            continue
        try:
            raw = path.read_bytes()
            if b"\0" in raw[:1024]:
                continue
            content = raw.decode("utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        content_without_urls = _URI_REFERENCE.sub("", content)
        if _CLAUDE_PATH_REFERENCE.search(content_without_urls):
            raise ValueError(f"{target} output retains a central Claude resource path: {relative}")
def render_advisory_capabilities(text: str, target: str) -> str:
    """Project the ordinary inline advice capability marker."""

    start_count = text.count(ADVISORY_CAPABILITY_BLOCK_START)
    end_count = text.count(ADVISORY_CAPABILITY_BLOCK_END)
    start = text.find(ADVISORY_CAPABILITY_BLOCK_START)
    end = text.find(ADVISORY_CAPABILITY_BLOCK_END)
    if start_count != 1 or end_count != 1 or start < 0 or end < start:
        raise ValueError("Malformed advisory capability markers: expected one ordered block")
    content_start = start + len(ADVISORY_CAPABILITY_BLOCK_START)
    content = text[content_start:end].strip()
    if content != _CANONICAL_ADVISORY_CAPABILITIES:
        raise ValueError("Malformed advisory capability markers: canonical capabilities were altered")
    relay_error = advisory_relay_error(target)
    rendered = "\n".join((
        ADVISORY_CAPABILITY_BLOCK_START,
        "<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->",
        f"<!-- EVCRATE_CAPABILITY: advise-agent-relay/unsupported/{target}/v1 -->",
        f"<!-- EVCRATE_CAPABILITY_ERROR: {relay_error} -->",
        ADVISORY_CAPABILITY_BLOCK_END,
    ))
    projected = text[:start] + rendered + text[end + len(ADVISORY_CAPABILITY_BLOCK_END):]
    return projected.replace(
        "advise-agent-relay/claude/v1",
        f"advise-agent-relay/unsupported/{target}/v1",
    )


def render_inline_advise_command(canonical: str, target: str, question_tool: str) -> str:
    """Render the ordinary inline interview command for a target."""

    relay_error = advisory_relay_error(target)
    projected = render_advisory_capabilities(canonical, target)
    block_start = projected.find(ADVISORY_CAPABILITY_BLOCK_START)
    block_end = projected.find(ADVISORY_CAPABILITY_BLOCK_END) + len(ADVISORY_CAPABILITY_BLOCK_END)
    capability_block = projected[block_start:block_end]
    return f'''<!-- generated target: {target} -->
{capability_block}

Use this command for candid technical or architectural advice. `/advise` is
separate from `--advice` checkpoint mentorship: it first converges on the
problem, then provides advice.

## Parse input

Count exact, case-sensitive, whitespace-delimited standalone `--agent` tokens.
Reject two or more tokens. One token requests relay only when it is final after
trailing whitespace; quoted, embedded, suffixed, non-final, and differently
cased text remains ordinary input. If a final token requests relay, return
`{relay_error}` and say: `Run /advise <prompt> without --agent for inline
advice.` Do not invoke an advisor, create relay state, or silently continue in
inline mode.

## Inline interview

Run in the main session. Do not invoke a subagent or create persistent state.

1. Analyze only bounded local context relevant to the prompt or URL.
2. Ask exactly one concise substantive question per turn using `{question_tool}`.
   Never batch questions or infer an answer. Stop after eight discovery questions.
3. Present one concise reframed problem and require explicit `confirm` or
   `correct`. Permit at most two confirmation/correction cycles. On exhaustion,
   return `INTERVIEW_NOT_CONVERGED` and write no report.
4. After confirmation, write a concise Markdown report with exactly these
   headings: `## Reframed problem`, `## Recommendation`,
   `## Alternatives/tradeoffs`, `## Risks`, `## Assumptions/evidence gaps`,
   `## Success checks`, `## Next actions`, and `## Unresolved questions`.
5. Write the sanitized report to the active `<plan>/reports` directory, or
   `plans/reports` when there is no active plan. Never include credentials,
   environment values, tool traces, fetched page bodies, or model reasoning.
'''


def render_advisory_interview_workflow(text: str, target: str) -> str:
    """Project the ordinary inline interview workflow without relay state."""

    relay_error = advisory_relay_error(target)
    projected = render_advisory_capabilities(text, target)
    projected = projected.replace(
        "The second marker is a Claude-only capability claim. Generated targets must\nreplace it with their tested capability or an explicit unsupported result;\npresence of a generated file is never runtime proof.",
        f"The second marker records this target's explicit `{relay_error}` relay rejection.\n"
        "Generated-file presence is never runtime proof.",
    )
    for source, replacement in (
        ("| `design a cache --agent` | Claude relay | `design a cache` |", f"| `design a cache --agent` | `{relay_error}` | no inline interview |"),
        ("| `design a cache --agent ` | Claude relay | `design a cache` |", f"| `design a cache --agent ` | `{relay_error}` | no inline interview |"),
        ("| `--agent` | Claude relay, empty prompt | empty; normal empty-input handling |", f"| `--agent` | `{relay_error}` | no inline interview |"),
    ):
        projected = projected.replace(source, replacement)
    projected = projected.replace(
        "Inline mode keeps the active conversation in the main session. Relay mode\npersists only the bounded, sanitized invocation state through\n`scripts/advise-state.cjs`. Both modes ask exactly one question per turn.\n\n"
        "The helper exposes the executable `parse`, `validate-envelope`, `write-report`,\nand `validate-report` operations in addition to state lifecycle operations.\nCommands must call those operations; prose is not a substitute for validation.\n\n",
        "Inline mode keeps the active conversation in the main session and asks exactly\none question per turn. No relay state is created on this target.\n\n",
    )
    relay_section = projected.find("## Relay turn envelope")
    if relay_section < 0:
        raise ValueError("Canonical advisory interview workflow is missing relay contract")
    return (
        projected[:relay_section]
        + "## Unsupported relay\n\n"
        + f"A final standalone `--agent` returns `{relay_error}` before advisor delegation, "
        + "state creation, or inline-interview work. Users can run `/advise <prompt>` for inline advice.\n"
    )


def project_advisor_contract(body: str, target: str) -> str:
    """Validate the central checkpoint contract for generated advisor agents."""

    if "## Required checkpoint method" not in body or "## Checkpoint terminal report" not in body:
        raise ValueError("Canonical advisor is missing its checkpoint contract")
    return body


@dataclass(frozen=True)
class VerifiedArtifact:
    """The only input accepted by the HOME publication gate in phase 1."""

    repository: Path
    roots: tuple[Path, ...]
