"""Validated target manifests and deterministic build-manifest rendering."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from .advisor_controller import ADVISOR_CONTROLLER_FILES, ADVISOR_CONTROLLER_ROOT, validate_advisor_controller_source
from .contracts import BuildError
from .hashing import HashingError, canonical_json_bytes, contained_path, hash_bytes, hash_file, normalize_relative_path, tree_hash

BUILD_MANIFEST_SCHEMA_VERSION = 2

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
    managed_keys: tuple[str, ...]
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
    adapter_sources: tuple[str, ...] = ()
    shared_json: SharedJsonSpec | None = None

@dataclass(frozen=True)
class TargetRegistry:
    targets: Mapping[str, Path]

def _expect_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict): raise BuildError(f"{label} must be a JSON object")
    return value

def _paths(value: Any, label: str, allow_empty: bool = False) -> tuple[str, ...]:
    if not isinstance(value, list) or (not allow_empty and not value) or not all(isinstance(item, str) for item in value):
        raise BuildError(f"{label} must be a {'possibly empty ' if allow_empty else 'non-empty '}list of paths")
    try: paths = tuple(normalize_relative_path(item) for item in value)
    except HashingError as error: raise BuildError(str(error)) from error
    if len(set(paths)) != len(paths): raise BuildError(f"{label} contains duplicate paths")
    return paths

def _load_json(path: Path) -> dict[str, Any]:
    try:
        if path.is_symlink(): raise BuildError(f"Manifest cannot be a symlink: {path}")
        return _expect_object(json.loads(path.read_text(encoding="utf-8")), str(path))
    except (OSError, json.JSONDecodeError) as error:
        raise BuildError(f"Could not read manifest {path}: {error}") from error

def _adapter_sources(data: dict[str, Any], repository: Path) -> tuple[str, ...]:
    values = data.get("adapter_sources", [])
    if not isinstance(values, list) or not all(isinstance(item, str) for item in values):
        raise BuildError("adapter_sources must be a list of paths")
    try: sources = tuple(normalize_relative_path(item) for item in values)
    except HashingError as error: raise BuildError(str(error)) from error
    if len(set(sources)) != len(sources): raise BuildError("adapter_sources contains duplicate paths")
    for relative in sources:
        helper = contained_path(repository, relative, must_exist=True)
        if helper.is_symlink() or not helper.is_file(): raise BuildError(f"Adapter source must be a regular file: {relative}")
    return sources

def load_target_manifest(path: Path) -> TargetManifest:
    data = _load_json(path)
    if data.get("schema_version") != BUILD_MANIFEST_SCHEMA_VERSION:
        raise BuildError(f"Unsupported target manifest schema: {data.get('schema_version')!r}")
    if "advisor_runtime" in data or "runtime" in data:
        raise BuildError("Per-harness advisor runtime is obsolete; use .evcrate/bin")
    name = data.get("name")
    if not isinstance(name, str) or not name or "/" in name or "\\" in name:
        raise BuildError("Target manifest name must be a simple non-empty string")
    adapter = data.get("adapter")
    if adapter is not None:
        if not isinstance(adapter, str): raise BuildError("Target adapter must be a script path or null")
        try: adapter = normalize_relative_path(adapter)
        except HashingError as error: raise BuildError(str(error)) from error
    root_values = data.get("output_roots")
    if root_values is None:
        primary, additional = data.get("output_root"), data.get("additional_roots", [])
        if not isinstance(primary, str) or not isinstance(additional, list): raise BuildError("Target manifest requires output_root or output_roots")
        root_values = [primary, *additional]
    roots = _paths(root_values, "output_roots")
    owned = _paths(data.get("owned_paths", []), "owned_paths", allow_empty=True)
    patches: list[PatchSpec] = []
    raw_patches = data.get("patches", [])
    if not isinstance(raw_patches, list): raise BuildError("patches must be a list")
    for raw in raw_patches:
        patch = _expect_object(raw, "patch")
        source, destination, keys = patch.get("source"), patch.get("destination"), patch.get("keys")
        if not isinstance(source, str) or not isinstance(destination, str) or not isinstance(keys, list): raise BuildError("Each patch requires source, destination, and keys")
        try: source, destination = normalize_relative_path(source), normalize_relative_path(destination)
        except HashingError as error: raise BuildError(str(error)) from error
        if not source.startswith("patches/") or not all(isinstance(key, str) and key and all(part for part in key.split(".")) for key in keys):
            raise BuildError("Patch source and keys are invalid")
        if len(set(keys)) != len(keys): raise BuildError("Patch keys must not contain duplicates")
        patches.append(PatchSpec(source, destination, tuple(keys)))
    if len({patch.destination for patch in patches}) != len(patches): raise BuildError("Only one patch declaration may target each destination")
    policy = data.get("home_policy")
    if policy is None:
        policy = {
            "home_roots": data.get("home_roots", []),
            "preservation_policy": data.get("preservation_policy", "managed"),
            "project_docs": data.get("project_docs", []),
        }
    if not isinstance(policy, dict): raise BuildError("home_policy must be an object")
    if "reject_unmanaged_collisions" in policy and type(policy["reject_unmanaged_collisions"]) is not bool:
        raise BuildError("reject_unmanaged_collisions must be a boolean")
    docs_value = data.get("project_docs", policy.get("project_docs", []))
    if not isinstance(docs_value, list) or not all(isinstance(document, str) for document in docs_value): raise BuildError("project_docs must be a list of filenames")
    try: docs = tuple(normalize_relative_path(document) for document in docs_value)
    except HashingError as error: raise BuildError(str(error)) from error
    if any("/" in document for document in docs) or len(set(docs)) != len(docs): raise BuildError("project_docs must be unique root-level filenames")
    source_root = path.parent.resolve()
    repository = path.parents[3] if path.parent.parent.name == "targets" else source_root
    adapter_sources = _adapter_sources(data, repository)
    if adapter is not None:
        entrypoint = contained_path(repository, adapter, must_exist=True)
        if entrypoint.is_symlink() or not entrypoint.is_file(): raise BuildError(f"Target adapter must be a regular file: {adapter}")
    for owned_path in owned:
        if not owned_path.startswith("files/"): raise BuildError(f"Owned source must be under files/: {owned_path}")
        owned_source = contained_path(source_root, owned_path, must_exist=True)
        if owned_source.is_symlink(): raise BuildError(f"Owned source cannot be a symlink: {owned_path}")
    for patch in patches:
        patch_source = contained_path(source_root, patch.source, must_exist=True)
        if patch_source.is_symlink(): raise BuildError(f"Patch source cannot be a symlink: {patch.source}")
        if not any(patch.destination.startswith(root + "/") for root in roots): raise BuildError(f"Patch destination is outside declared output roots: {patch.destination}")
    overlay_root = None
    if data.get("overlay_root") is not None:
        if not isinstance(data["overlay_root"], str): raise BuildError("overlay_root must be a path string")
        try: overlay_root = contained_path(repository, normalize_relative_path(data["overlay_root"]))
        except HashingError as error: raise BuildError(str(error)) from error
    shared_json = None
    raw_shared = data.get("shared_json")
    if raw_shared is not None:
        shared = _expect_object(raw_shared, "shared_json")
        schema, destination, fragment, managed_keys = (shared.get(key) for key in ("schema", "destination", "fragment", "managed_keys"))
        if schema not in {"pi-settings-v1", "managed-json-v1"} or not isinstance(destination, str) or not isinstance(fragment, str):
            raise BuildError("shared_json is invalid")
        if not isinstance(managed_keys, list) or not managed_keys or not all(isinstance(key, str) and key for key in managed_keys):
            raise BuildError("shared_json managed_keys must be a non-empty list")
        if len(set(managed_keys)) != len(managed_keys):
            raise BuildError("shared_json managed_keys must not contain duplicates")
        if schema == "managed-json-v1" and any("." in key for key in managed_keys):
            raise BuildError("managed-json-v1 keys must be top-level")
        try: destination, fragment = normalize_relative_path(destination), normalize_relative_path(fragment)
        except HashingError as error: raise BuildError(str(error)) from error
        if destination == fragment or any(not part for key in managed_keys for part in key.split(".")):
            raise BuildError("shared_json paths are invalid")
        shared_json = SharedJsonSpec(schema, destination, fragment, tuple(managed_keys))
    return TargetManifest(name, adapter, roots, owned, tuple(patches), docs, policy, source_root, overlay_root, adapter_sources, shared_json)

def load_target_registry(path: Path) -> TargetRegistry:
    data = _load_json(path)
    if data.get("schema_version") != BUILD_MANIFEST_SCHEMA_VERSION: raise BuildError(f"Unsupported target registry schema: {data.get('schema_version')!r}")
    targets = data.get("targets")
    if not isinstance(targets, dict) or not targets: raise BuildError("Target registry requires a non-empty targets object")
    resolved: dict[str, Path] = {}
    for name, relative in targets.items():
        if not isinstance(name, str) or not name or "/" in name or "\\" in name or not isinstance(relative, str): raise BuildError("Target registry names and paths are invalid")
        try: candidate = contained_path(path.parent, relative, must_exist=True)
        except HashingError as error: raise BuildError(str(error)) from error
        if candidate.name != "manifest.json": raise BuildError(f"Target registry entry must name a manifest.json file: {relative}")
        resolved[name] = candidate
    return TargetRegistry(dict(sorted(resolved.items())))

def adapter_hashes(manifests: tuple[TargetManifest, ...], repository: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for manifest in manifests:
        for relative in tuple(item for item in (manifest.adapter, *manifest.adapter_sources) if item is not None):
            values[relative] = hash_file(contained_path(repository, relative, must_exist=True))
    return dict(sorted(values.items()))

def controller_hashes(repository: Path) -> dict[str, str]:
    source = contained_path(repository, ADVISOR_CONTROLLER_ROOT.as_posix(), must_exist=True)
    validate_advisor_controller_source(source)
    return {f".evcrate/bin/{relative}": hash_file(source / relative) for relative in ADVISOR_CONTROLLER_FILES}

def source_hashes(manifests: tuple[TargetManifest, ...]) -> dict[str, str]:
    values: dict[str, str] = {}
    for manifest in manifests:
        values[f"{manifest.name}/manifest.json"] = hash_file(manifest.source_root / "manifest.json")
        if manifest.overlay_root is not None:
            values[f"{manifest.name}/{manifest.overlay_root.name}"] = tree_hash(manifest.overlay_root) if manifest.overlay_root.exists() else hash_bytes(b"")
        for relative in manifest.owned_paths:
            path = contained_path(manifest.source_root, relative, must_exist=True)
            values[f"{manifest.name}/{relative}"] = tree_hash(path) if path.is_dir() else hash_file(path)
        for patch in manifest.patches:
            values[f"{manifest.name}/{patch.source}"] = hash_file(contained_path(manifest.source_root, patch.source, must_exist=True))
    return dict(sorted(values.items()))

def build_manifest_bytes(*, source_hashes: Mapping[str, str], adapter_hashes: Mapping[str, str], controller_hashes: Mapping[str, str], owners: Mapping[str, str], output_roots: Mapping[str, Path], home_policy: Mapping[str, Any], validation: Mapping[str, Any]) -> bytes:
    outputs = {name: tree_hash(path) if path.is_dir() else hash_file(path) for name, path in sorted(output_roots.items())}
    return canonical_json_bytes({
        "schema_version": BUILD_MANIFEST_SCHEMA_VERSION,
        "source_hashes": dict(sorted(source_hashes.items())),
        "adapter_hashes": dict(sorted(adapter_hashes.items())),
        "controller_hashes": dict(sorted(controller_hashes.items())),
        "owners": dict(sorted(owners.items())),
        "output_hashes": outputs,
        "validation": dict(sorted(validation.items())),
        "home_policy": home_policy,
    })
