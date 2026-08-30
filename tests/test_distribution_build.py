"""Schema-two build and staging contracts."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from distribution.advisor_controller import (
    ADVISOR_CONTROLLER_FILES,
    controller_hashes,
    validate_advisor_controller_projection,
    validate_advisor_controller_source,
)
from distribution.build import promote_transaction, recover_interrupted_promotion, staged_build_root
from distribution.context import create_context
from distribution.contracts import BuildError, DistributionAction, VerifiedArtifact, validate_harness_resource_projection
from distribution.hashing import HashingError, normalize_relative_path, source_tree_hash, tree_hash
from distribution.manifest import (
    build_manifest_bytes,
    controller_hashes as manifest_controller_hashes,
    load_target_manifest,
    load_target_registry,
)
from distribution.overlay import OverlayError, copy_overlay_files
from distribution.staging import BUILD_MANIFEST_PATH, build_manifest_path

REPOSITORY = Path(__file__).resolve().parents[1]
CONTROLLER = REPOSITORY / ".evcrate/source/.evcrate/bin"


class DistributionBuildTest(unittest.TestCase):
    def test_schema_two_manifest_authorizes_shared_controller(self) -> None:
        manifest = json.loads((REPOSITORY / BUILD_MANIFEST_PATH).read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema_version"], 2)
        self.assertEqual(manifest["controller_hashes"], {
            f".evcrate/bin/{relative}": digest
            for relative, digest in controller_hashes(CONTROLLER).items()
        })
        self.assertTrue(manifest["validation"]["complete"])
        self.assertEqual(manifest["validation"]["advisor_controller"]["files"], list(ADVISOR_CONTROLLER_FILES))
        self.assertIn("advisor-controller", manifest["home_policy"])
        self.assertEqual(manifest["home_policy"]["advisor-controller"]["bindings"], {".evcrate/bin": ".evcrate/bin"})
        self.assertNotIn("runtime_hashes", manifest)

    def test_repository_controller_hashes_emit_portable_paths(self) -> None:
        hashes = manifest_controller_hashes(REPOSITORY)
        self.assertEqual(
            set(hashes),
            {f".evcrate/bin/{relative}" for relative in ADVISOR_CONTROLLER_FILES},
        )

    def test_target_registry_and_manifests_have_schema_two_without_runtime(self) -> None:
        registry = load_target_registry(REPOSITORY / ".evcrate/targets/manifest.json")
        for name, path in registry.targets.items():
            with self.subTest(target=name):
                raw = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(raw["schema_version"], 2)
                self.assertNotIn("advisor_runtime", raw)
                self.assertNotIn("runtime", raw)
                self.assertNotIn("distribution/advisor_runtime.py", raw.get("adapter_sources", []))
                load_target_manifest(path)

    def test_selected_context_always_includes_central_root(self) -> None:
        context = create_context(DistributionAction.BUILD, selected_targets=("pi",))
        self.assertEqual({path.name for path in context.local_roots}, {".evcrate", ".pi"})
        self.assertEqual(context.local_roots[0].name, ".evcrate")
        self.assertEqual(build_manifest_path(context), Path(".evcrate/build-manifest-pi.json"))

    def test_controller_source_and_projection_reject_extra_artifacts_and_imports(self) -> None:
        validate_advisor_controller_source(CONTROLLER)
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / "bin"
            shutil.copytree(CONTROLLER, destination)
            (destination / "extra.cjs").write_text("module.exports = {};\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "non-production artifact"):
                validate_advisor_controller_projection(CONTROLLER, destination)
            (destination / "extra.cjs").unlink()
            errors = destination / "lib/advisor/errors.cjs"
            errors.write_text(f"{errors.read_text(encoding='utf-8')}require('../outside.cjs');\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "outside its closure"):
                validate_advisor_controller_source(destination)

    def test_target_projections_have_complete_ordinary_resource_closures(self) -> None:
        source = REPOSITORY / ".evcrate/source/.claude"
        roots = {
            "codex": REPOSITORY / ".evcrate/source/.codex",
            "gemini": REPOSITORY / ".evcrate/source/.gemini",
            "antigravity": REPOSITORY / ".evcrate/source/.antigravity",
            "pi": REPOSITORY / ".evcrate/source/.pi",
            "omp": REPOSITORY / ".evcrate/source/.omp",
        }
        for target, root in roots.items():
            with self.subTest(target=target):
                validate_harness_resource_projection(source, root, target)

    def test_manifest_loader_rejects_legacy_runtime_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "manifest.json"
            base = {
                "schema_version": 2,
                "name": "fixture",
                "adapter": None,
                "output_root": ".fixture",
                "owned_paths": [],
                "patches": [],
                "home_policy": {"bindings": {".fixture": ".fixture"}},
            }
            for key in ("runtime", "advisor_runtime"):
                with self.subTest(key=key):
                    path.write_text(json.dumps({**base, key: {}}), encoding="utf-8")
                    with self.assertRaises(BuildError):
                        load_target_manifest(path)

    def test_normalized_paths_reject_escape_and_windows_separators(self) -> None:
        self.assertEqual(normalize_relative_path(".codex/config.toml"), ".codex/config.toml")
        for value in (".", "../secret", "/tmp/secret", "nested/../secret", "nested\\secret", "./nested", "C:escape/config.json"):
            with self.subTest(value=value):
                with self.assertRaises(HashingError):
                    normalize_relative_path(value)

    def test_tree_hash_is_stable_and_distinguishes_empty_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "empty").mkdir()
            (root / "entry.txt").write_text("same", encoding="utf-8")
            digest = tree_hash(root)
            self.assertEqual(digest, tree_hash(root))
            (root / "empty").rmdir()
            self.assertNotEqual(digest, tree_hash(root))

    def test_source_hash_ignores_generated_dependency_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "source.txt").write_text("source", encoding="utf-8")
            digest = source_tree_hash(root)
            (root / "node_modules").mkdir()
            (root / "node_modules/local.js").write_text("generated", encoding="utf-8")
            (root / "dist").mkdir()
            (root / "dist/bundle.js").write_text("generated", encoding="utf-8")
            self.assertEqual(digest, source_tree_hash(root))

    def test_overlay_rejects_baseline_collision_and_undeclared_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, stage = root / "files", root / "stage"
            source.mkdir()
            stage.mkdir()
            (source / "config.json").write_text("{}", encoding="utf-8")
            (stage / "config.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(OverlayError):
                copy_overlay_files(source, stage, "fixture", {"config.json": "baseline"}, ("files/config.json",))
            (source / "extra.md").write_text("extra", encoding="utf-8")
            with self.assertRaises(OverlayError):
                copy_overlay_files(source, stage, "fixture", {}, ())

    def test_build_promotion_recovers_prior_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "stage.txt"
            destination = root / "output.txt"
            source.write_text("new", encoding="utf-8")
            destination.write_text("old", encoding="utf-8")
            promote_transaction([(source, destination)])
            self.assertEqual(destination.read_text(encoding="utf-8"), "new")
            self.assertFalse((root / ".evcrate-promotion-journal.json").exists())

    def test_staged_build_root_is_empty_and_removed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp)
            with staged_build_root(repository, recover=False) as stage:
                self.assertTrue(stage.is_dir())
                (stage / "temporary").write_text("stage", encoding="utf-8")
            self.assertFalse(stage.exists())

    def test_manifest_renderer_requires_controller_authorization(self) -> None:
        outputs = {".evcrate": CONTROLLER, "AGENTS.md": REPOSITORY / ".evcrate/source/AGENTS.md"}
        rendered = build_manifest_bytes(
            source_hashes={}, adapter_hashes={}, controller_hashes=controller_hashes(CONTROLLER),
            owners={".evcrate/bin/evcrate-advisor": "advisor-controller"}, output_roots=outputs,
            home_policy={"advisor-controller": {"bindings": {".evcrate/bin": ".evcrate/bin"}}},
            validation={"complete": True},
        )
        document = json.loads(rendered)
        self.assertEqual(document["schema_version"], 2)
        self.assertIn("controller_hashes", document)


if __name__ == "__main__":
    unittest.main()
