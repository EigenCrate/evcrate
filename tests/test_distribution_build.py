"""Focused coverage for Phase 2 distribution utilities."""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.build import JOURNAL_NAME, _sync_directory, _windows_repository_lock, promote_transaction, recover_interrupted_promotion, repository_lock, staged_build_root
from distribution.antigravity_publish import build_antigravity_config
from distribution.context import DistributionContext, create_context
from distribution.contracts import BuildError, DistributionAction
from distribution.hashing import HashingError, normalize_relative_path, source_tree_hash, tree_hash
from distribution.manifest import build_manifest_bytes, load_target_manifest, load_target_registry, source_hashes
from distribution.overlay import OverlayError, apply_exact_patch, apply_patch_file, copy_overlay_files
from distribution.staging import BUILD_MANIFEST_PATH, _baseline_owners, _copy_source_root, _load_targets, generate_stage


class DistributionBuildTest(unittest.TestCase):
    def test_normalized_paths_reject_traversal_and_windows_separators(self) -> None:
        self.assertEqual(normalize_relative_path(".codex/config.toml"), ".codex/config.toml")
        for path in (".", "../secret", "/tmp/secret", "nested/../secret", "nested\\secret", "./nested", "C:escape/config.json"):
            with self.assertRaises(HashingError):
                normalize_relative_path(path)

    def test_tree_hash_is_stable_and_includes_empty_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "empty").mkdir()
            (root / "entry.txt").write_text("same", encoding="utf-8")
            first = tree_hash(root)
            self.assertEqual(first, tree_hash(root))
            (root / "empty").rmdir()
            self.assertNotEqual(first, tree_hash(root))

    def test_artifact_hash_ignores_compiler_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "entry.txt").write_text("same", encoding="utf-8")
            before = tree_hash(root)
            (root / "__pycache__").mkdir()
            (root / "__pycache__" / "module.pyc").write_bytes(b"runtime")
            (root / "generated.pyc").write_bytes(b"runtime")
            (root / ".coverage").write_bytes(b"runtime")
            self.assertEqual(before, tree_hash(root))

    def test_source_tree_hash_ignores_local_dependency_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "source.txt").write_text("source", encoding="utf-8")
            before = source_tree_hash(root)
            (root / "node_modules").mkdir()
            (root / "node_modules" / "local.js").write_text("generated", encoding="utf-8")
            (root / "dist").mkdir()
            (root / "dist" / "bundle.js").write_text("generated", encoding="utf-8")
            self.assertEqual(before, source_tree_hash(root))

    def test_overlay_rejects_baseline_file_collision(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, stage = root / "files", root / "stage"
            source.mkdir()
            stage.mkdir()
            (source / "config.json").write_text("{}", encoding="utf-8")
            (stage / "config.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(OverlayError, "owned by baseline"):
                copy_overlay_files(source, stage, "codex", {}, ("files/config.json",))

    def test_overlay_rejects_file_directory_collision(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, stage = root / "files", root / "stage"
            (source / "nested").mkdir(parents=True)
            stage.mkdir()
            (source / "nested" / "extra.txt").write_text("overlay", encoding="utf-8")
            (stage / "nested").write_text("baseline", encoding="utf-8")
            with self.assertRaises(OverlayError):
                copy_overlay_files(source, stage, "codex", {}, ("files/nested/extra.txt",))

    def test_overlay_rejects_undeclared_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, stage = root / "files", root / "stage"
            source.mkdir()
            stage.mkdir()
            (source / "extra.md").write_text("overlay", encoding="utf-8")
            with self.assertRaisesRegex(OverlayError, "owned_paths"):
                copy_overlay_files(source, stage, "codex", {}, ())

    def test_overlay_rejects_symlink_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, stage = root / "files", root / "stage"
            source.mkdir()
            stage.mkdir()
            (source / "outside").symlink_to(root)
            with self.assertRaises(OverlayError):
                copy_overlay_files(source, stage, "codex", {}, ())

    def test_json_patch_requires_exact_declared_existing_type_matched_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / "settings.json"
            destination.write_text('{"hooks":{"enabled":false},"mode":"old"}', encoding="utf-8")
            apply_exact_patch(destination, {"hooks.enabled": True, "mode": "new"}, ("hooks.enabled", "mode"))
            self.assertEqual(json.loads(destination.read_text(encoding="utf-8")), {"hooks": {"enabled": True}, "mode": "new"})
            with self.assertRaises(OverlayError):
                apply_exact_patch(destination, {"mode": 1}, ("mode",))
            with self.assertRaises(OverlayError):
                apply_exact_patch(destination, {"missing": "x"}, ("missing",))
            with self.assertRaises(OverlayError):
                apply_exact_patch(destination, {"hooks..enabled": True}, ("hooks..enabled",))

    def test_patch_rejects_a_symlinked_destination(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            outside, destination = root / "outside.json", root / "settings.json"
            outside.write_text('{"mode":"old"}', encoding="utf-8")
            destination.symlink_to(outside)
            with self.assertRaises(OverlayError):
                apply_exact_patch(destination, {"mode": "new"}, ("mode",))
            self.assertEqual(json.loads(outside.read_text(encoding="utf-8")), {"mode": "old"})

    def test_toml_patch_file_is_parser_backed_and_canonical(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            destination, patch = root / "config.toml", root / "patch.json"
            destination.write_text('name = "old"\n[server]\nenabled = false\n', encoding="utf-8")
            patch.write_text('{"set":{"name":"new","server.enabled":true}}', encoding="utf-8")
            apply_patch_file(destination, patch, ("name", "server.enabled"))
            self.assertEqual(destination.read_text(encoding="utf-8"), 'name = "new"\n\n[server]\nenabled = true\n')

    def test_manifest_load_and_render_are_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "files").mkdir()
            (root / "patches").mkdir()
            (root / "files" / "extra.md").write_text("overlay", encoding="utf-8")
            (root / "patches" / "config.json").write_text('{"set":{"mode":"new"}}', encoding="utf-8")
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps({
                "schema_version": 1, "name": "codex", "output_roots": [".codex"],
                "owned_paths": ["files/extra.md"],
                "patches": [{"source": "patches/config.json", "destination": ".codex/config.json", "keys": ["mode"]}],
                "home_policy": {"mode": "managed"},
            }), encoding="utf-8")
            target = load_target_manifest(manifest_path)
            hashes = source_hashes((target,))
            output = root / "output"
            output.mkdir()
            (output / "item").write_text("value", encoding="utf-8")
            first = build_manifest_bytes(source_hashes=hashes, adapter_hashes={"codex": "a"}, owners={".codex/item": "baseline"}, output_roots={".codex": output}, home_policy={}, validation={"valid": True})
            self.assertEqual(first, build_manifest_bytes(source_hashes=hashes, adapter_hashes={"codex": "a"}, owners={".codex/item": "baseline"}, output_roots={".codex": output}, home_policy={}, validation={"valid": True}))

    def test_manifest_rejects_patch_outside_target_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "patches").mkdir()
            (root / "patches" / "config.json").write_text('{"set":{"mode":"new"}}', encoding="utf-8")
            manifest = {"schema_version": 1, "name": "codex", "output_roots": [".codex"], "patches": [{"source": "patches/config.json", "destination": ".gemini/settings.json", "keys": ["mode"]}]}
            path = root / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(BuildError):
                load_target_manifest(path)

    def test_context_uses_nested_source_root_and_rejects_legacy_roots(self) -> None:
        from distribution.gates import _assert_legacy_root_clean

        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp)
            context = DistributionContext(
                DistributionAction.BUILD,
                repository,
                repository / "home",
                repository / "stage",
                "managed",
                "config-and-scripts",
            )
            self.assertEqual(context.local_claude, repository / ".evcrate/source/.claude")
            self.assertEqual(context.local_path("AGENTS.md"), repository / ".evcrate/source/AGENTS.md")
            (repository / ".claude").mkdir()
            with self.assertRaisesRegex(BuildError, "under .evcrate/source"):
                _assert_legacy_root_clean(context)

    def test_current_target_registry_schema_accepts_singular_output_root(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        registry = load_target_registry(repository / ".evcrate/targets/manifest.json")
        context = create_context(DistributionAction.BUILD)
        self.assertEqual(context.local_roots[-2], context.local_claude)
        self.assertEqual(context.local_roots[-1], context.local_pi)
        claude = load_target_manifest(registry.targets["claude"])
        self.assertEqual(claude.output_roots, (".claude",))
        self.assertIsNone(claude.adapter)
        self.assertEqual(claude.project_docs, ())
        self.assertEqual(
            claude.home_policy,
            {"bindings": {".claude": ".claude"}, "preserve_paths": {}, "promotion_order": 40},
        )
        codex = load_target_manifest(registry.targets["codex"])
        self.assertEqual(codex.output_roots, (".codex", ".agents"))
        self.assertEqual(codex.home_policy["bindings"][".codex"], ".codex")
        self.assertIsNone(codex.runtime)
        manifest_text = registry.targets["codex"].read_text(encoding="utf-8")
        self.assertNotIn("advisor", manifest_text.lower())
        self.assertFalse((registry.targets["codex"].parent / "runtime").exists())
        self.assertEqual(set(registry.targets), {"antigravity", "claude", "codex", "gemini", "pi"})
        pi = load_target_manifest(registry.targets["pi"])
        self.assertEqual(pi.output_roots, (".pi",))
        self.assertEqual(pi.adapter_sources, (
            "pi_adapter/__init__.py",
            "pi_adapter/agents.py",
            "pi_adapter/frontmatter.py",
            "pi_adapter/resources.py",
        ))
        self.assertEqual(pi.shared_json.destination, "agent/settings.json")

    def test_manifest_rejects_escaping_duplicate_or_symlinked_adapter_sources(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp)
            target_dir = repository / ".evcrate/targets/pi"
            target_dir.mkdir(parents=True)
            (repository / "migrate.py").write_text("adapter", encoding="utf-8")
            helper = repository / "pi_adapter.py"
            helper.write_text("helper", encoding="utf-8")
            base = {
                "schema_version": 1,
                "name": "pi",
                "adapter": "migrate.py",
                "output_root": ".pi",
                "additional_roots": [],
                "adapter_sources": ["pi_adapter.py"],
                "patches": [],
                "home_policy": {},
            }
            manifest = target_dir / "manifest.json"
            manifest.write_text(json.dumps(base), encoding="utf-8")
            self.assertEqual(load_target_manifest(manifest).adapter_sources, ("pi_adapter.py",))
            for sources in (["../secret"], ["pi_adapter.py", "pi_adapter.py"]):
                invalid = dict(base, adapter_sources=sources)
                manifest.write_text(json.dumps(invalid), encoding="utf-8")
                with self.assertRaises(BuildError):
                    load_target_manifest(manifest)
            outside = repository / "outside.py"
            outside.write_text("outside", encoding="utf-8")
            helper.unlink()
            helper.symlink_to(outside)
            manifest.write_text(json.dumps(base), encoding="utf-8")
            with self.assertRaises(BuildError):
                load_target_manifest(manifest)

    def test_generated_target_cannot_use_a_null_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp)
            targets = repository / ".evcrate/targets"
            targets.mkdir(parents=True)
            (targets / "manifest.json").write_text(
                json.dumps({"schema_version": 1, "targets": {"generated": "generated/manifest.json"}}),
                encoding="utf-8",
            )
            generated = targets / "generated"
            generated.mkdir()
            (generated / "manifest.json").write_text(
                json.dumps({
                    "schema_version": 1,
                    "name": "generated",
                    "adapter": None,
                    "output_root": ".gemini",
                    "additional_roots": [],
                    "project_docs": [],
                    "patches": [],
                    "home_policy": {},
                }),
                encoding="utf-8",
            )
            context = DistributionContext(DistributionAction.BUILD, repository, repository / "home", repository / "stage", "managed", "config-and-scripts")
            with self.assertRaisesRegex(BuildError, "has no build adapter"):
                _load_targets(context, {".gemini": repository / "stage/.gemini"})

    def test_antigravity_adapter_rewrites_help_script_and_preserves_command_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / ".evcrate/source/.claude"
            target = root / ".evcrate/source/.antigravity"
            (source / "commands").mkdir(parents=True)
            (source / "scripts").mkdir()
            (source / "scripts/ev-help.py").write_text("help", encoding="utf-8")
            (source / "commands/evcrate-help.md").write_text(
                "---\nname: /evcrate:help\ndescription: Help\n---\n"
                "python .claude/scripts/ev-help.py \"$ARGUMENTS\"\n",
                encoding="utf-8",
            )

            build_antigravity_config(source, target)

            generated = (target / "skills/cmd_evcrate-help/SKILL.md").read_text(encoding="utf-8")
            self.assertIn("Command Path: /evcrate:help", generated)
            self.assertIn("python .antigravity/scripts/ev-help.py", generated)
            self.assertNotIn("python .claude/scripts/ev-help.py", generated)

    def test_source_copy_omits_compiler_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, destination = root / "source", root / "stage"
            source.mkdir()
            (source / "kept.md").write_text("kept", encoding="utf-8")
            (source / "__pycache__").mkdir()
            (source / "__pycache__" / "module.pyc").write_bytes(b"runtime")
            _copy_source_root(source, destination)
            self.assertTrue((destination / "kept.md").is_file())
            self.assertFalse((destination / "__pycache__").exists())

    def test_source_symlink_is_not_followed_and_baseline_rejects_it(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, destination, outside = root / "source", root / "stage", root / "outside"
            source.mkdir()
            outside.mkdir()
            (outside / "escaped.txt").write_text("outside", encoding="utf-8")
            (source / "escape").symlink_to(outside, target_is_directory=True)
            _copy_source_root(source, destination)
            self.assertTrue((destination / "escape").is_symlink())
            self.assertFalse((destination / "escaped.txt").exists())
            with self.assertRaisesRegex(BuildError, "Generated symlink is not allowed"):
                _baseline_owners({".claude": destination})

    def test_generate_stage_rejects_nested_symlink_before_consumers(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            repository, stage, outside = root / "repo", root / "stage", root / "outside"
            source_root = repository / ".evcrate/source"
            (source_root / ".claude").mkdir(parents=True)
            outside.mkdir()
            (outside / "escaped.txt").write_text("outside", encoding="utf-8")
            (source_root / ".claude/escape").symlink_to(outside, target_is_directory=True)
            (source_root / "CLAUDE.md").write_text("context", encoding="utf-8")
            (repository / "distribution").mkdir()
            (repository / "distribution/antigravity_publish.py").write_text("adapter", encoding="utf-8")
            (repository / "distribute_hooks.py").write_text("hooks", encoding="utf-8")
            (repository / "adapter.py").write_text("adapter", encoding="utf-8")
            targets = repository / ".evcrate/targets"
            targets.mkdir(parents=True)
            target_roots = {
                "antigravity": [".antigravity"],
                "claude": [".claude"],
                "codex": [".codex", ".agents"],
                "gemini": [".gemini"],
                "pi": [".pi"],
            }
            registry = {name: f"{name}/manifest.json" for name in target_roots}
            (targets / "manifest.json").write_text(json.dumps({"schema_version": 1, "targets": registry}), encoding="utf-8")
            for name, roots in target_roots.items():
                target = targets / name
                target.mkdir()
                manifest = {
                    "schema_version": 1,
                    "name": name,
                    "adapter": None if name == "claude" else "adapter.py",
                    "output_root": roots[0],
                    "additional_roots": roots[1:],
                    "project_docs": ["AGENTS.md"] if name == "codex" else (["GEMINI.md"] if name == "gemini" else []),
                    "patches": [],
                    "home_policy": {},
                }
                (target / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            context = DistributionContext(DistributionAction.BUILD, repository, root / "home", stage, "managed", "config-and-scripts")

            def unsafe_consumer(source: Path, destination: Path) -> None:
                shutil.copytree(source, destination, symlinks=False)

            with patch("distribution.staging.build_antigravity_config", side_effect=unsafe_consumer) as consumer:
                with self.assertRaises(BuildError):
                    generate_stage(context, lambda *_: None)
            consumer.assert_not_called()
            self.assertTrue((stage / ".claude/escape").is_symlink())
            self.assertFalse((stage / ".claude/escaped.txt").exists())
            self.assertFalse((stage / ".antigravity").exists())

    def test_staging_writes_a_deterministic_authorization_manifest(self) -> None:
        def run(stage: Path) -> bytes:
            context = create_context(DistributionAction.BUILD, stage=stage)

            def fake_migrator(_: object, script: str, env: dict[str, str]) -> None:
                if script == "migrate_claude_to_gemini.py":
                    Path(env["GEMINI_OUTPUT_DIR"]).joinpath("artifact").write_text("gemini", encoding="utf-8")
                    Path(env["GEMINI_PROJECT_DOCS_OUTPUT_DIR"]).joinpath("GEMINI.md").write_text("context", encoding="utf-8")
                else:
                    Path(env["CODEX_OUTPUT_DIR"]).joinpath("artifact").write_text("codex", encoding="utf-8")
                    Path(env["AGENTS_OUTPUT_DIR"]).joinpath("artifact").write_text("agents", encoding="utf-8")
                    Path(env["PROJECT_DOCS_OUTPUT_DIR"]).joinpath("AGENTS.md").write_text("context", encoding="utf-8")

            generate_stage(context, fake_migrator)
            self.assertTrue((stage / ".antigravity" / "hooks.json").is_file())
            source_file = context.local_claude / "commands/code.md"
            self.assertEqual((stage / ".claude/commands/code.md").read_bytes(), source_file.read_bytes())
            self.assertFalse((stage / ".antigravity" / "config").exists())
            self.assertFalse((stage / ".codex" / "runtime").exists())
            manifest = (stage / BUILD_MANIFEST_PATH).read_text(encoding="utf-8")
            manifest_data = json.loads(manifest)
            self.assertIn(".claude", manifest_data["output_hashes"])
            self.assertIn(".claude/commands/code.md", manifest_data["owners"])
            self.assertEqual(manifest_data["source_hashes"][".claude"], tree_hash(context.local_claude))
            self.assertEqual(
                manifest_data["home_policy"]["claude"],
                {"bindings": {".claude": ".claude"}, "preserve_paths": {}, "promotion_order": 40},
            )
            for marker in (
                "advisor_consult",
                "mcp_servers.advisor",
                "advisor-broker",
                "pretool-advisor-admission",
                "advisor-ledger",
                "runtime-advisor-launcher",
            ):
                self.assertNotIn(marker, manifest)
            return (stage / BUILD_MANIFEST_PATH).read_bytes()

        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            self.assertEqual(run(Path(first)), run(Path(second)))

    def test_missing_required_project_document_fails_stage(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = create_context(DistributionAction.BUILD, stage=Path(temp))
            with self.assertRaisesRegex(BuildError, "Required generated project document"):
                generate_stage(context, lambda *_: None)

    def test_byte_level_tree_comparison_ignores_matching_mtime(self) -> None:
        from distribution.gates import _same_tree

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, destination = root / "source", root / "destination"
            source.mkdir()
            destination.mkdir()
            (source / "item").write_bytes(b"left")
            (destination / "item").write_bytes(b"right")
            stamp = 1_700_000_000
            os.utime(source / "item", (stamp, stamp))
            os.utime(destination / "item", (stamp, stamp))
            self.assertFalse(_same_tree(source, destination))

    def test_recovery_restores_outputs_after_interruption(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            destination, staged = root / "artifact", root / "staged"
            backup_root = root / ".evcrate-promotion-interrupted"
            destination.write_text("old", encoding="utf-8")
            staged.write_text("new", encoding="utf-8")
            backup_root.mkdir()
            destination.replace(backup_root / "artifact")
            staged.replace(destination)
            (root / JOURNAL_NAME).write_text(
                json.dumps({"backup_dir": backup_root.name, "destinations": ["artifact"]}),
                encoding="utf-8",
            )
            recover_interrupted_promotion(root)
            self.assertEqual(destination.read_text(encoding="utf-8"), "old")
            self.assertFalse((root / JOURNAL_NAME).exists())

    def test_repository_lock_rejects_concurrent_operation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp)
            with repository_lock(repository):
                with self.assertRaises(BuildError):
                    with repository_lock(repository):
                        pass

    def test_windows_lock_fallback_uses_temporary_lock_file(self) -> None:
        calls: list[int] = []
        fake_msvcrt = types.SimpleNamespace(
            LK_NBLCK=1,
            LK_UNLCK=2,
            locking=lambda _fd, mode, _size: calls.append(mode),
        )
        with tempfile.TemporaryDirectory() as temp, patch.dict(sys.modules, {"msvcrt": fake_msvcrt}):
            with _windows_repository_lock(Path(temp)):
                pass
        self.assertEqual(calls, [fake_msvcrt.LK_NBLCK, fake_msvcrt.LK_UNLCK])

    def test_windows_directory_sync_is_a_safe_no_op(self) -> None:
        with tempfile.TemporaryDirectory() as temp, patch("distribution.build.os.name", "nt"):
            _sync_directory(Path(temp))

    def test_read_only_stage_refuses_recovery_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp)
            artifact = repository / "artifact"
            artifact.write_text("old", encoding="utf-8")
            (repository / JOURNAL_NAME).write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(BuildError, "requires --build recovery"):
                with staged_build_root(repository, recover=False):
                    pass
            self.assertEqual(artifact.read_text(encoding="utf-8"), "old")
            self.assertTrue((repository / JOURNAL_NAME).is_file())

    def test_promotion_failure_restores_prior_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp) / "repo"
            repository.mkdir()
            destination = repository / "artifact"
            destination.write_text("old", encoding="utf-8")
            with staged_build_root(repository) as stage:
                staged = stage / "artifact"
                staged.write_text("new", encoding="utf-8")
                with self.assertRaises(BuildError):
                    promote_transaction([(staged, destination), (stage / "missing", repository / "other")])
            self.assertEqual(destination.read_text(encoding="utf-8"), "old")

    def test_promotion_rejects_duplicate_destinations_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp) / "repo"
            repository.mkdir()
            destination = repository / "artifact"
            destination.write_text("old", encoding="utf-8")
            with staged_build_root(repository) as stage:
                first, second = stage / "first", stage / "second"
                first.write_text("first", encoding="utf-8")
                second.write_text("second", encoding="utf-8")
                with self.assertRaises(BuildError):
                    promote_transaction([(first, destination), (second, destination)])
            self.assertEqual(destination.read_text(encoding="utf-8"), "old")

    def test_promotion_accepts_a_nested_build_manifest_destination(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp) / "repo"
            repository.mkdir()
            (repository / ".evcrate").mkdir()
            with staged_build_root(repository) as stage:
                codex, manifest = stage / ".codex", stage / "build-manifest.json"
                codex.mkdir()
                (codex / "config.toml").write_text('model = "new"\n', encoding="utf-8")
                manifest.write_text('{"schema_version":1}\n', encoding="utf-8")
                promote_transaction([(codex, repository / ".codex"), (manifest, repository / ".evcrate/build-manifest.json")])
            self.assertTrue((repository / ".codex/config.toml").is_file())
            self.assertEqual((repository / ".evcrate/build-manifest.json").read_text(encoding="utf-8"), '{"schema_version":1}\n')


if __name__ == "__main__":
    unittest.main()
