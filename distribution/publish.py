"""Manifest-verified, non-destructive publication of local artifacts to HOME."""

from __future__ import annotations

import ctypes
import os
import shutil
import stat
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from distribute_hooks import rewrite_codex_global_file

from .context import DistributionContext
from .contracts import PublishError, VerifiedArtifact
from .build import repository_lock
from .hashing import normalize_relative_path
from .locking import publish_lock, read_release_marker, write_release_marker
from .managed_json import ManagedJsonError, ManagedJsonPlan, plan_managed_json
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
    _reject_symlinked_ancestors(path, "Shared settings path must not contain symlinks")
    if path.exists() and (path.is_symlink() or not path.is_file()):
        raise PublishError(f"Shared settings path is not a regular file: {path}")
    return path


def _shared_plan(local: Path, home: Path, spec: SharedJsonSpec) -> PiSettingsPlan | ManagedJsonPlan:
    fragment = local / spec.fragment
    if fragment.is_symlink() or not fragment.is_file():
        raise PublishError(f"Shared settings fragment is missing or unsafe: {fragment}")
    path = _settings_path(home, spec)
    existing = path.read_bytes() if path.exists() else None
    try:
        if spec.schema == "pi-settings-v1":
            if len(spec.managed_keys) != 1:
                raise PublishError("Pi shared settings requires exactly one managed key")
            return plan_pi_settings(existing, fragment.read_bytes(), managed_key=spec.managed_keys[0])
        if spec.schema == "managed-json-v1":
            return plan_managed_json(
                existing,
                fragment.read_bytes(),
                managed_keys=spec.managed_keys,
            )
        raise PublishError(f"Unsupported shared settings schema: {spec.schema}")
    except (PiSettingsError, ManagedJsonError) as error:
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
    try:
        home_metadata = context.home.stat()
    except FileNotFoundError:
        pass
    except (OSError, ValueError) as error:
        raise PublishError("HOME root could not be verified") from error
    else:
        if not stat.S_ISDIR(home_metadata.st_mode):
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


def _windows_owner_controlled_directory(path: Path, label: str) -> None:
    """Verify Windows ACL control without applying POSIX UID/mode rules."""

    from ctypes import wintypes

    advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    get_named_security_info = advapi32.GetNamedSecurityInfoW
    get_named_security_info.argtypes = [
        ctypes.c_wchar_p,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    get_named_security_info.restype = wintypes.DWORD

    access_check = advapi32.AccessCheck
    access_check.argtypes = [
        ctypes.c_void_p,
        wintypes.HANDLE,
        wintypes.DWORD,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.POINTER(wintypes.DWORD),
        ctypes.POINTER(wintypes.DWORD),
        ctypes.POINTER(wintypes.BOOL),
    ]
    access_check.restype = wintypes.BOOL

    open_process_token = advapi32.OpenProcessToken
    open_process_token.argtypes = [
        wintypes.HANDLE,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.HANDLE),
    ]
    open_process_token.restype = wintypes.BOOL
    duplicate_token = advapi32.DuplicateToken
    duplicate_token.argtypes = [
        wintypes.HANDLE,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.HANDLE),
    ]
    duplicate_token.restype = wintypes.BOOL

    get_current_process = kernel32.GetCurrentProcess
    get_current_process.restype = wintypes.HANDLE
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = [wintypes.HANDLE]
    close_handle.restype = wintypes.BOOL
    local_free = kernel32.LocalFree
    local_free.argtypes = [ctypes.c_void_p]
    local_free.restype = ctypes.c_void_p

    class GenericMapping(ctypes.Structure):
        _fields_ = [
            ("generic_read", wintypes.DWORD),
            ("generic_write", wintypes.DWORD),
            ("generic_execute", wintypes.DWORD),
            ("generic_all", wintypes.DWORD),
        ]

    token = wintypes.HANDLE()
    if not open_process_token(get_current_process(), 0x000A, ctypes.byref(token)):
        raise OSError(ctypes.get_last_error(), "OpenProcessToken failed")
    impersonation_token = wintypes.HANDLE()
    descriptor = ctypes.c_void_p()
    try:
        if not duplicate_token(token, 2, ctypes.byref(impersonation_token)):
            raise OSError(ctypes.get_last_error(), "DuplicateToken failed")
        result = get_named_security_info(
            str(path),
            1,
            0x00000007,
            None,
            None,
            None,
            None,
            ctypes.byref(descriptor),
        )
        if result:
            raise OSError(result, "GetNamedSecurityInfoW failed")
        mapping = GenericMapping(
            0x00120089,
            0x00120116,
            0x001200A0,
            0x001F01FF,
        )
        privileges = ctypes.create_string_buffer(1024)
        privilege_length = wintypes.DWORD(ctypes.sizeof(privileges))
        granted = wintypes.DWORD()
        access_status = wintypes.BOOL()
        file_generic_write = 0x00120116
        delete = 0x00010000
        file_delete_child = 0x00000040
        desired_access = file_generic_write | delete | file_delete_child
        if not access_check(
            descriptor,
            impersonation_token,
            desired_access,
            ctypes.byref(mapping),
            privileges,
            ctypes.byref(privilege_length),
            ctypes.byref(granted),
            ctypes.byref(access_status),
        ):
            raise OSError(ctypes.get_last_error(), "AccessCheck failed")
        if not access_status.value:
            raise PublishError(f"{label} must be owner-controlled")
    finally:
        if descriptor.value:
            local_free(descriptor)
        if impersonation_token.value:
            close_handle(impersonation_token)
        if token.value:
            close_handle(token)


def _owner_controlled_directory(path: Path, label: str) -> None:
    if _is_reparse_point(path):
        raise PublishError(f"{label} must be a real directory")
    try:
        metadata = path.stat()
    except FileNotFoundError:
        return
    except (OSError, ValueError) as error:
        raise PublishError(f"{label} ownership could not be verified") from error
    if not stat.S_ISDIR(metadata.st_mode):
        raise PublishError(f"{label} must be a real directory")
    if os.name == "nt":
        try:
            _windows_owner_controlled_directory(path, label)
        except PublishError:
            raise
        except (AttributeError, OSError, TypeError, ValueError, ctypes.ArgumentError) as error:
            raise PublishError(f"{label} ownership could not be verified") from error
        return
    try:
        uid = os.getuid()
    except (AttributeError, OSError) as error:
        raise PublishError(f"{label} ownership could not be verified") from error
    if metadata.st_uid != uid or metadata.st_mode & 0o022:
        raise PublishError(f"{label} must be owner-controlled")


def _validate_controller_home(context: DistributionContext, destination: Path) -> None:
    expected = context.home / ".evcrate" / "bin"
    if destination != expected:
        raise PublishError("Shared advisor controller has an invalid HOME binding")
    _validate_home_ancestors(context, destination)
    _owner_controlled_directory(context.home, "HOME root")
    _owner_controlled_directory(destination.parent, "Advisor controller HOME root")
    _owner_controlled_directory(destination, "Advisor controller bin")


def _remove_path(path: Path) -> None:
    if not (path.exists() or path.is_symlink()):
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def _controller_files_equal(source: Path, destination: Path) -> bool:
    if destination.is_symlink() or not destination.is_dir():
        raise PublishError(f"Advisor controller HOME path is not a real directory: {destination}")
    if os.name != "nt" and destination.stat().st_mode & 0o777 != 0o700:
        return False
    entrypoint = destination / "evcrate-advisor"
    if os.name != "nt" and entrypoint.is_file() and entrypoint.stat().st_mode & 0o777 != 0o755:
        return False
    source_files = _files(source)
    destination_files: dict[str, bytes] = {}
    for path in sorted(destination.rglob("*"), key=lambda item: item.as_posix()):
        relative = path.relative_to(destination).as_posix()
        if path.is_symlink():
            raise PublishError(f"Advisor controller HOME contains a symlink: {relative}")
        if path.is_file():
            destination_files[relative] = path.read_bytes()
    return source_files == destination_files


def _controller_directory_snapshot(
    source: Path,
    destination: Path,
    transaction: Path,
    marker: dict[str, Any],
    context: DistributionContext,
    release_id: str,
) -> tuple[Path, Path | None]:
    """Atomically replace the complete controller directory on one filesystem."""

    _validate_controller_home(context, destination)
    if source.is_symlink() or not source.is_dir():
        raise PublishError(f"Advisor controller source is missing or unsafe: {source}")
    _files(source)
    parent = destination.parent
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(parent, 0o700)
    temporary = Path(tempfile.mkdtemp(prefix=".evcrate-controller-", dir=parent))
    backup: Path | None = None
    promoted = False
    try:
        shutil.copytree(source, temporary, symlinks=False, dirs_exist_ok=True)
        for path in sorted(temporary.rglob("*"), key=lambda item: item.as_posix()):
            if path.is_symlink():
                raise PublishError(f"Advisor controller staging contains a symlink: {path}")
            if path.is_dir():
                os.chmod(path, 0o700)
        entrypoint = temporary / "evcrate-advisor"
        if not entrypoint.is_file():
            raise PublishError("Advisor controller staging is missing its entrypoint")
        os.chmod(entrypoint, 0o755)
        os.chmod(temporary, 0o700)

        if destination.exists() or destination.is_symlink():
            if destination.is_symlink() or not destination.is_dir():
                raise PublishError(f"Advisor controller HOME path is not a real directory: {destination}")
            backup = parent / f".evcrate-bin-backup-{release_id}"
            if backup.exists() or backup.is_symlink():
                raise PublishError("Advisor controller backup path already exists")
        operation = {
            "kind": "directory",
            "root": ".evcrate/bin",
            "path": ".evcrate/bin",
            "backup": backup.name if backup is not None else None,
        }
        marker["operations"].append(operation)
        write_release_marker(context.state_dir, marker)
        if backup is not None:
            destination.replace(backup)
        temporary.replace(destination)
        promoted = True
        os.chmod(destination, 0o700)
        os.chmod(destination / "evcrate-advisor", 0o755)
        return destination, backup
    except (OSError, PublishError):
        try:
            if promoted:
                _remove_path(destination)
            if backup is not None and backup.exists() and not destination.exists():
                backup.replace(destination)
        except OSError:
            pass
        raise
    finally:
        if temporary.exists():
            _remove_path(temporary)


def _restore_controller_snapshot(destination: Path, backup: Path | None) -> None:
    _remove_path(destination)
    if backup is not None and backup.exists():
        backup.replace(destination)
def _policies(context: DistributionContext) -> list[tuple[str, Path, Path, set[str], bool]]:
    policies: list[tuple[str, Path, Path, set[str], int, bool]] = []
    for manifest in context.selected_manifests:
        policy = manifest.home_policy
        bindings = policy.get("bindings", {})
        preserve = policy.get("preserve_paths", {})
        order = policy.get("promotion_order", 100)
        reject_collisions = policy.get("reject_unmanaged_collisions", False)
        if (
            not isinstance(bindings, dict)
            or not isinstance(preserve, dict)
            or not isinstance(order, int)
            or type(reject_collisions) is not bool
        ):
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
            policies.append((
                safe_home_name,
                context.local_path(local_name),
                context.home / safe_home_name,
                preserved,
                order,
                reject_collisions,
            ))
    controller_local = context.local_path(".evcrate") / "bin"
    controller_home = context.home / ".evcrate" / "bin"
    policies.append((".evcrate/bin", controller_local, controller_home, set(), 5, False))
    ordered = sorted(policies, key=lambda value: (value[4], value[0]))
    for index, (name, _, home, _, order, _) in enumerate(ordered):
        _validate_home_ancestors(context, home)
        for prior_name, _, _, _, prior_order, _ in ordered[:index]:
            if name == prior_name:
                raise PublishError("HOME policies must not duplicate a binding")
            if name.startswith(prior_name + "/") and order <= prior_order:
                raise PublishError("Nested HOME binding must promote after its parent")
    return [(name, local, home, preserve, reject) for name, local, home, preserve, _, reject in ordered]

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
    for name, local, home, preserved, reject_collisions in _policies(context):
        if name == ".evcrate/bin":
            _validate_controller_home(context, home)
            if local.is_symlink() or not local.is_dir():
                raise PublishError(f"Advisor controller source is missing or unsafe: {local}")
            _files(local)
            if not home.exists():
                changes.append(PublishChange(name, name, "create"))
            elif not _controller_files_equal(local, home):
                changes.append(PublishChange(name, name, "update"))
            continue
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
            if destination.exists() and reject_collisions and relative not in prior_paths:
                changes.append(PublishChange(name, relative, "conflict"))
            elif not destination.exists():
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
    if _is_reparse_point(destination) or (destination.exists() and not destination.is_file()):
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
def _create_managed_file(destination: Path, content: bytes) -> None:
    """Create a newly managed file without replacing a concurrent user path."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    descriptor = os.open(destination, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            descriptor = -1
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        if descriptor != -1:
            os.close(descriptor)



def publish_local_artifacts(context: DistributionContext, artifact: VerifiedArtifact, *, dry_run: bool = False) -> list[PublishChange]:
    """Publish verified artifacts only; source generation is deliberately absent."""

    # Validate HOME bindings and state paths before creating any lock directory.
    _policies(context)
    _validate_state_ancestors(context)
    with repository_lock(context.repository), publish_lock(context.state_dir):
        shared_snapshots = {
            name: _home_snapshot(home)
            for name, _, home, _ in _shared_specs(context)
        }
        changes = publish_diff(context, artifact)
        if dry_run:
            return changes
        conflicts = [change for change in changes if change.action == "conflict"]
        if conflicts:
            if any(change.root == ".pi" for change in conflicts):
                raise PublishError("Pi settings conflict; remove npm:pi-code manually before publication")
            conflict = conflicts[0]
            raise PublishError(
                f"Unmanaged HOME collision for {conflict.root}/{conflict.path}; "
                "remove or preserve the conflicting path before publication"
            )
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
        directory_snapshots: list[tuple[Path, Path | None]] = []

        def apply(
            path: Path,
            content: bytes | None,
            name: str,
            relative: str,
            *,
            exclusive_create: bool = False,
        ) -> None:
            if exclusive_create and (path.exists() or path.is_symlink()):
                raise PublishError(f"Unmanaged HOME collision for {name}/{relative}; publication aborted")
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
            elif exclusive_create:
                try:
                    _create_managed_file(path, content)
                except FileExistsError as error:
                    raise PublishError(f"Unmanaged HOME collision for {name}/{relative}; publication aborted") from error
            else:
                _replace_managed_file(path, content)

        try:
            for name, local, home, preserved, reject_collisions in _policies(context):
                if name in shared_snapshots and _home_snapshot(home) != shared_snapshots[name]:
                    raise PublishError(f"HOME changed concurrently for {name}; publication aborted")
                if name == ".evcrate/bin":
                    _validate_controller_home(context, home)
                    source_files = _files(local)
                    changed = any(
                        change.root == name
                        and change.path == name
                        and change.action in {"create", "update"}
                        for change in changes
                    )
                    if changed:
                        destination, backup = _controller_directory_snapshot(
                            local,
                            home,
                            transaction,
                            marker,
                            context,
                            release_id,
                        )
                        directory_snapshots.append((destination, backup))
                    managed_paths[name] = sorted(source_files)
                    marker["roots"][name] = {"completed": True}
                    marker["managed_paths"] = managed_paths
                    write_release_marker(context.state_dir, marker)
                    continue
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
                    destination = _managed_destination(home, relative)
                    apply(
                        destination,
                        source[relative],
                        name,
                        relative,
                        exclusive_create=reject_collisions and relative not in prior,
                    )
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
                            raise PublishError(f"HOME changed concurrently for {name}; publication aborted")
                        apply(settings, plan.result, name, spec.destination)
                managed_paths[name] = managed
                marker["roots"][name] = {"completed": True}
                marker["managed_paths"] = managed_paths
                write_release_marker(context.state_dir, marker)
            marker["status"] = "complete"
            write_release_marker(context.state_dir, marker)
            for _, backup in directory_snapshots:
                if backup is not None:
                    _remove_path(backup)
            shutil.rmtree(transaction, ignore_errors=True)
            return changes
        except (OSError, PublishError) as error:
            for destination, backup in reversed(directory_snapshots):
                _restore_controller_snapshot(destination, backup)
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
