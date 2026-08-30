"""OMP target projection without a native advisor callback path."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import migrate_claude_to_omp
from distribution.contracts import validate_harness_resource_projection
from omp_adapter.commands import build_command_map, translate_prompt

from tests.distribution_support import REPOSITORY

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

    def test_projects_resources_and_shared_advisor_workflow(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = self._run_migration(Path(temp))
            self.assertTrue((output / "agents/advisor.md").is_file())
            self.assertTrue((output / "commands/fix__hard.md").is_file())
            self.assertTrue((output / "evcrate/workflows/advisor-mentoring.md").is_file())
            router = (output / "commands/fix.md").read_text(encoding="utf-8")
            workflow = (output / "evcrate/workflows/advisor-mentoring.md").read_text(encoding="utf-8")
            hard = (output / "commands/fix__hard.md").read_text(encoding="utf-8")
            self.assertIn("execute the selected command immediately", router)
            self.assertIn("`.omp/commands/fix__hard.md`", router)
            self.assertIn("appending exactly one", router)
            self.assertIn("If a markdown plan exists, select `/code <path-to-plan>`", router)
            self.assertIn("Wait for the delegated workflow to reach its terminal result", router)
            self.assertNotIn("before emitting any of these handoffs", router)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", workflow)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", hard)
            self.assertNotIn("native OMP", hard)
            self.assertNotIn("advisor-bridge.cjs", workflow)
            inventory = json.loads((output / "evcrate/inventory.json").read_text(encoding="utf-8"))
            self.assertIn("advisorController", inventory["limitations"])
            self.assertNotIn("advisorRelay", inventory["limitations"])
            self.assertEqual(inventory["skillRuntime"]["projectRoot"], ".omp/skills")
            self.assertEqual(inventory["skillRuntime"]["homeRoot"], "~/.omp/agent/skills")
            self.assertIn("disables skill discovery", inventory["skillRuntime"]["noSkills"])
            validate_harness_resource_projection(SOURCE, output, "omp")

    def test_translates_command_files_and_disabled_skill_runtime(self) -> None:
        command_map = build_command_map(SOURCE)
        rendered = translate_prompt(
            "Read `.claude/commands/fix/hard.md`, `./.claude/commands/fix/hard.md`, "
            "and `~/.claude/commands/fix/hard.md`.\n"
            "Leave https://example.test/.claude/commands/fix/hard.md, "
            "ssh://host/.claude/commands/fix/hard.md, "
            "ftp://host/.claude/commands/fix/hard.md, "
            "file:///repo/.claude/commands/fix/hard.md, "
            "mailto:ops/.claude/commands/fix/hard.md, "
            "urn:example:.claude/commands/fix/hard.md, "
            "data:text/plain,.claude/commands/fix/hard.md, "
            "//host/.claude/commands/fix/hard.md, and "
            "custom+v1://host/.claude/commands/fix/hard.md unchanged.\n"
            "Analyze the skills catalog and activate the skills that are needed for the task "
            "during the process.\n"
            "Use the `Skill tool` to invoke `/plan:fast`.",
            command_map,
        )
        self.assertIn("`.omp/commands/fix__hard.md`", rendered)
        self.assertIn("`./.omp/commands/fix__hard.md`", rendered)
        self.assertIn("`~/.omp/agent/commands/fix__hard.md`", rendered)
        self.assertIn("https://example.test/.claude/commands/fix/hard.md", rendered)
        for uri in (
            "ssh://host/.claude/commands/fix/hard.md",
            "ftp://host/.claude/commands/fix/hard.md",
            "file:///repo/.claude/commands/fix/hard.md",
            "mailto:ops/.claude/commands/fix/hard.md",
            "urn:example:.claude/commands/fix/hard.md",
            "data:text/plain,.claude/commands/fix/hard.md",
            "//host/.claude/commands/fix/hard.md",
            "custom+v1://host/.claude/commands/fix/hard.md",
        ):
            self.assertIn(uri, rendered)
        self.assertIn("`omp --no-skills` disables skill discovery and loading", rendered)
        self.assertIn("`./.omp/skills/<skill-name>/SKILL.md`", rendered)
        self.assertIn("`~/.omp/agent/skills/<skill-name>/SKILL.md`", rendered)
        self.assertIn("/plan__fast", rendered)
        self.assertIn("OMP command mechanism", rendered)
        self.assertNotIn("skill command", rendered)

    def test_rejects_direct_arguments_and_noncanonical_source(self) -> None:
        with self.assertRaises(SystemExit):
            migrate_claude_to_omp.main(["--global"])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stage = root / "stage"
            output = stage / ".omp"
            stage.mkdir()
            output.mkdir()
            outside = root / "outside/.claude"
            outside.mkdir(parents=True)
            (outside / ".evcrate.json").write_text("{}", encoding="utf-8")
            (outside / ".evcrateignore").write_text("", encoding="utf-8")
            with patch.dict(os.environ, {
                "EVCRATE_REPOSITORY": str(REPOSITORY),
                "EVCRATE_SOURCE_DIR": str(outside.parent),
                "CLAUDE_SOURCE_DIR": str(outside),
                "OMP_STAGE_ROOT": str(stage),
                "OMP_OUTPUT_DIR": str(output),
            }, clear=False):
                with self.assertRaises(SystemExit):
                    migrate_claude_to_omp.main([])


if __name__ == "__main__":
    unittest.main()
