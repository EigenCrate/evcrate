from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import migrate_claude_to_omp
from distribution.contracts import validate_harness_resource_projection
from pi_adapter.frontmatter import split_frontmatter


REPOSITORY = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPOSITORY / ".evcrate/source"
SOURCE = SOURCE_ROOT / ".claude"


class OMPAdapterTest(unittest.TestCase):
    def _run_migration(self, root: Path) -> Path:
        stage = root / "stage"
        stage.mkdir()
        output = stage / ".omp"
        output.mkdir()
        with patch.dict(os.environ, {
            "EVCRATE_REPOSITORY": str(REPOSITORY),
            "EVCRATE_SOURCE_DIR": str(SOURCE_ROOT),
            "CLAUDE_SOURCE_DIR": str(SOURCE),
            "OMP_STAGE_ROOT": str(stage),
            "OMP_OUTPUT_DIR": str(output),
        }, clear=False):
            self.assertEqual(migrate_claude_to_omp.main([]), 0)
        return output

    def test_projects_native_resources_and_static_closure(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = self._run_migration(Path(temp))
            self.assertEqual(len(list((output / "agents").glob("*.md"))), 18)
            self.assertEqual(len(list((output / "commands").glob("*.md"))), 73)
            self.assertEqual(len(list((output / "skills").glob("*/SKILL.md"))), 51)
            self.assertTrue((output / "commands/plan__fast.md").is_file())
            self.assertTrue((output / "commands/coding-level.md").is_file())
            self.assertFalse((output / "commands/plan/fast.md").exists())
            self.assertTrue((output / "skills/claude-code/SKILL.md").is_file())
            self.assertTrue((output / "skills/docx/SKILL.md").is_file())
            self.assertTrue((output / "evcrate/skills/common/README.md").is_file())
            self.assertTrue((output / "evcrate/hooks/session-init.cjs").is_file())
            self.assertFalse((output / "evcrate/scripts/advisor-bridge.cjs").exists())
            self.assertNotIn("advisor-bridge.cjs", (output / "commands/fix__hard.md").read_text(encoding="utf-8"))
            self.assertNotIn("advisor-bridge.cjs", (output / "evcrate/workflows/advisor-mentoring.md").read_text(encoding="utf-8"))
            self.assertIn("dispatch exactly one blocking native OMP", (output / "commands/fix__hard.md").read_text(encoding="utf-8"))
            self.assertNotIn("executable local bridge", (output / "commands/fix.md").read_text(encoding="utf-8"))
            self.assertIn("~/.omp/agent/evcrate/workflows/primary-workflow.md", (output / "commands/ask.md").read_text(encoding="utf-8"))
            runtime = (output / "evcrate/omp-hook-runtime.ts").read_text(encoding="utf-8")
            self.assertIn("output.split(\"\\n\")", runtime)
            self.assertIn('spawn("node"', runtime)
            self.assertNotIn("spawn(process.execPath", runtime)
            self.assertTrue((output / "hooks/pre/evcrate-context.ts").is_file())
            self.assertTrue((output / "hooks/pre/evcrate-policy.ts").is_file())
            self.assertTrue((output / "hooks/post/evcrate-results.ts").is_file())
            self.assertTrue((output / "evcrate/output-styles/coding-level-1-junior.md").is_file())

            planner = split_frontmatter((output / "agents/planner.md").read_text(encoding="utf-8"), output / "agents/planner.md")
            self.assertEqual(planner.fields["model"], "@slow")
            self.assertEqual(planner.fields["thinking-level"], "high")
            reviewer = split_frontmatter((output / "agents/code-reviewer.md").read_text(encoding="utf-8"), output / "agents/code-reviewer.md")
            self.assertEqual(reviewer.fields["model"], "@default")
            ui = split_frontmatter((output / "agents/ui-ux-designer.md").read_text(encoding="utf-8"), output / "agents/ui-ux-designer.md")
            self.assertNotIn("model", ui.fields)
            advisor = (output / "agents/advisor.md").read_text(encoding="utf-8")
            self.assertIn("ADVISE_AGENT_RELAY_UNSUPPORTED_OMP", advisor)
            self.assertNotIn("interview-relay/v1` contract", advisor)
            advise = (output / "commands/advise.md").read_text(encoding="utf-8")
            self.assertIn("ADVISE_AGENT_RELAY_UNSUPPORTED_OMP", advise)
            self.assertIn("native user-input flow", advise)

            hook_map = json.loads((output / "evcrate/hook-map.json").read_text(encoding="utf-8"))
            self.assertEqual(hook_map["events"]["PreToolUse"]["targetEvents"], ["tool_call"])
            self.assertEqual(hook_map["events"]["SubagentStart"]["status"], "limited")
            inventory = json.loads((output / "evcrate/inventory.json").read_text(encoding="utf-8"))
            self.assertEqual(inventory["modelAliases"]["opus"], "@slow")
            self.assertEqual(inventory["native"]["commands"], 73)
            validate_harness_resource_projection(SOURCE, output, "omp")

    def test_rejects_direct_arguments_and_noncanonical_source(self) -> None:
        with self.assertRaises(SystemExit):
            migrate_claude_to_omp.main(["--global"])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stage = root / "stage"
            stage.mkdir()
            (stage / ".omp").mkdir()
            outside = root / "outside/.claude"
            outside.mkdir(parents=True)
            noncanonical = root / "not-canonical"
            noncanonical.mkdir()
            env = {
                "EVCRATE_REPOSITORY": str(REPOSITORY),
                "EVCRATE_SOURCE_DIR": str(noncanonical),
                "CLAUDE_SOURCE_DIR": str(outside),
                "OMP_STAGE_ROOT": str(stage),
                "OMP_OUTPUT_DIR": str(stage / ".omp"),
            }
            with patch.dict(os.environ, env, clear=False):
                with self.assertRaisesRegex(SystemExit, "canonical repository"):
                    migrate_claude_to_omp.main([])


if __name__ == "__main__":
    unittest.main()
