"""Build-manifest verification isolated from HOME mutation logic."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .context import DistributionContext
from .contracts import PublishError, VerifiedArtifact
from .hashing import hash_file, tree_hash
from .manifest import adapter_hashes, load_target_manifest, load_target_registry, source_hashes
from .staging import BUILD_MANIFEST_PATH


def _load_build_manifest(context: DistributionContext) -> dict[str, Any]:
    path = context.repository / BUILD_MANIFEST_PATH
    if not path.is_file() or path.is_symlink():
        raise PublishError("Missing or unsafe build manifest; run --build first")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PublishError(f"Could not read build manifest: {error}") from error
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise PublishError("Build manifest has an unsupported schema")
    if manifest.get("validation", {}).get("complete") is not True:
        raise PublishError("Build manifest does not authorize publication")
    return manifest


def _current_source_hashes(context: DistributionContext) -> dict[str, str]:
    registry = load_target_registry(context.repository / ".evcrate/targets/manifest.json")
    manifests = tuple(load_target_manifest(path) for path in registry.targets.values())
    values = {
        ".claude": tree_hash(context.local_claude),
        "CLAUDE.md": hash_file(context.source_root / "CLAUDE.md"),
        ".evcrate/targets": tree_hash(context.repository / ".evcrate/targets"),
        "distribution/antigravity_publish.py": hash_file(context.repository / "distribution/antigravity_publish.py"),
        "distribute_hooks.py": hash_file(context.repository / "distribute_hooks.py"),
    }
    values.update(source_hashes(manifests))
    values.update(adapter_hashes(manifests, context.repository))
    return dict(sorted(values.items()))


def _expected_output_names(context: DistributionContext) -> set[str]:
    registry = load_target_registry(context.repository / ".evcrate/targets/manifest.json")
    manifests = tuple(load_target_manifest(path) for path in registry.targets.values())
    names = {root.name for root in context.local_roots}
    names.update(document for manifest in manifests for document in manifest.project_docs)
    return names


def verify_local_artifact(context: DistributionContext, artifact: VerifiedArtifact) -> dict[str, Any]:
    """Verify source and output hashes without executing a generator."""

    legacy = [path for path in context.legacy_local_paths if path.exists() or path.is_symlink()]
    if legacy:
        names = ", ".join(path.name for path in legacy)
        raise PublishError(f"Legacy project-local agent paths must be moved under .evcrate/source: {names}")
    if artifact.repository != context.repository or artifact.roots != context.local_roots:
        raise PublishError("Artifact reference does not belong to this repository")
    manifest = _load_build_manifest(context)
    expected_sources = _current_source_hashes(context)
    actual_sources = {**manifest.get("source_hashes", {}), **manifest.get("adapter_hashes", {})}
    if actual_sources != expected_sources:
        raise PublishError("Build manifest is stale; run --build before publishing")
    output_hashes = manifest.get("output_hashes")
    if not isinstance(output_hashes, dict):
        raise PublishError("Build manifest has no output hashes")
    if set(output_hashes) != _expected_output_names(context):
        raise PublishError("Build manifest output hashes do not match current artifacts")
    for relative, expected in output_hashes.items():
        path = context.local_path(relative)
        if not path.exists() or path.is_symlink():
            raise PublishError(f"Build artifact is missing or unsafe: {relative}")
        actual = tree_hash(path) if path.is_dir() else hash_file(path)
        if actual != expected:
            raise PublishError(f"Build artifact hash mismatch: {relative}")
    return manifest
