"""Selected Pi publication with the singleton controller."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.advisor_controller import ADVISOR_CONTROLLER_FILES
from distribution.contracts import PublishError, VerifiedArtifact
from distribution.publish import publish_local_artifacts
from distribution.publish_verification import verify_local_artifact

from tests.distribution_support import artifact_for, context_for, tree_bytes


class NativePiDistributionTest(unittest.TestCase):
    def test_selected_publish_installs_controller_and_only_pi_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            for name in (".claude", ".codex", ".agents", ".gemini", ".antigravity", ".omp"):
                path = context.home / name / "user-owned.txt"
                path.parent.mkdir(parents=True)
                path.write_text(name, encoding="utf-8")
            with patch("distribution.publish.verify_local_artifact"):
                changes = publish_local_artifacts(context, artifact_for(context))
            self.assertEqual({change.root for change in changes}, {".evcrate/bin", ".pi"})
            controller = context.home / ".evcrate/bin"
            self.assertTrue((controller / "evcrate-advisor").is_file())
            self.assertEqual(set(path.relative_to(controller).as_posix() for path in controller.rglob("*") if path.is_file()), set(ADVISOR_CONTROLLER_FILES))
            for name in (".claude", ".codex", ".agents", ".gemini", ".antigravity", ".omp"):
                self.assertEqual((context.home / name / "user-owned.txt").read_text(encoding="utf-8"), name)

    def test_pi_settings_and_user_files_are_preserved_during_selected_publish(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            settings = context.home / ".pi/agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text(json.dumps({
                "defaultProvider": "custom",
                "defaultModel": "keep-me",
                "packages": ["npm:custom@1.0.0"],
                "unknown": {"nested": ["preserve"]},
            }), encoding="utf-8")
            user_file = context.home / ".pi/sessions/user-owned.json"
            user_file.parent.mkdir(parents=True)
            user_file.write_text("keep", encoding="utf-8")
            with patch("distribution.publish.verify_local_artifact"):
                publish_local_artifacts(context, artifact_for(context))
            merged = json.loads(settings.read_text(encoding="utf-8"))
            self.assertEqual(merged["defaultProvider"], "custom")
            self.assertEqual(merged["unknown"], {"nested": ["preserve"]})
            self.assertIn("npm:custom@1.0.0", merged["packages"])
            self.assertEqual(user_file.read_text(encoding="utf-8"), "keep")

    def test_selected_controller_artifact_is_not_authorized_by_pi_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            manifest = json.loads((context.repository / ".evcrate/targets/pi/manifest.json").read_text(encoding="utf-8"))
            self.assertNotIn("advisor_runtime", manifest)
            self.assertNotIn("distribution/advisor_runtime.py", manifest.get("adapter_sources", []))
            self.assertNotIn("bin", tree_bytes(context.local_pi))

    def test_selected_verification_rejects_missing_or_wrong_artifact_reference(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            with self.assertRaisesRegex(PublishError, "Artifact reference"):
                verify_local_artifact(context, VerifiedArtifact(context.repository, (context.local_pi,)))


if __name__ == "__main__":
    unittest.main()
