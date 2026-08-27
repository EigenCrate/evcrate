import os
import json
import re
import shutil
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
from tests.test_advisor_skill_distribution import FORBIDDEN_RUNTIME_MARKERS, SCOPED_COMMANDS


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

    def test_rejects_symlinked_source_tree_before_writing(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / ".evcrate/source"
            source_root.mkdir(parents=True)
            outside = root / "outside"
            outside.mkdir()
            (source_root / ".claude").symlink_to(outside, target_is_directory=True)
            env = os.environ.copy()
            env["EVCRATE_SOURCE_DIR"] = str(source_root)
            completed = subprocess.run(
                [sys.executable, str(repository / "migrate_claude_to_gemini.py"), "--local"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("Canonical Claude source", completed.stderr)
            self.assertFalse((source_root / ".gemini").exists())

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
    def test_context_bridge_can_use_matching_global_hook(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            home = root / "home"
            project = home / "project"
            hook_dir = home / ".gemini/hooks"
            hook_dir.mkdir(parents=True)
            project.mkdir()
            (hook_dir / "session-init.cjs").write_text(
                "process.stdout.write('global context');\n", encoding="utf-8"
            )
            wrapper = hook_dir / "session-start.cjs"
            wrapper.write_text(
                migrator.create_context_bridge(
                    "GEMINI_PROJECT_DIR", "SessionStart", ".gemini/hooks/session-init.cjs"
                ),
                encoding="utf-8",
            )
            environment = os.environ.copy()
            environment.update({"HOME": str(home), "GEMINI_PROJECT_DIR": str(project)})
            completed = subprocess.run(
                ["node", str(wrapper)],
                cwd=project,
                input="{}",
                text=True,
                capture_output=True,
                env=environment,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(
                json.loads(completed.stdout)["hookSpecificOutput"]["additionalContext"],
                "global context",
            )

    def test_passthrough_bridge_does_not_execute_symlinked_hook(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            project = root / "project"
            hook_dir = project / ".gemini/hooks"
            outside = root / "outside-hook.cjs"
            marker = root / "executed.txt"
            hook_dir.mkdir(parents=True)
            project.mkdir(exist_ok=True)
            outside.write_text(
                f"require('fs').writeFileSync({json.dumps(str(marker))}, 'executed');\n",
                encoding="utf-8",
            )
            (hook_dir / "claude-session-end.cjs").symlink_to(outside)
            wrapper = hook_dir / "session-end.cjs"
            wrapper.write_text(
                migrator.create_passthrough_bridge(
                    "GEMINI_PROJECT_DIR", ".gemini/hooks/claude-session-end.cjs"
                ),
                encoding="utf-8",
            )
            environment = os.environ.copy()
            environment.update({"HOME": str(root / "home"), "GEMINI_PROJECT_DIR": str(project)})
            completed = subprocess.run(
                ["node", str(wrapper)],
                cwd=project,
                input="{}",
                text=True,
                capture_output=True,
                env=environment,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(json.loads(completed.stdout), {})
            self.assertIn("EVCREATE_HOOK_UNAVAILABLE", completed.stderr)
            self.assertFalse(marker.exists())

    def test_gemini_unmanaged_file_targets_reject_symlinks(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / ".claude"
            output = root / ".gemini"
            source.mkdir()
            output.mkdir()
            (root / "CLAUDE.md").write_text("context\n", encoding="utf-8")
            outside_settings = root / "outside-settings.json"
            outside_settings.write_text("{}", encoding="utf-8")
            (output / "settings.json").symlink_to(outside_settings)
            with patch.object(migrator, "CLAUDE_DIR", source), patch.object(
                migrator, "GEMINI_DIR", output
            ), patch.object(migrator, "PROJECT_DOCS_DIR", root):
                with self.assertRaisesRegex(RuntimeError, "regular file"):
                    migrator.migrate_mcp()
            self.assertEqual(outside_settings.read_text(encoding="utf-8"), "{}")

            outside_docs = root / "outside-gemini.md"
            outside_docs.write_text("preserve", encoding="utf-8")
            (root / "GEMINI.md").symlink_to(outside_docs)
            with patch.object(migrator, "CLAUDE_DIR", source), patch.object(
                migrator, "PROJECT_DOCS_DIR", root
            ):
                with self.assertRaisesRegex(RuntimeError, "regular file"):
                    migrator.write_gemini_memory_wrapper()
            self.assertEqual(outside_docs.read_text(encoding="utf-8"), "preserve")

    def test_full_migration_preflights_before_cleanup(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / ".evcrate/source"
            (source_root / ".claude").mkdir(parents=True)
            (source_root / "CLAUDE.md").write_text("context\n", encoding="utf-8")
            output = source_root / ".gemini"
            sentinel = output / "agents/sentinel.txt"
            sentinel.parent.mkdir(parents=True)
            sentinel.write_text("preserve\n", encoding="utf-8")
            outside = root / "outside-settings.json"
            outside.write_text("{}\n", encoding="utf-8")
            (output / "settings.json").symlink_to(outside)

            environment = os.environ.copy()
            environment["EVCRATE_SOURCE_DIR"] = str(source_root)
            completed = subprocess.run(
                [sys.executable, str(repository / "migrate_claude_to_gemini.py"), "--local"],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("regular file", completed.stderr)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve\n")
            self.assertEqual(outside.read_text(encoding="utf-8"), "{}\n")

    def test_full_migration_rejects_managed_config_symlink_before_cleanup(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / ".evcrate/source"
            source = source_root / ".claude"
            source.mkdir(parents=True)
            (source_root / "CLAUDE.md").write_text("context\n", encoding="utf-8")
            (source / ".evcrate.json").write_text("{}\n", encoding="utf-8")
            output = source_root / ".gemini"
            sentinel = output / "agents/sentinel.txt"
            sentinel.parent.mkdir(parents=True)
            sentinel.write_text("preserve\n", encoding="utf-8")
            outside = root / "outside-evcrate.json"
            outside.write_text("preserve\n", encoding="utf-8")
            (output / ".evcrate.json").symlink_to(outside)

            environment = os.environ.copy()
            environment["EVCRATE_SOURCE_DIR"] = str(source_root)
            completed = subprocess.run(
                [sys.executable, str(repository / "migrate_claude_to_gemini.py"), "--local"],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("regular file", completed.stderr)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve\n")
            self.assertEqual(outside.read_text(encoding="utf-8"), "preserve\n")

    def test_full_migration_rejects_nested_managed_symlink_before_cleanup(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_root = root / ".evcrate/source"
            (source_root / ".claude").mkdir(parents=True)
            (source_root / "CLAUDE.md").write_text("context\n", encoding="utf-8")
            output = source_root / ".gemini"
            sentinel = output / "agents/sentinel.txt"
            sentinel.parent.mkdir(parents=True)
            sentinel.write_text("preserve\n", encoding="utf-8")
            outside = root / "outside.txt"
            outside.write_text("preserve\n", encoding="utf-8")
            (output / "agents/unlisted.md").symlink_to(outside)

            environment = os.environ.copy()
            environment["EVCRATE_SOURCE_DIR"] = str(source_root)
            completed = subprocess.run(
                [sys.executable, str(repository / "migrate_claude_to_gemini.py"), "--local"],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("contains a symlink", completed.stderr)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve\n")
            self.assertEqual(outside.read_text(encoding="utf-8"), "preserve\n")

    def test_advise_command_uses_native_questioning_and_rejects_relay(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude/commands"
            output_dir = root / ".gemini"
            source_dir.mkdir(parents=True)
            shutil.copyfile(repository / ".evcrate/source/.claude/commands/advise.md", source_dir / "advise.md")
            with patch.object(migrator, "CLAUDE_DIR", root / ".claude"), patch.object(
                migrator, "GEMINI_DIR", output_dir
            ):
                migrator.migrate_commands()

            generated = (output_dir / "commands/advise.toml").read_text(encoding="utf-8")
            self.assertIn("ask_user", generated)
            self.assertIn("ADVISE_AGENT_RELAY_UNSUPPORTED_GEMINI", generated)
            self.assertNotIn("advise-state.cjs", generated)

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
            self.assertIn("--advice", body)
            self.assertNotIn("@advisor", body)

    def test_scoped_command_reads_generated_gemini_workflow(self) -> None:
        repository = Path(__file__).resolve().parents[1]
        canonical_root = repository / ".evcrate/source/.claude"
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_dir = root / ".claude"
            output_dir = root / ".gemini"
            (source_dir / "commands").mkdir(parents=True)
            (source_dir / "workflows").mkdir()
            shutil.copyfile(
                canonical_root / "workflows/advisor-mentoring.md",
                source_dir / "workflows/advisor-mentoring.md",
            )
            shutil.copytree(
                canonical_root / "skills/advisor-strategy",
                source_dir / "skills/advisor-strategy",
            )
            for relative in SCOPED_COMMANDS:
                target = source_dir / "commands" / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(canonical_root / "commands" / relative, target)
            with patch.object(migrator, "CLAUDE_DIR", root / ".claude"), patch.object(
                migrator, "GEMINI_DIR", output_dir
            ):
                migrator.migrate_commands()
                migrator.migrate_commands_as_native_skills()
                migrator.migrate_workflows()
                migrator.migrate_skills()

            for relative in SCOPED_COMMANDS:
                with self.subTest(command=relative):
                    generated = output_dir / "commands" / relative.replace(".md", ".toml")
                    content = generated.read_text(encoding="utf-8")
                    self.assertIn(".gemini/workflows/advisor-mentoring.md", content)
                    self.assertNotIn(".claude/workflows/advisor-mentoring.md", content)
                    self.assertIn("--advice", content)
                    self.assertNotIn("@advisor", content)
                    native_name = "cmd_" + relative.removesuffix(".md").replace("/", "_")
                    native = output_dir / "skills" / native_name / "SKILL.md"
                    native_content = native.read_text(encoding="utf-8")
                    self.assertIn(".gemini/workflows/advisor-mentoring.md", native_content)
                    self.assertIn("--advice", native_content)
                    self.assertNotIn("@advisor", native_content)

            workflow = output_dir / "workflows/advisor-mentoring.md"
            self.assertIn("decision:<workflow-step>", workflow.read_text(encoding="utf-8"))
            strategy = output_dir / "skills/advisor-strategy/SKILL.md"
            self.assertIn("fresh", strategy.read_text(encoding="utf-8").lower())
            brief = output_dir / "skills/advisor-strategy/references/brief-contract.md"
            self.assertIn("prior_counsel", brief.read_text(encoding="utf-8"))

            for generated in output_dir.rglob("*"):
                if not generated.is_file():
                    continue
                try:
                    content = generated.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                for marker in FORBIDDEN_RUNTIME_MARKERS:
                    self.assertNotIn(marker, content, generated.as_posix())


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
