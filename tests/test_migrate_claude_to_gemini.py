import os
import re
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import migrate_claude_to_gemini as migrator
from migrate_claude_to_gemini import (
    EXTERNAL_SCOUT_STRATEGY_END,
    EXTERNAL_SCOUT_STRATEGY_START,
)


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

    def test_workflow_paths_are_target_relative(self) -> None:
        migrated = migrator.apply_replacements("Read .claude/workflows/advisor-mentoring.md")
        self.assertEqual(migrated, "Read .gemini/workflows/advisor-mentoring.md")

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


class AdvisorGeminiGenerationTest(unittest.TestCase):
    def test_advisor_agent_maps_opus_to_pro(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        canonical = repository / ".evcrate/source/.claude/agents/advisor.md"
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude/agents"
            output_dir = root / ".gemini"
            source_dir.mkdir(parents=True)
            (source_dir / "advisor.md").write_bytes(canonical.read_bytes())
            with patch.object(migrator, "CLAUDE_DIR", root / ".claude"), patch.object(
                migrator, "GEMINI_DIR", output_dir
            ):
                migrator.migrate_agents()

            generated = output_dir / "agents/advisor.md"
            frontmatter, body = migrator.parse_markdown_with_frontmatter(generated)
            self.assertEqual(frontmatter["name"], "advisor")
            self.assertEqual(frontmatter["model"], "pro")
            self.assertIn("advisor-strategy", body)

    def test_scoped_command_reads_generated_gemini_workflow(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        canonical = repository / ".evcrate/source/.claude/commands/code.md"
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude/commands"
            output_dir = root / ".gemini"
            source_dir.mkdir(parents=True)
            (source_dir / "code.md").write_bytes(canonical.read_bytes())
            with patch.object(migrator, "CLAUDE_DIR", root / ".claude"), patch.object(
                migrator, "GEMINI_DIR", output_dir
            ):
                migrator.migrate_commands()
                migrator.migrate_commands_as_native_skills()

            for generated in (
                output_dir / "commands/code.toml",
                output_dir / "skills/cmd_code/SKILL.md",
            ):
                content = generated.read_text(encoding="utf-8")
                self.assertIn(".gemini/workflows/advisor-mentoring.md", content)
                self.assertNotIn(".claude/workflows/advisor-mentoring.md", content)


class ExternalScoutGeminiGenerationTest(unittest.TestCase):
    @staticmethod
    def _generate(source_content: str, output_dir: Path) -> Path:
        source_dir = output_dir.parent / "canonical/.claude"
        agents_dir = source_dir / "agents"
        agents_dir.mkdir(parents=True, exist_ok=True)
        (agents_dir / "scout-external.md").write_text(source_content, encoding="utf-8")
        with patch.object(migrator, "CLAUDE_DIR", source_dir), patch.object(
            migrator, "GEMINI_DIR", output_dir
        ):
            migrator.migrate_agents()
        return output_dir / "agents/scout-external.md"

    @staticmethod
    def _assert_contract(path: Path) -> str:
        body = path.read_text(encoding="utf-8")
        frontmatter, _ = migrator.parse_markdown_with_frontmatter(path)
        tools = frontmatter.get("tools", [])
        if isinstance(tools, str):
            tools = [tool.strip() for tool in tools.split(",")]
        if "write_file" in tools:
            raise AssertionError("read-only scout generated write_file tool")
        primary = 'codex exec -m gpt-5.6-luna "[prompt]"'
        fallback = 'claude -p --model sonnet "[prompt]"'
        if body.count(primary) != 1 or body.count(fallback) != 1:
            raise AssertionError("expected one exact primary and fallback command")
        if body.index(primary) >= body.index(fallback):
            raise AssertionError("Gemini fallback appears before primary command")
        for forbidden in ("agy", "opencode", "gemini-2.5-flash"):
            if forbidden in body.lower():
                raise AssertionError(f"forbidden Gemini strategy token: {forbidden}")
        if "scale" in body.lower():
            raise AssertionError("legacy scale-provider routing remains")
        if body.count(EXTERNAL_SCOUT_STRATEGY_START) != 1 or body.count(EXTERNAL_SCOUT_STRATEGY_END) != 1:
            raise AssertionError("scout strategy markers are not unique")
        return body

    def test_isolated_generation_uses_codex_then_claude_strategy(self) -> None:
        canonical = Path(__file__).resolve().parents[1] / ".evcrate/source/.claude/agents/scout-external.md"
        with TemporaryDirectory() as temp:
            generated = self._generate(canonical.read_text(encoding="utf-8"), Path(temp) / ".gemini")
            self._assert_contract(generated)

    def test_fallback_stays_literal_claude_after_replacements(self) -> None:
        canonical = Path(__file__).resolve().parents[1] / ".evcrate/source/.claude/agents/scout-external.md"
        with TemporaryDirectory() as temp:
            body = self._assert_contract(
                self._generate(canonical.read_text(encoding="utf-8"), Path(temp) / ".gemini")
            )
            self.assertIn('claude -p --model sonnet "[prompt]"', body)
            self.assertNotIn('gemini -p --model sonnet "[prompt]"', body)

    def test_malformed_strategy_markers_fail_deterministically(self) -> None:
        canonical = Path(__file__).resolve().parents[1] / ".evcrate/source/.claude/agents/scout-external.md"
        source = canonical.read_text(encoding="utf-8")
        malformed = {
            "missing": source.replace(EXTERNAL_SCOUT_STRATEGY_START + "\n", "", 1),
            "duplicate": source.replace(EXTERNAL_SCOUT_STRATEGY_END, EXTERNAL_SCOUT_STRATEGY_END + "\n" + EXTERNAL_SCOUT_STRATEGY_END, 1),
            "reversed": source.replace(EXTERNAL_SCOUT_STRATEGY_START, "__START__", 1)
            .replace(EXTERNAL_SCOUT_STRATEGY_END, EXTERNAL_SCOUT_STRATEGY_START, 1)
            .replace("__START__", EXTERNAL_SCOUT_STRATEGY_END, 1),
        }
        message = "Malformed scout-external strategy markers: expected exactly one ordered start/end pair"
        for name, content in malformed.items():
            with self.subTest(name=name), TemporaryDirectory() as temp:
                with self.assertRaisesRegex(ValueError, f"^{re.escape(message)}$"):
                    self._generate(content, Path(temp) / ".gemini")

    def test_repeat_generation_is_byte_identical(self) -> None:
        canonical = Path(__file__).resolve().parents[1] / ".evcrate/source/.claude/agents/scout-external.md"
        content = canonical.read_text(encoding="utf-8")
        with TemporaryDirectory() as temp:
            first = self._generate(content, Path(temp) / "first").read_bytes()
            second = self._generate(content, Path(temp) / "second").read_bytes()
            self.assertEqual(first, second)

    def test_checked_in_artifact_matches_canonical_strategy_after_regeneration(self) -> None:
        artifact = Path(__file__).resolve().parents[1] / ".evcrate/source/.gemini/agents/scout-external.md"
        self._assert_contract(artifact)


if __name__ == "__main__":
    unittest.main()
