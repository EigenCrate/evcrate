"""Assemble a deterministic local distribution artifact in an empty stage."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Callable

from .context import DistributionContext
from .antigravity_publish import build_antigravity_config
from .contracts import BuildError, VerifiedArtifact
from .hashing import hash_file, ignore_artifacts, source_tree_hash, tree_hash
from .manifest import adapter_hashes, TargetManifest, build_manifest_bytes, load_target_registry, source_hashes
from .overlay import apply_patch_file, copy_overlay_files
from .runtime import stage_runtime


BUILD_MANIFEST_PATH = Path(".evcrate/build-manifest.json")
SOURCE_BACKED_TARGET = ("claude", (".claude",))


def build_manifest_path(context: DistributionContext) -> Path:
    """Return the authorization manifest dedicated to this target selection."""

    if len(context.selected_target_names) == 1:
        return Path(f".evcrate/build-manifest-{context.selected_target_names[0]}.json")
    return BUILD_MANIFEST_PATH


def build_input_hashes(context: DistributionContext, manifests: tuple[TargetManifest, ...]) -> dict[str, str]:
    """Hash only inputs that authorize the selected build's outputs."""

    values = {
        ".claude": tree_hash(context.local_claude),
        "CLAUDE.md": hash_file(context.source_root / "CLAUDE.md"),
        **source_hashes(manifests),
        **adapter_hashes(manifests, context.repository),
    }
    registry = load_target_registry(context.repository / ".evcrate/targets/manifest.json")
    if set(context.selected_target_names) == set(registry.targets):
        values.update({
            ".evcrate/targets": source_tree_hash(context.repository / ".evcrate/targets"),
            "distribution/antigravity_publish.py": hash_file(context.repository / "distribution/antigravity_publish.py"),
            "distribute_hooks.py": hash_file(context.repository / "distribute_hooks.py"),
        })
    return dict(sorted(values.items()))


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


def _copy_source_root(source: Path, destination: Path) -> None:
    """Copy a source-backed root without following links before ownership checks."""

    if source.is_symlink() or not source.is_dir():
        raise BuildError(f"Source root is missing or unsafe: {source.name}")
    shutil.copytree(source, destination, symlinks=True, ignore=ignore_artifacts)


def _load_targets(context: DistributionContext, roots: dict[str, Path]) -> tuple[TargetManifest, ...]:
    manifests = context.selected_manifests
    if len({manifest.name for manifest in manifests}) != len(manifests):
        raise BuildError("Target registry contains duplicate manifest names")
    claimed_roots: set[str] = set()
    for manifest in manifests:
        source_backed = (manifest.name, manifest.output_roots) == SOURCE_BACKED_TARGET
        if manifest.adapter is None and not source_backed:
            raise BuildError(f"Target {manifest.name} has no build adapter")
        if manifest.adapter is not None and not (context.repository / manifest.adapter).is_file():
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
        if manifest.runtime is not None:
            for relative in stage_runtime(context.repository, manifest.source_root, primary, manifest.runtime):
                owners[f"{active_roots[0]}/{relative}"] = manifest.name
        for patch in manifest.patches:
            destination = context.stage / patch.destination
            if not destination.is_file() or destination.is_symlink():
                raise BuildError(f"Declared patch destination is missing or unsafe: {patch.destination}")
            patch_source = manifest.source_root / patch.source
            if patch_source.is_symlink():
                raise BuildError(f"Patch source is symlinked: {patch.source}")
            apply_patch_file(destination, patch_source, patch.keys)
            owners[patch.destination] = manifest.name

    return (
        owners,
        build_input_hashes(context, manifests),
        target_policies,
        tuple(project_docs),
    )


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
        "EVCRATE_REPOSITORY": str(context.repository),
        "EVCRATE_SOURCE_DIR": str(context.source_root),
        "CLAUDE_SOURCE_DIR": str(context.local_claude),
        "GEMINI_OUTPUT_DIR": str(roots.get(".gemini", context.stage / ".gemini")),
        "CODEX_OUTPUT_DIR": str(roots.get(".codex", context.stage / ".codex")),
        "AGENTS_OUTPUT_DIR": str(roots.get(".agents", context.stage / ".agents")),
        "PI_OUTPUT_DIR": str(roots.get(".pi", context.stage / ".pi")),
        "PI_STAGE_ROOT": str(context.stage),
        "PROJECT_DOCS_OUTPUT_DIR": str(context.stage_project_docs),
        "GEMINI_PROJECT_DOCS_OUTPUT_DIR": str(context.stage_project_docs),
    })
    for name, directory in roots.items():
        if name not in {".antigravity", ".claude"}:
            directory.mkdir(parents=True, exist_ok=True)
    context.stage_project_docs.mkdir(parents=True, exist_ok=True)
    if ".claude" in roots:
        _copy_source_root(context.local_claude, roots[".claude"])
        _baseline_owners({".claude": roots[".claude"]})
    for script in dict.fromkeys(manifest.adapter for manifest in manifests if manifest.adapter):
        run_migrator(context, script, env)
    if ".antigravity" in roots:
        build_antigravity_config(context.local_claude, roots[".antigravity"])

    owners, sources_and_adapters, policies, required_docs = _apply_targets(context, roots, manifests)
    adapter_names = set(adapter_hashes(manifests, context.repository))
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
    staged_manifest = context.stage / build_manifest_path(context)
    staged_manifest.parent.mkdir(parents=True, exist_ok=True)
    staged_manifest.write_bytes(manifest)
    return VerifiedArtifact(context.repository, tuple(roots.values()))
