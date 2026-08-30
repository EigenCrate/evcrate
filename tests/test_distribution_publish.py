"""HOME publication and recovery contracts for the shared controller."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.context import DistributionContext, create_context
from distribution.contracts import DistributionAction, PublishError, VerifiedArtifact
from distribution.gates import run_home_publish
from distribution.publish import publish_diff, publish_local_artifacts
from distribution.publish_recovery import recover_interrupted_publish
from distribution.publish_verification import verify_local_artifact
from distribution.locking import write_release_marker

from tests.distribution_support import REPOSITORY, artifact_for, context_for, tree_bytes


class DistributionPublishTest(unittest.TestCase):
    def test_dry_run_reports_one_complete_controller_transaction_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            artifact = artifact_for(context)
            with patch("distribution.publish.verify_local_artifact"):
                changes = publish_local_artifacts(context, artifact, dry_run=True)
            central = [change for change in changes if change.root == ".evcrate/bin"]
            self.assertEqual(len(central), 1)
            self.assertEqual((central[0].root, central[0].path, central[0].action), (".evcrate/bin", ".evcrate/bin", "create"))
            self.assertFalse((context.home / ".evcrate/bin").exists())
            self.assertFalse((context.home / ".evcrate/advisor-routing.json").exists())

    def test_publish_replaces_complete_controller_and_preserves_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            policy_root = context.home / ".evcrate"
            policy_root.mkdir(mode=0o700)
            policy = policy_root / "advisor-routing.json"
            original = b'{"version":1,"advisor":{"backend":"codex","model":"gpt-5.6-sol","effort":"high","timeout_ms":60000}}\n'
            policy.write_bytes(original)
            os.chmod(policy, 0o600)
            artifact = artifact_for(context)
            with patch("distribution.publish.verify_local_artifact"):
                changes = publish_local_artifacts(context, artifact)
            controller = context.home / ".evcrate/bin"
            self.assertTrue(controller.is_dir())
            self.assertEqual(controller.stat().st_mode & 0o777, 0o700)
            self.assertEqual((controller / "evcrate-advisor").stat().st_mode & 0o777, 0o755)
            self.assertEqual((controller / "evcrate-advisor").read_bytes(), (REPOSITORY / ".evcrate/source/.evcrate/bin/evcrate-advisor").read_bytes())
            self.assertEqual(policy.read_bytes(), original)
            self.assertEqual(policy.stat().st_mode & 0o777, 0o600)
            self.assertIn((".evcrate/bin", ".evcrate/bin", "create"), {(item.root, item.path, item.action) for item in changes})

    def test_controller_recovery_restores_the_prior_complete_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = context_for(root, ("pi",))
            destination = context.home / ".evcrate/bin"
            destination.mkdir(parents=True, mode=0o700)
            (destination / "evcrate-advisor").write_text("new", encoding="utf-8")
            backup = destination.parent / ".evcrate-bin-backup-fixture"
            backup.mkdir(mode=0o700)
            (backup / "evcrate-advisor").write_text("old", encoding="utf-8")
            transaction = context.state_dir / "release-fixture"
            transaction.mkdir(mode=0o700)
            write_release_marker(context.state_dir, {
                "schema_version": 1,
                "status": "in_progress",
                "release_id": "fixture",
                "transaction_dir": transaction.name,
                "roots": {},
                "managed_paths": {},
                "previous_managed_paths": {},
                "operations": [{
                    "kind": "directory",
                    "root": ".evcrate/bin",
                    "path": ".evcrate/bin",
                    "backup": backup.name,
                }],
            })
            recover_interrupted_publish(context)
            self.assertEqual((destination / "evcrate-advisor").read_text(encoding="utf-8"), "old")
            self.assertFalse(backup.exists())
            self.assertFalse(transaction.exists())

    def test_stale_controller_hash_blocks_before_home_artifact_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = create_context(
                DistributionAction.PUBLISH,
                environ={"EVCRATE_HOME": str(root / "home"), "EVCRATE_STATE_HOME": str(root / "state")},
            )
            artifact = VerifiedArtifact(REPOSITORY, context.local_roots)
            with patch("distribution.publish_verification.controller_hashes", return_value={"stale": "hash"}):
                with self.assertRaisesRegex(PublishError, "stale"):
                    verify_local_artifact(context, artifact)
            self.assertFalse((context.home / ".evcrate/bin").exists())

    def test_symlinked_controller_home_is_rejected_without_following_it(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = context_for(root, ("pi",))
            outside = root / "outside"
            outside.mkdir()
            (context.home / ".evcrate").symlink_to(outside, target_is_directory=True)
            with patch("distribution.publish.verify_local_artifact"):
                with self.assertRaisesRegex(PublishError, "unsafe"):
                    publish_local_artifacts(context, artifact_for(context))
            self.assertFalse((outside / "bin").exists())
            self.assertFalse((context.state_dir / "release-marker.json").exists())

    def test_selected_publish_does_not_touch_unselected_harness_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = context_for(root, ("pi",))
            sentinels = {}
            for name in (".claude", ".codex", ".agents", ".gemini", ".antigravity", ".omp"):
                path = context.home / name / "user-owned.txt"
                path.parent.mkdir(parents=True)
                path.write_text(name, encoding="utf-8")
                sentinels[name] = tree_bytes(path.parent)
            with patch("distribution.publish.verify_local_artifact"):
                changes = run_home_publish(context, artifact_for(context))
            self.assertEqual({change.root for change in changes}, {".evcrate/bin", ".pi"})
            for name, before in sentinels.items():
                self.assertEqual(tree_bytes(context.home / name), before)

    def test_publish_diff_validates_artifact_before_planning(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            artifact = artifact_for(context)
            with patch("distribution.publish.verify_local_artifact", side_effect=PublishError("invalid artifact")) as verify:
                with self.assertRaisesRegex(PublishError, "invalid artifact"):
                    publish_diff(context, artifact)
            verify.assert_called_once_with(context, artifact)


if __name__ == "__main__":
    unittest.main()
