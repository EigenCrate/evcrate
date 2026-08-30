"""Canonical inventory and validation for the shared advisor controller."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Sequence

from .hashing import hash_file, is_ignored_artifact


ADVISOR_CONTROLLER_ROOT = Path(".evcrate/source/.evcrate/bin")
ADVISOR_CONTROLLER_FILES = (
    "evcrate-advisor",
    "lib/advisor/adapter-contract.cjs",
    "lib/advisor/adapter-registry.cjs",
    "lib/advisor/adapters/claude.cjs",
    "lib/advisor/adapters/codex.cjs",
    "lib/advisor/adapters/omp.cjs",
    "lib/advisor/adapters/omp-parser.cjs",
    "lib/advisor/adapters/pi.cjs",
    "lib/advisor/checkpoint-contract.cjs",
    "lib/advisor/controller-envelope.cjs",
    "lib/advisor/controller.cjs",
    "lib/advisor/errors.cjs",
    "lib/advisor/isolated-workspace.cjs",
    "lib/advisor/json-document.cjs",
    "lib/advisor/policy-schema.cjs",
    "lib/advisor/profile.cjs",
    "lib/advisor/runner.cjs",
)
ADVISOR_CONTROLLER_AUTHORIZATION_SOURCE = "distribution/advisor_controller.py"
FORBIDDEN_CONTROLLER_PARTS = frozenset({"__tests__", "tests", "fixtures", "helpers"})
FORBIDDEN_CONTROLLER_SUFFIXES = (".test.cjs", ".test.js", ".test.mjs", ".test.py", ".spec.cjs", ".spec.js")
NODE_BUILTINS = frozenset({
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto",
    "dgram", "diagnostics_channel", "dns", "dns/promises", "domain", "events", "fs", "fs/promises",
    "http", "http2", "https", "inspector", "module", "net", "os", "path", "path/posix", "path/win32",
    "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl", "stream",
    "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "timers",
    "timers/promises", "tls", "trace_events", "tty", "url", "util", "util/types", "v8", "vm", "wasi",
    "worker_threads", "zlib"
})
REQUIRE_CALL = re.compile(r"(?<![\w$.])require\s*\(", re.MULTILINE)
LITERAL_REQUIRE = re.compile(r"""(?<![\w$.])require\s*\(\s*(['"])([^'"]+)\1\s*\)""", re.MULTILINE)


def is_production_controller_artifact(relative: str | Path) -> bool:
    path = Path(relative)
    return bool(
        FORBIDDEN_CONTROLLER_PARTS.intersection(path.parts)
        or path.name.startswith("fake-")
        or path.name.endswith(FORBIDDEN_CONTROLLER_SUFFIXES)
    )


def _validate_import_closure(source_root: Path, files: Sequence[str]) -> None:
    allowed = set(files)
    root = source_root.resolve()
    for relative in files:
        path = root / relative
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise ValueError(f"Advisor controller import source is unreadable: {relative}") from error
        literal_imports = {match.start(): match for match in LITERAL_REQUIRE.finditer(source)}
        for call in REQUIRE_CALL.finditer(source):
            match = literal_imports.get(call.start())
            if match is None:
                raise ValueError(f"Advisor controller import must be a literal require: {relative}")
            specifier = match.group(2)
            module = specifier[5:] if specifier.startswith("node:") else specifier
            if not module.startswith("."):
                if module not in NODE_BUILTINS:
                    raise ValueError(f"Advisor controller imports an unauthorized module: {specifier}")
                continue
            candidate = Path(os.path.normpath(str(path.parent / specifier)))
            try:
                imported = candidate.relative_to(root).as_posix()
            except ValueError as error:
                raise ValueError(f"Advisor controller import escapes its closure: {specifier}") from error
            if imported not in allowed:
                raise ValueError(f"Advisor controller imports a file outside its closure: {specifier}")


def _regular_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Advisor controller {label} is missing or unsafe: {path}")


def _validate_root(root: Path, allowed: set[str] | None = None) -> None:
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"Advisor controller root is missing or unsafe: {root}")
    allowed_directories: set[str] | None = None
    if allowed is not None:
        allowed_directories = set()
        for name in allowed:
            parent = Path(name).parent
            while parent != Path("."):
                allowed_directories.add(parent.as_posix())
                parent = parent.parent
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        name = relative.as_posix()
        if path.is_symlink():
            raise ValueError(f"Advisor controller contains a symlink: {relative}")
        if path.is_dir():
            if allowed_directories is not None and name not in allowed_directories:
                raise ValueError(f"Advisor controller contains an unexpected directory: {relative}")
            continue
        if not path.is_file():
            raise ValueError(f"Advisor controller contains a non-regular entry: {relative}")
        if (
            (allowed is not None and name not in allowed)
            or is_production_controller_artifact(relative)
            or is_ignored_artifact(relative)
        ):
            raise ValueError(f"Advisor controller contains a non-production artifact: {relative}")


def validate_advisor_controller_source(source_root: Path, files: Sequence[str] = ADVISOR_CONTROLLER_FILES) -> None:
    if tuple(files) != ADVISOR_CONTROLLER_FILES:
        raise ValueError("Advisor controller inventory must use the canonical closure")
    _validate_root(source_root, set(files))
    for relative in files:
        _regular_file(source_root / relative, relative)
    _validate_import_closure(source_root, files)
    entrypoint = source_root / "evcrate-advisor"
    if entrypoint.read_text(encoding="utf-8").splitlines()[0] != "#!/usr/bin/env node":
        raise ValueError("Advisor controller entrypoint has an invalid shebang")
    if not os.access(entrypoint, os.X_OK):
        raise ValueError("Advisor controller entrypoint must be executable")


def controller_hashes(source_root: Path, files: Sequence[str] = ADVISOR_CONTROLLER_FILES) -> dict[str, str]:
    validate_advisor_controller_source(source_root, files)
    return {relative: hash_file(source_root / relative) for relative in files}


def render_advisor_controller_metadata() -> dict[str, object]:
    return {
        "schema": "evcrate-advisor-controller/v1",
        "root": ".evcrate/bin",
        "entrypoint": "evcrate-advisor",
        "files": list(ADVISOR_CONTROLLER_FILES),
        "parity": "byte-identical",
    }


def validate_advisor_controller_projection(
    source_root: Path,
    output_root: Path,
    files: Sequence[str] = ADVISOR_CONTROLLER_FILES,
) -> dict[str, object]:
    validate_advisor_controller_source(source_root, files)
    _validate_root(output_root, set(files))
    for relative in files:
        source, output = source_root / relative, output_root / relative
        _regular_file(output, relative)
        if source.read_bytes() != output.read_bytes():
            raise ValueError(f"Advisor controller projection drifted: {relative}")
    return render_advisor_controller_metadata()
