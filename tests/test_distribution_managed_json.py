"""Byte-preserving managed JSONC publication contracts."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.managed_json import ManagedJsonError, plan_managed_json


MANAGED_KEYS = ("includeCoAuthoredBy", "effortLevel", "statusLine")
FRAGMENT = json.dumps(
    {
        "includeCoAuthoredBy": False,
        "effortLevel": "high",
        "statusLine": {"type": "command", "command": "node -e status"},
    },
    separators=(",", ":"),
).encode()


class ManagedJsonPlanTest(unittest.TestCase):
    def test_create_emits_only_the_declared_managed_keys(self) -> None:
        plan = plan_managed_json(None, FRAGMENT, managed_keys=MANAGED_KEYS)
        self.assertEqual(plan.action, "create")
        self.assertEqual(json.loads(plan.result), json.loads(FRAGMENT))

    def test_jsonc_update_preserves_comments_unmanaged_values_bom_and_line_endings(self) -> None:
        existing = (
            b"\xef\xbb\xbf{\r\n"
            b"  // User-owned settings stay byte-for-byte intact.\r\n"
            b'  "custom": {"enabled": true,},\r\n'
            b'  "includeCoAuthoredBy": true, // managed\r\n'
            b'  "effortLevel": "low",\r\n'
            b"}\r\n"
        )
        plan = plan_managed_json(existing, FRAGMENT, managed_keys=MANAGED_KEYS)
        self.assertEqual(plan.action, "update")
        self.assertTrue(plan.result.startswith(b"\xef\xbb\xbf"))
        self.assertIn(b"// User-owned settings stay byte-for-byte intact.", plan.result)
        self.assertIn(b'"custom": {"enabled": true,}', plan.result)
        self.assertIn(b"\r\n", plan.result)
        self.assertIn(b'"includeCoAuthoredBy": false', plan.result)
        self.assertIn(b'"effortLevel": "high"', plan.result)
        self.assertIn(b'"statusLine": {"type":"command","command":"node -e status"}', plan.result)
        self.assertEqual(plan_managed_json(plan.result, FRAGMENT, managed_keys=MANAGED_KEYS).action, "noop")

    def test_missing_managed_keys_are_inserted_into_empty_and_nonempty_objects(self) -> None:
        empty = plan_managed_json(b"{}", FRAGMENT, managed_keys=MANAGED_KEYS)
        self.assertEqual(json.loads(empty.result), json.loads(FRAGMENT))
        existing = b'{"custom": 1, "includeCoAuthoredBy": true}'
        plan = plan_managed_json(existing, FRAGMENT, managed_keys=MANAGED_KEYS)
        parsed = json.loads(plan.result)
        self.assertEqual(parsed["custom"], 1)
        self.assertEqual(parsed["effortLevel"], "high")
        self.assertEqual(parsed["statusLine"]["command"], "node -e status")

    def test_missing_keys_follow_an_inline_comment_without_corrupting_jsonc(self) -> None:
        existing = b'{\n  "custom": 1 // keep this comment\n}\n'
        plan = plan_managed_json(existing, FRAGMENT, managed_keys=MANAGED_KEYS)
        self.assertIn(b'"custom": 1 // keep this comment', plan.result)
        self.assertEqual(plan_managed_json(plan.result, FRAGMENT, managed_keys=MANAGED_KEYS).action, "noop")

    def test_exact_values_are_a_byte_preserving_noop(self) -> None:
        existing = b'{"custom": 1, "includeCoAuthoredBy": false, "effortLevel": "high", "statusLine": {"type":"command","command":"node -e status"}}'
        plan = plan_managed_json(existing, FRAGMENT, managed_keys=MANAGED_KEYS)
        self.assertEqual(plan.action, "noop")
        self.assertEqual(plan.result, existing)

    def test_malformed_duplicate_and_type_conflict_inputs_fail_closed(self) -> None:
        cases = (
            (b'{"includeCoAuthoredBy": false, "includeCoAuthoredBy": true}', FRAGMENT, "Duplicate"),
            (b'{"includeCoAuthoredBy": false', FRAGMENT, "Invalid"),
            (b'{"includeCoAuthoredBy": "yes"}', FRAGMENT, "changes type"),
        )
        for existing, fragment, message in cases:
            with self.subTest(message=message):
                with self.assertRaisesRegex(ManagedJsonError, message):
                    plan_managed_json(existing, fragment, managed_keys=MANAGED_KEYS)

    def test_fragment_keys_must_match_the_manifest_contract(self) -> None:
        with self.assertRaisesRegex(ManagedJsonError, "exactly match"):
            plan_managed_json(
                None,
                b'{"includeCoAuthoredBy":false}',
                managed_keys=MANAGED_KEYS,
            )
        with self.assertRaises(ManagedJsonError):
            plan_managed_json(FRAGMENT, FRAGMENT, managed_keys=("effortLevel", "effortLevel"))

    def test_copilot_publication_merges_only_managed_settings_bytes(self) -> None:
        from distribution.publish import publish_local_artifacts
        from tests.distribution_support import artifact_for, context_for

        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("copilot",))
            settings = context.home / ".copilot/settings.json"
            settings.parent.mkdir(parents=True)
            original = (
                b"{\n"
                b"  // Keep this user setting and comment.\n"
                b'  \"custom\": {\"enabled\": true},\n'
                b'  \"effortLevel\": \"low\"\n'
                b"}\n"
            )
            settings.write_bytes(original)
            with patch("distribution.publish.verify_local_artifact"):
                publish_local_artifacts(context, artifact_for(context))
            merged = settings.read_bytes()
            self.assertIn(b"// Keep this user setting and comment.", merged)
            self.assertIn(b'\"custom\": {\"enabled\": true}', merged)
            self.assertIn(b'\"includeCoAuthoredBy\": false', merged)
            self.assertIn(b'\"effortLevel\": \"high\"', merged)
            self.assertNotEqual(merged, original)

    def test_copilot_unmanaged_collision_is_dry_run_only_and_non_destructive(self) -> None:
        from distribution.contracts import PublishError
        from distribution.publish import publish_local_artifacts
        from tests.distribution_support import artifact_for, context_for

        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("copilot",))
            collision = context.home / ".copilot/copilot-instructions.md"
            collision.parent.mkdir(parents=True)
            collision.write_text("user-owned\n", encoding="utf-8")
            before = collision.read_bytes()
            with patch("distribution.publish.verify_local_artifact"):
                dry = publish_local_artifacts(context, artifact_for(context), dry_run=True)
                with self.assertRaisesRegex(PublishError, "Unmanaged HOME collision"):
                    publish_local_artifacts(context, artifact_for(context))
            self.assertIn((".copilot", "copilot-instructions.md", "conflict"), {
                (item.root, item.path, item.action) for item in dry
            })
            self.assertEqual(collision.read_bytes(), before)
    def test_copilot_collision_is_rechecked_before_exclusive_create(self) -> None:
        from distribution.contracts import PublishError
        from distribution.publish import _publication_files, publish_local_artifacts
        from tests.distribution_support import artifact_for, context_for

        with tempfile.TemporaryDirectory() as temp:
            context = context_for(Path(temp), ("copilot",))
            collision = context.home / ".copilot/copilot-instructions.md"
            real_files = _publication_files
            calls = 0

            def inject_collision(current_context, local, home):
                nonlocal calls
                calls += 1
                files = real_files(current_context, local, home)
                if calls == 2:
                    collision.parent.mkdir(parents=True, exist_ok=True)
                    collision.write_text("created concurrently\n", encoding="utf-8")
                return files

            with patch("distribution.publish.verify_local_artifact"), patch(
                "distribution.publish._publication_files", side_effect=inject_collision
            ):
                with self.assertRaisesRegex(PublishError, "Unmanaged HOME collision"):
                    publish_local_artifacts(context, artifact_for(context))
            self.assertEqual(collision.read_text(encoding="utf-8"), "created concurrently\n")



if __name__ == "__main__":
    unittest.main()
