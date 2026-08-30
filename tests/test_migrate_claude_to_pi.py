"""Pi migration emits ordinary resources and central advisor references."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import migrate_claude_to_pi
from pi_adapter.resources import copy_commands_and_workflows

from tests.distribution_support import REPOSITORY

CANONICAL = REPOSITORY / ".evcrate/source/.claude"
FORBIDDEN = ("advisor-bridge.cjs", "advisor-coordinator.cjs", "advisor-dispatch.cjs", "advisor-handoff.cjs", "active_host")


class PiAdapterTest(unittest.TestCase):
    def test_command_projection_keeps_advisor_execution_at_managed_controller(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / ".claude"
            output = root / ".pi"
            (source / "commands").mkdir(parents=True)
            (source / "workflows").mkdir()
            output.mkdir()
            for relative in ("commands/fix/hard.md", "workflows/advisor-mentoring.md"):
                target = source / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((CANONICAL / relative).read_bytes())
            copy_commands_and_workflows(source, output, ("fix/hard", "advisor-mentoring"))
            command = (output / "agent/evcrate/commands/fix/hard.md").read_text(encoding="utf-8")
            workflow = (output / "agent/evcrate/workflows/advisor-mentoring.md").read_text(encoding="utf-8")
            self.assertIn("~/.evcrate/bin/evcrate-advisor", command)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", workflow)
            for text in (command, workflow):
                for marker in FORBIDDEN:
                    self.assertNotIn(marker, text)

    def test_full_migration_is_contained_and_does_not_copy_controller(self) -> None:
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
                self.assertEqual(migrate_claude_to_pi.main([]), 0)
            workflow = (output / "agent/evcrate/workflows/advisor-mentoring.md").read_text(encoding="utf-8")
            self.assertIn("decision:<workflow-step>", workflow)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", workflow)
            self.assertFalse((output / "bin/lib/advisor").exists())
            for path in output.rglob("*"):
                if not path.is_file():
                    continue
                try:
                    text = path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                for marker in FORBIDDEN:
                    self.assertNotIn(marker, text, path.as_posix())

    def test_direct_global_mode_is_rejected(self) -> None:
        with self.assertRaises(SystemExit):
            migrate_claude_to_pi.main(["--global"])


if __name__ == "__main__":
    unittest.main()
