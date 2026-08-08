"""Manifest-verified, non-destructive publication of local artifacts to HOME."""

from __future__ import annotations

import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from distribute_hooks import rewrite_codex_global_file

from .context import DistributionContext
from .contracts import PublishError, VerifiedArtifact
from .hashing import normalize_relative_path
from .locking import publish_lock, read_release_marker, write_release_marker
from .manifest import load_target_manifest, load_target_registry
from .publish_verification import verify_local_artifact
from .publish_inventory import artifact_files as _files, home_inventory, home_tree_hash, prior_managed_paths, protected_paths
from .publish_recovery import recover_interrupted_publish, restore_roots


@dataclass(frozen=True)
class PublishChange:
    root: str
    path: str
    action: str


def _validate_home_ancestors(context: DistributionContext, home: Path) -> None:
    if context.home.exists() and (context.home.is_symlink() or not context.home.is_dir()):
        raise PublishError("HOME root must be a real directory")
    try:
        relative = home.relative_to(context.home)
    except ValueError as error:
        raise PublishError("HOME binding escapes the configured HOME root") from error
    ancestor = context.home
    for part in relative.parts[:-1]:
        ancestor /= part
        if ancestor.exists() and (ancestor.is_symlink() or not ancestor.is_dir()):
            raise PublishError(f"HOME binding has an unsafe ancestor: {home}")


def _policies(context: DistributionContext) -> list[tuple[str, Path, Path, set[str]]]:
    registry = load_target_registry(context.repository / ".evcrate/targets/manifest.json")
    policies: list[tuple[str, Path, Path, set[str], int]] = []
    for manifest_path in registry.targets.values():
        manifest = load_target_manifest(manifest_path)
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
            local = context.repository / local_name
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


def publish_diff(context: DistributionContext, artifact: VerifiedArtifact) -> list[PublishChange]:
    verify_local_artifact(context, artifact)
    marker = read_release_marker(context.state_dir)
    prior = marker.get("managed_paths", {}) if marker.get("status") == "complete" else {}
    changes: list[PublishChange] = []
    for name, local, home, preserved in _policies(context):
        source = _publication_files(context, local, home)
        prior_paths = prior_managed_paths(prior, name)
        existing = home_inventory(home, protected_paths(source, prior_paths, preserved)) if home.exists() or home.is_symlink() else None
        for relative, content in source.items():
            if relative in preserved:
                changes.append(PublishChange(name, relative, "preserve"))
            elif existing is None or relative not in existing.files:
                changes.append(PublishChange(name, relative, "create"))
            elif existing.files[relative] != content:
                changes.append(PublishChange(name, relative, "update"))
        for relative in prior_paths:
            if relative not in source and relative not in preserved and existing is not None and relative in existing.files:
                changes.append(PublishChange(name, relative, "delete"))
        for relative in existing.paths if existing is not None else set():
            if relative not in source and relative not in prior_paths:
                changes.append(PublishChange(name, relative, "preserve"))
    return sorted(changes, key=lambda item: (item.root, item.path, item.action))


def _publication_files(context: DistributionContext, local: Path, home: Path) -> dict[str, bytes]:
    source = _files(local)
    if home != context.target_codex:
        return source
    try:
        return {
            relative: rewrite_codex_global_file(relative, content, home)
            for relative, content in source.items()
        }
    except (AttributeError, UnicodeDecodeError, TypeError, ValueError) as error:
        raise PublishError(f"Invalid generated Codex global configuration: {error}") from error


def _copy_candidate(
    context: DistributionContext,
    local: Path,
    home: Path,
    preserved: set[str],
    prior: set[str],
) -> tuple[Path, set[str]]:
    _validate_home_ancestors(context, home)
    if home.exists() or home.is_symlink():
        source = _publication_files(context, local, home)
        home_inventory(home, protected_paths(source, prior, preserved))
    else:
        source = _publication_files(context, local, home)
    if home.exists() and (home.is_symlink() or not home.is_dir()):
        raise PublishError(f"HOME root is unsafe: {home}")
    home.parent.mkdir(parents=True, exist_ok=True)
    candidate = Path(tempfile.mkdtemp(prefix=f".{home.name}.evcrate-stage-", dir=home.parent))
    if home.exists():
        shutil.copytree(home, candidate, dirs_exist_ok=True, symlinks=True)
    for relative in prior - set(source):
        path = candidate / relative
        if path.exists() and not path.is_symlink():
            path.unlink()
    managed: set[str] = set()
    for relative, content in source.items():
        if relative in preserved:
            continue
        destination = candidate / relative
        if destination.is_symlink():
            raise PublishError(f"Refusing to write through HOME symlink: {home / relative}")
        if any(parent.is_symlink() for parent in destination.parents if parent != candidate.parent):
            raise PublishError(f"Refusing to write through HOME symlink: {home / relative}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        managed.add(relative)
    return candidate, managed


def publish_local_artifacts(context: DistributionContext, artifact: VerifiedArtifact, *, dry_run: bool = False) -> list[PublishChange]:
    """Publish verified artifacts only; source generation is deliberately absent."""

    with publish_lock(context.state_dir):
        changes = publish_diff(context, artifact)
        if dry_run:
            return changes
        prior_marker = read_release_marker(context.state_dir)
        prior_paths = prior_marker.get("managed_paths", {}) if prior_marker.get("status") == "complete" else {}
        release_id = uuid.uuid4().hex
        completed: list[tuple[Path, Path | None]] = []
        managed_paths: dict[str, list[str]] = {}
        marker: dict[str, Any] = {
            "schema_version": 1,
            "status": "in_progress",
            "release_id": release_id,
            "roots": {},
            "managed_paths": {},
            "previous_managed_paths": prior_paths,
        }
        write_release_marker(context.state_dir, marker)
        try:
            for name, local, home, preserved in _policies(context):
                candidate, managed = _copy_candidate(context, local, home, preserved, prior_managed_paths(prior_paths, name))
                backup = home.with_name(f".{home.name}.evcrate-backup-{release_id}") if home.exists() else None
                marker["roots"][name] = {"backup": backup.name if backup else None, "completed": False}
                write_release_marker(context.state_dir, marker)
                if backup is not None:
                    home.replace(backup)
                completed.append((home, backup))
                candidate.replace(home)
                managed_paths[name] = sorted(managed)
                marker["roots"][name] = {"hash": home_tree_hash(home), "completed": True, "backup": backup.name if backup else None}
                marker["managed_paths"] = managed_paths
                write_release_marker(context.state_dir, marker)
            marker["status"] = "complete"
            write_release_marker(context.state_dir, marker)
            for _, backup in completed:
                if backup is not None and backup.exists():
                    try:
                        shutil.rmtree(backup)
                    except OSError:
                        pass
            return changes
        except (OSError, PublishError) as error:
            restore_roots(completed)
            marker["status"] = "recovered"
            marker["recovery_action"] = "restored-completed-roots"
            write_release_marker(context.state_dir, marker)
            raise PublishError(f"HOME publication recovered after failure: {error}") from error
