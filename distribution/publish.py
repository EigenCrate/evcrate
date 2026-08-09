"""Manifest-verified, non-destructive publication of local artifacts to HOME."""

from __future__ import annotations

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
from .manifest import SharedJsonSpec, load_target_manifest, load_target_registry
from .pi_settings import PiSettingsError, PiSettingsPlan, plan_pi_settings
from .publish_verification import verify_local_artifact
from .publish_inventory import artifact_files as _files, home_inventory, home_tree_hash, prior_managed_paths, protected_paths
from .publish_recovery import recover_interrupted_publish, restore_roots


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
    registry = load_target_registry(registry_path)
    result: list[tuple[str, Path, Path, SharedJsonSpec]] = []
    for manifest_path in registry.targets.values():
        manifest = load_target_manifest(manifest_path)
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
        if probe.is_symlink():
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


def publish_diff(context: DistributionContext, artifact: VerifiedArtifact) -> list[PublishChange]:
    verify_local_artifact(context, artifact)
    marker = read_release_marker(context.state_dir)
    prior = _managed_paths_for_publish(marker)
    changes: list[PublishChange] = []
    for name, local, home, preserved in _policies(context):
        source = _publication_files(context, local, home)
        shared_paths = {spec.destination for _, spec in _shared_for_root(context, local, home)}
        prior_paths = prior_managed_paths(prior, name)
        protected = protected_paths(source, prior_paths, preserved) | shared_paths
        existing = home_inventory(home, protected) if home.exists() or home.is_symlink() else None
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
            if relative not in source and relative not in prior_paths and relative not in shared_paths:
                changes.append(PublishChange(name, relative, "preserve"))
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
        shared_paths = {spec.destination for _, spec in _shared_for_root(context, local, home)}
        home_inventory(home, protected_paths(source, prior, preserved) | shared_paths)
    else:
        source = _publication_files(context, local, home)
    if home.exists() and (home.is_symlink() or not home.is_dir()):
        raise PublishError(f"HOME root is unsafe: {home}")
    home.parent.mkdir(parents=True, exist_ok=True)
    candidate = Path(tempfile.mkdtemp(prefix=f".{home.name}.evcrate-stage-", dir=home.parent))
    try:
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
    except (OSError, PublishError):
        shutil.rmtree(candidate, ignore_errors=True)
        raise


def _merge_shared_candidate(candidate: Path, local: Path, spec: SharedJsonSpec) -> PiSettingsPlan:
    fragment = local / spec.fragment
    settings = candidate / spec.destination
    existing = settings.read_bytes() if settings.exists() else None
    try:
        plan = plan_pi_settings(existing, fragment.read_bytes(), managed_key=spec.managed_key)
    except (OSError, PiSettingsError) as error:
        raise PublishError(f"Could not merge Pi shared settings: {error}") from error
    if plan.action == "conflict":
        raise PublishError(plan.message)
    if plan.result is not None and plan.result != existing:
        settings.parent.mkdir(parents=True, exist_ok=True)
        settings.write_bytes(plan.result)
    return plan


def _home_snapshot(home: Path) -> str | None:
    if not home.exists() and not home.is_symlink():
        return None
    return home_tree_hash(home)


def publish_local_artifacts(context: DistributionContext, artifact: VerifiedArtifact, *, dry_run: bool = False) -> list[PublishChange]:
    """Publish verified artifacts only; source generation is deliberately absent."""

    # Validate HOME bindings and state paths before creating any lock directory.
    _policies(context)
    _validate_state_ancestors(context)
    with publish_lock(context.state_dir):
        changes = publish_diff(context, artifact)
        if dry_run:
            return changes
        if any(change.action == "conflict" for change in changes):
            raise PublishError("Pi settings conflict; remove npm:pi-code manually before publication")
        shared_snapshots = {name: _home_snapshot(home) for name, _, home, _ in _shared_specs(context)}
        shared_merges = {
            name: next(change.action for change in changes if change.root == name and change.path == spec.destination)
            for name, _, _, spec in _shared_specs(context)
        }
        prior_marker = read_release_marker(context.state_dir)
        prior_paths = _managed_paths_for_publish(prior_marker)
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
            "shared_merges": shared_merges,
        }
        write_release_marker(context.state_dir, marker)
        try:
            for name, local, home, preserved in _policies(context):
                candidate: Path | None = None
                candidate, managed = _copy_candidate(context, local, home, preserved, prior_managed_paths(prior_paths, name))
                shared = _shared_for_root(context, local, home)
                for _, spec in shared:
                    _merge_shared_candidate(candidate, local, spec)
                if shared and _home_snapshot(home) != shared_snapshots.get(name):
                    raise PublishError(f"Pi HOME changed concurrently for {name}; publication aborted")
                backup = home.with_name(f".{home.name}.evcrate-backup-{release_id}") if home.exists() else None
                marker["roots"][name] = {"backup": backup.name if backup else None, "completed": False}
                write_release_marker(context.state_dir, marker)
                # Manual Pi quiescence remains required; this is the final optimistic recheck.
                if shared and _home_snapshot(home) != shared_snapshots.get(name):
                    raise PublishError(f"Pi HOME changed concurrently for {name}; publication aborted")
                if backup is not None:
                    home.replace(backup)
                completed.append((home, backup))
                candidate.replace(home)
                candidate = None
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
            if "candidate" in locals() and candidate is not None and candidate.exists():
                shutil.rmtree(candidate)
            restore_roots(completed)
            marker["status"] = "recovered"
            marker["recovery_action"] = "restored-completed-roots"
            marker["managed_paths"] = prior_paths
            write_release_marker(context.state_dir, marker)
            raise PublishError(f"HOME publication recovered after failure: {error}") from error
