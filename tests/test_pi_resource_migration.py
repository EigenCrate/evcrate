from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import migrate_claude_to_pi
from distribution.contracts import ADVISOR_BRIDGE_FALLBACK_BLOCK
from pi_adapter.frontmatter import FrontmatterError, validate_skill_frontmatter
from pi_adapter.resources import ResourceError, _copy_file, hook_map, translate_prompt


REPOSITORY = Path(__file__).resolve().parents[1]
CANONICAL = REPOSITORY / ".evcrate/source/.claude"


def tree_digest(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def tree_modes(root: Path) -> dict[str, int]:
    return {
        str(path.relative_to(root)): path.stat().st_mode & 0o777
        for path in sorted(root.rglob("*"))
    }


class PiResourceMigrationTest(unittest.TestCase):
    def _migrate_canonical(self, output: Path, stage: Path) -> None:
        with patch.dict(os.environ, {
            "EVCRATE_REPOSITORY": str(REPOSITORY),
            "EVCRATE_SOURCE_DIR": str(REPOSITORY / ".evcrate/source"),
            "CLAUDE_SOURCE_DIR": str(CANONICAL),
            "PI_STAGE_ROOT": str(stage),
            "PI_OUTPUT_DIR": str(output),
        }, clear=False):
            self.assertEqual(migrate_claude_to_pi.main([]), 0)

    def test_real_inventory_roles_and_deterministic_second_migration(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp) / "stage"
            output = stage / ".pi"
            output.mkdir(parents=True)
            self._migrate_canonical(output, stage)
            first = tree_digest(output)
            second_stage = Path(temp) / "second-stage"
            second_output = second_stage / ".pi"
            second_output.mkdir(parents=True)
            self._migrate_canonical(second_output, second_stage)
            self.assertEqual(tree_digest(second_output), first)

            agent_root = output / "agent"
            inventory = json.loads((agent_root / "evcrate/inventory.json").read_text())
            ignored_runtime_dir = "_" + "_" + "pycache" + "_" + "_"
            self.assertEqual(inventory["advisorRuntime"]["active_host"], "pi")
            self.assertEqual(len(inventory["advisorRuntime"]["files"]), 19)
            self.assertFalse(any(
                ignored_runtime_dir in item
                or item.endswith((".pyc", ".pyo", ".test.cjs", ".test.js", ".test.mjs"))
                or item == "test-evcrate-help.py"
                for item in inventory["scripts"]
            ))
            self.assertEqual({key: len(inventory[key]) for key in ("commands", "workflows", "agents", "skills")}, {
                "commands": 73, "workflows": 6, "agents": 18, "skills": 50,
            })
            self.assertEqual(inventory["legacySkillExcluded"], "claude-code/skill.md")
            skill_root = agent_root / "skills"
            self.assertFalse((skill_root / "claude-code/skill.md").exists())
            packages = tuple(Path(name) for name in inventory["skills"])
            for generated in skill_root.rglob("*"):
                if generated.is_file():
                    relative = generated.relative_to(skill_root)
                    self.assertTrue(
                        any(relative.parts[:len(package.parts)] == package.parts for package in packages),
                        f"non-skill file was projected into Pi skills: {relative}",
                    )

            roles = json.loads((agent_root / "evcrate/model-roles.json").read_text())["agents"]
            self.assertEqual(len(roles), 18)
            self.assertEqual(roles["advisor"]["role"], "strong")
            self.assertEqual({item["role"] for item in roles.values()}, {"strong", "standard", "fast", "parent"})
            agents = "\n".join(path.read_text(encoding="utf-8") for path in (agent_root / "agents").glob("*.md"))
            self.assertIsNone(re.search(r"\b(opus|sonnet|haiku|claude-[\w.-]+|gpt-[\w.-]+)\b", agents, re.IGNORECASE))

    def test_generated_prompts_have_only_recognized_runtime_translations(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp) / "stage"
            output = stage / ".pi"
            output.mkdir(parents=True)
            self._migrate_canonical(output, stage)
            prompts = [* (output / "agent/evcrate/commands").rglob("*.md"), * (output / "agent/evcrate/workflows").glob("*.md")]
            content = "\n".join(path.read_text(encoding="utf-8") for path in prompts)
            self.assertNotIn("AskUserQuestion", content)
            self.assertNotIn(".claude/workflows/", content)
            self.assertNotRegex(content, r"(?<!~/)\.claude/scripts/")
            self.assertNotIn(".evcrate/source", content)
            self.assertNotRegex(content, r"/home/[^\s]+")

    def test_generated_resources_do_not_retain_project_claude_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp) / "stage"
            output = stage / ".pi"
            output.mkdir(parents=True)
            self._migrate_canonical(output, stage)
            for generated in output.rglob("*"):
                if not generated.is_file() or "agent/evcrate/scripts" in generated.relative_to(output).as_posix():
                    continue
                try:
                    content = generated.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                content = content.replace(ADVISOR_BRIDGE_FALLBACK_BLOCK, "")
                self.assertNotRegex(
                    content,
                    r"(?<![A-Za-z0-9_])\.claude(?=[/\\])",
                    generated.as_posix(),
                )

    def test_translate_prompt_marks_only_known_model_directed_commands(self) -> None:
        commands = ("plan/fast", "plan/hard", "plan/validate", "code", "git/cm", "scout/ext")
        cases = (
            ("- Trigger `/plan:fast <details>` now.\n", "- Trigger {{evcrate:commands/plan:fast}} <details> now.\n"),
            ("Execute SlashCommand: `/code <plan>`.\n", "Execute SlashCommand: {{evcrate:commands/code}} <plan>.\n"),
            ("Dispatch /git:cm --message 'ship'.\n", "Dispatch {{evcrate:commands/git:cm}} --message 'ship'.\n"),
            ("Then use `/scout:ext` SlashCommand.\n", "Then use {{evcrate:commands/scout:ext}} SlashCommand.\n"),
            ("Call `/plan:validate {plan-path}`.\n", "Call {{evcrate:commands/plan:validate}} {plan-path}.\n"),
            ("Command Path: /plan:fast\n", "Command Path: /plan:fast\n"),
            ("Tell users that `/plan:fast` is available.\n", "Tell users that `/plan:fast` is available.\n"),
            ("Use `/plan:fast` for an example.\n", "Use `/plan:fast` for an example.\n"),
            ("Trigger [/plan:fast](https://example.test/plan).\n", "Trigger [/plan:fast](https://example.test/plan).\n"),
            ("Trigger https://example.test/plan:fast.\n", "Trigger https://example.test/plan:fast.\n"),
            ("Trigger `/unknown-command <details>`.\n", "Trigger `/unknown-command <details>`.\n"),
            ("Execute plan: <plan>$ARGUMENTS</plan>\n", "Execute plan: <plan>$ARGUMENTS</plan>\n"),
            ("```markdown\nTrigger `/plan:fast <details>`\n```\n", "```markdown\nTrigger `/plan:fast <details>`\n```\n"),
        )
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(translate_prompt(source, commands), expected)
                self.assertEqual(translate_prompt(expected, commands), expected)

    def test_translate_prompt_maps_global_and_project_skill_roots(self) -> None:
        cases = (
            ("$HOME/.claude/skills/debugging/SKILL.md", "$HOME/.pi/agent/skills/debugging/SKILL.md"),
            ("${HOME}/.claude/skills/debugging/SKILL.md", "${HOME}/.pi/agent/skills/debugging/SKILL.md"),
            ("~/.claude/skills/debugging/SKILL.md", "~/.pi/agent/skills/debugging/SKILL.md"),
            ("~/.claude/scripts/resolve_env.py", "~/.pi/agent/evcrate/scripts/resolve_env.py"),
            ("~/.claude\\scripts\\resolve_env.py", "~/.pi\\agent\\evcrate\\scripts\\resolve_env.py"),
            ("~\\.claude\\scripts\\resolve_env.py", "~\\.pi\\agent\\evcrate\\scripts\\resolve_env.py"),
            ("os.homedir() / \".claude\" / \"scripts\" / \"resolve_env.py\"", "os.homedir() / \".pi\" / \"agent\" / \"evcrate\" / \"scripts\" / \"resolve_env.py\""),
            ("~/.claude/.mcp.json", "~/.pi/.mcp.json"),
            ("~/.claude/scripts/advisor-bridge.cjs", "~/.claude/scripts/advisor-bridge.cjs"),
            (".claude/skills/debugging/SKILL.md", ".pi/agent/skills/debugging/SKILL.md"),
            (".claude/.mcp.json", ".pi/.mcp.json"),
            ("./.claude/commands/scout.md", "./.pi/agent/evcrate/commands/scout.md"),
            ("mklink .gemini\\settings.json .claude\\.mcp.json", "mklink .gemini\\settings.json .pi\\.mcp.json"),
            (".claude/chrome-devtools/snapshots/page.yaml", ".pi/chrome-devtools/snapshots/page.yaml"),
            ("https://example.com/.claude/path", "https://example.com/.claude/path"),
        )
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(translate_prompt(source), expected)

    def test_real_canonical_directives_have_no_migration_residuals(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp) / "stage"
            output = stage / ".pi"
            output.mkdir(parents=True)
            self._migrate_canonical(output, stage)
            prompts = "\n".join(
                path.read_text(encoding="utf-8")
                for path in (output / "agent/evcrate/commands").rglob("*.md")
            )

        for marker in (
            "{{evcrate:commands/plan:fast}} <detailed-instruction-prompt>",
            "{{evcrate:commands/plan:parallel}} <detailed-instruction>",
            "{{evcrate:commands/plan:validate}} {plan-path}",
            "{{evcrate:commands/code}} <plan>",
        ):
            self.assertIn(marker, prompts)
        for residual in (
            "Trigger slash command `/plan:fast",
            "Trigger `/plan:parallel",
            "Execute `/plan:validate",
            "Trigger slash command `/code",
        ):
            self.assertNotIn(residual, prompts)

    def test_hook_map_preserves_order_and_marks_safety_scripts(self) -> None:
        mapped = hook_map(CANONICAL)
        pre_tool = mapped["events"]["PreToolUse"][0]
        self.assertEqual(pre_tool["scripts"], ["scout-block.cjs", "privacy-block.cjs"])
        self.assertEqual(pre_tool["safetyScripts"], ["scout-block.cjs", "privacy-block.cjs"])

    def test_hook_map_rejects_escaping_or_missing_hook_commands(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp)
            (source / "hooks").mkdir()
            (source / "settings.json").write_text(json.dumps({"hooks": {
                "SessionStart": [{"hooks": [{
                    "type": "command",
                    "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/../../outside.cjs",
                }]}],
            }}), encoding="utf-8")
            with self.assertRaises(ResourceError):
                hook_map(source)

    def test_hook_map_rejects_symlinked_settings(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source"
            source.mkdir()
            (source / "hooks").mkdir()
            external = Path(temp) / "external-settings.json"
            external.write_text('{"hooks": {}}', encoding="utf-8")
            (source / "settings.json").symlink_to(external)
            with self.assertRaises(ResourceError):
                hook_map(source)

    @unittest.skipIf(os.name == "nt", "umask semantics are POSIX-specific")
    def test_migration_file_modes_do_not_depend_on_umask(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            results: list[tuple[dict[str, str], dict[str, int]]] = []
            original_umask = os.umask(0o022)
            try:
                for index, umask in enumerate((0o022, 0o077)):
                    stage = Path(temp) / f"stage-{index}"
                    output = stage / ".pi"
                    os.umask(umask)
                    output.mkdir(parents=True)
                    self._migrate_canonical(output, stage)
                    results.append((tree_digest(output), tree_modes(output)))
            finally:
                os.umask(original_umask)
            self.assertEqual(results[0], results[1])

    def test_untransformed_copy_preserves_source_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.bin"
            output = root / "output"
            output.mkdir()
            payload = b"first\r\nsecond\rthird\x00"
            source.write_bytes(payload)
            _copy_file(source, output / "nested/source.bin", output)
            self.assertEqual((output / "nested/source.bin").read_bytes(), payload)

    def test_transformed_shell_copy_normalizes_line_endings(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.sh"
            output = root / "output"
            output.mkdir()
            source.write_bytes(b"#!/usr/bin/env bash\r\nif true; then\r\n  :\r\nfi\r\n")
            _copy_file(source, output / "source.sh", output, lambda value: value)
            generated = (output / "source.sh").read_bytes()
            self.assertNotIn(b"\r", generated)

    def test_frontmatter_and_translation_reject_or_transform_expected_tokens(self) -> None:
        with self.assertRaises(FrontmatterError):
            validate_skill_frontmatter("---\nname: Invalid_Name\ndescription: valid\n---\n", Path("skill.md"))
        translated = translate_prompt("AskUserQuestion; Task; .claude/workflows/primary.md")
        self.assertIn("ask_user_question", translated)
        self.assertIn("evcrate_subagent", translated)
        self.assertIn("{{evcrate:workflows/primary.md}}", translated)


if __name__ == "__main__":
    unittest.main()
