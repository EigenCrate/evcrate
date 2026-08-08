"""Recovery for an interrupted per-root HOME publication."""

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
    """Restore roots recorded before an interrupted per-root promotion."""

    from .publish import _policies, _validate_state_ancestors

    _policies(context)
    _validate_state_ancestors(context)
    with publish_lock(context.state_dir):
        marker = read_release_marker(context.state_dir)
        if marker.get("status") != "in_progress":
            return
        policy_by_name = {name: home for name, _, home, _ in _policies(context)}
        restored: list[tuple[Path, Path | None]] = []
        for name, details in marker.get("roots", {}).items():
            if name not in policy_by_name or not isinstance(details, dict):
                raise PublishError("Interrupted release marker has an unsafe root")
            target = policy_by_name[name]
            backup_name = details.get("backup")
            backup = target.parent / backup_name if isinstance(backup_name, str) else None
            if backup is not None and (backup.parent != target.parent or not backup.name.startswith(f".{target.name}.evcrate-backup-")):
                raise PublishError("Interrupted release marker has an unsafe backup")
            restored.append((target, backup))
        restore_roots(restored)
        marker["status"] = "recovered"
        marker["recovery_action"] = "restored-interrupted-roots"
        marker["managed_paths"] = marker.get("previous_managed_paths", {})
        write_release_marker(context.state_dir, marker)
