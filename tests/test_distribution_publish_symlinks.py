"""Security regressions for HOME symlinks during publication."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.context import DistributionContext
from distribution.contracts import DistributionAction, PublishError, VerifiedArtifact
from distribution.publish import _managed_destination, publish_diff, publish_local_artifacts
from distribution.publish_inventory import home_tree_hash


class DistributionPublishSymlinkTest(unittest.TestCase):
    def _context(self, root: Path) -> DistributionContext:
        return DistributionContext(DistributionAction.PUBLISH, root / "repo", root / "home", None, "managed", "config-and-scripts", root / "state")

    def _policy(self, source: Path, home: Path) -> list[tuple[str, Path, Path, set[str]]]:
        return [(".agents", source, home, set())]

    def _publish(self, context: DistributionContext, source: Path, home: Path, *, dry_run: bool = False) -> list[object]:
        with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=self._policy(source, home)):
            return publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots), dry_run=dry_run)

    def test_unmanaged_dangling_symlink_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home = root / "source", context.home / ".agents"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "managed").write_text("new", encoding="utf-8")
            launcher = home / "node_modules/.bin/browser"
            launcher.parent.mkdir(parents=True)
            launcher.symlink_to("../playwright/cli.js")
            changes = self._publish(context, source, home)
            self.assertNotIn("node_modules/.bin/browser", {item.path for item in changes})
            self.assertTrue(launcher.is_symlink())
            self.assertEqual(launcher.readlink(), Path("../playwright/cli.js"))
            self.assertEqual((home / "managed").read_text(encoding="utf-8"), "new")

    def test_managed_destination_symlink_is_rejected_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home, outside = root / "source", context.home / ".agents", root / "outside"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "managed").write_text("new", encoding="utf-8")
            outside.write_text("keep", encoding="utf-8")
            (home / "managed").symlink_to(outside)
            with self.assertRaisesRegex(PublishError, "intersects managed"):
                self._publish(context, source, home, dry_run=True)
            self.assertEqual(outside.read_text(encoding="utf-8"), "keep")

    def test_managed_ancestor_symlink_is_rejected_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home, outside = root / "source", context.home / ".agents", root / "outside"
            source.mkdir(parents=True)
            outside.mkdir()
            home.mkdir(parents=True)
            (source / "nested").mkdir()
            (source / "nested/managed").write_text("new", encoding="utf-8")
            (outside / "managed").write_text("keep", encoding="utf-8")
            (home / "nested").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(PublishError, "intersects managed"):
                self._publish(context, source, home, dry_run=True)
            self.assertEqual((outside / "managed").read_text(encoding="utf-8"), "keep")

    def test_prior_managed_symlink_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home, outside = root / "source", context.home / ".agents", root / "outside"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            outside.write_text("keep", encoding="utf-8")
            (home / "stale").symlink_to(outside)
            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=self._policy(source, home)), patch("distribution.publish.read_release_marker", return_value={"status": "complete", "managed_paths": {".agents": ["stale"]}}):
                with self.assertRaisesRegex(PublishError, "intersects managed"):
                    publish_diff(context, VerifiedArtifact(context.repository, context.local_roots))
            self.assertEqual(outside.read_text(encoding="utf-8"), "keep")

    def test_invalid_prior_paths_are_rejected_without_mutation(self) -> None:
        for invalid in (["../victim"], ["/victim"], [1]):
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                context = self._context(root)
                source, home, victim = root / "source", context.home / ".agents", context.home / "victim"
                source.mkdir(parents=True)
                home.mkdir(parents=True)
                victim.write_text("keep", encoding="utf-8")
                marker = {"status": "complete", "managed_paths": {".agents": invalid}}
                with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._policies", return_value=self._policy(source, home)), patch("distribution.publish.read_release_marker", return_value=marker):
                    with self.assertRaisesRegex(PublishError, "Release marker paths are invalid"):
                        publish_local_artifacts(context, VerifiedArtifact(context.repository, context.local_roots))
                self.assertEqual(victim.read_text(encoding="utf-8"), "keep")

    def test_home_hash_includes_dangling_symlink_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            link = root / "launcher"
            link.symlink_to("missing-one")
            first = home_tree_hash(root)
            link.unlink()
            link.symlink_to("missing-two")
            self.assertNotEqual(first, home_tree_hash(root))

    def test_managed_destination_guard_rejects_destination_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home, outside = root / "source", context.home / ".agents", root / "outside"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            (source / "managed").write_text("new", encoding="utf-8")
            outside.write_text("keep", encoding="utf-8")
            (home / "managed").symlink_to(outside)
            with self.assertRaisesRegex(PublishError, "intersects managed"):
                _managed_destination(home, "managed")
            self.assertEqual(outside.read_text(encoding="utf-8"), "keep")

    def test_source_symlink_is_still_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = self._context(root)
            source, home, outside = root / "source", context.home / ".agents", root / "outside"
            source.mkdir(parents=True)
            home.mkdir(parents=True)
            outside.write_text("outside", encoding="utf-8")
            (source / "managed").symlink_to(outside)
            with self.assertRaisesRegex(PublishError, "Artifact contains symlink"):
                self._publish(context, source, home, dry_run=True)


if __name__ == "__main__":
    unittest.main()
