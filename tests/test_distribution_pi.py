"""End-to-end isolated-HOME coverage for the native Pi target."""

from __future__ import annotations

import json
import shutil
from dataclasses import replace
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from distribution.context import create_context
from distribution.contracts import DistributionAction, PublishError, VerifiedArtifact
from distribution import gates
from distribution.gates import run_home_publish, run_local_build, run_local_check
from distribution.manifest import build_manifest_bytes
from distribution.publish import publish_local_artifacts
from distribution.publish_verification import verify_local_artifact
from distribution.staging import build_manifest_path


REPOSITORY = Path(__file__).resolve().parents[1]


def tree_bytes(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class NativePiDistributionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._artifact_snapshot = tempfile.TemporaryDirectory()
        snapshot = Path(cls._artifact_snapshot.name)
        cls._tracked_artifacts = (Path(".evcrate/source/.pi"), Path(".evcrate/build-manifest-pi.json"))
        cls._artifact_existed = {path: path.exists() for path in cls._tracked_artifacts}
        for path, exists in cls._artifact_existed.items():
            if exists:
                destination = snapshot / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(path, destination) if path.is_dir() else shutil.copy2(path, destination)
        run_local_build(("pi",))
        run_local_check(("pi",))

    @classmethod
    def tearDownClass(cls) -> None:
        snapshot = Path(cls._artifact_snapshot.name)
        for path, existed in cls._artifact_existed.items():
            if path.is_dir():
                shutil.rmtree(path)
            elif path.exists() or path.is_symlink():
                path.unlink()
            if existed:
                path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(snapshot / path, path) if (snapshot / path).is_dir() else shutil.copy2(snapshot / path, path)
        cls._artifact_snapshot.cleanup()

    def test_pi_build_manifest_does_not_replace_default_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = Path(temp)
            shutil.copytree(REPOSITORY / ".evcrate/targets", repository / ".evcrate/targets")
            for relative in (
                "migrate_claude_to_gemini.py",
                "migrate_claude_to_codex.py",
                "migrate_claude_to_pi.py",
                "pi_adapter",
                "distribution/antigravity_publish.py",
                "distribution/advisor_runtime.py",
                "distribution/contracts.py",
            ):
                source, destination = REPOSITORY / relative, repository / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(source, destination) if source.is_dir() else shutil.copy2(source, destination)
            all_context = replace(create_context(DistributionAction.BUILD), repository=repository)
            pi_stage = repository / "stage"
            pi_context = replace(
                create_context(DistributionAction.BUILD, selected_targets=("pi",)),
                repository=repository,
                stage=pi_stage,
            )
            outputs = {path.name: path for path in (*all_context.local_roots, *all_context.local_project_docs)}
            for path in outputs.values():
                path.mkdir(parents=True, exist_ok=True)
            default_manifest = repository / build_manifest_path(all_context)
            default_manifest.parent.mkdir(parents=True, exist_ok=True)
            default_manifest.write_bytes(build_manifest_bytes(
                source_hashes={}, adapter_hashes={}, owners={}, output_roots=outputs,
                home_policy={}, validation={"complete": True}, runtime_hashes={},
            ))
            pi_root = pi_stage / ".pi"
            shutil.copytree(outputs[".pi"], pi_root)
            pi_manifest = pi_stage / build_manifest_path(pi_context)
            pi_manifest.parent.mkdir(parents=True, exist_ok=True)
            pi_manifest.write_text("pi authorization", encoding="utf-8")

            gates._promote_transaction(gates._changed_promotion_pairs(
                pi_context, VerifiedArtifact(repository, (pi_root,)),
            ))

            self.assertEqual(default_manifest.read_bytes(), build_manifest_bytes(
                source_hashes={}, adapter_hashes={}, owners={}, output_roots=outputs,
                home_policy={}, validation={"complete": True}, runtime_hashes={},
            ))
            self.assertEqual((repository / build_manifest_path(pi_context)).read_text(encoding="utf-8"), "pi authorization")
            with patch("distribution.publish_verification._current_source_hashes", return_value={}), patch(
                "distribution.publish_verification.advisor_runtime_hashes", return_value={}
            ):
                verify_local_artifact(
                    all_context,
                    VerifiedArtifact(repository, all_context.local_roots),
                )

    def _context(self, root: Path):
        environment = {
            "EVCRATE_HOME": str(root / "home"),
            "EVCRATE_STATE_HOME": str(root / "state"),
        }
        context = create_context(DistributionAction.PUBLISH, environ=environment, selected_targets=("pi",))
        return context, VerifiedArtifact(REPOSITORY, context.local_roots)

    def test_selected_publish_changes_only_pi_home_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context, artifact = self._context(Path(temp))
            other_roots = (".claude", ".codex", ".agents", ".gemini", ".antigravity")
            before = {}
            for name in other_roots:
                path = context.home / name / "user-owned.txt"
                path.parent.mkdir(parents=True)
                path.write_text(name, encoding="utf-8")
                before[name] = tree_bytes(context.home / name)

            changes = run_home_publish(context, artifact)

            self.assertEqual({change.root for change in changes}, {".pi"})
            self.assertTrue(context.target_pi.is_dir())
            for name in other_roots:
                self.assertEqual(tree_bytes(context.home / name), before[name])

    def test_publish_preserves_settings_and_removes_prior_managed_pi_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            context, artifact = self._context(Path(temp))
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text(json.dumps({
                "defaultProvider": "custom",
                "defaultModel": "keep-me",
                "packages": [{"source": "npm:custom@1.0.0", "enabled": False}],
                "evcrate": {"modelRoles": {"providers": {"custom": {}}}},
                "unknown": {"nested": ["preserve"]},
            }, separators=(",", ":")), encoding="utf-8")
            user_file = context.target_pi / "sessions/user-owned.json"
            user_file.parent.mkdir(parents=True)
            user_file.write_text("keep", encoding="utf-8")

            first = run_home_publish(context, artifact)
            merged = json.loads(settings.read_text(encoding="utf-8"))
            self.assertEqual(merged["defaultProvider"], "custom")
            self.assertEqual(merged["unknown"], {"nested": ["preserve"]})
            self.assertEqual(merged["packages"][0]["source"], "npm:custom@1.0.0")
            self.assertEqual({entry for entry in merged["packages"] if isinstance(entry, str)}, {
                "npm:pi-subagents@0.44.0",
                "npm:@juicesharp/rpiv-ask-user-question@2.4.0",
                "npm:@juicesharp/rpiv-todo@2.4.0",
            })
            self.assertTrue(any(getattr(change, "root", None) == ".pi" for change in first))

            stale = context.target_pi / "agent/evcrate/commands/stale.md"
            stale.write_text("managed stale file", encoding="utf-8")
            marker_path = context.state_dir / "release-marker.json"
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            marker["managed_paths"][".pi"].append("agent/evcrate/commands/stale.md")
            marker_path.write_text(json.dumps(marker, sort_keys=True), encoding="utf-8")

            before_dry_run = tree_bytes(context.target_pi)
            dry_run = run_home_publish(context, artifact, dry_run=True)
            self.assertEqual(before_dry_run, tree_bytes(context.target_pi))
            self.assertIn((".pi", "agent/evcrate/commands/stale.md", "delete"), {
                (change.root, change.path, change.action) for change in dry_run
            })

            second = run_home_publish(context, artifact)
            self.assertFalse(stale.exists())
            self.assertEqual(user_file.read_text(encoding="utf-8"), "keep")
            self.assertIn((".pi", "agent/settings.json", "noop"), {
                (change.root, change.path, change.action) for change in second
            })

    def test_pi_conflict_symlink_and_concurrent_mutation_abort_without_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            context, artifact = self._context(root)
            settings = context.target_pi / "agent/settings.json"
            settings.parent.mkdir(parents=True)
            settings.write_text('{"packages":["npm:pi-code@1.0.0"]}', encoding="utf-8")
            original = settings.read_bytes()
            dry_run = run_home_publish(context, artifact, dry_run=True)
            self.assertIn((".pi", "agent/settings.json", "conflict"), {
                (change.root, change.path, change.action) for change in dry_run
            })
            with self.assertRaisesRegex(PublishError, "pi-code"):
                run_home_publish(context, artifact)
            self.assertEqual(settings.read_bytes(), original)

            settings.write_text('{"packages":[]}', encoding="utf-8")
            from distribution import publish as publish_module
            original_snapshot = publish_module._home_snapshot

            snapshots = 0

            def mutate_after_snapshot(home: Path):
                nonlocal snapshots
                snapshot = original_snapshot(home)
                snapshots += 1
                if snapshots == 1:
                    (context.target_pi / "session-live.json").write_text("concurrent", encoding="utf-8")
                return snapshot

            with patch("distribution.publish._home_snapshot", side_effect=mutate_after_snapshot):
                with self.assertRaisesRegex(PublishError, "concurrently"):
                    publish_local_artifacts(context, artifact)
            self.assertEqual(settings.read_text(encoding="utf-8"), '{"packages":[]}')
            self.assertEqual((context.target_pi / "session-live.json").read_text(encoding="utf-8"), "concurrent")

            shutil.rmtree(context.target_pi)
            outside = root / "outside"
            outside.mkdir()
            context.target_pi.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(PublishError, "unsafe ancestor"):
                run_home_publish(context, artifact)
            self.assertFalse((outside / "agent").exists())


if __name__ == "__main__":
    unittest.main()
