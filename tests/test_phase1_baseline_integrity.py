"""Independent target, manifest, and inventory checks for Phase 1."""

from __future__ import annotations

import json
import hashlib
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from distribution.hashing import hash_file, is_ignored_artifact
from distribution.manifest import load_target_manifest
from tests.phase1_baseline_expectations import (
    EXPECTED_BUILD_MANIFEST,
    EXPECTED_DOCUMENTS,
    EXPECTED_MANIFESTS,
    EXPECTED_OUTPUTS,
    EXPECTED_REGISTRY,
    EXPECTED_TARGET_OUTPUTS,
    EXPECTED_TARGETS,
)
from tests.phase1_baseline_support import (
    expected_validation,
)
from tests.phase1_baseline_oracle import (
    authoritative_targets,
    file_list_hash,
    safe_relative,
    source_authorization,
)


FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "phase-1-baseline"
REPOSITORY = Path(__file__).resolve().parents[1]


def _load(name: str) -> dict:
    value = json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssertionError(f"Fixture must contain an object: {name}")
    return value


def _independent_tree(root: Path) -> tuple[str, list[str]]:
    records: list[bytes] = []
    files: list[str] = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root).as_posix()
        if is_ignored_artifact(relative):
            continue
        if path.is_symlink():
            raise AssertionError(f"Generated tree contains a symlink: {relative}")
        if path.is_dir():
            records.append(f"d\0{relative}\n".encode())
        elif path.is_file():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            records.append(f"f\0{relative}\0{digest}\n".encode())
            files.append(relative)
        else:
            raise AssertionError(f"Generated tree contains an unsupported path: {relative}")
    return hashlib.sha256(b"".join(records)).hexdigest(), files


def _generated_authority(repository: Path, destination: Path) -> Path:
    checkout = destination / "generated"
    shutil.copytree(
        repository,
        checkout,
        ignore=shutil.ignore_patterns(".git", "node_modules", "__pycache__", ".coverage", "*.pyc", "*.pyo"),
    )
    for command in (("python3", "distribute.py", "--build"), ("python3", "distribute.py", "--check")):
        subprocess.run(command, cwd=checkout, check=True, capture_output=True, text=True)
    return checkout


class Phase1BaselineIntegrityTest(unittest.TestCase):
    def _assert_inventory(self, baseline: dict) -> None:
        owners = {}
        for target, root_names in EXPECTED_TARGET_OUTPUTS.items():
            outputs = baseline["targets"][target]["outputs"]
            self.assertEqual(set(outputs), set(root_names), target)
            for root in root_names:
                self.assertNotIn(root, owners)
                owners[root] = target
        self.assertEqual(set(owners), set(EXPECTED_OUTPUTS))
        for root, (count, digest, file_digest) in EXPECTED_OUTPUTS.items():
            output = baseline["targets"][owners[root]]["outputs"][root]
            self.assertEqual(set(output), {"tree_hash", "file_count", "files"}, root)
            self.assertEqual(output["file_count"], count, root)
            self.assertEqual(output["tree_hash"], digest, root)
            self.assertEqual(output["file_count"], len(output["files"]), root)
            self.assertEqual(output["files"], sorted(set(output["files"])), root)
            self.assertEqual(file_list_hash(output["files"]), file_digest, root)

    def test_baseline_matches_independent_authorization_and_inventory(self) -> None:
        baseline = _load("baseline.json")
        self.assertEqual(set(baseline), {"schema", "baseline_commit", "target_registry", "build_manifest", "targets"})
        self.assertEqual(baseline["schema"], "evcrate-phase1-baseline/v1")
        self.assertRegex(baseline["baseline_commit"], r"^[0-9a-f]{40}$")
        self.assertEqual(set(baseline["targets"]), EXPECTED_TARGETS)
        registry_data, registry, manifests = authoritative_targets(REPOSITORY)
        self.assertEqual(registry_data, EXPECTED_REGISTRY)
        self.assertEqual(baseline["target_registry"], registry_data)
        sources, adapters, runtime = source_authorization(REPOSITORY)
        build = baseline["build_manifest"]
        self.assertEqual(set(build), {"schema_version", "source_hashes", "adapter_hashes", "runtime_hashes", "output_hashes", "owners", "home_policy", "validation", "manifest_sha256"})
        self.assertEqual(build["schema_version"], 1)
        self.assertEqual(build["home_policy"], {item.name: dict(item.home_policy) for item in manifests})
        self.assertEqual(build["validation"], expected_validation(manifests))
        self.assertEqual(build["manifest_sha256"], EXPECTED_BUILD_MANIFEST)
        self.assertEqual(build["source_hashes"], sources)
        self.assertEqual(build["adapter_hashes"], adapters)
        self.assertEqual(build["runtime_hashes"], runtime)
        expected_outputs = {root: values[1] for root, values in EXPECTED_OUTPUTS.items()}
        expected_outputs.update(EXPECTED_DOCUMENTS)
        self.assertEqual(build["output_hashes"], expected_outputs)
        for target, manifest_path in registry.targets.items():
            target_data = baseline["targets"][target]
            self.assertEqual(set(target_data), {"manifest_sha256", "manifest", "outputs", "project_docs"})
            self.assertEqual(target_data["manifest"], json.loads(manifest_path.read_text(encoding="utf-8")), target)
            self.assertEqual(target_data["manifest_sha256"], EXPECTED_MANIFESTS[target])
            self.assertEqual(hash_file(manifest_path), target_data["manifest_sha256"])
            loaded = load_target_manifest(manifest_path)
            self.assertEqual(set(loaded.output_roots), set(EXPECTED_TARGET_OUTPUTS[target]))
            expected_docs = {document: {"sha256": EXPECTED_DOCUMENTS[document]} for document in loaded.project_docs}
            self.assertEqual(target_data["project_docs"], expected_docs)
        self._assert_inventory(baseline)
        for target in baseline["targets"].values():
            for output in target["outputs"].values():
                self.assertTrue(all(safe_relative(path) for path in output["files"]))
            for document, value in target["project_docs"].items():
                self.assertEqual(value["sha256"], EXPECTED_DOCUMENTS[document])

    def test_authoritative_generated_artifacts_are_rehashed_independently(self) -> None:
        baseline = _load("baseline.json")
        with tempfile.TemporaryDirectory() as temp:
            generated = _generated_authority(REPOSITORY, Path(temp))
            build_path = generated / ".evcrate/build-manifest.json"
            build = json.loads(build_path.read_text(encoding="utf-8"))
            self.assertEqual(hashlib.sha256(build_path.read_bytes()).hexdigest(), EXPECTED_BUILD_MANIFEST)
            recorded = dict(baseline["build_manifest"])
            self.assertEqual(recorded.pop("manifest_sha256"), EXPECTED_BUILD_MANIFEST)
            self.assertEqual(build, recorded)
            source_root = generated / ".evcrate/source"
            for target, roots in EXPECTED_TARGET_OUTPUTS.items():
                for root in roots:
                    digest, files = _independent_tree(source_root / root)
                    output = baseline["targets"][target]["outputs"][root]
                    self.assertEqual(digest, output["tree_hash"], root)
                    self.assertEqual(len(files), output["file_count"], root)
                    self.assertEqual(file_list_hash(files), file_list_hash(output["files"]), root)
            for document, digest in EXPECTED_DOCUMENTS.items():
                actual = hashlib.sha256((source_root / document).read_bytes()).hexdigest()
                self.assertEqual(actual, digest, document)

    def test_owner_mutation_is_rejected_by_authoritative_manifest(self) -> None:
        baseline = _load("baseline.json")
        owner = next(key for key, value in baseline["build_manifest"]["owners"].items() if value == "baseline")
        tampered = dict(baseline["build_manifest"])
        tampered["owners"] = dict(tampered["owners"])
        tampered["owners"][owner] = "claude"
        self.assertNotEqual(tampered, baseline["build_manifest"])

    def test_tampered_inventory_fails_independent_oracle(self) -> None:
        tampered = _load("baseline.json")
        tampered["targets"]["claude"]["outputs"][".claude"]["file_count"] += 1
        with self.assertRaises(AssertionError):
            self._assert_inventory(tampered)


if __name__ == "__main__":
    unittest.main()
