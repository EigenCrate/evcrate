"""Phase 3 regression coverage for verified, non-destructive HOME publication."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.context import DistributionContext
from distribution.contracts import DistributionAction, PublishError, VerifiedArtifact
from distribution.locking import publish_lock, write_release_marker
from distribution.publish import publish_diff, publish_local_artifacts, recover_interrupted_publish
from distribution.publish_verification import verify_local_artifact


class DistributionPublishTest(unittest.TestCase):
    def _context(self, root: Path) -> DistributionContext:
        return DistributionContext(DistributionAction.PUBLISH, root / "repo", root / "home", None, "managed", "config-and-scripts", root / "state")

    def _policy(self, context: DistributionContext, source: Path, home: Path) -> list[tuple[str, Path, Path, set[str]]]:
        return [(".codex", source, home, {".devkit.json"})]

    def test_publish_preserves_unknown_and_user_owned_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = root / "source", context.home / ".codex"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "settings.json").write_text("new", encoding="utf-8")
            (source / ".devkit.json").write_text("generated", encoding="utf-8")
            (home / "unknown.txt").write_text("keep", encoding="utf-8")
            (home / ".devkit.json").write_text("user", encoding="utf-8")
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            policy = self._policy(context, source, home)
            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy):
                changes = publish_local_artifacts(context, artifact)
                self.assertIn("create", [change.action for change in changes])
                self.assertEqual((home / "settings.json").read_text(encoding="utf-8"), "new")
                self.assertEqual((home / "unknown.txt").read_text(encoding="utf-8"), "keep")
                self.assertEqual((home / ".devkit.json").read_text(encoding="utf-8"), "user")
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
            self.assertIn(("unknown", "preserve"), {(change.path, change.action) for change in first})

    def test_stale_source_hash_blocks_before_home_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            with patch("distribution.publish_verification._load_build_manifest", return_value={"source_hashes": {}, "adapter_hashes": {}, "output_hashes": {}, "validation": {"complete": True}}), patch("distribution.publish_verification._current_source_hashes", return_value={"changed": "hash"}):
                with self.assertRaisesRegex(PublishError, "stale"):
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
            policy = [(".gemini", first_source, first_home, set()), (".codex", second_source, second_home, set())]
            original = __import__("distribution.publish", fromlist=["_copy_candidate"])._copy_candidate
            calls = 0

            def fail_second(*args: object):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("injected failure")
                return original(*args)

            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=policy), patch("distribution.publish._copy_candidate", side_effect=fail_second):
                with self.assertRaisesRegex(PublishError, "recovered"):
                    publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertEqual((first_home / "managed").read_text(encoding="utf-8"), "old")

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

            def fail_candidate(path: Path, destination: Path) -> Path:
                if ".devkit-stage-" in path.name:
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

    def test_recovery_restores_marker_recorded_backup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = root / "source", context.home / ".codex"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (home / "value").write_text("new", encoding="utf-8")
            backup = home.with_name(f".{home.name}.devkit-backup-test")
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
            with self.assertRaisesRegex(PublishError, "state directory"):
                with publish_lock(state):
                    pass

    def test_release_preparation_uses_verified_gate_not_direct_migrators(self) -> None:
        script = Path(__file__).resolve().parents[1] / "scripts" / "prepare-release-assets.cjs"
        content = script.read_text(encoding="utf-8")
        self.assertIn("['distribute.py', '--build']", content)
        self.assertIn("['distribute.py', '--check']", content)
        self.assertIn("'.antigravity'", content)
        self.assertNotIn("migrate_claude_to_gemini.py', {", content)
        self.assertNotIn("migrate_claude_to_codex.py', {", content)


if __name__ == "__main__":
    unittest.main()
