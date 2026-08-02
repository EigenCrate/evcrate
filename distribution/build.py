"""Same-volume staged-build lifecycle and rollback-safe local promotion."""

from __future__ import annotations

import json
import hashlib
import os
import shutil
import tempfile
from os.path import commonpath
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Sequence

from .contracts import BuildError


JOURNAL_NAME = ".devkit-promotion-journal.json"


@contextmanager
def repository_lock(repository: Path) -> Iterator[None]:
    """Acquire a non-blocking exclusive lock without writing the repository."""

    try:
        import fcntl
    except ImportError:
        with _windows_repository_lock(repository):
            yield
        return
    descriptor = os.open(repository, os.O_RDONLY)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise BuildError("Another distribution build or check is already active") from error
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


@contextmanager
def _windows_repository_lock(repository: Path) -> Iterator[None]:
    """Use a stable temp lock file where Windows cannot lock directories."""

    try:
        import msvcrt
    except ImportError as error:  # pragma: no cover - unsupported host
        raise BuildError("Exclusive repository locking is unavailable on this platform") from error
    token = hashlib.sha256(str(repository.resolve()).encode("utf-8")).hexdigest()[:24]
    lock_path = Path(tempfile.gettempdir()) / f"devkit-distribution-{token}.lock"
    with lock_path.open("a+b") as handle:
        handle.seek(0)
        if not handle.read(1):
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise BuildError("Another distribution build or check is already active") from error
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def _remove(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    elif path.exists() or path.is_symlink():
        path.unlink()


def _write_journal(path: Path, backup_dir: Path, common_parent: Path, destinations: list[Path]) -> None:
    payload = {
        "backup_dir": backup_dir.relative_to(common_parent).as_posix(),
        "destinations": [destination.relative_to(common_parent).as_posix() for destination in destinations],
    }
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, sort_keys=True, separators=(",", ":"))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)
    _sync_directory(path.parent)


def _sync_directory(path: Path) -> None:
    """Flush POSIX directory metadata; Windows lacks a compatible directory handle."""

    if os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def recover_interrupted_promotion(common_parent: Path) -> None:
    """Restore the last complete artifact set if a prior promotion was interrupted."""

    journal = common_parent / JOURNAL_NAME
    if not journal.exists():
        return
    try:
        if journal.is_symlink():
            raise ValueError("journal is a symlink")
        data = json.loads(journal.read_text(encoding="utf-8"))
        backup_dir = common_parent / data["backup_dir"]
        destinations = [common_parent / relative for relative in data["destinations"]]
        resolved_backup = backup_dir.resolve(strict=False)
        if backup_dir.parent != common_parent or not backup_dir.name.startswith(".devkit-promotion-"):
            raise ValueError("journal backup has an invalid location")
        if common_parent not in (resolved_backup, *resolved_backup.parents):
            raise ValueError("journal backup escapes common parent")
        if backup_dir.is_symlink() or any(path.is_symlink() for path in destinations):
            raise ValueError("journal references a symlink")
        if any(path.resolve(strict=False).parent != common_parent and common_parent not in path.resolve(strict=False).parents for path in destinations):
            raise ValueError("journal path escapes common parent")
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise BuildError(f"Could not safely recover interrupted promotion: {error}") from error
    for destination in reversed(destinations):
        backup = backup_dir / destination.relative_to(common_parent)
        if destination.exists():
            _remove(destination)
        if backup.exists():
            backup.replace(destination)
    journal.unlink()
    if backup_dir.exists():
        _remove(backup_dir)


@contextmanager
def staged_build_root(repository: Path, *, prefix: str = ".devkit-build-", recover: bool = True) -> Iterator[Path]:
    """Create an empty stage beside the repository so renames stay same-volume."""

    repository = repository.resolve()
    if not repository.is_dir():
        raise BuildError(f"Repository does not exist: {repository}")
    if recover:
        recover_interrupted_promotion(repository)
    elif (repository / JOURNAL_NAME).exists() or (repository / JOURNAL_NAME).is_symlink():
        raise BuildError("Interrupted promotion requires --build recovery before --check")
    stage = Path(tempfile.mkdtemp(prefix=prefix, dir=repository.parent))
    try:
        yield stage
    finally:
        if stage.exists():
            _remove(stage)


def promote_transaction(pairs: Sequence[tuple[Path | None, Path]]) -> None:
    """Rename staged roots as one recoverable set, restoring prior outputs on error."""

    if not pairs:
        return
    destinations = [destination.resolve(strict=False) for _, destination in pairs]
    sources = [source.resolve(strict=False) for source, _ in pairs if source is not None]
    if len(set(destinations)) != len(destinations):
        raise BuildError("Each promoted destination must be unique")
    if len(set(sources)) != len(sources):
        raise BuildError("Each promoted source must be unique")
    destination_parents = [destination.parent.resolve() for _, destination in pairs]
    common_parent = Path(commonpath([str(parent) for parent in destination_parents]))
    if not common_parent.is_dir():
        raise BuildError("Promoted destinations must have a common existing ancestor")
    for source, destination in pairs:
        if not destination.parent.is_dir() or destination.parent.is_symlink():
            raise BuildError(f"Refusing unsafe destination parent: {destination.parent}")
        if source is not None:
            try:
                if source.is_symlink():
                    raise BuildError(f"Refusing to promote a symlink: {source}")
                same_volume = source.stat().st_dev == destination.parent.stat().st_dev
            except OSError as error:
                raise BuildError(f"Could not inspect staged source {source}: {error}") from error
            if not same_volume:
                raise BuildError(f"Staged source must share destination volume: {source}")
        if destination.is_symlink():
            raise BuildError(f"Refusing to replace symlinked destination: {destination}")
    recover_interrupted_promotion(common_parent)
    backup_dir = Path(tempfile.mkdtemp(prefix=".devkit-promotion-", dir=common_parent))
    journal = common_parent / JOURNAL_NAME
    _write_journal(journal, backup_dir, common_parent, destinations)
    try:
        for source, destination in pairs:
            backup = backup_dir / destination.relative_to(common_parent)
            if destination.exists():
                backup.parent.mkdir(parents=True, exist_ok=True)
                destination.replace(backup)
            if source is not None:
                source.replace(destination)
    except OSError as error:
        recover_interrupted_promotion(common_parent)
        raise BuildError(f"Could not promote local artifacts: {error}") from error
    journal.unlink()
    _sync_directory(common_parent)
    _remove(backup_dir)
