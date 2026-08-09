"""Phase 3 regression coverage for verified, non-destructive HOME publication."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.context import DistributionContext, create_context
from distribution.contracts import DistributionAction, PublishError, VerifiedArtifact
from distribution.locking import publish_lock, write_release_marker
from distribution.publish import publish_diff, publish_local_artifacts, recover_interrupted_publish
from distribution.publish_verification import _expected_output_names, verify_local_artifact


class DistributionPublishTest(unittest.TestCase):
    def _context(self, root: Path) -> DistributionContext:
        return DistributionContext(DistributionAction.PUBLISH, root / "repo", root / "home", None, "managed", "config-and-scripts", root / "state")

    def _policy(self, context: DistributionContext, source: Path, home: Path) -> list[tuple[str, Path, Path, set[str]]]:
        return [(".codex", source, home, {".evcrate.json"})]

    def test_publish_preserves_unknown_and_user_owned_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = root / "source", context.home / ".codex"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "settings.json").write_text("new", encoding="utf-8")
            (source / ".evcrate.json").write_text("generated", encoding="utf-8")
            (home / "unknown.txt").write_text("keep", encoding="utf-8")
            (home / ".evcrate.json").write_text("user", encoding="utf-8")
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            policy = self._policy(context, source, home)
            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy):
                changes = publish_local_artifacts(context, artifact)
                self.assertIn("create", [change.action for change in changes])
                self.assertEqual((home / "settings.json").read_text(encoding="utf-8"), "new")
                self.assertEqual((home / "unknown.txt").read_text(encoding="utf-8"), "keep")
                self.assertEqual((home / ".evcrate.json").read_text(encoding="utf-8"), "user")
                (source / "settings.json").unlink()
                publish_local_artifacts(context, artifact)
            self.assertFalse((home / "settings.json").exists())
            self.assertEqual((home / "unknown.txt").read_text(encoding="utf-8"), "keep")

    def test_diff_is_stable_and_marks_user_paths_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = root / "source", context.home / ".codex"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "managed").write_text("new", encoding="utf-8")
            (home / "unknown").write_text("keep", encoding="utf-8")
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=self._policy(context, source, home)):
                first = publish_diff(context, artifact)
                second = publish_diff(context, artifact)
            self.assertEqual(first, second)
            self.assertNotIn("unknown", {change.path for change in first})

    def test_nested_claude_publish_preserves_unmanaged_files_and_dry_run(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = context.local_claude, context.target_claude
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "agents/deep/rules.md").parent.mkdir(parents=True)
            (source / "agents/deep/rules.md").write_text("new nested rule", encoding="utf-8")
            (source / "skills").mkdir()
            (source / "skills/INSTALLATION.md").write_text("non-skill document", encoding="utf-8")
            (source / "skills/planning/SKILL.md").parent.mkdir(parents=True)
            (source / "skills/planning/SKILL.md").write_text("skill metadata", encoding="utf-8")
            (source / "skills/planning/README.md").write_text("skill support file", encoding="utf-8")
            (source / "settings.json").write_text("new managed", encoding="utf-8")
            (home / "settings.json").write_text("old managed", encoding="utf-8")
            (home / "unmanaged.txt").write_text("keep", encoding="utf-8")
            (home / "skills/INSTALLATION.md").parent.mkdir(parents=True)
            (home / "skills/INSTALLATION.md").write_text("stale non-skill document", encoding="utf-8")
            write_release_marker(
                context.state_dir,
                {
                    "schema_version": 1,
                    "status": "complete",
                    "managed_paths": {".claude": ["skills/INSTALLATION.md"]},
                },
            )
            policy = [(".claude", source, home, set())]
            artifact = VerifiedArtifact(context.repository, context.local_roots)

            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy):
                changes = publish_local_artifacts(context, artifact)
                self.assertIn((".claude", "agents/deep/rules.md", "create"), {(change.root, change.path, change.action) for change in changes})
                self.assertIn((".claude", "settings.json", "update"), {(change.root, change.path, change.action) for change in changes})
                self.assertNotIn("unmanaged.txt", {change.path for change in changes})
                self.assertEqual((home / "agents/deep/rules.md").read_text(encoding="utf-8"), "new nested rule")
                self.assertFalse((home / "skills/INSTALLATION.md").exists())
                self.assertEqual((home / "skills/planning/SKILL.md").read_text(encoding="utf-8"), "skill metadata")
                self.assertEqual((home / "skills/planning/README.md").read_text(encoding="utf-8"), "skill support file")
                self.assertEqual((home / "settings.json").read_text(encoding="utf-8"), "new managed")
                before = {path.relative_to(home).as_posix(): path.read_bytes() for path in home.rglob("*") if path.is_file()}
                (source / "new/deeper/file.txt").parent.mkdir(parents=True)
                (source / "new/deeper/file.txt").write_text("dry run", encoding="utf-8")
                dry_changes = publish_local_artifacts(context, artifact, dry_run=True)
                self.assertIn("new/deeper/file.txt", {change.path for change in dry_changes})
                after = {path.relative_to(home).as_posix(): path.read_bytes() for path in home.rglob("*") if path.is_file()}
                self.assertEqual(before, after)

    def test_codex_global_paths_are_rewritten_only_for_home_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "workspace with spaces"
            root.mkdir()
            context = self._context(root)
            source, home = root / "source", context.home / ".codex"
            source.mkdir(parents=True)
            hooks = {
                "hooks": {
                    "SessionStart": [{
                        "hooks": [{
                            "type": "command",
                            "command": 'sh "$CODEX_PROJECT_DIR"/.codex/hooks/run-node-hook.sh "$CODEX_PROJECT_DIR"/.codex/hooks/session-start.cjs',
                        }],
                    }],
                },
            }
            (source / "hooks.json").write_text(json.dumps(hooks, indent=2), encoding="utf-8")
            (source / "config.toml").write_text('command = ".codex/bin/run-mcp-package.sh"\n', encoding="utf-8")
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            policy = self._policy(context, source, home)

            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy):
                publish_local_artifacts(context, artifact)
                self.assertEqual(publish_diff(context, artifact), [])

            local_command = json.loads((source / "hooks.json").read_text(encoding="utf-8"))["hooks"]["SessionStart"][0]["hooks"][0]["command"]
            global_command = json.loads((home / "hooks.json").read_text(encoding="utf-8"))["hooks"]["SessionStart"][0]["hooks"][0]["command"]
            self.assertIn("$CODEX_PROJECT_DIR", local_command)
            self.assertNotIn("$CODEX_PROJECT_DIR", global_command)
            self.assertIn((home / "hooks").as_posix(), global_command)
            self.assertEqual(
                (home / "config.toml").read_text(encoding="utf-8"),
                f'command = "{(home / "bin" / "run-mcp-package.sh").as_posix()}"\n',
            )
            self.assertEqual(
                (source / "config.toml").read_text(encoding="utf-8"),
                'command = ".codex/bin/run-mcp-package.sh"\n',
            )

    def test_stale_source_hash_blocks_before_home_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            with patch("distribution.publish_verification._load_build_manifest", return_value={"source_hashes": {}, "adapter_hashes": {}, "output_hashes": {}, "validation": {"complete": True}}), patch("distribution.publish_verification._current_source_hashes", return_value={"changed": "hash"}):
                with self.assertRaisesRegex(PublishError, "stale"):
                    verify_local_artifact(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertFalse(context.home.exists())

    def test_expected_output_names_include_roots_and_project_docs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = create_context(DistributionAction.PUBLISH, environ={"EVCRATE_HOME": str(Path(temp) / "home")})
            self.assertEqual(
                _expected_output_names(context),
                {".gemini", ".codex", ".agents", ".antigravity", ".claude", ".pi", "AGENTS.md", "GEMINI.md"},
            )

    def test_changed_claude_output_hash_blocks_before_home_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            context.local_claude.mkdir(parents=True)
            (context.local_claude / "nested.md").write_text("changed", encoding="utf-8")
            manifest = {
                "source_hashes": {"same": "hash"},
                "adapter_hashes": {},
                "output_hashes": {".claude": "stale-output-hash"},
                "validation": {"complete": True},
            }
            with patch("distribution.publish_verification._load_build_manifest", return_value=manifest), patch(
                "distribution.publish_verification._current_source_hashes", return_value={"same": "hash"}
            ), patch("distribution.publish_verification._expected_output_names", return_value={".claude"}):
                with self.assertRaisesRegex(PublishError, "Build artifact hash mismatch: .claude"):
                    verify_local_artifact(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertFalse(context.home.exists())

    def test_missing_claude_output_authorization_blocks_before_home_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            context.local_claude.mkdir(parents=True)
            (context.local_claude / "nested.md").write_text("authorized output", encoding="utf-8")
            manifest = {
                "source_hashes": {"same": "hash"},
                "adapter_hashes": {},
                "output_hashes": {},
                "validation": {"complete": True},
            }
            with patch("distribution.publish_verification._load_build_manifest", return_value=manifest), patch(
                "distribution.publish_verification._current_source_hashes", return_value={"same": "hash"}
            ), patch("distribution.publish_verification._expected_output_names", return_value={".claude"}):
                with self.assertRaisesRegex(PublishError, "output hashes do not match current artifacts"):
                    verify_local_artifact(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertFalse(context.home.exists())

    def test_failure_restores_completed_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            first_source, second_source = root / "first-source", root / "second-source"
            first_home, second_home = context.home / ".gemini", context.home / ".codex"
            for source, home in ((first_source, first_home), (second_source, second_home)):
                source.mkdir(parents=True)
                home.mkdir(parents=True)
                (source / "managed").write_text("new", encoding="utf-8")
                (home / "managed").write_text("old", encoding="utf-8")
            (first_home / "stale").write_text("stale managed file", encoding="utf-8")
            write_release_marker(
                context.state_dir,
                {
                    "schema_version": 1,
                    "status": "complete",
                    "managed_paths": {".gemini": ["stale"], ".codex": []},
                },
            )
            policy = [(".gemini", first_source, first_home, set()), (".codex", second_source, second_home, set())]
            original = __import__("distribution.publish", fromlist=["_replace_managed_file"])._replace_managed_file
            calls = 0

            def fail_second(*args: object):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("injected failure")
                return original(*args)

            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy), patch("distribution.publish._replace_managed_file", side_effect=fail_second):
                with self.assertRaisesRegex(PublishError, "recovered"):
                    publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots))
                self.assertEqual((first_home / "managed").read_text(encoding="utf-8"), "old")
                publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertFalse((first_home / "stale").exists())

    def test_failure_after_backup_rename_restores_current_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = root / "source", context.home / ".codex"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "managed").write_text("new", encoding="utf-8")
            (home / "managed").write_text("old", encoding="utf-8")
            original_replace = Path.replace
            failed = False

            def fail_candidate(path: Path, destination: Path) -> Path:
                nonlocal failed
                if not failed and ".evcrate-publish-" in path.name:
                    failed = True
                    raise OSError("injected candidate promotion failure")
                return original_replace(path, destination)

            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=self._policy(context, source, home)), patch.object(Path, "replace", fail_candidate):
                with self.assertRaisesRegex(PublishError, "recovered"):
                    publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertEqual((home / "managed").read_text(encoding="utf-8"), "old")

    def test_nested_home_binding_rejects_symlinked_ancestor(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, outside = root / "source", root / "outside"
            source.mkdir()
            outside.mkdir()
            context.home.mkdir()
            (context.home / ".gemini").symlink_to(outside, target_is_directory=True)
            policy = [(".gemini/config", source, context.home / ".gemini" / "config", set())]
            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy):
                with self.assertRaisesRegex(PublishError, "unsafe"):
                    publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertFalse(any(outside.iterdir()))

    def test_home_root_symlink_is_rejected_before_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, outside = root / "source", root / "outside"
            source.mkdir()
            outside.mkdir()
            context.home.symlink_to(outside, target_is_directory=True)
            policy = [(".gemini", source, context.home / ".gemini", set())]
            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy):
                with self.assertRaisesRegex(PublishError, "symlinked ancestors"):
                    publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertFalse((outside / "value").exists())

    def test_recovery_restores_marker_recorded_backup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = root / "source", context.home / ".codex"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (home / "value").write_text("new", encoding="utf-8")
            backup = home.with_name(f".{home.name}.evcrate-backup-test")
            backup.mkdir()
            (backup / "value").write_text("old", encoding="utf-8")
            write_release_marker(context.state_dir, {"schema_version": 1, "status": "in_progress", "roots": {".codex": {"backup": backup.name}}})
            with patch("distribution.publish._policies", return_value=self._policy(context, source, home)):
                recover_interrupted_publish(context)
            self.assertEqual((home / "value").read_text(encoding="utf-8"), "old")

    def test_publish_lock_rejects_second_publisher(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            with publish_lock(state):
                with self.assertRaisesRegex(PublishError, "already active"):
                    with publish_lock(state):
                        pass

    def test_publish_lock_rejects_symlinked_state_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            outside = root / "outside"
            outside.mkdir()
            state = root / "state"
            state.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(PublishError, "state path"):
                with publish_lock(state):
                    pass

    def test_publish_lock_rejects_symlinked_state_ancestor(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            outside = root / "outside"
            outside.mkdir()
            parent = root / "parent"
            parent.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(PublishError, "state path"):
                with publish_lock(parent / "state"):
                    pass
            self.assertFalse((outside / "state").exists())

    def test_release_preparation_uses_verified_gate_not_direct_migrators(self) -> None:
        script = Path(__file__).resolve().parents[1] / "scripts" / "prepare-release-assets.cjs"
        content = script.read_text(encoding="utf-8")
        self.assertIn("['distribute.py', '--build']", content)
        self.assertIn("['distribute.py', '--check']", content)
        self.assertIn("'.evcrate/source/.antigravity'", content)
        self.assertNotIn("migrate_claude_to_gemini.py', {", content)
        self.assertNotIn("migrate_claude_to_codex.py', {", content)


if __name__ == "__main__":
    unittest.main()
