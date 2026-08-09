"""Build, check, and HOME publication gates."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from .build import promote_transaction, repository_lock, staged_build_root
from .context import DistributionContext, create_context
from .contracts import BuildError, DistributionAction, PublishError, VerifiedArtifact
from .hashing import is_ignored_artifact
from .staging import BUILD_MANIFEST_PATH, generate_stage


GENERATED_DOCS = ("AGENTS.md", "GEMINI.md")


def _assert_legacy_root_clean(context: DistributionContext) -> None:
    legacy = [path for path in context.legacy_local_paths if path.exists() or path.is_symlink()]
    if legacy:
        names = ", ".join(path.name for path in legacy)
        raise BuildError(f"Legacy project-local agent paths must be moved under .evcrate/source: {names}")


def _run_migrator(context: DistributionContext, script_name: str, env: dict[str, str]) -> None:
    script = context.repository / script_name
    if not script.is_file():
        raise BuildError(f"Required migrator is missing: {script_name}")
    try:
        subprocess.run(
            [sys.executable, str(script)],
            cwd=context.repository,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        # Do not echo arbitrary child output; it can contain credentials.
        raise BuildError(f"{script_name} failed with exit code {error.returncode}") from error
    except OSError as error:
        raise BuildError(f"Could not execute {script_name}: {error}") from error


def _stage_context(action: DistributionAction, stage: Path) -> DistributionContext:
    return create_context(action, stage=stage)


def _generate_stage(context: DistributionContext) -> VerifiedArtifact:
    return generate_stage(context, _run_migrator)


def _tree_differences(source: Path, target: Path, relative: str) -> list[str]:
    """Return exact byte-level drift paths without trusting mtime or file size."""

    if is_ignored_artifact(Path(relative)):
        return []
    if source.is_symlink() or target.is_symlink():
        return [relative]
    if source.exists() != target.exists() or source.is_dir() != target.is_dir():
        return [relative]
    if source.is_file():
        return [] if source.read_bytes() == target.read_bytes() else [relative]
    differences: list[str] = []
    source_names = {
        path.name for path in source.iterdir() if not is_ignored_artifact(Path(relative) / path.name)
    }
    target_names = {
        path.name for path in target.iterdir() if not is_ignored_artifact(Path(relative) / path.name)
    }
    for name in sorted(source_names | target_names):
        child_relative = f"{relative}/{name}"
        if name not in source_names or name not in target_names:
            differences.append(child_relative)
        else:
            differences.extend(_tree_differences(source / name, target / name, child_relative))
    return differences


def _same_tree(source: Path, target: Path) -> bool:
    return not _tree_differences(source, target, source.name)


def _promote_path(source: Path, destination: Path) -> None:
    backup = destination.with_name(f".{destination.name}.distribution-backup")
    if backup.exists():
        _remove_path(backup)
    if destination.exists():
        destination.replace(backup)
    try:
        source.replace(destination)
    except OSError as error:
        if backup.exists() and not destination.exists():
            backup.replace(destination)
        raise BuildError(f"Could not promote {destination.name}: {error}") from error
    if backup.exists():
        _remove_path(backup)


def _remove_path(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def _promote_transaction(pairs: list[tuple[Path | None, Path]]) -> None:
    """Compatibility wrapper for the Phase 2 transactional promoter."""

    promote_transaction(pairs)


def _changed_promotion_pairs(context: DistributionContext, staged: VerifiedArtifact) -> list[tuple[Path | None, Path]]:
    pairs = [
        (source, destination)
        for source, destination in zip(staged.roots, context.local_roots, strict=True)
        if not _same_tree(source, destination)
    ]
    for document in GENERATED_DOCS:
        source = context.stage_project_docs / document
        destination = context.local_path(document)
        if source.exists():
            if not _same_tree(source, destination):
                pairs.append((source, destination))
        elif destination.exists() or destination.is_symlink():
            pairs.append((None, destination))
    manifest = context.stage / BUILD_MANIFEST_PATH
    destination = context.repository / BUILD_MANIFEST_PATH
    if not _same_tree(manifest, destination):
        pairs.append((manifest, destination))
    return pairs


def run_local_build() -> VerifiedArtifact:
    """Generate local artifacts in isolation, then promote only complete output."""

    base_context = create_context(DistributionAction.BUILD)
    _assert_legacy_root_clean(base_context)
    with repository_lock(base_context.repository):
        with staged_build_root(base_context.repository) as stage:
            context = _stage_context(DistributionAction.BUILD, stage)
            staged = _generate_stage(context)
            _promote_transaction(_changed_promotion_pairs(context, staged))
            return VerifiedArtifact(repository=context.repository, roots=context.local_roots)


def run_local_check() -> None:
    """Compare staged output with local artifacts without writing repository or HOME."""

    base_context = create_context(DistributionAction.CHECK)
    _assert_legacy_root_clean(base_context)
    with repository_lock(base_context.repository):
        with staged_build_root(base_context.repository, prefix=".evcrate-check-", recover=False) as stage:
            context = _stage_context(DistributionAction.CHECK, stage)
            staged = _generate_stage(context)
            differences = [
                path
                for root, local in zip(staged.roots, context.local_roots, strict=True)
                for path in _tree_differences(root, local, root.name)
            ]
            for document in GENERATED_DOCS:
                staged_document = context.stage_project_docs / document
                local_document = context.local_path(document)
                if staged_document.exists() != local_document.exists() or (
                    staged_document.exists() and staged_document.read_bytes() != local_document.read_bytes()
                ):
                    differences.append(document)
            staged_manifest = context.stage / BUILD_MANIFEST_PATH
            local_manifest = context.repository / BUILD_MANIFEST_PATH
            if (
                not staged_manifest.is_file()
                or not local_manifest.is_file()
                or staged_manifest.read_bytes() != local_manifest.read_bytes()
            ):
                differences.append(str(BUILD_MANIFEST_PATH))
            if differences:
                raise BuildError("Local artifacts are out of date: " + ", ".join(differences))


def verified_local_artifact(context: DistributionContext) -> VerifiedArtifact:
    missing = [root.name for root in context.local_roots if not root.is_dir()]
    if missing:
        raise PublishError("Missing local build artifacts: " + ", ".join(missing))
    return VerifiedArtifact(repository=context.repository, roots=context.local_roots)


def run_home_publish(
    context: DistributionContext,
    artifact: VerifiedArtifact,
    *,
    dry_run: bool = False,
) -> list[object]:
    """Publish an explicit local artifact; this function never invokes a migrator."""

    if context.global_sync_mode not in {"managed", "full"}:
        raise PublishError("EVCRATE_GLOBAL_SYNC_MODE must be 'managed' or 'full'")
    from .publish import publish_local_artifacts

    try:
        return publish_local_artifacts(context, artifact, dry_run=dry_run)
    except PublishError:
        raise
    except Exception as error:
        raise PublishError("HOME publication failed") from error


def run_all() -> None:
    artifact = run_local_build()
    context = create_context(DistributionAction.ALL)
    run_home_publish(context, artifact)


def run_home_recovery(context: DistributionContext) -> None:
    from .publish import recover_interrupted_publish

    recover_interrupted_publish(context)
