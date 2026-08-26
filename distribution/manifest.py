"""Validated source manifests and deterministic build-manifest rendering."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from .advisor_runtime import (
    ADVISOR_HOSTS,
    ADVISOR_RUNTIME_AUTHORIZATION_SOURCE,
    ADVISOR_RUNTIME_FILES,
    ADVISOR_RUNTIME_OUTPUT_PATHS,
    NATIVE_CAPABILITIES_FILE,
)
from .contracts import BuildError
from .hashing import HashingError, canonical_json_bytes, contained_path, hash_bytes, hash_file, normalize_relative_path, tree_hash
from .runtime import RuntimeSpec, load_runtime_spec


BUILD_MANIFEST_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class PatchSpec:
    source: str
    destination: str
    keys: tuple[str, ...]


@dataclass(frozen=True)
class SharedJsonSpec:
    schema: str
    destination: str
    fragment: str
    managed_key: str


@dataclass(frozen=True)
class AdvisorRuntimeSpec:
    host: str
    source_root: str
    output_root: str
    native_capabilities: str
    files: tuple[str, ...]


@dataclass(frozen=True)
class TargetManifest:
    name: str
    adapter: str | None
    output_roots: tuple[str, ...]
    owned_paths: tuple[str, ...]
    patches: tuple[PatchSpec, ...]
    project_docs: tuple[str, ...]
    home_policy: Mapping[str, Any]
    source_root: Path
    overlay_root: Path | None = None
    runtime: RuntimeSpec | None = None
    adapter_sources: tuple[str, ...] = ()
    shared_json: SharedJsonSpec | None = None
    advisor_runtime: AdvisorRuntimeSpec | None = None


@dataclass(frozen=True)
class TargetRegistry:
    targets: Mapping[str, Path]


def _expect_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BuildError(f"{label} must be a JSON object")
    return value


def _paths(value: Any, label: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value or not all(isinstance(item, str) for item in value):
        raise BuildError(f"{label} must be a non-empty list of paths")
    try:
        paths = tuple(normalize_relative_path(item) for item in value)
    except HashingError as error:
        raise BuildError(str(error)) from error
    if len(set(paths)) != len(paths):
        raise BuildError(f"{label} contains duplicate paths")
    return paths


def _load_json(path: Path) -> dict[str, Any]:
    try:
        if path.is_symlink():
            raise BuildError(f"Manifest cannot be a symlink: {path}")
        return _expect_object(json.loads(path.read_text(encoding="utf-8")), str(path))
    except (OSError, json.JSONDecodeError) as error:
        raise BuildError(f"Could not read manifest {path}: {error}") from error


def _load_advisor_runtime(
    value: Any,
    name: str,
    roots: tuple[str, ...],
    repository: Path,
) -> AdvisorRuntimeSpec | None:
    if value is None:
        return None
    runtime = _expect_object(value, "advisor_runtime")
    expected_keys = {"host", "source_root", "output_root", "native_capabilities", "files"}
    if set(runtime) != expected_keys:
        raise BuildError("advisor_runtime requires host, source_root, output_root, native_capabilities, and files")
    host = runtime["host"]
    if host not in ADVISOR_HOSTS or host != name:
        raise BuildError(f"advisor_runtime host must match target name: {name}")
    if not all(isinstance(runtime[key], str) for key in ("source_root", "output_root", "native_capabilities")):
        raise BuildError("advisor_runtime paths must be strings")
    try:
        source_root = normalize_relative_path(runtime["source_root"])
        output_root = normalize_relative_path(runtime["output_root"])
        native_capabilities = normalize_relative_path(runtime["native_capabilities"])
    except HashingError as error:
        raise BuildError(f"Invalid advisor_runtime path: {error}") from error
    files_value = runtime["files"]
    if not isinstance(files_value, list) or not all(isinstance(item, str) for item in files_value):
        raise BuildError("advisor_runtime.files must be a list of paths")
    try:
        files = tuple(normalize_relative_path(item) for item in files_value)
    except HashingError as error:
        raise BuildError(f"Invalid advisor_runtime file: {error}") from error
    if files != ADVISOR_RUNTIME_FILES:
        raise BuildError("advisor_runtime.files must match the canonical production closure")
    if output_root != ADVISOR_RUNTIME_OUTPUT_PATHS[host]:
        raise BuildError(f"advisor_runtime output path is not owned by {name}")
    if native_capabilities != NATIVE_CAPABILITIES_FILE:
        raise BuildError("advisor_runtime.native_capabilities must use the bundled capability document")
    source = contained_path(repository, source_root)
    if source.exists():
        if source.is_symlink() or not source.is_dir():
            raise BuildError("advisor_runtime source_root must be a regular directory")
        for relative in files:
            path = contained_path(source, relative, must_exist=True)
            if path.is_symlink() or not path.is_file():
                raise BuildError(f"advisor_runtime source file is missing or unsafe: {relative}")
    return AdvisorRuntimeSpec(host, source_root, output_root, native_capabilities, files)


def load_target_manifest(path: Path) -> TargetManifest:
    """Load one target contract; reject unowned outputs and unsafe source paths."""

    data = _load_json(path)
    if data.get("schema_version") != BUILD_MANIFEST_SCHEMA_VERSION:
        raise BuildError(f"Unsupported target manifest schema: {data.get('schema_version')!r}")
    name = data.get("name")
    if not isinstance(name, str) or not name or "/" in name or "\\" in name:
        raise BuildError("Target manifest name must be a simple non-empty string")
    adapter = data.get("adapter")
    if adapter is not None:
        if not isinstance(adapter, str):
            raise BuildError("Target adapter must be a script path or null")
        try:
            adapter = normalize_relative_path(adapter)
        except HashingError as error:
            raise BuildError(str(error)) from error
    raw_adapter_sources = data.get("adapter_sources", [])
    if not isinstance(raw_adapter_sources, list) or not all(isinstance(item, str) for item in raw_adapter_sources):
        raise BuildError("adapter_sources must be a list of paths")
    try:
        adapter_sources = tuple(normalize_relative_path(item) for item in raw_adapter_sources)
    except HashingError as error:
        raise BuildError(str(error)) from error
    if len(set(adapter_sources)) != len(adapter_sources):
        raise BuildError("adapter_sources contains duplicate paths")
    if adapter is not None and adapter in adapter_sources:
        raise BuildError("adapter_sources must not repeat the adapter entrypoint")
    root_values = data.get("output_roots")
    if root_values is None:
        primary_root = data.get("output_root")
        additional_roots = data.get("additional_roots", [])
        if not isinstance(primary_root, str) or not isinstance(additional_roots, list):
            raise BuildError("Target manifest requires output_root or output_roots")
        root_values = [primary_root, *additional_roots]
    roots = _paths(root_values, "output_roots")
    owned = _paths(data.get("owned_paths", []), "owned_paths") if data.get("owned_paths") else ()
    patches: list[PatchSpec] = []
    raw_patches = data.get("patches", [])
    if not isinstance(raw_patches, list):
        raise BuildError("patches must be a list")
    for raw in raw_patches:
        patch = _expect_object(raw, "patch")
        source, destination, keys = patch.get("source"), patch.get("destination"), patch.get("keys")
        if not isinstance(source, str) or not isinstance(destination, str) or not isinstance(keys, list):
            raise BuildError("Each patch requires source, destination, and keys")
        try:
            safe_source = normalize_relative_path(source)
            safe_destination = normalize_relative_path(destination)
        except HashingError as error:
            raise BuildError(str(error)) from error
        if not safe_source.startswith("patches/"):
            raise BuildError(f"Patch source must be under patches/: {safe_source}")
        if not all(isinstance(key, str) and key and all(part for part in key.split(".")) for key in keys):
            raise BuildError("Patch keys must be exact non-empty dotted paths")
        if len(set(keys)) != len(keys):
            raise BuildError("Patch keys must not contain duplicates")
        patches.append(PatchSpec(safe_source, safe_destination, tuple(keys)))
    destinations = [patch.destination for patch in patches]
    if len(set(destinations)) != len(destinations):
        raise BuildError("Only one patch declaration may target each destination")
    policy = data.get("home_policy")
    if policy is None:
        policy = {
            "home_roots": data.get("home_roots", []),
            "preservation_policy": data.get("preservation_policy", "managed"),
            "project_docs": data.get("project_docs", []),
        }
    if not isinstance(policy, dict):
        raise BuildError("home_policy must be an object")
    docs_value = data.get("project_docs", policy.get("project_docs", []))
    if not isinstance(docs_value, list) or not all(isinstance(document, str) for document in docs_value):
        raise BuildError("project_docs must be a list of filenames")
    try:
        docs = tuple(normalize_relative_path(document) for document in docs_value)
    except HashingError as error:
        raise BuildError(str(error)) from error
    if any("/" in document for document in docs) or len(set(docs)) != len(docs):
        raise BuildError("project_docs must be unique root-level filenames")
    source_root = path.parent.resolve()
    repository = path.parents[3] if path.parent.parent.name == "targets" else source_root
    for relative in adapter_sources:
        helper = contained_path(repository, relative, must_exist=True)
        if helper.is_symlink() or not helper.is_file():
            raise BuildError(f"Adapter source must be a regular file: {relative}")
    if adapter is not None:
        entrypoint = contained_path(repository, adapter, must_exist=True)
        if entrypoint.is_symlink() or not entrypoint.is_file():
            raise BuildError(f"Target adapter must be a regular file: {adapter}")
    for owned_path in owned:
        if not owned_path.startswith("files/"):
            raise BuildError(f"Owned source must be under files/: {owned_path}")
        owned_source = contained_path(source_root, owned_path, must_exist=True)
        if owned_source.is_symlink():
            raise BuildError(f"Owned source cannot be a symlink: {owned_path}")
    for patch in patches:
        patch_source = contained_path(source_root, patch.source, must_exist=True)
        if patch_source.is_symlink():
            raise BuildError(f"Patch source cannot be a symlink: {patch.source}")
        if not any(patch.destination.startswith(root + "/") for root in roots):
            raise BuildError(f"Patch destination is outside declared output roots: {patch.destination}")
    overlay_root: Path | None = None
    overlay_value = data.get("overlay_root")
    if overlay_value is not None:
        if not isinstance(overlay_value, str):
            raise BuildError("overlay_root must be a path string")
        try:
            safe_overlay = normalize_relative_path(overlay_value)
        except HashingError as error:
            raise BuildError(str(error)) from error
        overlay_root = contained_path(repository, safe_overlay)
    raw_shared = data.get("shared_json")
    shared_json: SharedJsonSpec | None = None
    if raw_shared is not None:
        shared = _expect_object(raw_shared, "shared_json")
        schema, destination = shared.get("schema"), shared.get("destination")
        fragment, managed_key = shared.get("fragment"), shared.get("managed_key")
        if schema != "pi-settings-v1":
            raise BuildError("shared_json schema must be pi-settings-v1")
        if not all(isinstance(value, str) for value in (destination, fragment, managed_key)):
            raise BuildError("shared_json requires destination, fragment, and managed_key strings")
        try:
            destination = normalize_relative_path(destination)
            fragment = normalize_relative_path(fragment)
        except HashingError as error:
            raise BuildError(str(error)) from error
        if destination == fragment:
            raise BuildError("shared_json destination and fragment must differ")
        if not managed_key or any(part == "" for part in managed_key.split(".")):
            raise BuildError("shared_json managed_key must be a non-empty dotted path")
        shared_json = SharedJsonSpec(schema, destination, fragment, managed_key)
    advisor_runtime = _load_advisor_runtime(data.get("advisor_runtime"), name, roots, repository)
    if advisor_runtime is not None and ADVISOR_RUNTIME_AUTHORIZATION_SOURCE not in adapter_sources:
        raise BuildError(
            f"advisor_runtime targets must authorize {ADVISOR_RUNTIME_AUTHORIZATION_SOURCE}"
        )
    return TargetManifest(
        name, adapter, roots, owned, tuple(patches), docs, policy, source_root,
        overlay_root, load_runtime_spec(data.get("runtime")), adapter_sources, shared_json,
        advisor_runtime,
    )


def load_target_registry(path: Path) -> TargetRegistry:
    """Load a target-name to manifest-path registry beneath ``.evcrate/targets``."""

    data = _load_json(path)
    if data.get("schema_version") != BUILD_MANIFEST_SCHEMA_VERSION:
        raise BuildError(f"Unsupported target registry schema: {data.get('schema_version')!r}")
    targets = data.get("targets")
    if not isinstance(targets, dict) or not targets:
        raise BuildError("Target registry requires a non-empty targets object")
    resolved: dict[str, Path] = {}
    for name, relative in targets.items():
        if (
            not isinstance(name, str)
            or not name
            or "/" in name
            or "\\" in name
            or not isinstance(relative, str)
        ):
            raise BuildError("Target registry names must be simple strings and paths must be strings")
        try:
            candidate = contained_path(path.parent, relative, must_exist=True)
        except HashingError as error:
            raise BuildError(str(error)) from error
        if candidate.name != "manifest.json":
            raise BuildError(f"Target registry entry must name a manifest.json file: {relative}")
        resolved[name] = candidate
    return TargetRegistry(dict(sorted(resolved.items())))


def adapter_hashes(manifests: tuple[TargetManifest, ...], repository: Path) -> dict[str, str]:
    """Hash adapter entrypoints and declared helper sources symmetrically."""

    hashes: dict[str, str] = {}
    for manifest in manifests:
        paths = tuple(item for item in (manifest.adapter, *manifest.adapter_sources) if item is not None)
        for relative in paths:
            path = contained_path(repository, relative, must_exist=True)
            hashes[relative] = hash_file(path)
    return dict(sorted(hashes.items()))


def advisor_runtime_hashes(manifests: tuple[TargetManifest, ...], repository: Path) -> dict[str, str]:
    """Hash every declared production runtime input for the selected hosts."""

    hashes: dict[str, str] = {}
    for manifest in manifests:
        if manifest.advisor_runtime is None:
            continue
        runtime = manifest.advisor_runtime
        source = contained_path(repository, runtime.source_root, must_exist=True)
        for relative in runtime.files:
            path = contained_path(source, relative, must_exist=True)
            hashes[f"{manifest.name}/{relative}"] = hash_file(path)
    return dict(sorted(hashes.items()))


def source_hashes(manifests: tuple[TargetManifest, ...]) -> dict[str, str]:
    """Hash declared overlay sources only; never include environment values."""

    hashes: dict[str, str] = {}
    for manifest in manifests:
        hashes[f"{manifest.name}/manifest.json"] = hash_file(manifest.source_root / "manifest.json")
        if manifest.overlay_root is not None:
            key = f"{manifest.name}/{manifest.overlay_root.name}"
            hashes[key] = tree_hash(manifest.overlay_root) if manifest.overlay_root.exists() else hash_bytes(b"")
        for relative in manifest.owned_paths:
            path = contained_path(manifest.source_root, relative, must_exist=True)
            hashes[f"{manifest.name}/{relative}"] = tree_hash(path) if path.is_dir() else hash_file(path)
        for patch in manifest.patches:
            path = contained_path(manifest.source_root, patch.source, must_exist=True)
            hashes[f"{manifest.name}/{patch.source}"] = hash_file(path)
    return dict(sorted(hashes.items()))


def build_manifest_bytes(*, source_hashes: Mapping[str, str], adapter_hashes: Mapping[str, str], owners: Mapping[str, str], output_roots: Mapping[str, Path], home_policy: Mapping[str, Any], validation: Mapping[str, Any], runtime_hashes: Mapping[str, str] | None = None) -> bytes:
    """Return canonical, timestamp-free authorization bytes for a completed build."""

    outputs = {
        name: tree_hash(path) if path.is_dir() else hash_file(path)
        for name, path in sorted(output_roots.items())
    }
    payload = {
        "schema_version": BUILD_MANIFEST_SCHEMA_VERSION,
        "source_hashes": dict(sorted(source_hashes.items())),
        "adapter_hashes": dict(sorted(adapter_hashes.items())),
        "owners": dict(sorted(owners.items())),
        "output_hashes": outputs,
        "validation": dict(sorted(validation.items())),
        "home_policy": home_policy,
    }
    if runtime_hashes is not None:
        payload["runtime_hashes"] = dict(sorted(runtime_hashes.items()))
    return canonical_json_bytes(payload)
