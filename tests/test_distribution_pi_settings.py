"""Pi settings merge contracts under central-controller publication."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.contracts import PublishError
from distribution.pi_settings import MANAGED_PACKAGES, plan_pi_settings
from distribution.publish import publish_local_artifacts

from tests.distribution_support import artifact_for, context_for


class PiSettingsPlanTest(unittest.TestCase):
    def test_create_and_exact_noop_preserve_bytes(self) -> None:
        created = plan_pi_settings(None, {"packages": list(MANAGED_PACKAGES)})
        self.assertEqual(created.action, "merge-create")
        self.assertEqual(json.loads(created.result or b""), {"packages": list(MANAGED_PACKAGES)})
        original = b'{"defaultModel":"keep","packages":["npm:pi-subagents@0.44.0","npm:@juicesharp/rpiv-ask-user-question@2.4.0","npm:@juicesharp/rpiv-todo@2.4.0"]}'
        noop = plan_pi_settings(original, {"packages": list(MANAGED_PACKAGES)})
        self.assertEqual(noop.action, "noop")
        self.assertEqual(noop.result, original)

    def test_update_replaces_managed_entries_and_preserves_unknown_values(self) -> None:
        original = json.dumps({
            "defaultProvider": "openai-codex",
            "evcrate": {"modelRoles": {"strong": "custom"}},
            "packages": [
                {"source": "npm:pi-subagents@0.1.0", "enabled": False},
                "npm:custom@1.0.0",
                {"source": "npm:@juicesharp/rpiv-ask-user-question@2.3.0", "filter": ["tools"]},
                "npm:@juicesharp/rpiv-todo@2.3.0",
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
        self.assertEqual(merged["packages"][3], MANAGED_PACKAGES[2])

    def test_pi_code_conflict_is_reported_without_result(self) -> None:
        for entry in ("pi-code", "npm:pi-code@1.0.2", {"source": "npm:pi-code@1.0.2"}, {"package": "pi-code"}):
            with self.subTest(entry=entry):
                plan = plan_pi_settings(json.dumps({"packages": [entry]}).encode(), {"packages": list(MANAGED_PACKAGES)})
                self.assertEqual(plan.action, "conflict")
                self.assertIsNone(plan.result)

    def test_malformed_and_wrong_fragment_fail_closed(self) -> None:
        with self.assertRaises(ValueError):
            plan_pi_settings(b"[]", {"packages": list(MANAGED_PACKAGES)})
        with self.assertRaises(ValueError):
            plan_pi_settings(None, {"packages": ["npm:pi-subagents@wrong"]})


class PiSettingsPublicationTest(unittest.TestCase):
    def test_conflict_is_dry_run_only_and_non_destructive(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("pi",))
            settings = context.home / ".pi/agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text('{"packages":["npm:pi-code@1.0.2"]}', encoding="utf-8")
            before = settings.read_bytes()
            with patch("distribution.publish.verify_local_artifact"):
                dry = publish_local_artifacts(context, artifact_for(context), dry_run=True)
                with self.assertRaisesRegex(PublishError, "pi-code"):
                    publish_local_artifacts(context, artifact_for(context))
            self.assertIn((".pi", "agent/settings.json", "conflict"), {(item.root, item.path, item.action) for item in dry})
            self.assertEqual(settings.read_bytes(), before)

    def test_symlinked_settings_are_rejected_before_controller_or_pi_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context = context_for(root, ("pi",))
            settings = context.home / ".pi/agent/settings.json"
            settings.parent.mkdir(parents=True)
            outside = root / "outside-settings.json"
            outside.write_text('{"packages":[]}', encoding="utf-8")
            settings.symlink_to(outside)
            with patch("distribution.publish.verify_local_artifact"):
                with self.assertRaisesRegex(PublishError, "symlink"):
                    publish_local_artifacts(context, artifact_for(context))
            self.assertFalse((context.home / ".evcrate/bin").exists())
            self.assertEqual(outside.read_text(encoding="utf-8"), '{"packages":[]}')


if __name__ == "__main__":
    unittest.main()
