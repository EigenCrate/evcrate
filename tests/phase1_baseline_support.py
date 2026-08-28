"""Shared validation helpers for the Phase 1 baseline evidence."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from distribution.advisor_runtime import render_advisor_runtime_metadata
from distribution.hashing import (
    HashingError,
    hash_file,
    is_ignored_artifact,
    normalize_relative_path,
    source_tree_hash,
    tree_hash,
)
from distribution.manifest import (
    adapter_hashes,
    advisor_runtime_hashes,
    source_hashes,
)


SHA256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")


def commit(repository: Path, supplied: str | None) -> str:
    try:
        head_result = subprocess.run(
            ["git", "-c", f"safe.directory={repository}", "rev-parse", "--verify", "HEAD^{commit}"],
            cwd=repository,
            check=True, capture_output=True, text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError("A verifiable Git baseline commit is required") from error
    head = head_result.stdout.strip()
    if not COMMIT.fullmatch(head):
        raise ValueError("Git did not return a 40-character baseline commit")
    if supplied is None:
        return head
    if not COMMIT.fullmatch(supplied):
        raise ValueError("Baseline commit must be a 40-character hexadecimal hash")
    try:
        resolved = subprocess.run(
            ["git", "-c", f"safe.directory={repository}", "rev-parse", "--verify", f"{supplied}^{{commit}}"],
            cwd=repository,
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        if resolved != supplied:
            raise ValueError("Baseline commit must name a commit object")
        subprocess.run(
            ["git", "-c", f"safe.directory={repository}", "merge-base", "--is-ancestor", supplied, head],
            cwd=repository,
            check=True, capture_output=True, text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError("Baseline commit is not a verified ancestor of repository HEAD") from error
    return supplied


def hash_map(value: Any, label: str) -> dict[str, str]:
    if not isinstance(value, dict) or not value or any(
        not isinstance(key, str) or not isinstance(digest, str) or not SHA256.fullmatch(digest)
        for key, digest in value.items()
    ):
        raise ValueError(f"{label} must be a map of SHA-256 hashes")
    return dict(value)


def expected_validation(manifests: tuple[Any, ...]) -> dict[str, Any]:
    runtime = {
        manifest.name: render_advisor_runtime_metadata(
            manifest.advisor_runtime.host, manifest.advisor_runtime.output_root
        )
        for manifest in manifests
        if manifest.advisor_runtime is not None
    }
    return {
        "complete": True,
        "symlinks": "rejected",
        "target_registry": "validated",
        "advisor_runtime": runtime,
    }


def validate_build_metadata(build_data: dict[str, Any], manifests: tuple[Any, ...]) -> None:
    expected_keys = {
        "schema_version", "source_hashes", "adapter_hashes", "owners",
        "output_hashes", "validation", "home_policy", "runtime_hashes",
    }
    if set(build_data) != expected_keys:
        raise ValueError("Build manifest metadata has unexpected fields")
    if build_data["schema_version"] != 1:
        raise ValueError("Unsupported build manifest schema")
    expected_policy = {manifest.name: dict(manifest.home_policy) for manifest in manifests}
    if build_data["home_policy"] != expected_policy:
        raise ValueError("Build home policy does not match target manifests")
    if build_data["validation"] != expected_validation(manifests):
        raise ValueError("Build validation metadata is not canonical")
    owners = build_data["owners"]
    if not isinstance(owners, dict) or not owners:
        raise ValueError("Build manifest owners must be a non-empty object")
    allowed_owners = {"baseline", *(manifest.name for manifest in manifests)}
    for relative, owner in owners.items():
        if not isinstance(relative, str) or not isinstance(owner, str) or owner not in allowed_owners:
            raise ValueError("Build manifest owners contain an invalid entry")
        try:
            if normalize_relative_path(relative) != relative:
                raise ValueError("Build manifest owner path is not normalized")
        except HashingError as error:
            raise ValueError("Build manifest owner path is unsafe") from error


def authorized_hashes(
    repository: Path,
    source_root: Path,
    manifests: tuple[Any, ...],
    registry: Any,
    build_data: dict[str, Any],
) -> dict[str, str]:
    validate_build_metadata(build_data, manifests)
    sources = hash_map(build_data.get("source_hashes"), "source_hashes")
    expected_adapters = dict(sorted(adapter_hashes(manifests, repository).items()))
    expected_sources = {
        ".claude": tree_hash(source_root / ".claude"),
        "CLAUDE.md": hash_file(source_root / "CLAUDE.md"),
        **source_hashes(manifests),
        ".evcrate/targets": source_tree_hash(repository / ".evcrate/targets"),
    }
    if sources != dict(sorted(expected_sources.items())):
        raise ValueError("Build source authorization hashes do not match the repository")
    adapters = hash_map(build_data.get("adapter_hashes"), "adapter_hashes")
    if adapters != expected_adapters:
        raise ValueError("Build adapter authorization hashes do not match the repository")
    runtime = hash_map(build_data.get("runtime_hashes"), "runtime_hashes")
    if runtime != advisor_runtime_hashes(manifests, repository):
        raise ValueError("Build runtime authorization hashes do not match the repository")
    if set(registry.targets) != {manifest.name for manifest in manifests}:
        raise ValueError("Target registry names do not match manifest names")
    outputs = hash_map(build_data.get("output_hashes"), "output_hashes")
    expected_outputs = {
        root for manifest in manifests for root in manifest.output_roots
    }
    expected_outputs.update(
        document for manifest in manifests for document in manifest.project_docs
    )
    if set(outputs) != expected_outputs:
        raise ValueError("Build output authorization is incomplete or unexpected")
    return outputs


def files(root: Path) -> list[str]:
    if not root.is_dir() or root.is_symlink():
        raise ValueError(f"Generated root is missing or unsafe: {root}")
    values: list[str] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root)
        if is_ignored_artifact(relative):
            continue
        if path.is_symlink():
            raise ValueError(f"Generated output contains a symlink: {relative}")
        if path.is_file():
            values.append(relative.as_posix())
    return values


def output(root: Path, expected_hash: str) -> dict[str, Any]:
    values = files(root)
    digest = tree_hash(root)
    if not isinstance(expected_hash, str) or not SHA256.fullmatch(expected_hash) or digest != expected_hash:
        raise ValueError(f"Output hash drift for {root.name}: {digest} != {expected_hash}")
    return {"tree_hash": digest, "file_count": len(values), "files": values}
