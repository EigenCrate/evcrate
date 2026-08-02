"""Regression coverage for static advisor guidance in Codex output."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]


class AdvisorCodexWiringTest(unittest.TestCase):
    def test_migrator_distributes_static_skill_and_non_invoking_command_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            env = os.environ | {
                "CODEX_OUTPUT_DIR": str(root / ".codex"),
                "AGENTS_OUTPUT_DIR": str(root / ".agents"),
                "PROJECT_DOCS_OUTPUT_DIR": str(root / "docs"),
            }
            subprocess.run(
                [sys.executable, "migrate_claude_to_codex.py"],
                cwd=REPOSITORY,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
            config = (root / ".codex" / "config.toml").read_text(encoding="utf-8")
            hooks = json.loads((root / ".codex" / "hooks.json").read_text(encoding="utf-8"))
            skill = root / ".agents" / "skills" / "advisor-strategy"
            self.assertTrue((skill / "SKILL.md").is_file())
            self.assertTrue((skill / "references" / "brief-contract.md").is_file())
            self.assertNotIn("[mcp_servers.advisor]", config)
            self.assertNotIn("advisor", json.dumps(hooks))
            self.assertFalse((root / ".codex" / "runtime").exists())

            command_skills = sorted((root / ".agents" / "skills").glob("cmd_*/SKILL.md"))
            self.assertTrue(command_skills)
            pointer = "consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it."
            for command_skill in command_skills:
                self.assertEqual(command_skill.read_text(encoding="utf-8").count(pointer), 1)


if __name__ == "__main__":
    unittest.main()
