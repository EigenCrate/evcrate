"""Regression coverage for advisor command-mode distribution."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest.mock import patch

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
REVIEW_COUNTER_COMMANDS = ("code.md", "code/auto.md", "code/parallel.md")
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
ADVICE_MATRIX_ROWS = (
    "| `plan/path --advice` | explicit | `plan/path` |",
    r"| `implement abc\n--advice` | explicit | `implement abc` |",
    "| `--advice` | explicit, empty work | empty |",
    "| `abc --advice --advice` | reject duplicate | not evaluated |",
    "| `abc --advice extra` | default | unchanged |",
    "| `abc --advice` + trailing whitespace | explicit | `abc` |",
    "| `\"--advice\"` | default | unchanged |",
    "| `path--advice` | default | unchanged |",
    "| `--advice.txt` | default | unchanged |",
    "| `--Advice` | default | unchanged |",
    "| `task @advisor` | default | unchanged |",
    "| `task @advisor continue` | default | unchanged |",
    "| `before @advisor after` | default | unchanged |",
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

    def run_gemini_migrator(self, root: Path) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        for credential in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
            env.pop(credential, None)
        source_root = REPOSITORY / ".evcrate/source"
        env.update(
            {
                "EVCRATE_SOURCE_DIR": str(source_root),
                "CLAUDE_SOURCE_DIR": str(source_root / ".claude"),
                "GEMINI_OUTPUT_DIR": str(root / ".gemini"),
                "GEMINI_PROJECT_DOCS_OUTPUT_DIR": str(root),
            }
        )
        return subprocess.run(
            [sys.executable, "migrate_claude_to_gemini.py"],
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

    def test_canonical_advice_contract_and_scoped_commands(self) -> None:
        canonical = REPOSITORY / ".evcrate/source/.claude"
        contract = (canonical / "workflows/advisor-mentoring.md").read_text(encoding="utf-8")
        normalized_contract = " ".join(contract.split()).lower()
        for marker in (
            "standalone token is exactly `--advice` delimited by whitespace",
            "two or more standalone tokens are a deterministic input error",
            "`abc --advice --advice`",
            "`abc --advice extra`",
            '`"--advice"`',
            "`path--advice`",
            "`--advice.txt`",
            "allowing trailing whitespace",
            "`--advice` alone produces empty",
            "non-final token remains ordinary input",
            "preserve every other byte",
            "`task @advisor`",
            "review:<workflow-step>",
            "stuck:<blocker-signature>",
            "decision:<workflow-step>",
            "second consecutive matching terminal",
            "consult at most once per stuck episode",
            "stop and ask the user for direction",
            "also satisfies any stuck consultation",
            "explicitly rejected model",
            "missing, partial, interrupted, cancelled, timed-out",
            "no fourth reviewer or advisor call",
            "at most three terminal reviewer/advisor cycles",
        ):
            self.assertIn(marker, normalized_contract)
        self.assertIn('`--Advice`', " ".join(contract.split()))
        for row in ADVICE_MATRIX_ROWS:
            with self.subTest(matrix_row=row):
                self.assertIn(row, contract)

        agent = canonical / "agents/advisor.md"
        frontmatter, body = parse_markdown_with_frontmatter(agent)
        self.assertEqual(frontmatter["name"], "advisor")
        self.assertEqual(frontmatter["model"], "opus")
        self.assertEqual(frontmatter["tools"], "Read, Glob, Grep")
        self.assertIn("advisor-strategy", body)
        self.assertIn("do not implement", body.lower())
        self.assertIn("fresh named checkpoint", frontmatter["description"])
        self.assertNotIn("@advisor", body)

        for relative in SCOPED_COMMANDS:
            with self.subTest(command=relative):
                content = (canonical / "commands" / relative).read_text(encoding="utf-8")
                normalized_content = " ".join(content.split())
                self.assertIn("[--advice]", content)
                self.assertNotIn("@advisor", content)
                self.assertIn(".claude/workflows/advisor-mentoring.md", content)
                self.assertIn("WORK_ARGUMENTS", content)
                self.assertIn("default stuck-escalation contract", normalized_content)
        for relative in DIRECT_REVIEW_COMMANDS:
            with self.subTest(review_command=relative):
                content = (canonical / "commands" / relative).read_text(encoding="utf-8")
                normalized_content = " ".join(content.split())
                self.assertIn("explicit advice mode", normalized_content.lower())
                self.assertIn("`advisor`", content)
                self.assertIn("code-reviewer", content)
                self.assertIn("terminal", normalized_content.lower())
                self.assertIn("review:<workflow-step>", normalized_content)
                self.assertIn("prior counsel", normalized_content.lower())
                self.assertIn("owner disposition", normalized_content.lower())
                reviewer_position = normalized_content.lower().find("code-reviewer")
                advisor_position = normalized_content.lower().find("explicit advice mode", reviewer_position)
                self.assertGreater(advisor_position, reviewer_position)

    def test_canonical_advisory_interview_and_claude_relay_contract(self) -> None:
        canonical = REPOSITORY / ".evcrate/source/.claude"
        workflow = (canonical / "workflows/advisory-interview.md").read_text(encoding="utf-8")
        normalized_workflow = " ".join(workflow.split()).lower()
        for marker in (
            "exact, case-sensitive, whitespace-delimited `--agent` tokens",
            "more than one is a deterministic input error",
            "quoted, embedded, suffixed, non-final",
            "one question per turn",
            "eight substantive `discovery` questions",
            "at most two `confirm_reframe` cycles",
            "interview_not_converged",
            '"protocol": "evcrate-advise-relay"',
            '"status": "needs_user_input"',
            '"status": "advice_ready"',
            "no pending question may coexist",
            "seven days",
            "24 hours",
            "64 kib",
            "0700",
            "0600",
            "no cleanup daemon",
            "executable `parse`, `validate-envelope`, `write-report`,",
            "atomic tombstone transition",
        ):
            self.assertIn(marker, normalized_workflow)
        self.assertEqual(workflow.count("EVCRATE_CAPABILITY=advise-inline/v1"), 1)
        self.assertEqual(workflow.count("EVCRATE_CAPABILITY=advise-agent-relay/claude/v1"), 1)
        for row in (
            "| `design a cache --agent` | Claude relay | `design a cache` |",
            "| `a --agent --agent` | reject | not evaluated |",
            "| `a --agent later` | inline | unchanged |",
            '| `"--agent"` | inline | unchanged |',
            "| `path--agent` | inline | unchanged |",
            "| `--Agent` | inline | unchanged |",
        ):
            self.assertIn(row, workflow)

        command = (canonical / "commands/advise.md").read_text(encoding="utf-8")
        frontmatter, body = parse_markdown_with_frontmatter(canonical / "commands/advise.md")
        self.assertIn("--agent", str(frontmatter["argument-hint"]))
        self.assertEqual(command.count("EVCRATE_CAPABILITY: advise-inline/v1"), 1)
        self.assertEqual(command.count("EVCRATE_CAPABILITY: advise-agent-relay/claude/v1"), 1)
        normalized_body = " ".join(body.split())
        for marker in (
            "Count exact, case-sensitive, whitespace-delimited standalone `--agent`",
            "Ask exactly one concise substantive question per turn",
            "Do not invoke a subagent",
            "state helper before any analysis",
            "validate-envelope",
            "validate-report",
            "write-report",
            "interview-relay/v1",
            "exactly one terminal JSON envelope",
            "Never silently downgrade to inline mode",
            "advise-state.cjs",
            "Reframed problem",
            "Unresolved questions",
        ):
            self.assertIn(marker, normalized_body)
        self.assertNotIn("ADVISE_AGENT_RELAY_UNSUPPORTED_CLAUDE", command)
        helper = (canonical / "scripts/advise-state.cjs").read_text(encoding="utf-8")
        for marker in ("parseArguments", "validateEnvelope", "validateReport", "writeReport", "STATE_BUSY", "recoverCompletion"):
            self.assertIn(marker, helper)

        agent_frontmatter, agent_body = parse_markdown_with_frontmatter(canonical / "agents/advisor.md")
        self.assertEqual(agent_frontmatter["model"], "opus")
        normalized_agent = " ".join(agent_body.split())
        self.assertIn("interview-relay/v1", normalized_agent)
        self.assertIn("exactly one JSON envelope", normalized_agent)
        self.assertIn("Do not activate checkpoint mode implicitly", normalized_agent)
        self.assertIn("do not ask the user directly", normalized_agent.lower())

        paths = (canonical / "hooks/lib/evcrate-paths.cjs").read_text(encoding="utf-8")
        self.assertIn("ADVICE_DIR", paths)
        self.assertIn("path.join(EVCRATE_ADVICE_ROOT, 'advice')", paths)

        help_script = canonical / "scripts/ev-help.py"
        result = subprocess.run(
            [sys.executable, str(help_script), "advise"],
            cwd=REPOSITORY,
            check=True,
            capture_output=True,
            text=True,
        )
        for marker in ("/advise", "--agent", "Claude-only", "--advice", "@advisor"):
            self.assertIn(marker, result.stdout)

    def test_decision_checkpoint_has_explicit_bootstrap_placement(self) -> None:
        canonical = REPOSITORY / ".evcrate/source/.claude"
        decision_commands = (
            "commands/bootstrap.md",
            "commands/bootstrap/auto.md",
            "commands/bootstrap/auto/fast.md",
            "commands/bootstrap/auto/parallel.md",
        )
        for relative in decision_commands:
            with self.subTest(command=relative):
                content = " ".join((canonical / relative).read_text(encoding="utf-8").split()).lower()
                self.assertIn("decision:<workflow-step>", content)
                self.assertIn("branch explicitly", content)
                self.assertIn("decision is irreversible", content)
                self.assertIn("call exactly one `advisor`", content)
                self.assertIn("otherwise continue the existing approval/action", content)
                self.assertIn("routine", content)

        primary = " ".join(
            (canonical / "workflows/primary-workflow.md").read_text(encoding="utf-8").split()
        ).lower()
        self.assertIn("decision:<workflow-step>", primary)
        for relative in HANDOFF_COMMANDS:
            with self.subTest(handoff_command=relative):
                content = (canonical / "commands" / relative).read_text(encoding="utf-8")
                normalized_content = " ".join(content.split())
                self.assertIn("append exactly one trailing", normalized_content)
                self.assertIn("exactly one trailing `--advice`", normalized_content)
                self.assertNotIn("@advisor", content)
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
        for relative in REVIEW_COUNTER_COMMANDS:
            with self.subTest(command=relative):
                content = " ".join(
                    (canonical / "commands" / relative).read_text(encoding="utf-8").split()
                )
                self.assertIn("at most three terminal reviewer/advisor cycles", content)
                self.assertIn("do not start another review or advisor call", content)
                self.assertNotIn("restart cycle counter", content)
                self.assertIn(
                    "review_cycles++ only after every required reviewer/advisor result is terminal",
                    content,
                )
                self.assertIn("do not increment review_cycles", content)

        for relative in REVIEW_LOOP_COMMANDS:
            with self.subTest(review_loop=relative):
                content = " ".join(
                    (canonical / "commands" / relative).read_text(encoding="utf-8").split()
                ).lower()
                self.assertIn("at most three terminal reviewer/advisor cycles", content)
                self.assertNotIn("restart cycle counter", content)

        auto = (canonical / "commands/code/auto.md").read_text(encoding="utf-8")
        normalized_auto = " ".join(auto.split()).lower()
        for marker in (
            "review_must_fix",
            "explicit advice mode sets advisor_must_fix",
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
                self.assertIn("exactly one trailing `--advice`", content)
                self.assertIn("otherwise pass no `--advice` token", content)
                self.assertNotIn("@advisor", content)

    def test_generated_codex_advisor_and_command_mode_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)
            self.run_gemini_migrator(root)
            advisor = tomllib.loads((root / ".codex/agents/advisor.toml").read_text(encoding="utf-8"))
            self.assertEqual(advisor["model"], "gpt-5.6-sol")
            self.assertEqual(advisor["model_reasoning_effort"], "high")
            self.assertIn("advisor-strategy", advisor["developer_instructions"])
            self.assertTrue((root / ".codex/workflows/advisor-mentoring.md").is_file())

            for relative in SCOPED_COMMANDS:
                skill_name = "cmd_" + relative.removesuffix(".md").replace("/", "_")
                content = (root / ".agents/skills" / skill_name / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn("--advice", content)
                self.assertNotIn("@advisor", content)
                self.assertIn("WORK_ARGUMENTS", content)
                self.assertIn(".codex/workflows/advisor-mentoring.md", content)

            gemini_commands = root / ".gemini/commands"
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
            self.assertIn("cycle counter advances only after every required reviewer/advisor result is terminal", code_command)
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
            # Phase 02 intentionally leaves generated artifacts/build manifest
            # untouched; isolate HOME-preservation behavior from that release gate.
            with patch("distribution.publish.verify_local_artifact"):
                changes = publish_diff(context, artifact)

            self.assertIn((".evcrate.json", "preserve"), {(item.path, item.action) for item in changes})
            self.assertEqual(user_config.read_text(encoding="utf-8"), "user-owned\n")


if __name__ == "__main__":
    unittest.main()
