"""Build, check, and HOME publication gates."""

from __future__ import annotations

import filecmp
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .context import DistributionContext, create_context
from .contracts import BuildError, DistributionAction, PublishError, VerifiedArtifact


GENERATED_DOCS = ("AGENTS.md", "GEMINI.md")


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
    if context.stage is None:
        raise BuildError("Local generation requires a staging directory")
    env = os.environ.copy()
    env.update({
        "GEMINI_OUTPUT_DIR": str(context.stage / ".gemini"),
        "CODEX_OUTPUT_DIR": str(context.stage / ".codex"),
        "AGENTS_OUTPUT_DIR": str(context.stage / ".agents"),
        "PROJECT_DOCS_OUTPUT_DIR": str(context.stage_project_docs),
        "GEMINI_PROJECT_DOCS_OUTPUT_DIR": str(context.stage_project_docs),
    })
    for directory in (*[context.stage / name for name in (".gemini", ".codex", ".agents")], context.stage_project_docs):
        directory.mkdir(parents=True, exist_ok=True)
    _run_migrator(context, "migrate_claude_to_gemini.py", env)
    _run_migrator(context, "migrate_claude_to_codex.py", env)
    roots = tuple(context.stage / root.name for root in context.local_roots)
    return VerifiedArtifact(repository=context.repository, roots=roots)


def _same_tree(source: Path, target: Path) -> bool:
    if not source.exists() or not target.exists():
        return source.exists() == target.exists()
    comparison = filecmp.dircmp(source, target)
    if comparison.left_only or comparison.right_only or comparison.common_funny or comparison.funny_files:
        return False
    if comparison.diff_files:
        return False
    return all(_same_tree(source / name, target / name) for name in comparison.common_dirs)


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
    """Promote all local outputs together and restore prior outputs on failure."""

    repository = pairs[0][1].parent
    with tempfile.TemporaryDirectory(prefix=".devkit-promotion-", dir=repository.parent) as temp:
        backup_root = Path(temp)
        backups: list[tuple[Path, Path]] = []
        promoted: list[Path] = []
        try:
            for source, destination in pairs:
                backup = backup_root / destination.name
                if destination.exists():
                    destination.replace(backup)
                    backups.append((backup, destination))
                if source is not None:
                    source.replace(destination)
                promoted.append(destination)
        except Exception as error:
            for destination in reversed(promoted):
                if destination.exists():
                    _remove_path(destination)
            for backup, destination in reversed(backups):
                if backup.exists():
                    backup.replace(destination)
            if isinstance(error, BuildError):
                raise
            raise BuildError(f"Could not promote local artifacts: {error}") from error


def run_local_build() -> VerifiedArtifact:
    """Generate local artifacts in isolation, then promote only complete output."""

    with tempfile.TemporaryDirectory(prefix=".devkit-build-", dir=create_context(DistributionAction.BUILD).repository.parent) as temp:
        context = _stage_context(DistributionAction.BUILD, Path(temp))
        staged = _generate_stage(context)
        pairs = list(zip(staged.roots, context.local_roots, strict=True))
        for document in GENERATED_DOCS:
            staged_document = context.stage_project_docs / document
            if staged_document.exists():
                pairs.append((staged_document, context.repository / document))
            elif (context.repository / document).exists():
                pairs.append((None, context.repository / document))
        _promote_transaction(pairs)
        return VerifiedArtifact(repository=context.repository, roots=context.local_roots)


def run_local_check() -> None:
    """Compare staged output with local artifacts without writing repository or HOME."""

    with tempfile.TemporaryDirectory(prefix=".devkit-check-") as temp:
        context = _stage_context(DistributionAction.CHECK, Path(temp))
        staged = _generate_stage(context)
        differences = [root.name for root, local in zip(staged.roots, context.local_roots, strict=True) if not _same_tree(root, local)]
        for document in GENERATED_DOCS:
            staged_document = context.stage_project_docs / document
            local_document = context.repository / document
            if staged_document.exists() != local_document.exists() or (
                staged_document.exists() and staged_document.read_bytes() != local_document.read_bytes()
            ):
                differences.append(document)
        if differences:
            raise BuildError("Local artifacts are out of date: " + ", ".join(differences))


def verified_local_artifact(context: DistributionContext) -> VerifiedArtifact:
    missing = [root.name for root in context.local_roots if not root.is_dir()]
    if missing:
        raise PublishError("Missing local build artifacts: " + ", ".join(missing))
    return VerifiedArtifact(repository=context.repository, roots=context.local_roots)


def run_home_publish(context: DistributionContext, artifact: VerifiedArtifact) -> None:
    """Publish an explicit local artifact; this function never invokes a migrator."""

    if artifact.repository != context.repository or artifact.roots != context.local_roots:
        raise PublishError("Artifact reference does not belong to this repository")
    if context.global_sync_mode not in {"managed", "full"}:
        raise PublishError("DEVKIT_GLOBAL_SYNC_MODE must be 'managed' or 'full'")
    from distribute_sync import publish_local_artifacts

    try:
        publish_local_artifacts(context)
    except Exception as error:
        # Keep publication failures machine-readable and avoid raw tracebacks.
        raise PublishError("HOME publication failed") from error


def run_all() -> None:
    artifact = run_local_build()
    context = create_context(DistributionAction.ALL)
    run_home_publish(context, artifact)
