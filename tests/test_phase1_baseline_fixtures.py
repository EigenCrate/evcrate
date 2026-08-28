"""Independent checks for the Phase 1 baseline evidence."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from tests.phase1_baseline_support import (
    commit as _commit,
    files as _files,
    hash_map as _hash_map,
    validate_build_metadata,
)
from tests.phase1_baseline_oracle import authoritative_targets as _authoritative_targets
from tests.phase1_baseline_privacy import assert_private as _assert_private
from tests.phase1_baseline_expectations import (
    EXPECTED_COMMAND_IDS,
    EXPECTED_FAILURE_CASES,
    EXPECTED_FAILURE_IDS,
    EXPECTED_COMMANDS,
    EXPECTED_ENVIRONMENT,
    EXPECTED_PRECONDITIONS,
)


FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "phase-1-baseline"
REPOSITORY = Path(__file__).resolve().parents[1]


def _load(name: str) -> dict:
    value = json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssertionError(f"Fixture must contain an object: {name}")
    return value


class Phase1BaselineFixtureTest(unittest.TestCase):
    def test_missing_hashes_and_output_symlinks_fail_closed(self) -> None:
        for value in (None, {}, {"source": "not-a-sha"}):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    _hash_map(value, "fixture")
        _, _, manifests = _authoritative_targets(REPOSITORY)
        build_data = json.loads((REPOSITORY / ".evcrate/build-manifest.json").read_text(encoding="utf-8"))
        for key, value in (("schema_version", 2), ("home_policy", {}), ("validation", {"complete": True})):
            tampered = deepcopy(build_data)
            tampered[key] = value
            with self.subTest(metadata=key):
                with self.assertRaises(ValueError):
                    validate_build_metadata(tampered, manifests)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "output"
            root.mkdir()
            (root / "target").write_text("target", encoding="utf-8")
            (root / "link").symlink_to(root / "target")
            with self.assertRaises(ValueError):
                _files(root)
    def test_failure_case_matrix_is_exact_and_executable(self) -> None:
        fixture = _load("failure-cases.json")
        self.assertEqual(set(fixture), {"schema", "baseline_commit", "cases"})
        self.assertEqual(fixture["schema"], "evcrate-phase1-failure-cases/v1")
        self.assertEqual(fixture["baseline_commit"], _load("baseline.json")["baseline_commit"])
        self.assertEqual(len(fixture["cases"]), len(EXPECTED_FAILURE_CASES))
        self.assertEqual([case["id"] for case in fixture["cases"]], EXPECTED_FAILURE_IDS)
        self.assertEqual(len(set(EXPECTED_FAILURE_IDS)), len(EXPECTED_FAILURE_IDS))
        self.assertEqual(fixture["cases"], EXPECTED_FAILURE_CASES)
        for case in fixture["cases"]:
            test = case["test"]
            self.assertEqual(sum(key in case for key in ("expected_error", "expected_result")), 1)
            test_file, test_name = test.split("::", 1)
            source = REPOSITORY / test_file
            self.assertTrue(source.is_file(), case["id"])
            method = test_name.rsplit(".", 1)[-1]
            self.assertRegex(source.read_text(encoding="utf-8"), rf"(?m)^    def {re.escape(method)}\(", case["id"])
    def test_results_have_exact_commands_and_sanitized_metadata(self) -> None:
        results = _load("baseline-results.json")
        expected = {
            "schema": "evcrate-phase1-results/v1",
            "baseline_commit": _load("baseline.json")["baseline_commit"],
            "environment": EXPECTED_ENVIRONMENT,
            "commands": EXPECTED_COMMANDS,
            "precondition_diagnostics": EXPECTED_PRECONDITIONS,
        }
        self.assertEqual(results, expected)
        self.assertEqual([command["id"] for command in results["commands"]], EXPECTED_COMMAND_IDS)
    def test_decisions_and_commit_links_are_exactly_scoped(self) -> None:
        baseline_commit = _load("baseline.json")["baseline_commit"]
        for name in ("baseline-results.json", "failure-cases.json", "compatibility-decisions.json"):
            self.assertEqual(_load(name)["baseline_commit"], baseline_commit, name)
        decisions = _load("compatibility-decisions.json")
        self.assertEqual(set(decisions), {"schema", "baseline_commit", "preserved", "deprecated_after_parity", "unresolved"})
        self.assertEqual([len(decisions[key]) for key in ("preserved", "deprecated_after_parity", "unresolved")], [7, 2, 5])

    def test_all_fixtures_are_private_and_host_independent(self) -> None:
        for path in sorted(FIXTURE_ROOT.glob("*.json")):
            _assert_private(path.read_text(encoding="utf-8"))

    def test_private_scanner_rejects_canonical_secret_shapes(self) -> None:
        samples = (
            '{"token":"value"}', '{"authorization":"Bearer value"}',
            "AKIAABCDEFGHIJKLMNOP", "ASIAABCDEFGHIJKLMNOP", "github_pat_abcdefgh",
            "npm_abcdefgh", "AIzaabcdefgh", "sk_abcdefgh", "sk-proj-abcdefgh",
        )
        for sample in samples:
            with self.subTest(sample=sample):
                with self.assertRaises(AssertionError):
                    _assert_private(sample)

    def test_git_provenance_requires_a_verifiable_head(self) -> None:
        baseline_commit = _load("baseline.json")["baseline_commit"]
        try:
            head = _commit(REPOSITORY, None)
        except ValueError:
            head = None
        if head is not None:
            self.assertEqual(_commit(REPOSITORY, head), head)
            with self.assertRaises(ValueError):
                _commit(REPOSITORY, "0" * 40)
            subprocess.run(
                ["git", "-c", f"safe.directory={REPOSITORY}", "cat-file", "-e", f"{baseline_commit}^{{commit}}"],
                cwd=REPOSITORY,
                check=True,
                capture_output=True,
            )
        with tempfile.TemporaryDirectory() as temp:
            raw = Path(temp)
            with self.assertRaises(ValueError):
                _commit(raw, baseline_commit)
        with patch(
            "tests.phase1_baseline_support.subprocess.run",
            side_effect=subprocess.CalledProcessError(128, "git"),
        ):
            with self.assertRaises(ValueError):
                _commit(REPOSITORY, baseline_commit)

if __name__ == "__main__":
    unittest.main()
