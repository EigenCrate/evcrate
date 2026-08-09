from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.context import DistributionContext
from distribution.contracts import DistributionAction, PublishError, VerifiedArtifact
from distribution.pi_settings import MANAGED_PACKAGES, plan_pi_settings
from distribution.publish import publish_local_artifacts


class PiSettingsPlanTest(unittest.TestCase):
    def test_create_and_exact_noop_preserve_bytes(self) -> None:
        created = plan_pi_settings(None, {"packages": list(MANAGED_PACKAGES)})
        self.assertEqual(created.action, "merge-create")
        self.assertEqual(json.loads(created.result or b""), {"packages": list(MANAGED_PACKAGES)})
        original = b'{"defaultModel":"keep","packages":["npm:pi-subagents@0.44.0","npm:@juicesharp/rpiv-ask-user-question@2.4.0"]}'
        noop = plan_pi_settings(original, {"packages": list(MANAGED_PACKAGES)})
        self.assertEqual(noop.action, "noop")
        self.assertEqual(noop.result, original)

    def test_update_replaces_old_managed_entries_and_preserves_unknown_values(self) -> None:
        original = json.dumps({
            "defaultProvider": "openai-codex",
            "evcrate": {"modelRoles": {"strong": "custom"}},
            "packages": [
                {"source": "npm:pi-subagents@0.1.0", "enabled": False},
                "npm:custom@1.0.0",
                {"source": "npm:@juicesharp/rpiv-ask-user-question@2.3.0", "filter": ["tools"]},
            ],
        }, separators=(",", ":")).encode()
        plan = plan_pi_settings(original, {"packages": list(MANAGED_PACKAGES)})
        self.assertEqual(plan.action, "merge-update")
        merged = json.loads(plan.result or b"")
        self.assertEqual(merged["defaultProvider"], "openai-codex")
        self.assertEqual(merged["evcrate"], {"modelRoles": {"strong": "custom"}})
        self.assertEqual(merged["packages"][0], "npm:custom@1.0.0")
        self.assertEqual(merged["packages"][1]["source"], MANAGED_PACKAGES[0])
        self.assertFalse(merged["packages"][1]["enabled"])
        self.assertEqual(merged["packages"][2]["source"], MANAGED_PACKAGES[1])
        self.assertEqual(merged["packages"][2]["filter"], ["tools"])

    def test_pi_code_conflict_is_reported_without_result(self) -> None:
        for entry in (
            "pi-code", "npm:pi-code@1.0.2", {"source": "npm:pi-code@1.0.2"},
            {"package": "npm:pi-code"}, {"name": "pi-code"},
        ):
            plan = plan_pi_settings(json.dumps({"packages": [entry]}).encode(), {"packages": list(MANAGED_PACKAGES)})
            self.assertEqual(plan.action, "conflict")
            self.assertIsNone(plan.result)

    def test_malformed_and_wrong_fragment_fail_closed(self) -> None:
        with self.assertRaises(ValueError):
            plan_pi_settings(b"[]", {"packages": list(MANAGED_PACKAGES)})
        with self.assertRaises(ValueError):
            plan_pi_settings(None, {"packages": ["npm:pi-subagents@wrong"]})


class PiSettingsPublicationTest(unittest.TestCase):
    def _fixture(self, root: Path) -> tuple[DistributionContext, VerifiedArtifact]:
        repository = root / "repo"
        target = repository / ".evcrate/targets/pi"
        target.mkdir(parents=True)
        (repository / ".evcrate/targets/manifest.json").write_text(
            '{"schema_version":1,"targets":{"pi":"pi/manifest.json"}}', encoding="utf-8"
        )
        (target / "manifest.json").write_text(json.dumps({
            "schema_version": 1, "name": "pi", "adapter": None,
            "output_root": ".pi", "additional_roots": [], "patches": [],
            "shared_json": {"schema": "pi-settings-v1", "destination": "agent/settings.json", "fragment": "agent/evcrate/managed-settings.json", "managed_key": "packages"},
            "home_policy": {"bindings": {".pi": ".pi"}, "preserve_paths": {}, "promotion_order": 1},
        }), encoding="utf-8")
        context = DistributionContext(DistributionAction.PUBLISH, repository, root / "home", None, "managed", "config-and-scripts", root / "state")
        fragment = context.local_pi / "agent/evcrate/managed-settings.json"
        fragment.parent.mkdir(parents=True)
        fragment.write_text(json.dumps({"packages": list(MANAGED_PACKAGES)}, separators=(",", ":")), encoding="utf-8")
        return context, VerifiedArtifact(repository, context.local_roots)

    def test_publish_merges_only_packages_and_keeps_settings_out_of_managed_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context, artifact = self._fixture(Path(temp))
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            original = b'{"defaultModel":"keep","packages":["npm:pi-subagents@0.1.0","npm:custom@1.0.0"]}'
            settings.write_bytes(original)
            (context.target_pi / "user-session.json").write_text("keep", encoding="utf-8")
            with patch("distribution.publish.verify_local_artifact"):
                changes = publish_local_artifacts(context, artifact)
                merged_bytes = settings.read_bytes()
                second = publish_local_artifacts(context, artifact)
            merged = json.loads(merged_bytes)
            self.assertEqual(merged["defaultModel"], "keep")
            self.assertEqual(merged["packages"][0], "npm:custom@1.0.0")
            self.assertEqual(merged["packages"][1], MANAGED_PACKAGES[0])
            self.assertEqual(merged["packages"][2], MANAGED_PACKAGES[1])
            self.assertIn((".pi", "agent/settings.json", "merge-update"), [(item.root, item.path, item.action) for item in changes])
            self.assertIn((".pi", "agent/settings.json", "noop"), [(item.root, item.path, item.action) for item in second])
            marker = json.loads((context.state_dir / "release-marker.json").read_text(encoding="utf-8"))
            self.assertNotIn("agent/settings.json", marker["managed_paths"][".pi"])
            self.assertEqual((context.target_pi / "user-session.json").read_text(encoding="utf-8"), "keep")

    def test_pi_code_conflict_is_dry_run_only_and_non_destructive(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context, artifact = self._fixture(Path(temp))
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text('{"packages":["npm:pi-code@1.0.2"]}', encoding="utf-8")
            before = settings.read_bytes()
            with patch("distribution.publish.verify_local_artifact"):
                dry = publish_local_artifacts(context, artifact, dry_run=True)
                with self.assertRaisesRegex(PublishError, "pi-code"):
                    publish_local_artifacts(context, artifact)
            self.assertIn((".pi", "agent/settings.json", "conflict"), [(item.root, item.path, item.action) for item in dry])
            self.assertEqual(settings.read_bytes(), before)

    def test_symlinked_settings_are_rejected_before_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context, artifact = self._fixture(Path(temp))
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            outside = Path(temp) / "outside-settings.json"
            outside.write_text('{"packages":[]}', encoding="utf-8")
            settings.symlink_to(outside)
            with patch("distribution.publish.verify_local_artifact"):
                with self.assertRaisesRegex(PublishError, "symlink"):
                    publish_local_artifacts(context, artifact)
            self.assertEqual(outside.read_text(encoding="utf-8"), '{"packages":[]}')

    def test_concurrent_pi_home_change_aborts_before_promotion(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context, artifact = self._fixture(Path(temp))
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text('{"packages":[]}', encoding="utf-8")
            from distribution import publish as module
            original = module._copy_candidate

            def mutate_after_candidate(*args: object, **kwargs: object):
                candidate, managed = original(*args, **kwargs)
                (context.target_pi / "session-live.json").write_text("concurrent", encoding="utf-8")
                return candidate, managed

            with patch("distribution.publish.verify_local_artifact"), patch("distribution.publish._copy_candidate", side_effect=mutate_after_candidate):
                with self.assertRaisesRegex(PublishError, "concurrently"):
                    publish_local_artifacts(context, artifact)
            self.assertEqual(settings.read_text(encoding="utf-8"), '{"packages":[]}')
            self.assertEqual((context.target_pi / "session-live.json").read_text(encoding="utf-8"), "concurrent")


if __name__ == "__main__":
    unittest.main()
