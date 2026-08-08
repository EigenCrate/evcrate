import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from migrate_claude_to_codex import (
    SUBAGENT_WAIT_CONTRACT,
    apply_replacements,
    apply_subagent_wait_contract,
    migrate_help_scripts,
)


class ApplyReplacementsTest(unittest.TestCase):
    def test_claude_markdown_filename_uses_canonical_agents_name(self) -> None:
        for source in ("CLAUDE.md", "Claude.md", "claude.md"):
            with self.subTest(source=source):
                self.assertEqual(apply_replacements(source), "AGENTS.md")

    def test_claude_markdown_filename_in_paths_and_context(self) -> None:
        self.assertEqual(
            apply_replacements("Read ./CLAUDE.md and docs/claude.md first."),
            "Read ./AGENTS.md and docs/AGENTS.md first.",
        )

    def test_filename_and_product_prose_are_replaced_independently(self) -> None:
        self.assertEqual(
            apply_replacements("Claude Code reads CLAUDE.md for Claude guidance."),
            "Codex CLI reads AGENTS.md for Codex guidance.",
        )

    def test_generic_claude_product_names_keep_existing_mapping(self) -> None:
        self.assertEqual(
            apply_replacements("Claude Code and Claude"),
            "Codex CLI and Codex",
        )

    def test_subagent_wait_contract_is_idempotent_and_fail_closed(self) -> None:
        source = "Call tester and continue only after its validation report."
        generated = apply_subagent_wait_contract(source)

        self.assertIn(SUBAGENT_WAIT_CONTRACT, generated)
        self.assertIn("wait for all N to finish", generated)
        self.assertIn('"No agents completed yet" is a non-terminal poll result', generated)
        self.assertIn("Do not invent a wall-clock limit", generated)
        self.assertIn("partial result as a failed gate", generated)
        self.assertIn("preserve the agent identity", generated)
        self.assertEqual(apply_subagent_wait_contract(generated), generated)

    def test_help_scripts_copy_to_codex_without_bytecode(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude" / "scripts"
            target_dir = root / ".codex"
            source_dir.mkdir(parents=True)
            (source_dir / "ev-help.py").write_bytes(b"help")
            (source_dir / "test-evcrate-help.py").write_bytes(b"test")
            (source_dir / "ignored.pyc").write_bytes(b"bytecode")

            with patch("migrate_claude_to_codex.CLAUDE_DIR", root / ".claude"), patch(
                "migrate_claude_to_codex.CODEX_DIR", target_dir
            ):
                migrate_help_scripts()

            self.assertEqual((target_dir / "scripts/ev-help.py").read_bytes(), b"help")
            self.assertEqual((target_dir / "scripts/test-evcrate-help.py").read_bytes(), b"test")
            self.assertFalse((target_dir / "scripts/ignored.pyc").exists())


if __name__ == "__main__":
    unittest.main()
