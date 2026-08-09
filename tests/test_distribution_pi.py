"""End-to-end isolated-HOME coverage for the native Pi target."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.context import create_context
from distribution.contracts import DistributionAction, PublishError, VerifiedArtifact
from distribution.gates import run_home_publish, run_local_build, run_local_check
from distribution.publish import publish_local_artifacts


REPOSITORY = Path(__file__).resolve().parents[1]


def tree_bytes(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class NativePiDistributionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        run_local_build()
        run_local_check()

    def _context(self, root: Path):
        environment = {
            "EVCRATE_HOME": str(root / "home"),
            "EVCRATE_STATE_HOME": str(root / "state"),
        }
        context = create_context(DistributionAction.PUBLISH, environ=environment)
        return context, VerifiedArtifact(REPOSITORY, context.local_roots)

    def test_publish_preserves_settings_and_removes_prior_managed_pi_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context, artifact = self._context(Path(temp))
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text(json.dumps({
                "defaultProvider": "custom",
                "defaultModel": "keep-me",
                "packages": [{"source": "npm:custom@1.0.0", "enabled": False}],
                "evcrate": {"modelRoles": {"providers": {"custom": {}}}},
                "unknown": {"nested": ["preserve"]},
            }, separators=(",", ":")), encoding="utf-8")
            user_file = context.target_pi / "sessions/user-owned.json"
            user_file.parent.mkdir(parents=True)
            user_file.write_text("keep", encoding="utf-8")

            first = run_home_publish(context, artifact)
            merged = json.loads(settings.read_text(encoding="utf-8"))
            self.assertEqual(merged["defaultProvider"], "custom")
            self.assertEqual(merged["unknown"], {"nested": ["preserve"]})
            self.assertEqual(merged["packages"][0]["source"], "npm:custom@1.0.0")
            self.assertEqual({entry for entry in merged["packages"] if isinstance(entry, str)}, {
                "npm:pi-subagents@0.44.0",
                "npm:@juicesharp/rpiv-ask-user-question@2.4.0",
            })
            self.assertTrue(any(getattr(change, "root", None) == ".pi" for change in first))

            stale = context.target_pi / "agent/evcrate/commands/stale.md"
            stale.write_text("managed stale file", encoding="utf-8")
            marker_path = context.state_dir / "release-marker.json"
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            marker["managed_paths"][".pi"].append("agent/evcrate/commands/stale.md")
            marker_path.write_text(json.dumps(marker, sort_keys=True), encoding="utf-8")

            before_dry_run = tree_bytes(context.target_pi)
            dry_run = run_home_publish(context, artifact, dry_run=True)
            self.assertEqual(before_dry_run, tree_bytes(context.target_pi))
            self.assertIn((".pi", "agent/evcrate/commands/stale.md", "delete"), {
                (change.root, change.path, change.action) for change in dry_run
            })

            second = run_home_publish(context, artifact)
            self.assertFalse(stale.exists())
            self.assertEqual(user_file.read_text(encoding="utf-8"), "keep")
            self.assertIn((".pi", "agent/settings.json", "noop"), {
                (change.root, change.path, change.action) for change in second
            })

    def test_pi_conflict_symlink_and_concurrent_mutation_abort_without_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context, artifact = self._context(root)
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text('{"packages":["npm:pi-code@1.0.0"]}', encoding="utf-8")
            original = settings.read_bytes()
            dry_run = run_home_publish(context, artifact, dry_run=True)
            self.assertIn((".pi", "agent/settings.json", "conflict"), {
                (change.root, change.path, change.action) for change in dry_run
            })
            with self.assertRaisesRegex(PublishError, "pi-code"):
                run_home_publish(context, artifact)
            self.assertEqual(settings.read_bytes(), original)

            settings.write_text('{"packages":[]}', encoding="utf-8")
            from distribution import publish as publish_module
            original_copy = publish_module._copy_candidate

            def mutate_after_candidate(*args: object, **kwargs: object):
                candidate, managed = original_copy(*args, **kwargs)
                (context.target_pi / "session-live.json").write_text("concurrent", encoding="utf-8")
                return candidate, managed

            with patch("distribution.publish._copy_candidate", side_effect=mutate_after_candidate):
                with self.assertRaisesRegex(PublishError, "concurrently"):
                    publish_local_artifacts(context, artifact)
            self.assertEqual(settings.read_text(encoding="utf-8"), '{"packages":[]}')

            shutil.rmtree(context.target_pi)
            outside = root / "outside"
            outside.mkdir()
            context.target_pi.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(PublishError, "unsafe ancestor"):
                run_home_publish(context, artifact)
            self.assertFalse((outside / "agent").exists())


if __name__ == "__main__":
    unittest.main()
