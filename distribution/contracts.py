"""Stable contracts shared by distribution command gates."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


ADVISORY_CAPABILITY_BLOCK_START = "<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->"
ADVISORY_CAPABILITY_BLOCK_END = "<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->"
_CANONICAL_ADVISORY_CAPABILITIES = (
    "<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n"
    "<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->"
)
_RELAY_ERRORS = {
    "antigravity": "ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY",
    "codex": "ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX",
    "gemini": "ADVISE_AGENT_RELAY_UNSUPPORTED_GEMINI",
    "pi": "ADVISE_AGENT_RELAY_UNSUPPORTED_PI",
}
_WORKFLOW_ROOTS = {
    "codex": (".codex/workflows", "~/.codex/workflows"),
    "antigravity": (".antigravity/workflows", "~/.gemini/config/workflows"),
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


def render_advisory_capabilities(text: str, target: str) -> str:
    """Replace one canonical advisory marker block with a target-specific block.

    Source markers are deliberately strict build inputs: a missing, duplicated,
    reversed, or locally edited block fails generation before a target can claim
    a capability it has not implemented.
    """

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
    """Render an inline command only after validating its canonical capability block."""

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
    """Project shared inline interview rules while removing unsupported relay state."""

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
    """Keep generated advisors checkpoint-only when their relay is unsupported."""

    entry = body.find("## Entry modes")
    boundaries = body.find("## Boundaries")
    terminal = body.find("## Checkpoint terminal report")
    if entry < 0 or boundaries < entry or terminal < boundaries:
        raise ValueError("Canonical advisor is missing its relay/checkpoint contract boundaries")
    prefix = body[:entry]
    prefix = prefix.replace(
        "for one fresh named checkpoint under explicit `--advice`, or\none terminal turn of the explicit `interview-relay/v1` contract.",
        "for one fresh named checkpoint under explicit `--advice`.",
    )
    boundaries_body = body[boundaries:terminal]
    terminal_body = body[terminal:]
    relay_error = advisory_relay_error(target)
    terminal_body = terminal_body.replace(
        "This section applies only to `checkpoint/v1`. The relay path returns the exact\nJSON envelope above and never this Markdown report.",
        "This section applies to `checkpoint/v1`. Interview relay is unsupported on this target.",
    )
    return (
        prefix
        + "## Entry mode\n\n"
        + "The caller must use `checkpoint/v1` and supply terminal evidence for one fresh named checkpoint. "
        + f"`interview-relay/v1` is unsupported here; `/advise --agent` returns `{relay_error}`.\n\n"
        + "## Required checkpoint method\n\n"
        + "1. Activate `advisor-strategy` and follow its one-shot checkpoint brief.\n"
        + "2. Give one precise recommendation from bounded evidence and relevant prior counsel.\n"
        + "3. Return a complete terminal report before the caller continues.\n\n"
        + boundaries_body
        + terminal_body
    )


@dataclass(frozen=True)
class VerifiedArtifact:
    """The only input accepted by the HOME publication gate in phase 1."""

    repository: Path
    roots: tuple[Path, ...]
