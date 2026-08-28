#!/usr/bin/env python3
"""Capture deterministic Phase 1 target and manifest evidence."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from distribution.hashing import hash_file
from distribution.manifest import load_target_manifest, load_target_registry
from tests.phase1_baseline_support import (
    authorized_hashes as _authorized_hashes,
    commit as _commit,
    output as _output,
)
from tests.phase1_baseline_expectations import (
    EXPECTED_BUILD_MANIFEST,
    EXPECTED_MANIFESTS,
    EXPECTED_REGISTRY,
    EXPECTED_TARGET_OUTPUTS,
    EXPECTED_TARGETS,
)


SCHEMA = "evcrate-phase1-baseline/v1"


def _json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def capture(repository: Path, baseline_commit: str | None) -> dict[str, Any]:
    source_root = repository / ".evcrate" / "source"
    registry_path = repository / ".evcrate" / "targets" / "manifest.json"
    build_path = repository / ".evcrate" / "build-manifest.json"
    registry_data = _json(registry_path)
    if registry_data != EXPECTED_REGISTRY:
        raise ValueError("Target registry is not the accepted Phase 1 registry")
    build_data = _json(build_path)
    build_digest = hash_file(build_path)
    if build_digest != EXPECTED_BUILD_MANIFEST:
        raise ValueError("Build manifest is not the accepted Phase 1 manifest")
    registry = load_target_registry(registry_path)
    if set(registry.targets) != EXPECTED_TARGETS:
        raise ValueError("Target registry does not contain every supported target")
    manifests = tuple(load_target_manifest(path) for path in registry.targets.values())
    output_hashes = _authorized_hashes(
        repository, source_root, manifests, registry, build_data
    )
    expected_outputs = {
        root for manifest in manifests for root in manifest.output_roots
    }
    expected_outputs.update(
        document for manifest in manifests for document in manifest.project_docs
    )
    if set(output_hashes) != expected_outputs:
        raise ValueError("Build output authorization does not match target outputs")

    targets: dict[str, Any] = {}
    for name, manifest_path in registry.targets.items():
        manifest = load_target_manifest(manifest_path)
        manifest_data = _json(manifest_path)
        manifest_key = f"{manifest.name}/manifest.json"
        if manifest.name != name:
            raise ValueError(f"Target registry name mismatch: {name}")
        manifest_digest = hash_file(manifest_path)
        if manifest_digest != EXPECTED_MANIFESTS[name]:
            raise ValueError(f"Target manifest is not the accepted Phase 1 manifest: {name}")
        if manifest_digest != build_data["source_hashes"][manifest_key]:
            raise ValueError(f"Target manifest hash drift: {manifest.name}")
        if set(manifest.output_roots) != set(EXPECTED_TARGET_OUTPUTS[name]):
            raise ValueError(f"Target output ownership drift: {manifest.name}")
        outputs = {
            root: _output(source_root / root, output_hashes[root])
            for root in manifest.output_roots
        }
        documents = {}
        for document in manifest.project_docs:
            digest = hash_file(source_root / document)
            if digest != output_hashes[document]:
                raise ValueError(f"Project document hash drift: {document}")
            documents[document] = {"sha256": digest}
        targets[name] = {
            "manifest_sha256": manifest_digest,
            "manifest": manifest_data,
            "outputs": outputs,
            "project_docs": documents,
        }

    selected_build_fields = {
        key: build_data[key]
        for key in (
            "schema_version", "source_hashes", "adapter_hashes", "runtime_hashes",
            "output_hashes", "owners", "home_policy", "validation",
        )
    }
    selected_build_fields["manifest_sha256"] = build_digest
    return {
        "schema": SCHEMA,
        "baseline_commit": _commit(repository, baseline_commit),
        "target_registry": registry_data,
        "build_manifest": selected_build_fields,
        "targets": targets,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--commit")
    args = parser.parse_args()
    evidence = capture(args.repository.resolve(), args.commit)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
