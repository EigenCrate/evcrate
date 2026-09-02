"""Owner-only HOME publish locking and durable release state."""

from __future__ import annotations

import os
import secrets
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .contracts import PublishError
from .hashing import HashingError, canonical_json_bytes, read_bounded_json


MARKER_NAME = "release-marker.json"
LOCK_NAME = "publish.lock"
MAX_LOCK_BYTES = 4096
MAX_MARKER_BYTES = 16 * 1024 * 1024
SAFE_INTEGER_MAX = 9007199254740991


def _is_reparse_point(path: Path) -> bool:
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()

def _state_file(state_dir: Path, name: str, *, create: bool = True) -> Path:
    probe = state_dir
    while True:
        if _is_reparse_point(probe):
            raise PublishError("Distribution state path must not contain symlinked ancestors")
        if probe.parent == probe:
            break
        probe = probe.parent
    if state_dir.exists() and not state_dir.is_dir():
        raise PublishError("Distribution state directory must be a real directory")
    if not create:
        return state_dir / name
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        state_dir.chmod(0o700)
    except OSError as error:
        raise PublishError(f"Could not secure distribution state directory: {error}") from error
    return state_dir / name


def _process_start_token(pid: int) -> str | None:
    if os.name != "posix":
        return None
    try:
        fields = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8").rsplit(")", 1)[1].split()
        return fields[19] if len(fields) > 19 else None
    except (OSError, UnicodeError):
        return None


def _lock_owner(path: Path) -> tuple[int, str | None, str] | None:
    try:
        value = read_bounded_json(path, MAX_LOCK_BYTES)
    except (HashingError, OSError):
        return None
    if not isinstance(value, dict):
        return None
    pid = value.get("pid")
    started_at = value.get("startedAt")
    if (
        type(pid) is not int
        or not 0 < pid <= SAFE_INTEGER_MAX
        or type(started_at) is not int
        or not 0 <= started_at <= SAFE_INTEGER_MAX
    ):
        return None
    token = value.get("token")
    process_start = value.get("processStart")
    if not isinstance(token, str) or len(token) != 32 or any(char not in "0123456789abcdef" for char in token):
        return None
    if process_start is not None and not isinstance(process_start, str):
        return None
    return pid, process_start, token


def _process_alive(owner: tuple[int, str | None, str]) -> bool:
    pid, process_start, _ = owner
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except OSError:
        return True
    if os.name == "posix" and process_start is None:
        return True
    current = _process_start_token(pid)
    return current is None or current == process_start


def _quarantine_stale_lock(lock_path: Path, owner: tuple[int, str | None, str]) -> bool:
    quarantine = lock_path.with_name(f".{lock_path.name}.stale-{secrets.token_hex(16)}")
    try:
        os.rename(lock_path, quarantine)
    except FileNotFoundError:
        return False
    except OSError as error:
        raise PublishError("Could not quarantine a stale HOME publication lock") from error
    quarantined = _lock_owner(quarantine)
    if quarantined is None or quarantined[2] != owner[2]:
        raise PublishError("Stale HOME publication lock changed during quarantine")
    try:
        quarantine.unlink()
    except OSError as error:
        raise PublishError("Could not remove a quarantined HOME publication lock") from error
    return True


def _acquire_publish_lock(lock_path: Path) -> tuple[int, int, str]:
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
    for _ in range(2):
        try:
            descriptor = os.open(lock_path, flags, 0o600)
        except FileExistsError as error:
            owner = _lock_owner(lock_path)
            if owner is None or _process_alive(owner):
                raise PublishError("Another HOME publication is already active") from error
            _quarantine_stale_lock(lock_path, owner)
            continue
        token = secrets.token_hex(16)
        try:
            payload = canonical_json_bytes({
                "pid": os.getpid(), "startedAt": int(time.time() * 1000),
                "token": token, "processStart": _process_start_token(os.getpid())
            })
            offset = 0
            while offset < len(payload):
                offset += os.write(descriptor, payload[offset:])
            os.fsync(descriptor)
            identity = os.fstat(descriptor)
            return int(identity.st_dev), int(identity.st_ino), token
        finally:
            os.close(descriptor)
    raise PublishError("Could not acquire HOME publication lock")


@contextmanager
def publish_lock(state_dir: Path) -> Iterator[None]:
    """Use the shared O_EXCL JSON lock protocol used by the TypeScript primitives."""

    lock_path = _state_file(state_dir, LOCK_NAME)
    device, inode, token = _acquire_publish_lock(lock_path)
    try:
        yield
    finally:
        try:
            current = _lock_owner(lock_path)
            identity = lock_path.stat(follow_symlinks=False)
            if (
                current is not None
                and current[2] == token
                and int(identity.st_dev) == device
                and int(identity.st_ino) == inode
            ):
                lock_path.unlink()
        except OSError:
            pass


def read_release_marker(state_dir: Path) -> dict[str, Any]:
    marker = _state_file(state_dir, MARKER_NAME, create=False)
    if _is_reparse_point(marker):
        raise PublishError("Release marker must not be a symlink")
    if not marker.exists():
        return {"schema_version": 1, "status": "none", "roots": {}, "managed_paths": {}}
    try:
        data = read_bounded_json(marker, MAX_MARKER_BYTES)
    except FileNotFoundError:
        return {"schema_version": 1, "status": "none", "roots": {}, "managed_paths": {}}
    except (HashingError, OSError) as error:
        raise PublishError(f"Could not read release marker: {error}") from error
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise PublishError("Release marker has an unsupported schema")
    return data


def write_release_marker(state_dir: Path, marker: dict[str, Any]) -> None:
    path = _state_file(state_dir, MARKER_NAME)
    if _is_reparse_point(path):
        raise PublishError("Release marker must not be a symlink")
    payload = canonical_json_bytes(marker)
    if len(payload) > MAX_MARKER_BYTES:
        raise PublishError("Release marker exceeds the bounded size limit")
    try:
        descriptor, temporary_name = tempfile.mkstemp(prefix=".release-marker-", dir=path.parent)
        temporary = Path(temporary_name)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        temporary.replace(path)
    except OSError as error:
        if "temporary" in locals() and temporary.exists():
            temporary.unlink(missing_ok=True)
        raise PublishError(f"Could not write release marker: {error}") from error
