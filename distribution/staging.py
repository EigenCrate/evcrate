"""Assemble a deterministic local distribution artifact in an empty stage."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

from .context import DistributionContext
from .antigravity_publish import build_antigravity_config
from .contracts import BuildError, VerifiedArtifact
from .hashing import hash_file, tree_hash
from .manifest import TargetManifest, build_manifest_bytes, load_target_manifest, load_target_registry, source_hashes
from .overlay import apply_patch_file, copy_overlay_files


BUILD_MANIFEST_PATH = Path(".devkit/build-manifest.json")


def _stage_roots(context: DistributionContext) -> dict[str, Path]:
    return {root.name: context.stage / root.name for root in context.local_roots if context.stage is not None}


def _baseline_owners(roots: dict[str, Path]) -> dict[str, str]:
    owners: dict[str, str] = {}
    for root_name, root in roots.items():
        if not root.is_dir() or root.is_symlink():
            raise BuildError(f"Generated root is missing or unsafe: {root_name}")
        for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
            if path.is_symlink():
                raise BuildError(f"Generated symlink is not allowed: {root_name}/{path.relative_to(root)}")
            if path.is_file():
                owners[f"{root_name}/{path.relative_to(root).as_posix()}"] = "baseline"
    return owners


def _load_targets(context: DistributionContext, roots: dict[str, Path]) -> tuple[TargetManifest, ...]:
    registry = load_target_registry(context.repository / ".devkit/targets/manifest.json")
    manifests = tuple(load_target_manifest(path) for path in registry.targets.values())
    if len({manifest.name for manifest in manifests}) != len(manifests):
        raise BuildError("Target registry contains duplicate manifest names")
    claimed_roots: set[str] = set()
    for manifest in manifests:
        if manifest.adapter is None:
            raise BuildError(f"Target {manifest.name} has no build adapter")
        if not (context.repository / manifest.adapter).is_file():
            raise BuildError(f"Target {manifest.name} adapter is missing: {manifest.adapter}")
        if not set(manifest.output_roots).issubset(roots):
            raise BuildError(f"Target {manifest.name} declares an unsupported output root")
        if claimed_roots.intersection(manifest.output_roots):
            raise BuildError("Each staged output root must have one target owner")
        claimed_roots.update(manifest.output_roots)
    if claimed_roots != set(roots):
        raise BuildError("Target registry does not completely own staged output roots")
    return manifests


def _apply_targets(
    context: DistributionContext,
    roots: dict[str, Path],
    manifests: tuple[TargetManifest, ...],
) -> tuple[dict[str, str], dict[str, str], dict[str, object], tuple[str, ...]]:

    owners = _baseline_owners(roots)
    target_policies: dict[str, object] = {}
    project_docs: list[str] = []
    for manifest in manifests:
        target_policies[manifest.name] = dict(manifest.home_policy)
        project_docs.extend(manifest.project_docs)
        active_roots = [root for root in manifest.output_roots if root in roots]
        primary = roots[active_roots[0]]
        if manifest.overlay_root is not None and manifest.overlay_root.exists():
            local_owners = {
                key.removeprefix(f"{active_roots[0]}/"): owner
                for key, owner in owners.items()
                if key.startswith(f"{active_roots[0]}/")
            }
            copy_overlay_files(
                manifest.overlay_root,
                primary,
                manifest.name,
                local_owners,
                manifest.owned_paths,
            )
            for relative, owner in local_owners.items():
                owners[f"{active_roots[0]}/{relative}"] = owner
        for patch in manifest.patches:
            destination = context.stage / patch.destination
            if not destination.is_file() or destination.is_symlink():
                raise BuildError(f"Declared patch destination is missing or unsafe: {patch.destination}")
            patch_source = manifest.source_root / patch.source
            if patch_source.is_symlink():
                raise BuildError(f"Patch source is symlinked: {patch.source}")
            apply_patch_file(destination, patch_source, patch.keys)
            owners[patch.destination] = manifest.name

    baseline_sources = {
        ".claude": tree_hash(context.repository / ".claude"),
        "CLAUDE.md": hash_file(context.repository / "CLAUDE.md"),
        ".devkit/targets": tree_hash(context.repository / ".devkit/targets"),
        "distribution/antigravity_publish.py": hash_file(context.repository / "distribution/antigravity_publish.py"),
        "distribute_hooks.py": hash_file(context.repository / "distribute_hooks.py"),
    }
    adapters = {manifest.adapter: hash_file(context.repository / manifest.adapter) for manifest in manifests if manifest.adapter}
    return owners, {**baseline_sources, **source_hashes(manifests), **adapters}, target_policies, tuple(project_docs)


def generate_stage(
    context: DistributionContext,
    run_migrator: Callable[[DistributionContext, str, dict[str, str]], None],
) -> VerifiedArtifact:
    """Run baseline adapters, apply declared targets, then write build-manifest."""

    if context.stage is None:
        raise BuildError("Local generation requires a staging directory")
    roots = _stage_roots(context)
    manifests = _load_targets(context, roots)
    env = os.environ.copy()
    env.update({
        "GEMINI_OUTPUT_DIR": str(roots[".gemini"]),
        "CODEX_OUTPUT_DIR": str(roots[".codex"]),
        "AGENTS_OUTPUT_DIR": str(roots[".agents"]),
        "PROJECT_DOCS_OUTPUT_DIR": str(context.stage_project_docs),
        "GEMINI_PROJECT_DOCS_OUTPUT_DIR": str(context.stage_project_docs),
    })
    for directory in (*(root for name, root in roots.items() if name != ".antigravity"), context.stage_project_docs):
        directory.mkdir(parents=True, exist_ok=True)
    for script in dict.fromkeys(manifest.adapter for manifest in manifests if manifest.adapter):
        run_migrator(context, script, env)
    build_antigravity_config(context.repository / ".claude", roots[".antigravity"])

    owners, sources_and_adapters, policies, required_docs = _apply_targets(context, roots, manifests)
    adapter_names = {manifest.adapter for manifest in manifests if manifest.adapter}
    source_values = {key: value for key, value in sources_and_adapters.items() if key not in adapter_names}
    adapter_values = {key: value for key, value in sources_and_adapters.items() if key in adapter_names}
    outputs = dict(roots)
    for document in required_docs:
        document_path = context.stage_project_docs / document
        if not document_path.is_file() or document_path.is_symlink():
            raise BuildError(f"Required generated project document is missing or unsafe: {document}")
        owners[document] = "baseline"
        outputs[document] = document_path
    manifest = build_manifest_bytes(
        source_hashes=source_values,
        adapter_hashes=adapter_values,
        owners=owners,
        output_roots=outputs,
        home_policy=policies,
        validation={"complete": True, "symlinks": "rejected", "target_registry": "validated"},
    )
    staged_manifest = context.stage / BUILD_MANIFEST_PATH
    staged_manifest.parent.mkdir(parents=True, exist_ok=True)
    staged_manifest.write_bytes(manifest)
    return VerifiedArtifact(context.repository, tuple(roots.values()))
