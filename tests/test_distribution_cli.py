"""Distribution command boundary contracts."""

from __future__ import annotations

import io
import json
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

REPOSITORY = Path(__file__).resolve().parents[1]


class DistributionCliTest(unittest.TestCase):
    def test_parse_actions_and_target_selection(self) -> None:
        self.assertEqual(distribute.parse_args(["--build"]), DistributionAction.BUILD)
        self.assertEqual(distribute.parse_args(["--check"]), DistributionAction.CHECK)
        self.assertEqual(distribute.parse_args(["--publish"]), DistributionAction.PUBLISH)
        self.assertEqual(distribute.parse_args(["--all"]), DistributionAction.ALL)
        with patch("sys.stderr", new_callable=io.StringIO):
            self.assertEqual(distribute.parse_args([]), DistributionAction.ALL)
        self.assertEqual(distribute.parse_invocation(["--all", "--target", "pi"]).selected_targets, ("pi",))
        for arguments in (("--build", "--publish"), ("--dry-run",), ("--all", "--target", "unknown")):
            with self.subTest(arguments=arguments), patch("sys.stderr", new_callable=io.StringIO):
                with self.assertRaises(SystemExit):
                    distribute.parse_invocation(list(arguments))

    def test_selected_context_contains_shared_controller_root(self) -> None:
        context = create_context(DistributionAction.BUILD, selected_targets=("omp",))
        self.assertEqual({path.name for path in context.local_roots}, {".evcrate", ".omp"})
        self.assertEqual(context.local_evcrate, context.local_path(".evcrate"))

    def test_publish_path_never_runs_a_migrator(self) -> None:
        context = create_context(DistributionAction.PUBLISH)
        artifact = VerifiedArtifact(context.repository, context.local_roots)
        with patch("distribution.publish.publish_local_artifacts", return_value=[]) as publish, patch(
            "distribution.gates._run_migrator"
        ) as migrator:
            gates.run_home_publish(context, artifact)
        publish.assert_called_once_with(context, artifact, dry_run=False)
        migrator.assert_not_called()

    def test_failed_build_never_calls_publisher(self) -> None:
        with patch("distribution.gates.run_local_build", side_effect=BuildError("generator failed")), patch(
            "distribution.gates.run_home_publish"
        ) as publish:
            with self.assertRaises(BuildError):
                gates.run_all()
        publish.assert_not_called()

    def test_unexpected_publish_failure_is_wrapped(self) -> None:
        context = create_context(DistributionAction.PUBLISH)
        artifact = VerifiedArtifact(context.repository, context.local_roots)
        with patch("distribution.publish.publish_local_artifacts", side_effect=NameError("bug")):
            with self.assertRaisesRegex(PublishError, "HOME publication failed"):
                gates.run_home_publish(context, artifact)

    def test_direct_global_migration_requires_explicit_emergency_opt_in(self) -> None:
        for script in ("migrate_claude_to_codex.py", "migrate_claude_to_gemini.py"):
            completed = subprocess.run(
                [sys.executable, script, "--global"],
                cwd=REPOSITORY,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("EVCRATE_ALLOW_DIRECT_GLOBAL=1", completed.stderr)

    def test_json_dry_run_is_a_serialized_publish_diff(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context = create_context(
                DistributionAction.PUBLISH,
                environ={"EVCRATE_HOME": str(Path(temp) / "home"), "EVCRATE_STATE_HOME": str(Path(temp) / "state")},
                selected_targets=("pi",),
            )
            artifact = VerifiedArtifact(context.repository, context.local_roots)
            with patch("distribution.gates.verified_local_artifact", return_value=artifact), patch(
                "distribute.run_home_publish", return_value=[]
            ):
                with patch("sys.argv", ["distribute.py", "--publish", "--dry-run", "--json"]), patch(
                    "sys.stdout", new_callable=io.StringIO
                ) as stdout:
                    self.assertEqual(distribute.main(), 0)
            self.assertEqual(json.loads(stdout.getvalue()), [])


if __name__ == "__main__":
    unittest.main()
