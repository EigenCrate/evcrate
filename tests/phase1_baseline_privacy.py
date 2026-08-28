"""Privacy and host-independence checks for Phase 1 fixtures."""

from __future__ import annotations

import re


_PATTERNS = (
    re.compile(r'(?<![A-Za-z0-9_.-])/(?:[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*)'),
    re.compile(r"(?i)\b[A-Za-z]:[\\/]"),
    re.compile(r"(?<!\\)\\\\[A-Za-z0-9_.-]+[\\/]"),
    re.compile(r"(?i)-----BEGIN[^\n]*PRIVATE KEY-----"),
    re.compile(r'(?i)["\']?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|authorization|auth|token|secret|password|cookie|credential)["\']?\s*[:=]'),
    re.compile(r"(?i)\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"(?i)\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b"),
    re.compile(r"(?i)\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    re.compile(r"(?i)\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/]+={0,2}"),
)


def assert_private(serialized: str) -> None:
    """Reject paths, credential fields, and recognizable secret values."""

    for pattern in _PATTERNS:
        if pattern.search(serialized):
            raise AssertionError(f"private or host-specific value matched: {pattern.pattern}")
