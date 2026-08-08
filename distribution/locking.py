"""Owner-only HOME publish locking and durable release state."""

from __future__ import annotations

import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .contracts import PublishError
from .hashing import canonical_json_bytes


MARKER_NAME = "release-marker.json"
LOCK_NAME = "publish.lock"


def _state_file(state_dir: Path, name: str) -> Path:
    probe = state_dir
    while True:
        if probe.is_symlink():
            raise PublishError("Distribution state path must not contain symlinked ancestors")
        if probe.parent == probe:
            break
        probe = probe.parent
    if state_dir.exists() and not state_dir.is_dir():
        raise PublishError("Distribution state directory must be a real directory")
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        state_dir.chmod(0o700)
    except OSError as error:
        raise PublishError(f"Could not secure distribution state directory: {error}") from error
    return state_dir / name


@contextmanager
def publish_lock(state_dir: Path) -> Iterator[None]:
    """Reject concurrent publishers without trusting a lock-file path from input."""

    try:
        import fcntl
    except ImportError as error:  # pragma: no cover - Windows fallback is platform work
        raise PublishError("HOME publish locking is unavailable on this platform") from error
    lock_path = _state_file(state_dir, LOCK_NAME)
    if lock_path.is_symlink():
        raise PublishError("Distribution publish lock must not be a symlink")
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise PublishError("Another HOME publication is already active") from error
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def read_release_marker(state_dir: Path) -> dict[str, Any]:
    marker = _state_file(state_dir, MARKER_NAME)
    if not marker.exists():
        return {"schema_version": 1, "status": "none", "roots": {}, "managed_paths": {}}
    if marker.is_symlink():
        raise PublishError("Release marker must not be a symlink")
    try:
        data = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PublishError(f"Could not read release marker: {error}") from error
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise PublishError("Release marker has an unsupported schema")
    return data


def write_release_marker(state_dir: Path, marker: dict[str, Any]) -> None:
    path = _state_file(state_dir, MARKER_NAME)
    if path.is_symlink():
        raise PublishError("Release marker must not be a symlink")
    try:
        descriptor, temporary_name = tempfile.mkstemp(prefix=".release-marker-", dir=path.parent)
        temporary = Path(temporary_name)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(canonical_json_bytes(marker))
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        temporary.replace(path)
    except OSError as error:
        if "temporary" in locals() and temporary.exists():
            temporary.unlink(missing_ok=True)
        raise PublishError(f"Could not write release marker: {error}") from error
