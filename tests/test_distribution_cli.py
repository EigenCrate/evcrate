"""Regression coverage for the Phase 1 distribution command boundary."""

from __future__ import annotations

import os
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import distribute
from distribution.context import create_context
from distribution.contracts import BuildError, DistributionAction, PublishError, VerifiedArtifact
from distribution import gates


class DistributionCliTest(unittest.TestCase):
    def test_parse_actions_are_exclusive_and_bare_is_compatible(self) -> None:
        self.assertEqual(distribute.parse_args(["--build"]), DistributionAction.BUILD)
        self.assertEqual(distribute.parse_args(["--check"]), DistributionAction.CHECK)
        self.assertEqual(distribute.parse_args(["--publish"]), DistributionAction.PUBLISH)
        self.assertEqual(distribute.parse_args(["--all"]), DistributionAction.ALL)
        with patch("sys.stderr", new_callable=io.StringIO):
            self.assertEqual(distribute.parse_args([]), DistributionAction.ALL)
        with self.assertRaises(SystemExit):
            with patch("sys.stderr", new_callable=io.StringIO):
                distribute.parse_args(["--build", "--publish"])
        with self.assertRaises(SystemExit):
            with patch("sys.stderr", new_callable=io.StringIO):
                distribute.parse_args(["--dry-run"])

    def test_staged_migrators_run_from_repository_with_fatal_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = create_context(DistributionAction.BUILD, stage=Path(temp))
            with patch("distribution.gates.subprocess.run") as run:
                def write_required_docs(*args: object, **kwargs: object) -> None:
                    command = args[0]
                    if command[0] == "npm":
                        if command[-1] == "build":
                            Path(kwargs["cwd"]).joinpath("dist").mkdir()
                            Path(kwargs["cwd"]).joinpath("dist/server.js").write_text("bundle", encoding="utf-8")
                        return
                    env = kwargs["env"]
                    script = str(command[1])
                    if script.endswith("migrate_claude_to_codex.py"):
                        Path(env["PROJECT_DOCS_OUTPUT_DIR"]).joinpath("AGENTS.md").write_text("context", encoding="utf-8")
                    else:
                        Path(env["GEMINI_PROJECT_DOCS_OUTPUT_DIR"]).joinpath("GEMINI.md").write_text("context", encoding="utf-8")

                run.side_effect = write_required_docs
                gates._generate_stage(context)
            migrator_calls = [call for call in run.call_args_list if call.args[0][0] != "npm"]
            self.assertEqual(len(migrator_calls), 2)
            for call in migrator_calls:
                self.assertEqual(call.kwargs["cwd"], context.repository)
                self.assertTrue(call.kwargs["check"])
                self.assertEqual(call.kwargs["env"]["PROJECT_DOCS_OUTPUT_DIR"], str(context.stage_project_docs))
                self.assertEqual(call.kwargs["env"]["GEMINI_PROJECT_DOCS_OUTPUT_DIR"], str(context.stage_project_docs))

    def test_failed_build_never_calls_publisher(self) -> None:
        with patch("distribution.gates.run_local_build", side_effect=BuildError("generator failed")), patch(
            "distribution.gates.run_home_publish"
        ) as publish:
            with self.assertRaises(BuildError):
                gates.run_all()
        publish.assert_not_called()

    def test_promotion_handles_a_file_backup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "staged"
            destination = root / "AGENTS.md"
            source.write_text("new", encoding="utf-8")
            destination.write_text("old", encoding="utf-8")
            gates._promote_path(source, destination)
            self.assertEqual(destination.read_text(encoding="utf-8"), "new")
            self.assertFalse((root / ".AGENTS.md.distribution-backup").exists())

    def test_local_promotion_restores_prior_outputs_on_later_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first_source, second_source = root / "first-stage", root / "missing-stage"
            first_destination, second_destination = root / "first", root / "second"
            first_source.write_text("new", encoding="utf-8")
            first_destination.write_text("old", encoding="utf-8")
            with self.assertRaises(BuildError):
                gates._promote_transaction([(first_source, first_destination), (second_source, second_destination)])
            self.assertEqual(first_destination.read_text(encoding="utf-8"), "old")

    def test_tree_comparison_handles_matching_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            left, right = root / "left", root / "right"
            for directory in (left, right):
                (directory / "nested").mkdir(parents=True)
                (directory / "nested" / "artifact.txt").write_text("same", encoding="utf-8")
            self.assertTrue(gates._same_tree(left, right))

    def test_tree_comparison_rejects_file_directory_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            left, right = root / "left", root / "right"
            left.mkdir()
            right.mkdir()
            (left / "shared").write_text("file", encoding="utf-8")
            (right / "shared").mkdir()
            self.assertFalse(gates._same_tree(left, right))

    def test_check_is_read_only_for_project_docs_and_home(self) -> None:
        context = create_context(DistributionAction.CHECK)
        documents = [context.local_path(name) for name in gates.GENERATED_DOCS]
        before = {path: path.read_bytes() if path.exists() else None for path in documents}
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, {"EVCRATE_HOME": home}):
            def generate(stage_context: object) -> VerifiedArtifact:
                stage = stage_context.stage
                assert stage is not None
                for root in stage_context.local_roots:
                    (stage / root.name).mkdir(exist_ok=True)
                stage_context.stage_project_docs.mkdir(exist_ok=True)
                (stage_context.stage_project_docs / "AGENTS.md").write_text("staged", encoding="utf-8")
                return VerifiedArtifact(stage_context.repository, tuple(stage / root.name for root in stage_context.local_roots))

            with patch("distribution.gates._generate_stage", side_effect=generate):
                with self.assertRaises(BuildError):
                    gates.run_local_check()
            self.assertFalse(any(Path(home).iterdir()))
        self.assertEqual(before, {path: path.read_bytes() if path.exists() else None for path in documents})

    def test_publish_requires_a_matching_artifact_and_never_runs_migrators(self) -> None:
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, {"EVCRATE_HOME": home}):
            context = create_context(DistributionAction.PUBLISH)
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            with patch("distribution.publish.publish_local_artifacts") as publish, patch(
                "distribution.gates._run_migrator"
            ) as migrator:
                gates.run_home_publish(context, artifact)
        publish.assert_called_once_with(context, artifact, dry_run=False)
        migrator.assert_not_called()

    def test_publish_exports_claude_source_and_pi_discoverable_skills(self) -> None:
        with tempfile.TemporaryDirectory() as home, patch.dict(os.environ, {"EVCRATE_HOME": home}):
            context = create_context(DistributionAction.PUBLISH)
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            gates.run_home_publish(context, artifact)

            published_claude = Path(home) / ".claude"
            published_pi_skills = Path(home) / ".agents" / "skills"
            self.assertEqual(
                (published_claude / "skills/planning/SKILL.md").read_bytes(),
                (context.local_claude / "skills/planning/SKILL.md").read_bytes(),
            )
            self.assertEqual(
                (published_pi_skills / "planning/SKILL.md").read_bytes(),
                (context.local_agents / "skills/planning/SKILL.md").read_bytes(),
            )
            for source_file in (context.local_claude / "skills").iterdir():
                if source_file.is_file():
                    self.assertFalse((published_claude / "skills" / source_file.name).exists())
            self.assertTrue((published_claude / "skills/common/README.md").is_file())
            self.assertFalse((Path(home) / ".pi/agent/settings.json").exists())

    def test_publish_rejects_symlinked_home_before_creating_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            outside = root / "outside"
            outside.mkdir()
            home = root / "home"
            home.symlink_to(outside, target_is_directory=True)
            context = create_context(
                DistributionAction.PUBLISH,
                environ={"EVCRATE_HOME": str(home)},
            )
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            with self.assertRaisesRegex(PublishError, "symlinked ancestors"):
                gates.run_home_publish(context, artifact)
            self.assertFalse((outside / ".local").exists())

    def test_publish_rejects_symlinked_state_ancestor_before_creating_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home = root / "home"
            outside = root / "outside"
            home.mkdir()
            outside.mkdir()
            (home / ".local").symlink_to(outside, target_is_directory=True)
            context = create_context(
                DistributionAction.PUBLISH,
                environ={"EVCRATE_HOME": str(home)},
            )
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            with self.assertRaisesRegex(PublishError, "state path"):
                gates.run_home_publish(context, artifact)
            self.assertFalse((outside / "evcrate").exists())

    def test_gemini_publisher_rewrites_settings_without_runtime_name_error(self) -> None:
        from distribute_sync import sync_gemini_assets
        from distribution.context import DistributionContext

        with tempfile.TemporaryDirectory() as temp:
            root, home = Path(temp) / "repo", Path(temp) / "home"
            (root / ".evcrate/source/.gemini").mkdir(parents=True)
            (root / ".evcrate/source/.gemini" / "settings.json").write_text('{"hooks": {}}', encoding="utf-8")
            context = DistributionContext(
                action=DistributionAction.PUBLISH,
                repository=root,
                home=home,
                stage=None,
                global_sync_mode="managed",
                gemini_global_mode="config-and-scripts",
            )
            sync_gemini_assets(context)
            self.assertEqual(__import__("json").loads((home / ".gemini" / "settings.json").read_text(encoding="utf-8")), {"hooks": {}})

    def test_unexpected_publish_failure_is_wrapped(self) -> None:
        context = create_context(DistributionAction.PUBLISH)
        artifact = VerifiedArtifact(context.repository, context.local_roots)
        with patch("distribution.publish.publish_local_artifacts", side_effect=NameError("bug")):
            with self.assertRaises(PublishError) as raised:
                gates.run_home_publish(context, artifact)
        self.assertEqual(str(raised.exception), "HOME publication failed")

    def test_legacy_publisher_delegates_to_manifest_publisher(self) -> None:
        from distribute_sync import publish_local_artifacts
        from distribution.context import DistributionContext

        with tempfile.TemporaryDirectory() as temp:
            root, home = Path(temp) / "repo", Path(temp) / "home"
            context = DistributionContext(DistributionAction.PUBLISH, root, home, None, "managed", "config-and-scripts")
            with patch("distribution.publish.publish_local_artifacts") as publish:
                publish_local_artifacts(context)
        publish.assert_called_once()

    def test_direct_global_migrators_require_emergency_opt_in(self) -> None:
        for script in ("migrate_claude_to_codex.py", "migrate_claude_to_gemini.py"):
            completed = subprocess.run(
                [sys.executable, script, "--global"],
                cwd=Path(__file__).resolve().parents[1],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("EVCRATE_ALLOW_DIRECT_GLOBAL=1", completed.stderr)


if __name__ == "__main__":
    unittest.main()
