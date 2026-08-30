"""OMP target projection without a native advisor callback path."""

from __future__ import annotations

import json
import os
import subprocess
import sys
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

    def _run_static_script(
        self,
        output: Path,
        script_name: str,
        *args: str,
    ) -> subprocess.CompletedProcess[str]:
        script = output / "evcrate" / "scripts" / script_name
        return subprocess.run(
            [sys.executable, str(script), *args],
            cwd=output.parent,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_projects_resources_and_shared_advisor_workflow(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = self._run_migration(Path(temp))
            self.assertTrue((output / "agents/advisor.md").is_file())
            self.assertTrue((output / "commands/cmd-fix__hard.md").is_file())
            self.assertFalse((output / "commands/fix__hard.md").exists())
            self.assertTrue((output / "evcrate/workflows/advisor-mentoring.md").is_file())
            router = (output / "commands/cmd-fix.md").read_text(encoding="utf-8")
            workflow = (output / "evcrate/workflows/advisor-mentoring.md").read_text(encoding="utf-8")
            advisory = (output / "evcrate/workflows/advisory-interview.md").read_text(encoding="utf-8")
            agent = (output / "agents/fullstack-developer.md").read_text(encoding="utf-8")
            hook = (output / "evcrate/hooks/session-init.cjs").read_text(encoding="utf-8")
            hard = (output / "commands/cmd-fix__hard.md").read_text(encoding="utf-8")
            take = (output / "commands/cmd-take.md").read_text(encoding="utf-8")
            self.assertIn("execute the selected command immediately", router)
            self.assertIn("`.omp/commands/cmd-fix__hard.md`", router)
            self.assertIn("appending exactly one", router)
            self.assertIn("If a markdown plan exists, select `/cmd-code <path-to-plan>`", router)
            self.assertIn("Wait for the delegated workflow to reach its terminal result", router)
            self.assertNotIn("before emitting any of these handoffs", router)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", workflow)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", hard)
            self.assertNotIn("native OMP", hard)
            self.assertNotIn("advisor-bridge.cjs", workflow)
            self.assertIn("Users can run `/cmd-advise <prompt>`", advisory)
            self.assertNotIn("Users can run `/advise <prompt>`", advisory)
            self.assertIn("/cmd-plan__parallel", agent)
            self.assertNotIn("/plan:parallel", agent)
            self.assertNotIn("/plan:validate", hook)
            self.assertIn('name: "/cmd-take"', take)
            self.assertNotIn("/evcrate:take", take)
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
            "Use the `Skill tool` to invoke `/plan:fast`.\n"
            "Also map `/evcrate:plan:fast` and `/fix:hard` through the command map.",
            command_map,
        )
        self.assertIn("`.omp/commands/cmd-fix__hard.md`", rendered)
        self.assertIn("`./.omp/commands/cmd-fix__hard.md`", rendered)
        self.assertIn("`~/.omp/agent/commands/cmd-fix__hard.md`", rendered)
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
        self.assertIn("/cmd-plan__fast", rendered)
        self.assertIn("/cmd-fix__hard", rendered)
        self.assertNotIn("/evcrate:plan:fast", rendered)
        self.assertNotIn("skill command", rendered)

    def test_prefixed_map_and_static_catalog_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = self._run_migration(Path(temp))
            map_path = output / "evcrate/command-name-map.json"
            mapping = json.loads(map_path.read_text(encoding="utf-8"))
            entries = mapping["commands"]
            fix_hard = next(item for item in entries if item["source"] == "fix/hard.md")
            self.assertEqual(mapping["schema"], "evcrate-omp-command-map-v1")
            self.assertEqual(fix_hard["target"], "cmd-fix__hard.md")
            self.assertEqual(fix_hard["targetName"], "cmd-fix__hard")

            command_files = {
                path.relative_to(output / "commands").as_posix()
                for path in (output / "commands").rglob("*.md")
            }
            self.assertEqual(command_files, {item["target"] for item in entries})
            self.assertTrue(all(path.startswith("cmd-") for path in command_files))
            self.assertNotIn("fix__hard.md", command_files)

            category = self._run_static_script(output, "ev-help.py", "fix")
            self.assertEqual(category.returncode, 0, category.stderr)
            self.assertIn("/cmd-fix", category.stdout)
            self.assertNotIn("/fix`", category.stdout)

            advice = self._run_static_script(output, "ev-help.py", "advise")
            self.assertEqual(advice.returncode, 0, advice.stderr)
            self.assertIn("native inline interview", advice.stdout)
            self.assertNotIn("Claude-only relay", advice.stdout)
            exact = self._run_static_script(output, "ev-help.py", "cmd-fix__hard")
            self.assertEqual(exact.returncode, 0, exact.stderr)
            self.assertIn("# `/cmd-fix__hard`", exact.stdout)
            old = self._run_static_script(output, "ev-help.py", "fix__hard")
            self.assertEqual(old.returncode, 0, old.stderr)
            self.assertNotIn("**Usage:**", old.stdout)

            scanner = self._run_static_script(output, "scan_commands.py")
            self.assertEqual(scanner.returncode, 0, scanner.stderr)
            self.assertIn("/cmd-fix__hard", scanner.stdout)
            self.assertNotIn("/ck:", scanner.stdout)
            catalog = (output / "evcrate/scripts/commands_data.yaml").read_text(encoding="utf-8")
            self.assertIn("name: /cmd-fix__hard", catalog)
            self.assertIn("path: cmd-fix__hard.md", catalog)

            original_map = map_path.read_text(encoding="utf-8")
            map_path.unlink()
            for script_name in ("ev-help.py", "scan_commands.py"):
                failed = self._run_static_script(output, script_name)
                self.assertNotEqual(failed.returncode, 0, script_name)
                self.assertIn("Invalid or missing OMP command map", failed.stderr)

            duplicate = json.loads(original_map)
            duplicate["commands"][1]["targetName"] = duplicate["commands"][0]["targetName"]
            duplicate["commands"][1]["target"] = duplicate["commands"][0]["target"]
            map_path.write_text(json.dumps(duplicate), encoding="utf-8")
            for script_name in ("ev-help.py", "scan_commands.py"):
                failed = self._run_static_script(output, script_name)
                self.assertNotEqual(failed.returncode, 0, script_name)
                self.assertIn("Invalid or duplicate OMP command map record", failed.stderr)

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
