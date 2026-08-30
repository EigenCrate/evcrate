"""Pi resource projection contracts after the central-controller cutover."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import migrate_claude_to_pi
from pi_adapter.resources import ResourceError, hook_map, translate_prompt

from tests.distribution_support import REPOSITORY

CANONICAL = REPOSITORY / ".evcrate/source/.claude"
FORBIDDEN = ("advisor-bridge.cjs", "advisor-coordinator.cjs", "advisor-dispatch.cjs", "advisor-handoff.cjs", "active_host")


def tree_digest(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file() and not path.is_symlink()
    }


class PiResourceMigrationTest(unittest.TestCase):
    def _migrate(self, output: Path, stage: Path) -> None:
        with patch.dict(os.environ, {
            "EVCRATE_REPOSITORY": str(REPOSITORY),
            "EVCRATE_SOURCE_DIR": str(REPOSITORY / ".evcrate/source"),
            "CLAUDE_SOURCE_DIR": str(CANONICAL),
            "PI_STAGE_ROOT": str(stage),
            "PI_OUTPUT_DIR": str(output),
        }, clear=False):
            self.assertEqual(migrate_claude_to_pi.main([]), 0)

    def test_real_migration_is_deterministic_and_has_no_controller_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first_stage, second_stage = root / "first", root / "second"
            first = first_stage / ".pi"
            second = second_stage / ".pi"
            first.mkdir(parents=True)
            second.mkdir(parents=True)
            self._migrate(first, first_stage)
            self._migrate(second, second_stage)
            self.assertEqual(tree_digest(first), tree_digest(second))
            inventory = json.loads((first / "agent/evcrate/inventory.json").read_text(encoding="utf-8"))
            self.assertNotIn("advisorRuntime", inventory)
            self.assertNotIn("distribution/advisor_runtime.py", " ".join(inventory.get("scripts", [])))
            advisor = (first / "agent/agents/advisor.md").read_text(encoding="utf-8")
            workflow = (first / "agent/evcrate/workflows/advisor-mentoring.md").read_text(encoding="utf-8")
            self.assertIn("evcrate-advisor-checkpoint", advisor)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", workflow)
            for generated in first.rglob("*"):
                if generated.is_file():
                    try:
                        text = generated.read_text(encoding="utf-8")
                    except UnicodeDecodeError:
                        continue
                    for marker in FORBIDDEN:
                        self.assertNotIn(marker, text, generated.as_posix())

    def test_prompt_translation_preserves_urls_and_rewrites_resource_roots(self) -> None:
        cases = (
            ("$HOME/.claude/skills/debugging/SKILL.md", "$HOME/.pi/agent/skills/debugging/SKILL.md"),
            ("~/.claude/scripts/resolve_env.py", "~/.pi/agent/evcrate/scripts/resolve_env.py"),
            ("./.claude/commands/scout.md", "./.pi/agent/evcrate/commands/scout.md"),
            ("See https://example.test/.claude/path", "See https://example.test/.claude/path"),
        )
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(translate_prompt(source), expected)
                self.assertEqual(translate_prompt(expected), expected)

    def test_hook_map_preserves_order_and_rejects_symlinked_settings(self) -> None:
        mapped = hook_map(CANONICAL)
        self.assertEqual(mapped["events"]["PreToolUse"][0]["scripts"], ["scout-block.cjs", "privacy-block.cjs"])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "hooks").mkdir()
            outside = root / "external-settings.json"
            outside.write_text('{"hooks":{}}', encoding="utf-8")
            (root / "settings.json").symlink_to(outside)
            with self.assertRaises(ResourceError):
                hook_map(root)

    def test_migration_rejects_escaped_output_and_direct_global_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stage = root / "stage"
            output = stage / ".pi"
            output.mkdir(parents=True)
            with patch.dict(os.environ, {
                "EVCRATE_REPOSITORY": str(REPOSITORY),
                "EVCRATE_SOURCE_DIR": str(REPOSITORY / ".evcrate/source"),
                "CLAUDE_SOURCE_DIR": str(CANONICAL),
                "PI_STAGE_ROOT": str(stage),
                "PI_OUTPUT_DIR": str(output),
            }, clear=False):
                with self.assertRaises(SystemExit):
                    migrate_claude_to_pi.main(["--global"])


if __name__ == "__main__":
    unittest.main()
