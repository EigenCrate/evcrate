"""Recovery for an interrupted HOME publication."""

from __future__ import annotations

import shutil
from pathlib import Path

from .context import DistributionContext
from .contracts import PublishError
from .locking import publish_lock, read_release_marker, write_release_marker


def restore_roots(roots: list[tuple[Path, Path | None]]) -> None:
    for target, backup in reversed(roots):
        if target.exists() or target.is_symlink():
            shutil.rmtree(target) if target.is_dir() and not target.is_symlink() else target.unlink()
        if backup is not None and backup.exists():
            backup.replace(target)


def recover_interrupted_publish(context: DistributionContext) -> None:
    """Restore roots recorded before an interrupted HOME publication."""

    from .publish import (
        _managed_destination,
        _policies,
        _remove_path,
        _replace_managed_file,
        _validate_controller_home,
        _validate_state_ancestors,
    )

    _policies(context)
    _validate_state_ancestors(context)
    with publish_lock(context.state_dir):
        marker = read_release_marker(context.state_dir)
        if marker.get("status") != "in_progress":
            return
        operations = marker.get("operations")
        transaction_name = marker.get("transaction_dir")
        if isinstance(operations, list) and isinstance(transaction_name, str):
            transaction = context.state_dir / transaction_name
            if transaction.parent != context.state_dir or not transaction.name.startswith("release-"):
                raise PublishError("Interrupted release marker has an unsafe transaction")
            policy_by_name = {name: home for name, _, home, _, _ in _policies(context)}
            for operation in reversed(operations):
                if not isinstance(operation, dict):
                    raise PublishError("Interrupted release marker has an unsafe operation")
                name = operation.get("root")
                relative = operation.get("path")
                backup = operation.get("backup")
                kind = operation.get("kind", "file")
                if (
                    name not in policy_by_name
                    or not isinstance(relative, str)
                    or (backup is not None and not isinstance(backup, str))
                    or kind not in {"file", "directory"}
                ):
                    raise PublishError("Interrupted release marker has an unsafe operation")
                destination_root = policy_by_name[name]
                if kind == "directory":
                    if name != ".evcrate/bin" or relative != ".evcrate/bin":
                        raise PublishError("Interrupted release marker has an unsafe directory operation")
                    _validate_controller_home(context, destination_root)
                    if backup is None:
                        _remove_path(destination_root)
                        continue
                    backup_path = destination_root.parent / backup
                    if (
                        Path(backup).name != backup
                        or not backup.startswith(".evcrate-bin-backup-")
                        or backup_path.parent != destination_root.parent
                        or backup_path.is_symlink()
                    ):
                        raise PublishError("Interrupted release marker has an unsafe controller backup")
                    if not backup_path.exists():
                        if destination_root.exists() or destination_root.is_symlink():
                            continue
                        raise PublishError("Interrupted release marker has a missing controller backup")
                    if not backup_path.is_dir():
                        raise PublishError("Interrupted release marker has an invalid controller backup")
                    _remove_path(destination_root)
                    backup_path.replace(destination_root)
                    continue
                if kind != "file":
                    raise PublishError("Interrupted release marker has an unsafe operation")
                destination = _managed_destination(destination_root, relative)
                if backup is None:
                    destination.unlink(missing_ok=True)
                else:
                    backup_path = transaction / backup
                    if (
                        Path(backup).name != backup
                        or backup_path.parent != transaction
                        or backup_path.is_symlink()
                        or not backup_path.is_file()
                    ):
                        raise PublishError("Interrupted release marker has a missing backup")
                    _replace_managed_file(destination, backup_path.read_bytes())
            shutil.rmtree(transaction, ignore_errors=True)
            marker["status"] = "recovered"
            marker["recovery_action"] = "restored-interrupted-files"
            marker["managed_paths"] = marker.get("previous_managed_paths", {})
            write_release_marker(context.state_dir, marker)
            return
        policy_by_name = {name: home for name, _, home, _, _ in _policies(context)}
        restored: list[tuple[Path, Path | None]] = []
        for name, details in marker.get("roots", {}).items():
            if name not in policy_by_name or not isinstance(details, dict):
                raise PublishError("Interrupted release marker has an unsafe root")
            target = policy_by_name[name]
            backup_name = details.get("backup")
            backup = target.parent / backup_name if isinstance(backup_name, str) else None
            if backup is not None and (
                backup.parent != target.parent
                or not backup.name.startswith(f".{target.name}.evcrate-backup-")
            ):
                raise PublishError("Interrupted release marker has an unsafe backup")
            restored.append((target, backup))
        restore_roots(restored)
        marker["status"] = "recovered"
        marker["recovery_action"] = "restored-interrupted-roots"
        marker["managed_paths"] = marker.get("previous_managed_paths", {})
        write_release_marker(context.state_dir, marker)
