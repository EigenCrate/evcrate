"""Regression coverage for advisor command-mode distribution."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path

from distribution.context import DistributionContext
from distribution.contracts import DistributionAction, VerifiedArtifact
from distribution.publish import publish_diff
from migrate_claude_to_codex import SUBAGENT_WAIT_CONTRACT, parse_markdown_with_frontmatter


REPOSITORY = Path(__file__).resolve().parents[1]
POINTER = (
    "consider explicit `$advisor-strategy` use for current-session guidance; "
    "this pointer does not activate it."
)
FORBIDDEN_RUNTIME_MARKERS = (
    "advisor_consult",
    "mcp_servers.advisor",
    "advisor-broker",
    "pretool-advisor-admission",
    "advisor-ledger",
    "runtime-advisor-launcher",
)
CODE_COMMANDS = (
    "code.md",
    "code/auto.md",
    "code/no-test.md",
    "code/parallel.md",
)
COOK_COMMANDS = (
    "cook.md",
    "cook/auto.md",
    "cook/auto/fast.md",
    "cook/auto/parallel.md",
)
SCOPED_COMMANDS = CODE_COMMANDS + COOK_COMMANDS + (
    "fix/logs.md",
    "fix/test.md",
    "fix/parallel.md",
    "fix/hard.md",
    "bootstrap.md",
    "bootstrap/auto.md",
    "bootstrap/auto/fast.md",
    "bootstrap/auto/parallel.md",
)
DIRECT_REVIEW_COMMANDS = CODE_COMMANDS + (
    "fix/logs.md",
    "fix/test.md",
    "fix/parallel.md",
    "bootstrap.md",
    "bootstrap/auto.md",
    "bootstrap/auto/fast.md",
    "bootstrap/auto/parallel.md",
)
HANDOFF_COMMANDS = COOK_COMMANDS + ("fix/hard.md",)
REVIEW_LOOP_COMMANDS = (
    "code.md",
    "code/auto.md",
    "code/parallel.md",
    "cook/auto/parallel.md",
    "fix/logs.md",
    "fix/test.md",
    "fix/parallel.md",
    "bootstrap.md",
    "bootstrap/auto.md",
    "bootstrap/auto/fast.md",
    "bootstrap/auto/parallel.md",
)


def tree_snapshot(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class AdvisorSkillDistributionTest(unittest.TestCase):
    def run_migrator(self, root: Path) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        for credential in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
            env.pop(credential, None)
        env.update(
            {
                "CODEX_OUTPUT_DIR": str(root / ".codex"),
                "AGENTS_OUTPUT_DIR": str(root / ".agents"),
                "PROJECT_DOCS_OUTPUT_DIR": str(root / "docs"),
            }
        )
        return subprocess.run(
            [sys.executable, "migrate_claude_to_codex.py"],
            cwd=REPOSITORY,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_migrator_packages_static_skill_and_reference(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            completed = self.run_migrator(root)
            generated = root / ".agents" / "skills" / "advisor-strategy"
            skill = generated / "SKILL.md"
            reference = generated / "references" / "brief-contract.md"

            self.assertTrue(skill.is_file())
            self.assertTrue(reference.is_file())
            self.assertEqual(
                reference.read_bytes(),
                (REPOSITORY / ".evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md").read_bytes(),
            )
            frontmatter, generated_body = parse_markdown_with_frontmatter(skill)
            canonical_frontmatter, canonical_body = parse_markdown_with_frontmatter(
                REPOSITORY / ".evcrate/source/.claude/skills/advisor-strategy/SKILL.md"
            )
            self.assertEqual(frontmatter["name"], "advisor-strategy")
            self.assertTrue(frontmatter["description"])
            self.assertEqual(frontmatter, canonical_frontmatter)
            self.assertEqual(generated_body.encode(), canonical_body.encode())
            self.assertNotIn("provider", completed.stdout.lower())

    def test_canonical_advisor_mode_contract_and_scoped_commands(self) -> None:
        canonical = REPOSITORY / ".evcrate/source/.claude"
        contract = (canonical / "workflows/advisor-mentoring.md").read_text(encoding="utf-8")
        normalized_contract = " ".join(contract.split())
        for marker in (
            "final whitespace-delimited",
            "exactly the case-sensitive string `@advisor`",
            "`abc @advisor @advisor`",
            "`abc @advisor extra`",
            "second matching",
            "Consult at most once per stuck episode",
            "stop and ask the user for direction",
            "Explicit mode uses the same stuck detection outside review gates",
            "also satisfies any stuck consultation for that same gate",
            "at most three terminal reviewer/advisor cycles",
        ):
            self.assertIn(marker, normalized_contract)

        agent = canonical / "agents/advisor.md"
        frontmatter, body = parse_markdown_with_frontmatter(agent)
        self.assertEqual(frontmatter["name"], "advisor")
        self.assertEqual(frontmatter["model"], "opus")
        self.assertEqual(frontmatter["tools"], "Read, Glob, Grep")
        self.assertIn("advisor-strategy", body)
        self.assertIn("do not implement", body.lower())

        for relative in SCOPED_COMMANDS:
            with self.subTest(command=relative):
                content = (canonical / "commands" / relative).read_text(encoding="utf-8")
                normalized_content = " ".join(content.split())
                self.assertIn("[@advisor]", content)
                self.assertIn(".claude/workflows/advisor-mentoring.md", content)
                self.assertIn("WORK_ARGUMENTS", content)
                self.assertIn("default stuck-escalation contract", normalized_content)
        for relative in DIRECT_REVIEW_COMMANDS:
            with self.subTest(review_command=relative):
                content = (canonical / "commands" / relative).read_text(encoding="utf-8")
                normalized_content = " ".join(content.split())
                self.assertIn("explicit advisor mode", normalized_content.lower())
                self.assertIn("`advisor`", content)
                self.assertIn("code-reviewer", content)
                self.assertIn("terminal", normalized_content.lower())
                reviewer_position = normalized_content.lower().find("code-reviewer")
                advisor_position = normalized_content.lower().find("explicit advisor mode", reviewer_position)
                self.assertGreater(advisor_position, reviewer_position)
        for relative in HANDOFF_COMMANDS:
            with self.subTest(handoff_command=relative):
                content = (canonical / "commands" / relative).read_text(encoding="utf-8")
                normalized_content = " ".join(content.split())
                self.assertIn("append exactly one trailing", normalized_content)
                self.assertIn("`@advisor`", content)
        for relative in REVIEW_LOOP_COMMANDS:
            with self.subTest(review_loop=relative):
                content = " ".join(
                    (canonical / "commands" / relative).read_text(encoding="utf-8").split()
                )
                self.assertRegex(
                    content.lower(), r"(?:review/advisor.{0,24}three|three review/advisor)"
                )

    def test_code_review_cycles_have_a_hard_cap(self) -> None:
        canonical = REPOSITORY / ".evcrate/source/.claude"
        for relative in CODE_COMMANDS:
            with self.subTest(command=relative):
                content = " ".join(
                    (canonical / "commands" / relative).read_text(encoding="utf-8").split()
                )
                self.assertIn("at most three terminal reviewer/advisor cycles", content)
                self.assertIn("do not start another review or advisor call", content)
                self.assertNotIn("restart cycle counter", content)

        auto = (canonical / "commands/code/auto.md").read_text(encoding="utf-8")
        normalized_auto = " ".join(auto.split()).lower()
        for marker in (
            "review_must_fix",
            "explicit advisor mode sets advisor_must_fix",
            "default mode does not invent advisor guidance",
            "apply every advisor must-fix item before approval",
        ):
            self.assertIn(marker, normalized_auto)

    def test_cook_fallback_handoffs_preserve_explicit_mode(self) -> None:
        canonical = REPOSITORY / ".evcrate/source/.claude"
        for relative in HANDOFF_COMMANDS:
            with self.subTest(handoff_command=relative):
                content = " ".join(
                    (canonical / "commands" / relative).read_text(encoding="utf-8").split()
                )
                self.assertIn("fallback handoff", content)
                self.assertIn("WORK_ARGUMENTS", content)
                self.assertIn("exactly one trailing `@advisor`", content)
                self.assertIn("otherwise pass no advisor token", content)

    def test_generated_codex_advisor_and_command_mode_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)
            advisor = tomllib.loads((root / ".codex/agents/advisor.toml").read_text(encoding="utf-8"))
            self.assertEqual(advisor["model"], "gpt-5.6-sol")
            self.assertEqual(advisor["model_reasoning_effort"], "high")
            self.assertIn("advisor-strategy", advisor["developer_instructions"])
            self.assertTrue((root / ".codex/workflows/advisor-mentoring.md").is_file())

            for relative in SCOPED_COMMANDS:
                skill_name = "cmd_" + relative.removesuffix(".md").replace("/", "_")
                content = (root / ".agents/skills" / skill_name / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn("@advisor", content)
                self.assertIn("WORK_ARGUMENTS", content)
                self.assertIn(".codex/workflows/advisor-mentoring.md", content)

            gemini_commands = REPOSITORY / ".evcrate/source/.gemini/commands"
            for relative in SCOPED_COMMANDS:
                generated = gemini_commands / relative.replace(".md", ".toml")
                content = generated.read_text(encoding="utf-8")
                self.assertIn(".gemini/workflows/advisor-mentoring.md", content)
                self.assertNotIn(".claude/workflows/advisor-mentoring.md", content)

    def test_generated_target_has_one_non_invoking_pointer_per_command(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)
            command_skills = sorted((root / ".agents" / "skills").glob("cmd_*/SKILL.md"))

            self.assertTrue(command_skills)
            for command_skill in command_skills:
                content = command_skill.read_text(encoding="utf-8")
                frontmatter, _ = parse_markdown_with_frontmatter(command_skill)
                self.assertRegex(frontmatter["name"], r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
                self.assertTrue(frontmatter["description"].strip())
                self.assertLessEqual(len(frontmatter["description"]), 1024)
                self.assertNotIn("Migrated command from", frontmatter["description"])
                self.assertEqual(content.count(POINTER), 1, command_skill.as_posix())
                self.assertNotIn("advisor_consult", content)

    def test_claude_authored_skills_have_pi_discoverable_metadata(self) -> None:
        skipped = {"claude-code", "skill-creator"}
        for skill_file in sorted((REPOSITORY / ".evcrate/source/.claude/skills").rglob("SKILL.md")):
            if skill_file.parent.name in skipped:
                continue
            frontmatter, _ = parse_markdown_with_frontmatter(skill_file)
            self.assertRegex(frontmatter.get("name", ""), r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
            self.assertTrue(frontmatter.get("description"), skill_file.as_posix())
            self.assertLessEqual(len(frontmatter["description"]), 1024, skill_file.as_posix())

    def test_multiline_skill_descriptions_are_preserved_in_pi_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)
            for name in ("context-engineering", "svg-icon-generator"):
                generated = root / ".agents/skills" / name / "SKILL.md"
                frontmatter, _ = parse_markdown_with_frontmatter(generated)
                self.assertGreater(len(frontmatter["description"]), 20)
                self.assertNotIn(frontmatter["description"], {"|", ">-"})

    def test_generated_commands_workflows_agents_and_config_wait_for_terminal_results(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)

            command = (root / ".agents/skills/cmd_cook/SKILL.md").read_text(encoding="utf-8")
            code_command = (root / ".agents/skills/cmd_code/SKILL.md").read_text(encoding="utf-8")
            workflow = (root / ".codex/workflows/orchestration-protocol.md").read_text(encoding="utf-8")
            agent = (root / ".codex/agents/planner.toml").read_text(encoding="utf-8")
            guidance = (root / ".codex/global-guidance.md").read_text(encoding="utf-8")
            config = (root / ".codex/config.toml").read_text(encoding="utf-8")

            for generated in (command, guidance):
                self.assertIn(SUBAGENT_WAIT_CONTRACT, generated)
            self.assertIn("Subagent Completion Contract", workflow)
            self.assertIn('"No agents completed yet" is a non-terminal poll result', workflow)
            self.assertIn("preserve the agent identity", workflow)
            self.assertIn("Wait-loop protocol", code_command)
            self.assertIn('"No agents completed yet"', code_command)
            self.assertIn("cycle counter advances only after a terminal review result", code_command)
            self.assertIn("Return a terminal report", code_command)
            self.assertIn("## Subagent Completion Contract", agent)
            self.assertIn("wait for all N to finish", agent)
            self.assertIn("max_concurrent_threads_per_session = 4", config)
            self.assertIn("interrupt_message = true", config)
            self.assertNotIn("max_threads = 4", config)

    def test_generated_target_contains_no_advisor_runtime_or_wiring(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)
            self.assertFalse((root / ".codex/runtime").exists())
            generated_files = sorted((root / ".codex").rglob("*")) + sorted(
                (root / ".agents").rglob("*")
            )
            encoded_markers = tuple(marker.encode() for marker in FORBIDDEN_RUNTIME_MARKERS)
            for generated_file in generated_files:
                if not generated_file.is_file():
                    continue
                content = generated_file.read_bytes()
                for marker in encoded_markers:
                    self.assertNotIn(marker, content, generated_file.as_posix())

    def test_repeated_migration_is_byte_identical(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)
            first = tree_snapshot(root / ".agents")

            self.run_migrator(root)
            second = tree_snapshot(root / ".agents")
            self.assertEqual(first, second)

    def test_publish_dry_run_preserves_user_owned_config_without_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home = root / "home"
            destination = home / ".codex"
            destination.mkdir(parents=True)
            user_config = destination / ".evcrate.json"
            user_config.write_text("user-owned\n", encoding="utf-8")
            context = DistributionContext(
                DistributionAction.PUBLISH,
                REPOSITORY,
                home,
                None,
                "managed",
                "config-and-scripts",
                root / "state",
            )
            artifact = VerifiedArtifact(REPOSITORY, context.local_roots)
            changes = publish_diff(context, artifact)

            self.assertIn((".evcrate.json", "preserve"), {(item.path, item.action) for item in changes})
            self.assertEqual(user_config.read_text(encoding="utf-8"), "user-owned\n")


if __name__ == "__main__":
    unittest.main()
