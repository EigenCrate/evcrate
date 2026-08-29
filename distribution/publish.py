"""Manifest-verified, non-destructive publication of local artifacts to HOME."""

from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from distribute_hooks import rewrite_codex_global_file

from .context import DistributionContext
from .contracts import PublishError, VerifiedArtifact
from .hashing import normalize_relative_path
from .locking import publish_lock, read_release_marker, write_release_marker
from .manifest import SharedJsonSpec
from .pi_settings import PiSettingsError, PiSettingsPlan, plan_pi_settings
from .publish_verification import verify_local_artifact
from .publish_inventory import artifact_files as _files, home_tree_hash, prior_managed_paths
from .publish_recovery import recover_interrupted_publish


@dataclass(frozen=True)
class PublishChange:
    root: str
    path: str
    action: str


CLAUDE_SKILLS_ROOT = PurePosixPath("skills")


def _is_claude_skill_root_file(relative: str) -> bool:
    """Exclude documentation and archives placed beside Claude skill packages."""

    return PurePosixPath(relative).parent == CLAUDE_SKILLS_ROOT


def _shared_specs(context: DistributionContext) -> list[tuple[str, Path, Path, SharedJsonSpec]]:
    """Resolve shared JSON files from target manifests, never from HOME defaults."""

    registry_path = context.repository / ".evcrate/targets/manifest.json"
    if not registry_path.is_file():
        return []
    result: list[tuple[str, Path, Path, SharedJsonSpec]] = []
    for manifest in context.selected_manifests:
        if manifest.shared_json is None:
            continue
        bindings = manifest.home_policy.get("bindings", {})
        if not isinstance(bindings, dict):
            raise PublishError(f"Invalid HOME bindings for shared target {manifest.name}")
        root = manifest.output_roots[0]
        home_name = bindings.get(root)
        if not isinstance(home_name, str):
            raise PublishError(f"Shared target {manifest.name} has no HOME binding for {root}")
        safe_home_name = normalize_relative_path(home_name)
        result.append((root, context.local_path(root), context.home / safe_home_name, manifest.shared_json))
    return result


def _shared_for_root(context: DistributionContext, local: Path, home: Path) -> list[tuple[str, SharedJsonSpec]]:
    return [(name, spec) for name, source, target, spec in _shared_specs(context) if source == local and target == home]


def _settings_path(home: Path, spec: SharedJsonSpec) -> Path:
    path = home / spec.destination
    _reject_symlinked_ancestors(path, "Pi shared settings path must not contain symlinks")
    if path.exists() and (path.is_symlink() or not path.is_file()):
        raise PublishError(f"Pi shared settings path is not a regular file: {path}")
    return path


def _shared_plan(local: Path, home: Path, spec: SharedJsonSpec) -> PiSettingsPlan:
    fragment = local / spec.fragment
    if fragment.is_symlink() or not fragment.is_file():
        raise PublishError(f"Pi shared settings fragment is missing or unsafe: {fragment}")
    path = _settings_path(home, spec)
    existing = path.read_bytes() if path.exists() else None
    try:
        return plan_pi_settings(existing, fragment.read_bytes(), managed_key=spec.managed_key)
    except PiSettingsError as error:
        raise PublishError(str(error)) from error


def _managed_paths_for_publish(marker: dict[str, Any]) -> object:
    """Reuse managed paths after a rolled-back release so stale files can be removed."""

    if marker.get("status") not in {"complete", "recovered"}:
        return {}
    return marker.get("managed_paths", {})


def _reject_symlinked_ancestors(path: Path, message: str) -> None:
    probe = path
    while True:
        if _is_reparse_point(probe):
            raise PublishError(message)
        if probe.parent == probe:
            break
        probe = probe.parent


def _validate_home_ancestors(context: DistributionContext, home: Path) -> None:
    _reject_symlinked_ancestors(context.home, "HOME root must not contain symlinked ancestors")
    _reject_symlinked_ancestors(home, f"HOME binding has an unsafe ancestor: {home}")
    if context.home.exists() and not context.home.is_dir():
        raise PublishError("HOME root must be a real directory")
    try:
        home.relative_to(context.home)
    except ValueError as error:
        raise PublishError("HOME binding escapes the configured HOME root") from error


def _validate_state_ancestors(context: DistributionContext) -> None:
    _reject_symlinked_ancestors(
        context.state_dir,
        "Distribution state path must not contain symlinked ancestors",
    )


def _policies(context: DistributionContext) -> list[tuple[str, Path, Path, set[str]]]:
    policies: list[tuple[str, Path, Path, set[str], int]] = []
    for manifest in context.selected_manifests:
        policy = manifest.home_policy
        bindings = policy.get("bindings", {})
        preserve = policy.get("preserve_paths", {})
        order = policy.get("promotion_order", 100)
        if not isinstance(bindings, dict) or not isinstance(preserve, dict) or not isinstance(order, int):
            raise PublishError(f"Invalid HOME policy for target {manifest.name}")
        for local_name, home_name in bindings.items():
            if local_name not in manifest.output_roots or not isinstance(home_name, str):
                raise PublishError(f"Invalid HOME binding for target {manifest.name}")
            try:
                safe_home_name = normalize_relative_path(home_name)
            except Exception as error:
                raise PublishError(f"Invalid HOME binding for target {manifest.name}") from error
            raw_preserved = preserve.get(local_name, [])
            if not isinstance(raw_preserved, list) or not all(isinstance(path, str) for path in raw_preserved):
                raise PublishError(f"Invalid preserved paths for target {manifest.name}")
            try:
                preserved = {normalize_relative_path(path) for path in raw_preserved}
            except Exception as error:
                raise PublishError(f"Invalid preserved paths for target {manifest.name}") from error
            if len(preserved) != len(raw_preserved):
                raise PublishError(f"Duplicate preserved paths for target {manifest.name}")
            local = context.local_path(local_name)
            home = context.home / safe_home_name
            policies.append((safe_home_name, local, home, preserved, order))
    ordered = sorted(policies, key=lambda value: (value[4], value[0]))
    for index, (name, _, home, _, order) in enumerate(ordered):
        _validate_home_ancestors(context, home)
        for prior_name, _, _, _, prior_order in ordered[:index]:
            if name == prior_name:
                raise PublishError("HOME policies must not duplicate a binding")
            if name.startswith(prior_name + "/") and order <= prior_order:
                raise PublishError("Nested HOME binding must promote after its parent")
    return [(name, local, home, preserve) for name, local, home, preserve, _ in ordered]

def _published_relative(context: DistributionContext, local: Path, home: Path, relative: str) -> str:
    """Map local OMP files into the HOME agent namespace."""

    if home == context.target_omp:
        return (PurePosixPath("agent") / normalize_relative_path(relative)).as_posix()
    return relative


def publish_diff(context: DistributionContext, artifact: VerifiedArtifact) -> list[PublishChange]:
    verify_local_artifact(context, artifact)
    marker = read_release_marker(context.state_dir)
    prior = _managed_paths_for_publish(marker)
    changes: list[PublishChange] = []
    for name, local, home, preserved in _policies(context):
        _validate_home_ancestors(context, home)
        source = _publication_files(context, local, home)
        preserved_paths = {
            _published_relative(context, local, home, relative)
            for relative in preserved
        }
        shared_paths = {spec.destination for _, spec in _shared_for_root(context, local, home)}
        prior_paths = prior_managed_paths(prior, name)
        for relative, content in source.items():
            if relative in preserved_paths:
                changes.append(PublishChange(name, relative, "preserve"))
                continue
            destination = _managed_destination(home, relative)
            if not destination.exists():
                changes.append(PublishChange(name, relative, "create"))
            elif destination.read_bytes() != content:
                changes.append(PublishChange(name, relative, "update"))
        for relative in prior_paths:
            if (
                relative not in source
                and relative not in preserved_paths
                and relative not in shared_paths
                and _managed_destination(home, relative).exists()
            ):
                changes.append(PublishChange(name, relative, "delete"))
    for name, local, home, spec in _shared_specs(context):
        plan = _shared_plan(local, home, spec)
        changes.append(PublishChange(name, spec.destination, plan.action))
    return sorted(changes, key=lambda item: (item.root, item.path, item.action))


def _publication_files(context: DistributionContext, local: Path, home: Path) -> dict[str, bytes]:
    source = _files(local)
    for _, spec in _shared_for_root(context, local, home):
        source.pop(spec.destination, None)
    if local == context.local_claude:
        # Keep the complete local authoring artifact, but do not expose files
        # beside skill packages to Pi's Claude skill discovery path.
        source = {
            relative: content
            for relative, content in source.items()
            if not _is_claude_skill_root_file(relative)
        }
    if home == context.target_omp:
        source = {
            _published_relative(context, local, home, relative): content
            for relative, content in source.items()
        }
    if home != context.target_codex:
        return source
    try:
        return {
            relative: rewrite_codex_global_file(relative, content, home)
            for relative, content in source.items()
        }
    except (AttributeError, UnicodeDecodeError, TypeError, ValueError) as error:
        raise PublishError(f"Invalid generated Codex global configuration: {error}") from error


def _home_snapshot(home: Path) -> str | None:
    """Hash a HOME binding before planning so concurrent Pi writes abort safely."""

    if not home.exists() and not home.is_symlink():
        return None
    return home_tree_hash(home)


def _is_reparse_point(path: Path) -> bool:
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def _managed_destination(home: Path, relative: str) -> Path:
    destination = home / normalize_relative_path(relative)
    if _is_reparse_point(home) or (home.exists() and not home.is_dir()):
        raise PublishError(f"HOME root is unsafe: {home}")
    current = home
    for part in destination.relative_to(home).parts[:-1]:
        current /= part
        if _is_reparse_point(current) or (current.exists() and not current.is_dir()):
            raise PublishError(f"HOME reparse point intersects managed path: {destination}")
    if destination.exists() and (_is_reparse_point(destination) or not destination.is_file()):
        raise PublishError(f"HOME reparse point intersects managed path: {destination}")
    return destination


def _replace_managed_file(destination: Path, content: bytes) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".evcrate-publish-", dir=destination.parent)
    temporary = Path(temporary_name)
    try:
        with open(descriptor, "wb", closefd=True) as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            temporary.replace(destination)
        except PermissionError as error:
            if os.name != "nt" or error.winerror not in {5, 32}:
                raise
            _reject_symlinked_ancestors(destination, "HOME reparse point intersects managed path")
            if _is_reparse_point(destination) or not destination.is_file():
                raise PublishError(f"HOME reparse point intersects managed path: {destination}") from error
            with destination.open("r+b") as handle:
                handle.seek(0)
                handle.write(content)
                handle.truncate()
                handle.flush()
                os.fsync(handle.fileno())
    finally:
        temporary.unlink(missing_ok=True)


def publish_local_artifacts(context: DistributionContext, artifact: VerifiedArtifact, *, dry_run: bool = False) -> list[PublishChange]:
    """Publish verified artifacts only; source generation is deliberately absent."""

    # Validate HOME bindings and state paths before creating any lock directory.
    _policies(context)
    _validate_state_ancestors(context)
    with publish_lock(context.state_dir):
        shared_snapshots = {
            name: _home_snapshot(home)
            for name, _, home, _ in _shared_specs(context)
        }
        changes = publish_diff(context, artifact)
        if dry_run:
            return changes
        if any(change.action == "conflict" for change in changes):
            raise PublishError("Pi settings conflict; remove npm:pi-code manually before publication")
        prior_marker = read_release_marker(context.state_dir)
        prior_paths = _managed_paths_for_publish(prior_marker)
        release_id = uuid.uuid4().hex
        managed_paths: dict[str, list[str]] = {}
        marker: dict[str, Any] = {
            "schema_version": 1,
            "status": "in_progress",
            "release_id": release_id,
            "roots": {},
            "managed_paths": {},
            "previous_managed_paths": prior_paths,
            "operations": [],
        }
        transaction = context.state_dir / f"release-{release_id}"
        transaction.mkdir(mode=0o700)
        marker["transaction_dir"] = transaction.name
        write_release_marker(context.state_dir, marker)
        snapshots: list[tuple[Path, bytes | None]] = []

        def apply(path: Path, content: bytes | None, name: str, relative: str) -> None:
            existing = path.read_bytes() if path.exists() else None
            if existing == content:
                return
            backup_name = None
            if existing is not None:
                backup_name = f"{len(marker['operations'])}.bin"
                (transaction / backup_name).write_bytes(existing)
            marker["operations"].append({"root": name, "path": relative, "backup": backup_name})
            write_release_marker(context.state_dir, marker)
            snapshots.append((path, existing))
            if content is None:
                path.unlink(missing_ok=True)
            else:
                _replace_managed_file(path, content)

        try:
            for name, local, home, preserved in _policies(context):
                if name in shared_snapshots and _home_snapshot(home) != shared_snapshots[name]:
                    raise PublishError(f"Pi HOME changed concurrently for {name}; publication aborted")
                source = _publication_files(context, local, home)
                preserved_paths = {
                    _published_relative(context, local, home, relative)
                    for relative in preserved
                }
                shared_specs = _shared_for_root(context, local, home)
                shared_paths = {spec.destination for _, spec in shared_specs}
                prior = prior_managed_paths(prior_paths, name)
                managed = sorted(set(source) - preserved_paths)
                for relative in managed:
                    apply(_managed_destination(home, relative), source[relative], name, relative)
                for relative in prior - set(source) - preserved_paths - shared_paths:
                    destination = _managed_destination(home, relative)
                    if destination.exists():
                        apply(destination, None, name, relative)
                for _, spec in shared_specs:
                    plan = _shared_plan(local, home, spec)
                    if plan.action == "conflict":
                        raise PublishError(plan.message)
                    if plan.result != plan.original:
                        settings = _settings_path(home, spec)
                        current = settings.read_bytes() if settings.exists() else None
                        if current != plan.original:
                            raise PublishError(f"Pi HOME changed concurrently for {name}; publication aborted")
                        apply(settings, plan.result, name, spec.destination)
                managed_paths[name] = managed
                marker["roots"][name] = {"completed": True}
                marker["managed_paths"] = managed_paths
                write_release_marker(context.state_dir, marker)
            marker["status"] = "complete"
            write_release_marker(context.state_dir, marker)
            shutil.rmtree(transaction, ignore_errors=True)
            return changes
        except (OSError, PublishError) as error:
            for destination, content in reversed(snapshots):
                if content is None:
                    destination.unlink(missing_ok=True)
                else:
                    _replace_managed_file(destination, content)
            marker["status"] = "recovered"
            marker["recovery_action"] = "restored-completed-files"
            marker["managed_paths"] = prior_paths
            write_release_marker(context.state_dir, marker)
            shutil.rmtree(transaction, ignore_errors=True)
            raise PublishError(f"HOME publication recovered after failure: {error}") from error
