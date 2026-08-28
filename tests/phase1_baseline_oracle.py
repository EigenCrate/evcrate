"""Independent source and inventory oracles for the Phase 1 baseline."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

from distribution.hashing import hash_file, source_tree_hash, tree_hash
from distribution.manifest import (
    adapter_hashes,
    advisor_runtime_hashes,
    load_target_manifest,
    load_target_registry,
    source_hashes,
)


def authoritative_targets(repository: Path) -> tuple[dict, Any, tuple[Any, ...]]:
    registry_path = repository / ".evcrate/targets/manifest.json"
    registry_data = json.loads(registry_path.read_text(encoding="utf-8"))
    registry = load_target_registry(registry_path)
    manifests = tuple(load_target_manifest(path) for path in registry.targets.values())
    return registry_data, registry, manifests


def source_authorization(repository: Path) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    _, _, manifests = authoritative_targets(repository)
    source_root = repository / ".evcrate/source"
    adapters = dict(sorted(adapter_hashes(manifests, repository).items()))
    sources = {
        ".claude": tree_hash(source_root / ".claude"),
        "CLAUDE.md": hash_file(source_root / "CLAUDE.md"),
        **source_hashes(manifests),
        ".evcrate/targets": source_tree_hash(repository / ".evcrate/targets"),
    }
    return dict(sorted(sources.items())), adapters, advisor_runtime_hashes(manifests, repository)


def safe_relative(value: str) -> bool:
    windows = PureWindowsPath(value)
    return bool(value) and "\\" not in value and not PurePosixPath(value).is_absolute() and not windows.is_absolute() and not windows.drive and all(part not in {"", ".", ".."} for part in value.split("/"))


def file_list_hash(files: list[str]) -> str:
    return hashlib.sha256("\n".join(files).encode()).hexdigest()
