"""Gemini target migration keeps advisor execution central."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import migrate_claude_to_gemini as migrator

from tests.distribution_support import REPOSITORY, clean_environment

FORBIDDEN = ("advisor-bridge.cjs", "advisor-coordinator.cjs", "advisor-dispatch.cjs", "advisor-handoff.cjs", "native-capabilities.json", "active_host")


class GeminiMigrationTest(unittest.TestCase):
    def test_replacements_keep_urls_and_translate_harness_resources(self) -> None:
        self.assertEqual(migrator.apply_replacements("Use Claude Code and the CLI."), "Use gemini Code and the CLI.")
        self.assertEqual(migrator.apply_replacements("Read .claude/workflows/advisor-mentoring.md."), "Read .gemini/workflows/advisor-mentoring.md.")
        self.assertEqual(migrator.apply_replacements("See https://claude.ai/docs and Claude."), "See https://claude.ai/docs and gemini.")
        self.assertEqual(migrator.apply_replacements("~/.evcrate/bin/evcrate-advisor"), "~/.evcrate/bin/evcrate-advisor")

    def test_local_migration_contains_central_workflow_without_controller_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = REPOSITORY / ".evcrate/source"
            output = root / ".gemini"
            env = clean_environment()
            env.update({
                "EVCRATE_SOURCE_DIR": str(source_root),
                "CLAUDE_SOURCE_DIR": str(source_root / ".claude"),
                "GEMINI_OUTPUT_DIR": str(output),
                "GEMINI_PROJECT_DOCS_OUTPUT_DIR": str(root),
            })
            completed = subprocess.run(
                [sys.executable, str(REPOSITORY / "migrate_claude_to_gemini.py")],
                cwd=REPOSITORY,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            workflow = (output / "workflows/advisor-mentoring.md").read_text(encoding="utf-8")
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

    def test_direct_global_migration_is_closed_by_default(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(REPOSITORY / "migrate_claude_to_gemini.py"), "--global"],
            cwd=REPOSITORY,
            env=clean_environment(),
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("EVCRATE_ALLOW_DIRECT_GLOBAL=1", completed.stderr)

    def test_symlinked_source_is_rejected_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / ".evcrate/source"
            source_root.mkdir(parents=True)
            outside = root / "outside"
            outside.mkdir()
            (source_root / ".claude").symlink_to(outside, target_is_directory=True)
            env = clean_environment()
            env.update({
                "EVCRATE_SOURCE_DIR": str(source_root),
                "CLAUDE_SOURCE_DIR": str(source_root / ".claude"),
                "GEMINI_OUTPUT_DIR": str(root / ".gemini"),
                "GEMINI_PROJECT_DOCS_OUTPUT_DIR": str(root),
            })
            completed = subprocess.run(
                [sys.executable, str(REPOSITORY / "migrate_claude_to_gemini.py")],
                cwd=REPOSITORY,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("Canonical Claude source", completed.stderr)
            self.assertFalse((root / ".gemini").exists())


if __name__ == "__main__":
    unittest.main()
