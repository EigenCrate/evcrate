import os
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import migrate_claude_to_gemini as migrator


class ApplyReplacementsTest(unittest.TestCase):
    def test_local_mode_writes_only_inside_nested_source_root(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / ".evcrate/source"
            (source_root / ".claude").mkdir(parents=True)
            (source_root / "CLAUDE.md").write_text("context", encoding="utf-8")
            env = os.environ.copy()
            env["EVCRATE_SOURCE_DIR"] = str(source_root)
            completed = subprocess.run(
                [sys.executable, str(repository / "migrate_claude_to_gemini.py"), "--local"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((source_root / ".gemini/settings.json").is_file())
            for name in (".gemini",):
                self.assertFalse((root / name).exists())

    def test_standalone_claude_platform_prose_is_migrated(self) -> None:
        self.assertEqual(
            migrator.apply_replacements("Use Claude Code and the CLI."),
            "Use gemini Code and the CLI.",
        )

    def test_sentence_terminal_and_identifier_boundaries_are_preserved(self) -> None:
        source = (
            "Claude. Keep .claude/commands, claude.com, claude.ai, ClaudeKit, "
            "claudekit-cli, and claude-code unchanged."
        )
        self.assertEqual(
            migrator.apply_replacements(source),
            "gemini. Keep .claude/commands, claude.com, claude.ai, ClaudeKit, "
            "claudekit-cli, and claude-code unchanged.",
        )

    def test_evcrate_and_claudekit_provenance_are_preserved(self) -> None:
        source = (
            "EVCrate replaces the old ClaudeKit Engineer template; "
            "use claudekit-cli and see https://github.com/claudekit/claudekit."
        )
        self.assertEqual(migrator.apply_replacements(source), source)

    def test_urls_and_dotted_names_are_not_rewritten(self) -> None:
        source = "See https://claude.ai/docs and the claude.com URL; Claude is the platform."
        self.assertEqual(
            migrator.apply_replacements(source),
            "See https://claude.ai/docs and the claude.com URL; gemini is the platform.",
        )

    def test_gemini_help_command_path_is_migrated_precisely(self) -> None:
        source = Path(".evcrate/source/.claude/commands/evcrate-help.md").read_text(encoding="utf-8")
        self.assertIn("python .claude/scripts/ev-help.py", source)
        migrated = migrator.apply_replacements(source)
        self.assertIn("python .gemini/scripts/ev-help.py", migrated)
        self.assertNotIn("python .claude/scripts/ev-help.py", migrated)

    def test_anthropic_urls_are_preserved(self) -> None:
        source = "See https://console.anthropic.com and https://github.com/anthropic-ai/claude-code."
        self.assertEqual(migrator.apply_replacements(source), source)


class MigrateScriptsTest(unittest.TestCase):
    def test_gemini_help_script_keeps_each_project_environment_name_once(self) -> None:
        source_script = Path(".evcrate/source/.claude/scripts/ev-help.py").read_text(encoding="utf-8")

        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_dir = root / ".claude"
            target_dir = root / ".gemini"
            source_scripts = source_dir / "scripts"
            source_scripts.mkdir(parents=True)
            (source_scripts / "ev-help.py").write_text(source_script, encoding="utf-8")

            with patch.object(migrator, "CLAUDE_DIR", source_dir), patch.object(
                migrator, "GEMINI_DIR", target_dir
            ):
                migrator.migrate_scripts()

            generated = (target_dir / "scripts" / "ev-help.py").read_text(encoding="utf-8")
            self.assertEqual(generated.count('"CLAUDE_PROJECT_DIR"'), 1)
            self.assertEqual(generated.count('"GEMINI_PROJECT_DIR"'), 1)


if __name__ == "__main__":
    unittest.main()
