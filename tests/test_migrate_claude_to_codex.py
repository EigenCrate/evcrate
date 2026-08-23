import os
import re
import shutil
import subprocess
import sys
import tomllib
import unittest
import io
from contextlib import redirect_stdout
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from migrate_claude_to_codex import (
    EXTERNAL_SCOUT_STRATEGY_END,
    EXTERNAL_SCOUT_STRATEGY_START,
    SUBAGENT_WAIT_CONTRACT,
    apply_replacements,
    apply_subagent_wait_contract,
    canonicalize_command_tokens,
    migrate_agents,
    migrate_commands_as_native_skills,
    migrate_help_scripts,
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
                [sys.executable, str(repository / "migrate_claude_to_codex.py"), "--local"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((source_root / ".codex/config.toml").is_file())
            self.assertTrue((source_root / ".agents/skills").is_dir())
            for name in (".codex", ".agents"):
                self.assertFalse((root / name).exists())

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

    def test_nested_command_tokens_use_colon_presentation(self) -> None:
        known_commands = {"/fix:logs"}

        self.assertEqual(canonicalize_command_tokens("Run /fix/logs", known_commands), "Run /fix:logs")
        self.assertEqual(canonicalize_command_tokens("Run /fix:logs", known_commands), "Run /fix:logs")
        self.assertEqual(canonicalize_command_tokens("Run /unknown/path", known_commands), "Run /unknown/path")

    def test_generated_nested_command_skill_keeps_canonical_label(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude" / "commands" / "fix"
            agents_dir = root / ".agents"
            source_dir.mkdir(parents=True)
            (source_dir / "logs.md").write_text(
                "---\nname: /fix:logs\ndescription: Fix logs\n---\nUse /fix/logs next.\n",
                encoding="utf-8",
            )

            with patch("migrate_claude_to_codex.CLAUDE_DIR", root / ".claude"), patch(
                "migrate_claude_to_codex.AGENTS_DIR", agents_dir
            ):
                migrate_commands_as_native_skills()

            content = (agents_dir / "skills/cmd_fix_logs/SKILL.md").read_text(encoding="utf-8")
            self.assertIn("Command Path: /fix:logs", content)
            self.assertNotIn("/fix/logs", content)

    def test_advisor_agent_uses_high_tier_model_mapping(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        canonical = repository / ".evcrate/source/.claude/agents/advisor.md"
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude/agents"
            output_dir = root / ".codex"
            source_dir.mkdir(parents=True)
            shutil.copyfile(canonical, source_dir / "advisor.md")
            with patch("migrate_claude_to_codex.CLAUDE_DIR", root / ".claude"), patch(
                "migrate_claude_to_codex.CODEX_DIR", output_dir
            ):
                migrate_agents()

            advisor = tomllib.loads((output_dir / "agents/advisor.toml").read_text(encoding="utf-8"))
            self.assertEqual(advisor["model"], "gpt-5.6-sol")
            self.assertEqual(advisor["model_reasoning_effort"], "high")
            self.assertIn("advisor-strategy", advisor["developer_instructions"])
            self.assertIn("--advice", advisor["developer_instructions"])
            self.assertNotIn("@advisor", advisor["developer_instructions"])

    def test_scoped_command_projects_advice_token_without_old_alias(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        canonical = repository / ".evcrate/source/.claude/commands/code.md"
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude/commands"
            output_dir = root / ".agents"
            source_dir.mkdir(parents=True)
            (source_dir / "code.md").write_bytes(canonical.read_bytes())
            with patch("migrate_claude_to_codex.CLAUDE_DIR", root / ".claude"), patch(
                "migrate_claude_to_codex.AGENTS_DIR", output_dir
            ):
                migrate_commands_as_native_skills()

            generated = (output_dir / "skills/cmd_code/SKILL.md").read_text(encoding="utf-8")
            self.assertIn("--advice", generated)
            self.assertNotIn("@advisor", generated)

    def test_advise_skill_uses_native_questioning_and_rejects_relay_without_state(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude/commands"
            output_dir = root / ".agents"
            source_dir.mkdir(parents=True)
            shutil.copyfile(repository / ".evcrate/source/.claude/commands/advise.md", source_dir / "advise.md")
            with patch("migrate_claude_to_codex.CLAUDE_DIR", root / ".claude"), patch(
                "migrate_claude_to_codex.AGENTS_DIR", output_dir
            ):
                migrate_commands_as_native_skills()

            generated = (output_dir / "skills/cmd_advise/SKILL.md").read_text(encoding="utf-8")
            self.assertIn("request_user_input", generated)
            self.assertIn("ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX", generated)
            self.assertIn("Do not invoke an advisor, create relay state", generated)
            self.assertNotIn("advise-state.cjs", generated)

    def test_generated_help_reports_codex_relay_rejection(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        source = repository / ".evcrate/source/.claude/scripts/ev-help.py"
        spec = spec_from_file_location("ev_help", source)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        output = io.StringIO()
        with redirect_stdout(output):
            module.show_advisory_guide("", "codex")
        rendered = output.getvalue()
        self.assertIn("ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX", rendered)
        self.assertNotIn("Claude relay v1", rendered)

    def test_help_resolves_codex_sibling_command_skills_without_claude_tree(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        source = repository / ".evcrate/source/.claude/scripts/ev-help.py"
        spec = spec_from_file_location("ev_help", source)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = module_from_spec(spec)
        spec.loader.exec_module(module)

        with TemporaryDirectory() as temp:
            root = Path(temp)
            script_path = root / ".codex/scripts/ev-help.py"
            skills_dir = root / ".agents/skills"
            script_path.parent.mkdir(parents=True)
            skills_dir.mkdir(parents=True)

            with patch.dict(os.environ, {
                "CLAUDE_PROJECT_DIR": "",
                "CODEX_PROJECT_DIR": "",
                "GEMINI_PROJECT_DIR": "",
                "AGY_PROJECT_DIR": "",
            }):
                source_type, source_dir = module.resolve_command_source(script_path)

            self.assertEqual((source_type, source_dir), ("skills", skills_dir))

    def test_codex_help_executes_with_sibling_command_skills_without_claude_tree(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        source_help = repository / ".evcrate/source/.claude/scripts/ev-help.py"
        with TemporaryDirectory() as temp:
            root = Path(temp)
            script_path = root / ".codex/scripts/ev-help.py"
            skill_path = root / ".agents/skills/cmd_fix_logs/SKILL.md"
            script_path.parent.mkdir(parents=True)
            skill_path.parent.mkdir(parents=True)
            shutil.copyfile(source_help, script_path)
            skill_path.write_text(
                "---\nname: cmd-fix-logs\ndescription: Fix logs\n---\n"
                "# cmd_fix_logs\n\nCommand Path: /fix:logs\n",
                encoding="utf-8",
            )
            env = os.environ.copy()
            for name in ("CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR"):
                env.pop(name, None)

            completed = subprocess.run(
                [sys.executable, str(script_path), "fix:logs"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("/fix:logs", completed.stdout)
            self.assertNotIn("/fix/logs", completed.stdout)


class ExternalScoutCodexGenerationTest(unittest.TestCase):
    @staticmethod
    def _generate(source_content: str, output_dir: Path) -> Path:
        source_dir = output_dir.parent / "canonical/.claude"
        agents_dir = source_dir / "agents"
        agents_dir.mkdir(parents=True, exist_ok=True)
        (agents_dir / "scout-external.md").write_text(source_content, encoding="utf-8")
        with patch("migrate_claude_to_codex.CLAUDE_DIR", source_dir), patch(
            "migrate_claude_to_codex.CODEX_DIR", output_dir
        ):
            migrate_agents()
        return output_dir / "agents/scout-external.toml"

    @staticmethod
    def _assert_contract(path: Path) -> str:
        payload = tomllib.loads(path.read_text(encoding="utf-8"))
        body = payload["developer_instructions"]
        command = 'agy -p "[prompt]" --model gemini-3.7-flash-high'
        if body.count(command) != 1:
            raise AssertionError(f"expected one exact agy command in {path}")
        for forbidden in ("opencode", "gemini-2.5-flash", "codex exec", "claude -p"):
            if forbidden in body.lower():
                raise AssertionError(f"forbidden Codex strategy token: {forbidden}")
        if "scale" in body.lower():
            raise AssertionError("legacy scale-provider routing remains")
        if body.count(EXTERNAL_SCOUT_STRATEGY_START) != 1 or body.count(EXTERNAL_SCOUT_STRATEGY_END) != 1:
            raise AssertionError("scout strategy markers are not unique")
        return body

    def test_isolated_generation_uses_canonical_agy_strategy(self) -> None:
        canonical = Path(__file__).resolve().parents[1] / ".evcrate/source/.claude/agents/scout-external.md"
        with TemporaryDirectory() as temp:
            generated = self._generate(canonical.read_text(encoding="utf-8"), Path(temp) / ".codex")
            self._assert_contract(generated)

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
                    self._generate(content, Path(temp) / ".codex")

    def test_repeat_generation_is_byte_identical(self) -> None:
        canonical = Path(__file__).resolve().parents[1] / ".evcrate/source/.claude/agents/scout-external.md"
        content = canonical.read_text(encoding="utf-8")
        with TemporaryDirectory() as temp:
            first = self._generate(content, Path(temp) / "first").read_bytes()
            second = self._generate(content, Path(temp) / "second").read_bytes()
            self.assertEqual(first, second)

    def test_checked_in_artifact_matches_canonical_strategy_after_regeneration(self) -> None:
        artifact = Path(__file__).resolve().parents[1] / ".evcrate/source/.codex/agents/scout-external.toml"
        self._assert_contract(artifact)


if __name__ == "__main__":
    unittest.main()
