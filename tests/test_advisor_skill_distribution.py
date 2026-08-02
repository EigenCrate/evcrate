"""Regression coverage for skill-only advisor distribution."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from distribution.context import DistributionContext
from distribution.contracts import DistributionAction, VerifiedArtifact
from distribution.publish import publish_diff
from migrate_claude_to_codex import parse_markdown_with_frontmatter


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
                (REPOSITORY / ".claude/skills/advisor-strategy/references/brief-contract.md").read_bytes(),
            )
            frontmatter, generated_body = parse_markdown_with_frontmatter(skill)
            canonical_frontmatter, canonical_body = parse_markdown_with_frontmatter(
                REPOSITORY / ".claude/skills/advisor-strategy/SKILL.md"
            )
            self.assertEqual(frontmatter["name"], "advisor-strategy")
            self.assertTrue(frontmatter["description"])
            self.assertEqual(frontmatter, canonical_frontmatter)
            self.assertEqual(generated_body.encode(), canonical_body.encode())
            self.assertNotIn("provider", completed.stdout.lower())

    def test_generated_target_has_one_non_invoking_pointer_per_command(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.run_migrator(root)
            command_skills = sorted((root / ".agents" / "skills").glob("cmd_*/SKILL.md"))

            self.assertTrue(command_skills)
            for command_skill in command_skills:
                content = command_skill.read_text(encoding="utf-8")
                self.assertEqual(content.count(POINTER), 1, command_skill.as_posix())
                self.assertNotIn("advisor_consult", content)

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
            user_config = destination / ".devkit.json"
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

            self.assertIn((".devkit.json", "preserve"), {(item.path, item.action) for item in changes})
            self.assertEqual(user_config.read_text(encoding="utf-8"), "user-owned\n")


if __name__ == "__main__":
    unittest.main()
