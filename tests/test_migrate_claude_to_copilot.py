"""Personal GitHub Copilot CLI migration contracts."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import migrate_claude_to_copilot
from copilot_adapter.prompts import translate_prompt
from copilot_adapter.resources import walk_files

from tests.distribution_support import REPOSITORY, tree_bytes


CANONICAL = REPOSITORY / ".evcrate/source/.claude"


class CopilotMigrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tempdir.name)
        cls.stage = cls.root / "stage"
        cls.output = cls.stage / ".copilot"
        cls.home = cls.root / "home"
        cls.output.mkdir(parents=True)
        cls.home.mkdir()
        (cls.stage / "safe.txt").write_text("safe\n", encoding="utf-8")
        cls._run()
        cls.first_tree = tree_bytes(cls.output)
        shutil.rmtree(cls.output)
        cls.output.mkdir(parents=True)
        cls._run()
        cls.second_tree = tree_bytes(cls.output)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tempdir.cleanup()

    @classmethod
    def _run(cls, arguments: list[str] | None = None) -> int:
        environment = {
            "EVCRATE_REPOSITORY": str(REPOSITORY),
            "EVCRATE_SOURCE_DIR": str(REPOSITORY / ".evcrate/source"),
            "CLAUDE_SOURCE_DIR": str(CANONICAL),
            "COPILOT_STAGE_ROOT": str(cls.stage),
            "COPILOT_OUTPUT_DIR": str(cls.output),
            "COPILOT_HOME": str(cls.home),
        }
        with patch.dict(os.environ, environment, clear=False):
            return migrate_claude_to_copilot.main(arguments or [])

    def test_single_case_variant_is_not_duplicate(self) -> None:
        from copilot_adapter.skills import _entrypoint

        for filename in ("SKILL.md", "skill.md"):
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as temp:
                package = Path(temp)
                marker = package / filename
                marker.write_text("", encoding="utf-8")
                self.assertEqual(_entrypoint(package), marker)

    def test_distinct_entrypoints_are_rejected(self) -> None:
        from copilot_adapter.resources import ResourceError
        from copilot_adapter.skills import _entrypoint

        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp)
            markers = (package / "SKILL.md", package / "skill.md")
            with patch.object(Path, "iterdir", return_value=markers):
                with self.assertRaisesRegex(ResourceError, "duplicate entrypoints"):
                    _entrypoint(package)

    def test_repeat_runs_are_byte_deterministic(self) -> None:
        self.assertEqual(self.first_tree, self.second_tree)
        self.assertGreater(len(self.first_tree), 800)

    def test_instructions_commands_skills_agents_and_styles_are_namespaced(self) -> None:
        instructions = (self.output / "copilot-instructions.md").read_text(encoding="utf-8")
        self.assertIn("# copilot-instructions.md", instructions)
        self.assertIn("GitHub Copilot CLI", instructions)
        self.assertIn("@evcrate/workflows/primary-workflow.md", instructions)
        self.assertIn("~/.copilot/evcrate/workflows/primary-workflow.md", instructions)
        self.assertNotIn("claude.ai/code", instructions)
        self.assertNotIn("CLAUDE.md", instructions)
        self.assertNotIn(".claude/", instructions)

        command_map = json.loads((self.output / "evcrate/command-name-map.json").read_text(encoding="utf-8"))
        source_commands = {
            path.relative_to(CANONICAL / "commands").as_posix()
            for path in walk_files(CANONICAL / "commands")
        }
        self.assertEqual({item["source"] for item in command_map["commands"]}, source_commands)
        hard = self.output / "skills/evcrate-cmd-fix-hard/SKILL.md"
        hard_text = hard.read_text(encoding="utf-8")
        self.assertIn("name: \"evcrate-cmd-fix-hard\"", hard_text)
        self.assertIn("user-invocable: true", hard_text)
        self.assertIn("disable-model-invocation: true", hard_text)
        self.assertIn("The literal `$ARGUMENTS` is the exact raw text", hard_text)
        self.assertIn("/evcrate-cmd-fix-hard", hard_text)

        self.assertTrue((self.output / "skills/evcrate-advisor-strategy/SKILL.md").is_file())
        self.assertTrue((self.output / "agents/evcrate-advisor.agent.md").is_file())
        style_skills = list((self.output / "skills").glob("evcrate-style-*/SKILL.md"))
        self.assertTrue(style_skills)
        self.assertTrue(all("user-invocable: true" in path.read_text(encoding="utf-8") for path in style_skills))

    def test_prompt_rewriting_preserves_urls_and_raw_slash_contracts(self) -> None:
        command_map = json.loads((self.output / "evcrate/command-name-map.json").read_text(encoding="utf-8"))
        entries = {item["sourceName"].casefold(): item for item in command_map["commands"]}
        rendered = translate_prompt(
            "See https://example.test/.claude/commands/fix/hard.md and run /fix/hard "
            "with .claude/commands/fix/hard.md.",
            entries,
        )
        self.assertIn("https://example.test/.claude/commands/fix/hard.md", rendered)
        self.assertIn("/evcrate-cmd-fix-hard", rendered)
        self.assertIn(".copilot/skills/evcrate-cmd-fix-hard/SKILL.md", rendered)

    def test_command_bom_frontmatter_is_parsed(self) -> None:
        from copilot_adapter.commands import build_command_map, convert_commands

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "commands").mkdir()
            (root / "commands/bom.md").write_bytes(
                b"\xef\xbb\xbf---\n"
                b"description: BOM command\n"
                b"argument-hint: [input]\n"
                b"---\n"
                b"Run the command.\n"
            )
            output = root / "output"
            convert_commands(root, output, build_command_map(root), lambda value: value, ())
            generated = (output / "skills/evcrate-cmd-bom/SKILL.md").read_text(encoding="utf-8")
        self.assertIn('description: "BOM command"', generated)
        self.assertIn('argument-hint: "[input]"', generated)

    def test_transformed_command_description_limit_is_enforced(self) -> None:
        from copilot_adapter.commands import build_command_map, convert_commands
        from copilot_adapter.resources import ResourceError

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "commands").mkdir()
            (root / "commands/long.md").write_text(
                "---\n"
                f"description: {'a' * 1020}\n"
                "---\n"
                "Run the command.\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ResourceError, "translated"):
                convert_commands(root, root / "output", build_command_map(root), lambda value: value + "xxxxx", ())

    def test_hooks_bridge_settings_and_support_are_safe(self) -> None:
        hook_config = json.loads((self.output / "hooks/evcrate.json").read_text(encoding="utf-8"))
        self.assertEqual(hook_config["version"], 1)
        hooks = hook_config["hooks"]
        self.assertEqual(
            set(hooks),
            {"SessionStart", "SubagentStart", "PreToolUse", "PostToolUse", "PreCompact", "SessionEnd"},
        )
        self.assertNotIn("UserPromptSubmit", hooks)
        self.assertEqual(hooks["SessionStart"][0]["matcher"], "startup|resume|new")
        self.assertEqual(hooks["SessionEnd"][0]["matcher"], "*")
        for entries in hooks.values():
            command = entries[0]["hooks"][0]["command"]
            self.assertIn("COPILOT_HOME", command)
            self.assertIn("path.resolve", command)
            self.assertIn("copilot-hook-bridge.cjs", command)

        managed = json.loads((self.output / "evcrate/managed-settings.json").read_text(encoding="utf-8"))
        self.assertEqual(set(managed), {"includeCoAuthoredBy", "effortLevel", "statusLine"})
        self.assertFalse(managed["includeCoAuthoredBy"])
        self.assertEqual(managed["effortLevel"], "high")
        self.assertIn("COPILOT_HOME", managed["statusLine"]["command"])
        self.assertTrue((self.output / "mcp-config.example.json").is_file())
        self.assertFalse((self.output / ".mcp.json").exists())
        self.assertFalse((self.output / "settings.local.json").exists())
        self.assertTrue((self.output / "evcrate/claude-settings.json").is_file())

    def test_hook_converter_rejects_unmapped_or_collapsed_registrations(self) -> None:
        from copilot_adapter.hooks import _hook_config

        with self.assertRaisesRegex(ValueError, "Unsupported canonical hook event"):
            _hook_config({"FutureEvent": [{"matcher": "*"}]})
        with self.assertRaisesRegex(ValueError, "cannot be collapsed safely"):
            _hook_config({"PostToolUse": [{"matcher": "*"}, {"matcher": "*"}]})
        with self.assertRaisesRegex(ValueError, "no source matcher"):
            _hook_config({"PreToolUse": [{
                "hooks": [
                    {"type": "command", "command": "scout-block.cjs"},
                    {"type": "command", "command": "privacy-block.cjs"},
                ],
            }]})

    def test_inventory_covers_fresh_source_walk_and_records_approximations(self) -> None:
        inventory = json.loads((self.output / "evcrate/migration-inventory.json").read_text(encoding="utf-8"))
        self.assertEqual(set(inventory["maps"]), {"commands", "skills", "agents"})
        entries = inventory["entries"]
        sources = [entry["source"] for entry in entries]
        self.assertEqual(len(sources), len(set(sources)))
        self.assertTrue(any(entry["disposition"] == "approximated" for entry in entries))
        self.assertTrue(any(entry["disposition"] == "unsupported" for entry in entries))
        for entry in entries:
            if entry["disposition"] != "native":
                self.assertIsInstance(entry.get("reason"), str)
                self.assertTrue(entry["reason"].strip(), entry["source"])
        prompt_entries = [entry for entry in entries if "#hooks.UserPromptSubmit[" in entry["source"]]
        self.assertEqual(len(prompt_entries), 1)
        self.assertEqual(prompt_entries[0]["disposition"], "unsupported")

    def test_bridge_allows_safe_tools_blocks_sensitive_tools_and_rejects_bad_payloads(self) -> None:
        bridge = self.output / "evcrate/hooks/copilot-hook-bridge.cjs"
        environment = {**os.environ, "COPILOT_HOME": str(self.home), "HOME": str(self.home)}

        safe = subprocess.run(
            ["node", str(bridge), "pre-tool-use"],
            cwd=self.stage,
            env=environment,
            input=json.dumps({"tool_name": "Read", "tool_input": {"file_path": "safe.txt"}}),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(safe.returncode, 0, safe.stderr)

        sensitive = subprocess.run(
            ["node", str(bridge), "pre-tool-use"],
            cwd=self.stage,
            env=environment,
            input=json.dumps({"tool_name": "Read", "tool_input": {"file_path": ".env"}}),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(sensitive.returncode, 2)

        hook_command = json.loads((self.output / "hooks/evcrate.json").read_text(encoding="utf-8"))["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
        configured = subprocess.run(
            ["sh", "-c", hook_command],
            cwd=self.stage,
            env={**environment, "COPILOT_HOME": str(self.output)},
            input=json.dumps({"tool_name": "Read", "tool_input": {"file_path": "safe.txt"}}),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(configured.returncode, 0, configured.stderr)
        configured_denial = subprocess.run(
            ["sh", "-c", hook_command],
            cwd=self.stage,
            env={**environment, "COPILOT_HOME": str(self.output)},
            input=json.dumps({"tool_name": "Read", "tool_input": {"file_path": ".env"}}),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(configured_denial.returncode, 2, configured_denial.stderr)

        malformed = subprocess.run(
            ["node", str(bridge), "pre-tool-use"],
            cwd=self.stage,
            env=environment,
            input="[]",
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(malformed.returncode, 2)
        self.assertIn("hook payload", malformed.stderr)
        missing_fields = subprocess.run(
            ["node", str(bridge), "pre-tool-use"],
            cwd=self.stage,
            env=environment,
            input="{}",
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(missing_fields.returncode, 2)
        self.assertIn("tool name", missing_fields.stderr)
        scalar_input = subprocess.run(
            ["node", str(bridge), "pre-tool-use"],
            cwd=self.stage,
            env=environment,
            input=json.dumps({"tool_name": "Read", "tool_input": "not-an-object"}),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(scalar_input.returncode, 2)
        self.assertIn("object tool input", scalar_input.stderr)


    def test_bridge_preserves_child_exit_status_before_parsing_output(self) -> None:
        bridge = self.output / "evcrate/hooks/copilot-hook-bridge.cjs"
        with tempfile.TemporaryDirectory() as temp:
            hooks = Path(temp) / "hooks"
            hooks.mkdir()
            (hooks / "bad.cjs").write_text(
                'process.stdout.write("{not-json"); process.exit(7);\n',
                encoding="utf-8",
            )
            source = bridge.read_text(encoding="utf-8").replace(
                "'session-start': ['session-init.cjs', 'dev-rules-reminder.cjs'],",
                "'session-start': ['bad.cjs'],",
            )
            copy = hooks / "copilot-hook-bridge.cjs"
            copy.write_text(source, encoding="utf-8")
            result = subprocess.run(
                ["node", str(copy), "session-start"],
                input="{}",
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertEqual(result.returncode, 7, result.stderr)

    def test_statusline_executes_with_copilot_session_fields(self) -> None:
        result = subprocess.run(
            ["node", str(self.output / "evcrate/statusline.cjs")],
            cwd=self.stage,
            env={**os.environ, "HOME": str(self.home)},
            input=json.dumps({"workspace": {"currentDir": str(self.root)}, "model": {"display_name": "Copilot"}}),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Copilot", result.stdout)
        aliases = subprocess.run(
            ["node", str(self.output / "evcrate/statusline.cjs")],
            cwd=self.stage,
            env={**os.environ, "HOME": str(self.home)},
            input=json.dumps({
                "workspace": {"path": str(self.root)},
                "model": {"name": "Copilot Alias"},
                "contextWindow": {
                    "totalInputTokens": 120,
                    "totalOutputTokens": 30,
                    "contextWindowSize": 1000,
                },
            }),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(aliases.returncode, 0, aliases.stderr)
        self.assertIn("Copilot Alias", aliases.stdout)

    def test_direct_and_uncontained_modes_are_rejected(self) -> None:
        with self.assertRaises(SystemExit):
            migrate_claude_to_copilot.main(["--global"])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stage = root / "stage"
            output = root / "outside"
            stage.mkdir()
            output.mkdir()
            environment = {
                "EVCRATE_REPOSITORY": str(REPOSITORY),
                "EVCRATE_SOURCE_DIR": str(REPOSITORY / ".evcrate/source"),
                "CLAUDE_SOURCE_DIR": str(CANONICAL),
                "COPILOT_STAGE_ROOT": str(stage),
                "COPILOT_OUTPUT_DIR": str(output),
            }
            with patch.dict(os.environ, environment, clear=False):
                with self.assertRaises(SystemExit):
                    migrate_claude_to_copilot.main([])


if __name__ == "__main__":
    unittest.main()
