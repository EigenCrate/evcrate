"""Central advisor controller distribution contracts."""

from __future__ import annotations

import json
import os
import re
import stat
import unittest
from pathlib import Path

from distribution.advisor_controller import (
    ADVISOR_CONTROLLER_FILES,
    controller_hashes,
    validate_advisor_controller_source,
)
from distribution.contracts import project_advisor_contract, render_harness_script_references
from distribution.manifest import load_target_manifest, load_target_registry

REPOSITORY = Path(__file__).resolve().parents[1]
CANONICAL = REPOSITORY / ".evcrate/source/.claude"
CONTROLLER = REPOSITORY / ".evcrate/source/.evcrate/bin"
FORBIDDEN_RUNTIME_MARKERS = (
    "advisor-bridge.cjs",
    "advisor-coordinator.cjs",
    "advisor-dispatch.cjs",
    "advisor-handoff.cjs",
    "native-capabilities.json",
    "active_host",
)
SCOPED_COMMANDS = (
    "code.md",
    "code/auto.md",
    "code/parallel.md",
    "cook/auto/parallel.md",
    "fix/logs.md",
    "fix/test.md",
    "fix/parallel.md",
    "fix/hard.md",
)


def _json_fence(text: str) -> dict[str, object]:
    match = re.search(r"```json\n(.*?)\n```", text, re.DOTALL)
    if match is None:
        raise AssertionError("missing JSON example")
    return json.loads(match.group(1))


class AdvisorSkillDistributionTest(unittest.TestCase):
    def test_canonical_checkpoint_contract_is_direct_and_exact(self) -> None:
        workflow = (CANONICAL / "workflows/advisor-mentoring.md").read_text(encoding="utf-8")
        request = _json_fence(workflow)
        self.assertEqual(list(request), [
            "protocol", "version", "checkpoint", "question", "kind", "task_or_phase",
            "evidence", "changed_paths", "prior_counsel", "owner_disposition",
        ])
        self.assertEqual(request["protocol"], "evcrate-advisor-checkpoint")
        self.assertNotIn("active_host", workflow)
        self.assertNotIn('"operation"', workflow)
        self.assertIn("~/.evcrate/bin/evcrate-advisor <<'JSON'", workflow)
        self.assertEqual(workflow.count("~/.evcrate/bin/evcrate-advisor"), 1)
        hard = (CANONICAL / "commands/fix/hard.md").read_text(encoding="utf-8")
        skill = (CANONICAL / "skills/advisor-strategy/SKILL.md").read_text(encoding="utf-8")
        brief = (CANONICAL / "skills/advisor-strategy/references/brief-contract.md").read_text(encoding="utf-8")
        for text in (hard, skill, brief):
            self.assertIn("evcrate-advisor-checkpoint", text)
            self.assertIn("~/.evcrate/bin/evcrate-advisor", text)
            self.assertNotIn("active_host", text)
            self.assertNotIn("advisor-bridge.cjs", text)

    def test_controller_closure_is_exact_regular_executable_source(self) -> None:
        validate_advisor_controller_source(CONTROLLER)
        self.assertEqual(tuple(path for path in ADVISOR_CONTROLLER_FILES), tuple(ADVISOR_CONTROLLER_FILES))
        self.assertEqual(set(controller_hashes(CONTROLLER)), set(ADVISOR_CONTROLLER_FILES))
        entrypoint = CONTROLLER / "evcrate-advisor"
        self.assertTrue(entrypoint.stat().st_mode & stat.S_IXUSR)
        self.assertEqual(entrypoint.read_text(encoding="utf-8").splitlines()[0], "#!/usr/bin/env node")
        for path in CONTROLLER.rglob("*"):
            if path.is_file():
                self.assertFalse(path.is_symlink())
                self.assertNotIn("test", path.name.lower())

    def test_every_target_uses_one_managed_workflow_path(self) -> None:
        workflow_paths = (
            ".claude/workflows/advisor-mentoring.md",
            ".codex/workflows/advisor-mentoring.md",
            ".gemini/workflows/advisor-mentoring.md",
            ".antigravity/workflows/advisor-mentoring.md",
            ".pi/agent/evcrate/workflows/advisor-mentoring.md",
            ".omp/evcrate/workflows/advisor-mentoring.md",
            ".copilot/evcrate/workflows/advisor-mentoring.md",
        )
        for relative in workflow_paths:
            with self.subTest(relative=relative):
                path = REPOSITORY / ".evcrate/source" / relative
                text = path.read_text(encoding="utf-8")
                self.assertEqual(text.count("~/.evcrate/bin/evcrate-advisor"), 1)
                self.assertNotIn("active_host", text)
                for marker in FORBIDDEN_RUNTIME_MARKERS:
                    self.assertNotIn(marker, text)

    def test_hard_command_projections_use_the_same_controller(self) -> None:
        command_paths = (
            ".claude/commands/fix/hard.md",
            ".agents/skills/cmd_fix_hard/SKILL.md",
            ".gemini/commands/fix/hard.toml",
            ".antigravity/skills/cmd_fix_hard/SKILL.md",
            ".pi/agent/evcrate/commands/fix/hard.md",
            ".omp/commands/cmd-fix__hard.md",
        )
        for relative in command_paths:
            with self.subTest(relative=relative):
                text = (REPOSITORY / ".evcrate/source" / relative).read_text(encoding="utf-8")
                self.assertIn("~/.evcrate/bin/evcrate-advisor", text)
                self.assertNotIn("active_host", text)
                self.assertNotIn("advisor-bridge.cjs", text)

    def test_target_manifests_have_no_per_harness_controller_runtime(self) -> None:
        registry = load_target_registry(REPOSITORY / ".evcrate/targets/manifest.json")
        self.assertEqual(set(registry.targets), {"antigravity", "claude", "codex", "gemini", "omp", "pi", "copilot"})
        for name, path in registry.targets.items():
            with self.subTest(target=name):
                raw = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(raw["schema_version"], 2)
                self.assertNotIn("advisor_runtime", raw)
                self.assertNotIn("runtime", raw)
                manifest = load_target_manifest(path)
                self.assertFalse(any("advisor" in source and "runtime" in source for source in manifest.adapter_sources))

    def test_generated_harnesses_contain_no_old_controller_copy(self) -> None:
        roots = (".claude", ".codex", ".agents", ".gemini", ".antigravity", ".pi", ".omp", ".copilot")
        for root_name in roots:
            root = REPOSITORY / ".evcrate/source" / root_name
            for path in root.rglob("*"):
                if not path.is_file():
                    continue
                relative = path.relative_to(root).as_posix()
                self.assertNotIn("bin/lib/advisor", relative, relative)
                try:
                    text = path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                for marker in FORBIDDEN_RUNTIME_MARKERS:
                    self.assertNotIn(marker, text, f"{root_name}/{relative}")

    def test_projection_helpers_keep_urls_and_central_advisor_contract(self) -> None:
        source = (
            "See https://example.test/.claude/path, ssh://host/.claude/path, "
            "ftp://host/.claude/path, file:///tmp/.claude/path, and "
            ".claude/scripts/tool.cjs."
        )
        self.assertEqual(
            render_harness_script_references(source, "codex"),
            "See https://example.test/.claude/path, ssh://host/.claude/path, "
            "ftp://host/.claude/path, file:///tmp/.claude/path, and "
            ".codex/scripts/tool.cjs.",
        )
        advisor = (CANONICAL / "agents/advisor.md").read_text(encoding="utf-8")
        self.assertEqual(project_advisor_contract(advisor.split("---\n", 2)[-1], "codex").count("evcrate-advisor-checkpoint"), 1)

    def test_package_declares_only_the_shared_controller_entrypoint(self) -> None:
        package = json.loads((REPOSITORY / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package["bin"], {"evcrate-advisor": ".evcrate/source/.evcrate/bin/evcrate-advisor"})
        self.assertIn(".evcrate/source/.evcrate/bin/**", package["files"])
        self.assertNotIn("test:advisor-routing", package["scripts"]["test"])
        self.assertEqual(package["scripts"]["test:advisor-controller"], "node --test tests/advisor-controller/*.test.cjs")


if __name__ == "__main__":
    unittest.main()
