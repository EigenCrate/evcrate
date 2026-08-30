"""Codex target migration contracts after centralizing advisor execution."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import migrate_claude_to_codex as migrator

from tests.distribution_support import REPOSITORY, clean_environment

FORBIDDEN = ("advisor-bridge.cjs", "advisor-coordinator.cjs", "advisor-dispatch.cjs", "advisor-handoff.cjs", "native-capabilities.json", "active_host")


class CodexMigrationTest(unittest.TestCase):
    def test_replacements_keep_controller_global_and_translate_harness_paths(self) -> None:
        self.assertEqual(migrator.apply_replacements("Read .claude/scripts/tool.cjs and ~/.evcrate/bin/evcrate-advisor."), "Read .codex/scripts/tool.cjs and ~/.evcrate/bin/evcrate-advisor.")
        self.assertEqual(migrator.apply_replacements("Claude Code reads CLAUDE.md."), "Codex CLI reads AGENTS.md.")
        source = "See https://example.test/.claude/path and .claude/workflows/advisor-mentoring.md."
        self.assertEqual(migrator.apply_replacements(source), "See https://example.test/.claude/path and .codex/workflows/advisor-mentoring.md.")

    def test_local_migration_contains_no_controller_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = REPOSITORY / ".evcrate/source"
            output = root / ".codex"
            agents = root / ".agents"
            docs = root / "docs"
            env = clean_environment()
            env.update({
                "EVCRATE_SOURCE_DIR": str(source_root),
                "CLAUDE_SOURCE_DIR": str(source_root / ".claude"),
                "CODEX_OUTPUT_DIR": str(output),
                "AGENTS_OUTPUT_DIR": str(agents),
                "PROJECT_DOCS_OUTPUT_DIR": str(docs),
            })
            completed = subprocess.run(
                [sys.executable, str(REPOSITORY / "migrate_claude_to_codex.py")],
                cwd=REPOSITORY,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            workflow = (output / "workflows/advisor-mentoring.md").read_text(encoding="utf-8")
            self.assertIn("~/.evcrate/bin/evcrate-advisor", workflow)
            self.assertNotIn("advisor-bridge.cjs", workflow)
            self.assertFalse((output / "bin/lib/advisor").exists())
            for generated in (output, agents, docs):
                for path in generated.rglob("*"):
                    if not path.is_file():
                        continue
                    try:
                        text = path.read_text(encoding="utf-8")
                    except UnicodeDecodeError:
                        continue
                    for marker in FORBIDDEN:
                        self.assertNotIn(marker, text, path.as_posix())

    def test_direct_global_migration_is_closed_by_default(self) -> None:
        env = clean_environment()
        completed = subprocess.run(
            [sys.executable, str(REPOSITORY / "migrate_claude_to_codex.py"), "--global"],
            cwd=REPOSITORY,
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("EVCRATE_ALLOW_DIRECT_GLOBAL=1", completed.stderr)

    def test_symlinked_canonical_source_is_rejected_before_output(self) -> None:
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
                "CODEX_OUTPUT_DIR": str(root / ".codex"),
                "AGENTS_OUTPUT_DIR": str(root / ".agents"),
                "PROJECT_DOCS_OUTPUT_DIR": str(root / "docs"),
            })
            completed = subprocess.run(
                [sys.executable, str(REPOSITORY / "migrate_claude_to_codex.py")],
                cwd=REPOSITORY,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("Canonical Claude source", completed.stderr)
            self.assertFalse((root / ".codex").exists())


if __name__ == "__main__":
    unittest.main()
