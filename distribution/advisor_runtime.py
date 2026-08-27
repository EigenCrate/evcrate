"""Canonical production advisor-runtime inventory and projection checks."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence

from .hashing import is_ignored_artifact


ADVISOR_HOSTS = ("claude", "codex", "gemini", "antigravity", "pi")
ADVISOR_ADAPTERS = ("claude", "codex", "gemini", "antigravity", "pi")
ADVISOR_RUNTIME_FILES = (
    "advisor-bridge.cjs",
    "advisor-coordinator.cjs",
    "advisor-dispatch.cjs",
    "advisor-handoff.cjs",
    "advisor-routing/adapter-contract.cjs",
    "advisor-routing/adapter-registry.cjs",
    "advisor-routing/adapters/antigravity.cjs",
    "advisor-routing/adapters/claude.cjs",
    "advisor-routing/adapters/codex.cjs",
    "advisor-routing/adapters/gemini.cjs",
    "advisor-routing/adapters/pi.cjs",
    "advisor-routing/checkpoint-contract.cjs",
    "advisor-routing/errors.cjs",
    "advisor-routing/json-document.cjs",
    "advisor-routing/native-capabilities.json",
    "advisor-routing/policy-schema.cjs",
    "advisor-routing/profile.cjs",
    "advisor-routing/resolve-route.cjs",
    "advisor-routing/runner.cjs",
)
ADVISOR_RUNTIME_OUTPUT_PATHS = {
    "claude": "scripts",
    "codex": "scripts",
    "gemini": "scripts",
    "antigravity": "scripts",
    "pi": "agent/evcrate/scripts",
}
NATIVE_CAPABILITIES_FILE = "advisor-routing/native-capabilities.json"
ADVISOR_RUNTIME_AUTHORIZATION_SOURCE = "distribution/advisor_runtime.py"
MAX_NATIVE_CAPABILITY_BYTES = 16 * 1024
FORBIDDEN_RUNTIME_PARTS = frozenset({"__tests__", "tests", "fixtures", "helpers"})
FORBIDDEN_RUNTIME_FILE_NAMES = frozenset({"test-evcrate-help.py"})
FORBIDDEN_RUNTIME_FILE_SUFFIXES = (
    ".test.cjs",
    ".test.js",
    ".test.mjs",
    ".test.py",
    ".spec.cjs",
    ".spec.js",
    ".spec.mjs",
    ".spec.py",
)


def is_production_runtime_artifact(relative: str | Path) -> bool:
    """Return whether a relative runtime path is source-only test material."""

    path = Path(relative)
    return bool(
        FORBIDDEN_RUNTIME_PARTS.intersection(path.parts)
        or path.name in FORBIDDEN_RUNTIME_FILE_NAMES
        or path.name.startswith("fake-")
        or path.name.endswith(FORBIDDEN_RUNTIME_FILE_SUFFIXES)
    )


def render_advisor_runtime_metadata(host: str, output_path: str) -> dict[str, object]:
    """Return deterministic host/path/capability metadata for a projection."""

    if host not in ADVISOR_HOSTS:
        raise ValueError(f"Unsupported advisor runtime host: {host}")
    if output_path != ADVISOR_RUNTIME_OUTPUT_PATHS[host]:
        raise ValueError(f"Unexpected advisor runtime path for {host}: {output_path}")
    return {
        "schema": "evcrate-advisor-runtime/v1",
        "active_host": host,
        "runtime_path": output_path,
        "native_capabilities": f"{output_path}/{NATIVE_CAPABILITIES_FILE}",
        "adapters": list(ADVISOR_ADAPTERS),
        "files": list(ADVISOR_RUNTIME_FILES),
        "parity": "byte-identical",
    }


def _regular_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Advisor runtime {label} is missing or unsafe: {path}")


def _validate_capabilities(path: Path) -> None:
    try:
        if path.stat().st_size > MAX_NATIVE_CAPABILITY_BYTES:
            raise ValueError("Advisor runtime capabilities exceed the 16 KiB limit")
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("Advisor runtime capabilities are not valid JSON") from error
    if not isinstance(document, dict) or set(document) != {"schema", "version", "hosts"}:
        raise ValueError("Advisor runtime capability document shape is invalid")
    if (
        document.get("schema") != "evcrate-advisor-native-capabilities/v1"
        or not isinstance(document.get("version"), int)
        or isinstance(document.get("version"), bool)
        or document.get("version") != 1
    ):
        raise ValueError("Advisor runtime capability schema is invalid")
    hosts = document.get("hosts")
    if not isinstance(hosts, dict) or set(hosts) != set(ADVISOR_HOSTS):
        raise ValueError("Advisor runtime capabilities must declare all five hosts")
    for host in ADVISOR_HOSTS:
        entry = hosts[host]
        if not isinstance(entry, dict) or set(entry) != {"backend", "model", "efforts", "selector"}:
            raise ValueError(f"Advisor runtime capability entry is invalid: {host}")
        if entry.get("backend") != host:
            raise ValueError(f"Advisor runtime capability backend is invalid: {host}")
        model = entry.get("model")
        if (
            not isinstance(model, str)
            or not model
            or model.strip() != model
            or len(model.encode("utf-8")) > 256
            or any(ord(char) < 32 or ord(char) == 127 for char in model)
        ):
            raise ValueError(f"Advisor runtime model is missing: {host}")
        selector = entry.get("selector")
        if not isinstance(selector, str) or selector not in {"model", "resolved-model"}:
            raise ValueError(f"Advisor runtime selector is missing: {host}")
        efforts = entry.get("efforts")
        if not isinstance(efforts, list) or len(efforts) > 8 or (host != "gemini" and not efforts):
            raise ValueError(f"Advisor runtime efforts are invalid: {host}")
        if any(
            not isinstance(effort, str)
            or not effort
            or effort.strip() != effort
            or len(effort.encode("utf-8")) > 64
            or any(ord(char) < 32 or ord(char) == 127 for char in effort)
            for effort in efforts
        ):
            raise ValueError(f"Advisor runtime efforts are invalid: {host}")
    if hosts["gemini"]["efforts"]:
        raise ValueError("Gemini 0.47.0 must advertise no exact effort capability")


def validate_advisor_runtime_projection(
    source_root: Path,
    output_root: Path,
    host: str,
    output_path: str,
    files: Sequence[str] = ADVISOR_RUNTIME_FILES,
) -> dict[str, object]:
    """Validate a complete, byte-identical production runtime projection."""

    metadata = render_advisor_runtime_metadata(host, output_path)
    if tuple(files) != ADVISOR_RUNTIME_FILES:
        raise ValueError("Advisor runtime inventory must use the canonical production closure")
    if source_root.is_symlink() or not source_root.is_dir() or output_root.is_symlink() or not output_root.is_dir():
        raise ValueError("Advisor runtime roots must be real directories")
    if host != "claude":
        for path in output_root.rglob("*"):
            relative = path.relative_to(output_root)
            if path.is_symlink() or is_production_runtime_artifact(relative) or is_ignored_artifact(relative):
                raise ValueError(f"Advisor runtime contains a non-production artifact: {relative}")
    for relative in files:
        parts = Path(relative).parts
        if FORBIDDEN_RUNTIME_PARTS.intersection(parts):
            raise ValueError(f"Advisor runtime contains a fixture/test path: {relative}")
        source = source_root / relative
        output = output_root / relative
        _regular_file(source, relative)
        _regular_file(output, relative)
        if source.read_bytes() != output.read_bytes():
            raise ValueError(f"Advisor runtime projection drifted: {relative}")
    _validate_capabilities(output_root / NATIVE_CAPABILITIES_FILE)
    return metadata
