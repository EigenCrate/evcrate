from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import migrate_claude_to_pi


class PiAdapterTest(unittest.TestCase):
    def _environment(self, root: Path) -> tuple[Path, Path, Path]:
        source = root / "repo/.evcrate/source/.claude"
        stage = root / "stage"
        output = stage / ".pi"
        source.mkdir(parents=True)
        stage.mkdir()
        output.mkdir()
        (source / ".evcrate.json").write_text('{"privacyBlock":true}\n', encoding="utf-8")
        (source / ".evcrateignore").write_text("node_modules\n", encoding="utf-8")
        return source, stage, output

    def test_emits_only_contained_deterministic_skeleton(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source, stage, output = self._environment(Path(temp))
            with patch.dict(os.environ, {
                "EVCRATE_REPOSITORY": str(source.parents[2]),
                "EVCRATE_SOURCE_DIR": str(source.parent),
                "CLAUDE_SOURCE_DIR": str(source),
                "PI_STAGE_ROOT": str(stage),
                "PI_OUTPUT_DIR": str(output),
            }, clear=False):
                self.assertEqual(migrate_claude_to_pi.main([]), 0)
            self.assertEqual((output / ".evcrate.json").read_text(encoding="utf-8"), '{"privacyBlock":true}\n')
            self.assertEqual((output / "agent/evcrate/managed-settings.json").read_text(encoding="utf-8"), '{"packages":["npm:pi-subagents@0.44.0","npm:@juicesharp/rpiv-ask-user-question@2.4.0"]}\n')
            self.assertFalse((stage / "escaped").exists())

    def test_rejects_missing_or_escaped_output_and_direct_arguments(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source, stage, output = self._environment(Path(temp))
            env = {"EVCRATE_REPOSITORY": str(source.parents[2]), "EVCRATE_SOURCE_DIR": str(source.parent), "CLAUDE_SOURCE_DIR": str(source), "PI_STAGE_ROOT": str(stage), "PI_OUTPUT_DIR": str(output)}
            with patch.dict(os.environ, env, clear=False):
                with self.assertRaises(SystemExit):
                    migrate_claude_to_pi.main(["--global"])
            empty = stage / "other"
            empty.mkdir()
            with patch.dict(os.environ, {**env, "PI_OUTPUT_DIR": str(empty)}, clear=False):
                with self.assertRaisesRegex(SystemExit, "exactly"):
                    migrate_claude_to_pi.main([])

    def test_rejects_source_escape_from_canonical_repository_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source, stage, output = self._environment(Path(temp))
            outside = Path(temp) / "outside/.claude"
            outside.mkdir(parents=True)
            (outside / ".evcrate.json").write_text("{}", encoding="utf-8")
            (outside / ".evcrateignore").write_text("", encoding="utf-8")
            with patch.dict(os.environ, {
                "EVCRATE_REPOSITORY": str(source.parents[2]),
                "EVCRATE_SOURCE_DIR": str(outside.parent),
                "CLAUDE_SOURCE_DIR": str(outside),
                "PI_STAGE_ROOT": str(stage),
                "PI_OUTPUT_DIR": str(output),
            }, clear=False):
                with self.assertRaisesRegex(SystemExit, "canonical repository"):
                    migrate_claude_to_pi.main([])

    def test_rejects_symlinked_source_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source, stage, output = self._environment(Path(temp))
            outside = Path(temp) / "outside"
            outside.write_text("secret", encoding="utf-8")
            (source / ".evcrateignore").unlink()
            (source / ".evcrateignore").symlink_to(outside)
            with patch.dict(os.environ, {
                "EVCRATE_REPOSITORY": str(source.parents[2]),
                "EVCRATE_SOURCE_DIR": str(source.parent),
                "CLAUDE_SOURCE_DIR": str(source),
                "PI_STAGE_ROOT": str(stage),
                "PI_OUTPUT_DIR": str(output),
            }, clear=False):
                with self.assertRaisesRegex(SystemExit, "missing or unsafe"):
                    migrate_claude_to_pi.main([])


if __name__ == "__main__":
    unittest.main()
