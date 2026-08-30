"""Independent checks for the Phase 1 baseline evidence."""

from __future__ import annotations

import ast
import json
import os
import subprocess
import shutil
import tarfile
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from tests.phase1_baseline_support import (
    REPLAY_HOST_TOOLS,
    REPLAY_PATH,
    REPLAY_TOOL_VERSIONS,
    commit as _commit,
    files as _files,
    hash_map as _hash_map,
    _resolve_tool,
    _nvm_version_key,
    _validate_tool_versions,
    require_canonical_environment,
    replay_tool,
    replay_environment,
    validate_build_metadata,
)
from tests.phase1_baseline_oracle import (
    authoritative_targets as _authoritative_targets,
    safe_relative as _safe_relative,
)
from tests.phase1_baseline_privacy import assert_private as _assert_private
from tests.phase1_baseline_expectations import (
    EXPECTED_BASELINE_COMMIT,
    EXPECTED_COMMAND_IDS,
    EXPECTED_FAILURE_CASES,
    EXPECTED_FAILURE_IDS,
    EXPECTED_COMMANDS,
    EXPECTED_COMPATIBILITY_DECISIONS,
    EXPECTED_ENVIRONMENT,
    EXPECTED_PRECONDITIONS,
    EXPECTED_RECOVERY_SCENARIOS,
    EXPECTED_RESULT_CONTRACT_SCHEMA,
)
from tests.capture_phase1_baseline import (
    _archive_checkout,
    _archive_member_name,
    _run,
    _sanitized_environment,
    _validate_results_envelope,
    _write_json_atomically,
    verify_results,
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
                    validate_build_metadata(tampered, manifests, REPOSITORY)
        for path in (
            "../escape", "folder/../../escape", ".\\secret", "/absolute", "C:/absolute",
            "\\\\server\\share", "CON.txt", "folder/trailing. ", "folder/name:", "folder/\x01",
        ):
            with self.subTest(path=path):
                self.assertFalse(_safe_relative(path))
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "output"
            root.mkdir()
            (root / "target").write_text("target", encoding="utf-8")
            (root / "link").symlink_to(root / "target")
            with self.assertRaises(ValueError):
                _files(root)

    def test_archive_entries_are_portable_regular_files_or_directories(self) -> None:
        for name in ("../escape", "folder/../../escape", ".\\secret", "/absolute", "C:/absolute", "\\\\server\\share", "folder/name:"):
            member = tarfile.TarInfo(name)
            with self.subTest(name=name), self.assertRaises(ValueError):
                _archive_member_name(member)
        for member_type in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE, tarfile.FIFOTYPE):
            member = tarfile.TarInfo("unsafe")
            member.type = member_type
            with self.subTest(member_type=member_type), self.assertRaises(ValueError):
                _archive_member_name(member)
        self.assertEqual(_archive_member_name(tarfile.TarInfo("folder/item")), "folder/item")

    def test_fixture_writer_replaces_atomically_and_preserves_prior_bytes_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / "baseline.json"
            destination.write_text('{"value":"old"}\n', encoding="utf-8")
            _write_json_atomically(destination, {"value": "new"})
            self.assertEqual(destination.read_text(encoding="utf-8"), '{\n  "value": "new"\n}\n')
            self.assertEqual(list(destination.parent.glob(f".{destination.name}.*.tmp")), [])
            with patch("tests.capture_phase1_baseline.json.dump", side_effect=OSError("injected write failure")):
                with self.assertRaises(OSError):
                    _write_json_atomically(destination, {"value": "broken"})
            self.assertEqual(destination.read_text(encoding="utf-8"), '{\n  "value": "new"\n}\n')
            self.assertEqual(list(destination.parent.glob(f".{destination.name}.*.tmp")), [])

    def test_replay_boundaries_ignore_hostile_parent_environment(self) -> None:
        hostile = {
            "PYTHONPATH": "/tmp/evcrate-hostile-pythonpath",
            "PYTHONHOME": "/tmp/evcrate-hostile-pythonhome",
            "PYTHONSTARTUP": "/tmp/evcrate-hostile-startup.py",
            "NODE_OPTIONS": "--require=/tmp/evcrate-hostile-node.js",
            "NODE_PATH": "/tmp/evcrate-hostile-nodepath",
            "GIT_DIR": "/tmp/evcrate-hostile-git",
            "GIT_WORK_TREE": "/tmp/evcrate-hostile-worktree",
            "GIT_CONFIG_GLOBAL": "/tmp/evcrate-hostile-gitconfig",
            "NPM_CONFIG_GLOBALCONFIG": "/tmp/evcrate-hostile-global.npmrc",
            "npm_config_globalconfig": "/tmp/evcrate-hostile-global.npmrc",
            "NPM_CONFIG_USERCONFIG": "/tmp/evcrate-hostile-user.npmrc",
            "npm_config_userconfig": "/tmp/evcrate-hostile-user.npmrc",
            "NPM_TOKEN": "host-secret-token",
            "NODE_AUTH_TOKEN": "host-secret-token",
        }
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            hostile_site = root / "hostile-site"
            hostile_site.mkdir()
            (hostile_site / "sitecustomize.py").write_text("raise RuntimeError('hostile Python preload')\n", encoding="utf-8")
            hostile["PYTHONPATH"] = str(hostile_site)
            hostile_bin = root / "hostile-bin"
            hostile_bin.mkdir()
            (hostile_bin / "git").write_text("#!/bin/sh\nexit 77\n", encoding="utf-8")
            (hostile_bin / "git").chmod(0o755)
            with patch.dict(os.environ, hostile, clear=False):
                self.assertEqual(_resolve_tool("git"), replay_tool("git"))
                environment = _sanitized_environment(root)
                self.assertEqual(environment, replay_environment(root))
                for key in set(hostile) - {
                    "GIT_CONFIG_GLOBAL",
                    "NPM_CONFIG_GLOBALCONFIG",
                    "npm_config_globalconfig",
                    "NPM_CONFIG_USERCONFIG",
                    "npm_config_userconfig",
                }:
                    self.assertNotIn(key, environment)
                for key in {
                    "GIT_CONFIG_GLOBAL",
                    "NPM_CONFIG_GLOBALCONFIG",
                    "npm_config_globalconfig",
                    "NPM_CONFIG_USERCONFIG",
                    "npm_config_userconfig",
                }:
                    self.assertNotEqual(environment[key], hostile[key])
                python = _run(["python", "-c", "print('replay-python')"], root, environment)
                node = _run(["node", "-e", "console.log('replay-node')"], root, environment)
                npm = _run(["npm", "--version"], root, environment)
                self.assertEqual((python.returncode, python.stdout.strip()), (0, "replay-python"))
                self.assertEqual((node.returncode, node.stdout.strip()), (0, "replay-node"))
                self.assertEqual((npm.returncode, npm.stdout.strip()), (0, EXPECTED_ENVIRONMENT["npm"]))
                self.assertEqual(_commit(REPOSITORY, EXPECTED_BASELINE_COMMIT, environment), EXPECTED_BASELINE_COMMIT)

                global_config = _run(["npm", "config", "get", "globalconfig"], root, environment)
                user_config = _run(["npm", "config", "get", "userconfig"], root, environment)
                self.assertEqual((global_config.returncode, global_config.stdout.strip()), (0, environment["NPM_CONFIG_GLOBALCONFIG"]))
                self.assertEqual((user_config.returncode, user_config.stdout.strip()), (0, environment["NPM_CONFIG_USERCONFIG"]))
                self.assertNotIn("host-secret-token", global_config.stdout + global_config.stderr + user_config.stdout + user_config.stderr)

    def test_replay_environment_rejects_mutated_values_with_valid_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            environment = replay_environment(root)
            mutations = {
                "PATH": "/tmp/hostile-bin",
                "HOME": str(root / "other-home"),
                "LANG": "en_US.UTF-8",
                "NPM_CONFIG_GLOBALCONFIG": str(root / "hostile.npmrc"),
                "npm_config_globalconfig": str(root / "hostile.npmrc"),
                "GIT_CONFIG_GLOBAL": str(root / "hostile.gitconfig"),
            }
            for key, value in mutations.items():
                candidate = dict(environment)
                candidate[key] = value
                with self.subTest(key=key), self.assertRaises(ValueError):
                    require_canonical_environment(candidate)

    def test_replay_roots_reject_symlinks_modes_and_non_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            trusted = Path(temp)
            target = trusted / "target"
            target.mkdir(mode=0o700)
            (target / "sentinel").write_text("untouched", encoding="utf-8")

            forged = trusted / "forged"
            forged.symlink_to(target, target_is_directory=True)
            with self.assertRaises(ValueError):
                replay_environment(forged)
            self.assertEqual((target / "sentinel").read_text(encoding="utf-8"), "untouched")

            ancestor = trusted / "ancestor"
            ancestor.mkdir(mode=0o700)
            ancestor_link = ancestor / "link"
            ancestor_link.symlink_to(target, target_is_directory=True)
            with self.assertRaises(ValueError):
                replay_environment(ancestor_link / "nested")

            wrong_mode = trusted / "wrong-mode"
            wrong_mode.mkdir(mode=0o755)
            wrong_mode.chmod(0o755)
            with self.assertRaises(ValueError):
                replay_environment(wrong_mode)

            non_directory = trusted / "not-a-directory"
            non_directory.write_text("no", encoding="utf-8")
            with self.assertRaises(ValueError):
                replay_environment(non_directory)

            valid = replay_environment(trusted / "valid")
            home = Path(valid["HOME"])
            home.rmdir()
            home.symlink_to(target, target_is_directory=True)
            with self.assertRaises(ValueError):
                require_canonical_environment(valid)
            self.assertEqual((target / "sentinel").read_text(encoding="utf-8"), "untouched")

            home.unlink()
            home.mkdir(mode=0o700)
            config = Path(valid["NPM_CONFIG_USERCONFIG"])
            config.unlink()
            config.symlink_to(target / "sentinel")
            with self.assertRaises(ValueError):
                require_canonical_environment(valid)
            self.assertEqual((target / "sentinel").read_text(encoding="utf-8"), "untouched")

    def test_replay_tool_versions_and_nvm_order_are_pinned(self) -> None:
        self.assertEqual(_nvm_version_key("v24.16.0"), (1, 24, 16, 0))
        self.assertGreater(_nvm_version_key("v24.16.0"), _nvm_version_key("v9.99.99"))
        self.assertEqual(REPLAY_TOOL_VERSIONS["node"], "24.16.0")
        self.assertEqual(REPLAY_TOOL_VERSIONS["npm"], "11.13.0")
        with patch("tests.phase1_baseline_support._TOOL_VERSIONS_VALIDATED", False), patch(
            "tests.phase1_baseline_support._tool_version", return_value="0.0.0"
        ):
            with self.assertRaisesRegex(ValueError, "expected pinned version"):
                _validate_tool_versions()

    def test_versioned_recovery_scenario_is_explicit_and_executable(self) -> None:
        fixture = _load("recovery-scenarios.json")
        self.assertEqual(fixture, EXPECTED_RECOVERY_SCENARIOS)
        self.assertEqual(fixture["baseline_commit"], EXPECTED_BASELINE_COMMIT)
        with tempfile.TemporaryDirectory() as temp:
            isolated_home = Path(temp)
            archived_checkout = _archive_checkout(REPOSITORY, fixture["baseline_commit"], isolated_home)
            environment = _sanitized_environment(isolated_home)
            for scenario in fixture["scenarios"]:
                with self.subTest(scenario=scenario["id"]):
                    self.assertEqual(scenario["baseline_commit"], EXPECTED_BASELINE_COMMIT)
                    self.assertTrue((archived_checkout / scenario["source"]).is_file())
                    observation_path = isolated_home / f"{scenario['id']}.json"
                    result = subprocess.run(
                        [
                            replay_tool("python"),
                            str(REPOSITORY / "tests" / "phase1_baseline_observer.py"),
                            scenario["observer"],
                            "--output",
                            str(observation_path),
                            "--repository",
                            str(archived_checkout),
                        ],
                        cwd=archived_checkout,
                        env=environment,
                        capture_output=True,
                        text=True,
                    )
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertEqual(json.loads(observation_path.read_text(encoding="utf-8")), scenario["result_contract"])

    def test_replay_path_discovers_only_validated_host_advisor_tools(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            hostile_bin = root / "hostile-bin"
            hostile_bin.mkdir()
            for name in REPLAY_HOST_TOOLS:
                fake = hostile_bin / name
                fake.write_text("#!/bin/sh\nexit 77\n", encoding="utf-8")
                fake.chmod(0o755)
            with patch.dict(os.environ, {"PATH": str(hostile_bin)}, clear=False):
                environment = replay_environment(root)
            self.assertEqual(environment["PATH"], REPLAY_PATH)
            for name, expected in REPLAY_HOST_TOOLS.items():
                self.assertEqual(shutil.which(name, path=environment["PATH"]), expected)

    def test_missing_reviewed_host_tool_fails_closed(self) -> None:
        with patch(
            "tests.phase1_baseline_support._resolve_tool",
            side_effect=ValueError("missing"),
        ):
            with self.assertRaisesRegex(ValueError, "host-dependent baseline cannot be replayed"):
                from tests.phase1_baseline_support import _resolve_host_tool

                _resolve_host_tool("codex")

    def test_failure_case_matrix_is_exact_and_executable(self) -> None:
        fixture = _load("failure-cases.json")
        self.assertEqual(set(fixture), {"schema", "baseline_commit", "cases"})
        self.assertEqual(fixture["schema"], "evcrate-phase1-failure-cases/v1")
        self.assertEqual(fixture["baseline_commit"], EXPECTED_BASELINE_COMMIT)
        self.assertEqual(fixture["baseline_commit"], _load("baseline.json")["baseline_commit"])
        self.assertEqual(len(fixture["cases"]), len(EXPECTED_FAILURE_CASES))
        self.assertEqual([case["id"] for case in fixture["cases"]], EXPECTED_FAILURE_IDS)
        self.assertEqual(len(set(EXPECTED_FAILURE_IDS)), len(EXPECTED_FAILURE_IDS))
        self.assertEqual(fixture["cases"], EXPECTED_FAILURE_CASES)
        with tempfile.TemporaryDirectory() as temp:
            isolated_home = Path(temp)
            archived_checkout = _archive_checkout(REPOSITORY, fixture["baseline_commit"], isolated_home)
            environment = _sanitized_environment(isolated_home)
            for case in fixture["cases"]:
                with self.subTest(case=case["id"]):
                    self.assertEqual(
                        set(case), {"id", "invariant", "test", "expected_error"}
                        if "expected_error" in case
                        else {"id", "invariant", "test", "result_contract"},
                    )
                    test_file, test_name = case["test"].split("::", 1)
                    source = archived_checkout / test_file
                    self.assertTrue(source.is_file())
                    class_name, method_name = test_name.rsplit(".", 1)
                    module = test_file[:-3].replace("/", ".")
                    syntax = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
                    class_node = next(
                        (node for node in syntax.body if isinstance(node, ast.ClassDef) and node.name == class_name),
                        None,
                    )
                    self.assertIsNotNone(class_node)
                    method_node = next(
                        (node for node in class_node.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method_name),
                        None,
                    )
                    self.assertIsNotNone(method_node)
                    calls = [
                        node for node in ast.walk(method_node)
                        if isinstance(node, ast.Call)
                        and isinstance(node.func, ast.Attribute)
                        and node.func.attr.startswith("assert")
                    ]
                    names = {
                        node.id for node in ast.walk(method_node) if isinstance(node, ast.Name)
                    }
                    names.update(
                        node.attr for node in ast.walk(method_node) if isinstance(node, ast.Attribute)
                    )
                    if "expected_error" in case:
                        self.assertIn(case["expected_error"], names)
                        error_calls = [call for call in calls if call.func.attr.startswith("assertRaises")]
                        self.assertTrue(error_calls)
                        self.assertTrue(any(
                            call.args
                            and (
                                (isinstance(call.args[0], ast.Name) and call.args[0].id == case["expected_error"])
                                or (isinstance(call.args[0], ast.Attribute) and call.args[0].attr == case["expected_error"])
                            )
                            for call in error_calls
                        ))
                        result = subprocess.run(
                            [replay_tool("python"), "-m", "unittest", f"{module}.{class_name}.{method_name}", "-q"],
                            cwd=archived_checkout,
                            env=environment,
                            capture_output=True,
                            text=True,
                        )
                    else:
                        contract = case["result_contract"]
                        self.assertIsInstance(contract, dict)
                        self.assertEqual(set(contract), {"schema", "predicates"})
                        self.assertEqual(contract["schema"], EXPECTED_RESULT_CONTRACT_SCHEMA)
                        predicates = contract["predicates"]
                        self.assertIsInstance(predicates, list)
                        self.assertTrue(predicates)
                        allowed_predicates = {
                            "equal": {"type", "actual", "expected"},
                            "false": {"type", "actual"},
                            "true": {"type", "actual"},
                            "contains": {"type", "member", "container"},
                            "not_contains": {"type", "member", "container"},
                        }
                        for predicate in predicates:
                            self.assertIsInstance(predicate, dict)
                            predicate_type = predicate.get("type")
                            self.assertIn(predicate_type, allowed_predicates)
                            self.assertEqual(set(predicate), allowed_predicates[predicate_type])
                            if predicate_type in {"false", "true"}:
                                self.assertIs(type(predicate["actual"]), bool)
                            if predicate_type in {"contains", "not_contains"}:
                                self.assertIsInstance(predicate["container"], list)
                        observation_path = isolated_home / f"{case['id']}.json"
                        result = subprocess.run(
                            [
                                replay_tool("python"),
                                str(REPOSITORY / "tests" / "phase1_baseline_observer.py"),
                                f"{module}.{class_name}.{method_name}",
                                "--output",
                                str(observation_path),
                                "--repository",
                                str(archived_checkout),
                            ],
                            cwd=archived_checkout,
                            env=environment,
                            capture_output=True,
                            text=True,
                        )
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                        observed = json.loads(observation_path.read_text(encoding="utf-8"))
                        self.assertEqual(observed, contract)
                    if "expected_error" in case:
                        self.assertEqual(result.returncode, 0)
    def test_results_have_exact_commands_and_sanitized_metadata(self) -> None:
        results = _load("baseline-results.json")
        self.assertEqual(results["baseline_commit"], EXPECTED_BASELINE_COMMIT)
        expected = {
            "schema": "evcrate-phase1-results/v1",
            "baseline_commit": _load("baseline.json")["baseline_commit"],
            "environment": EXPECTED_ENVIRONMENT,
            "commands": EXPECTED_COMMANDS,
            "precondition_diagnostics": EXPECTED_PRECONDITIONS,
        }
        self.assertEqual(results, expected)
        self.assertEqual([command["id"] for command in results["commands"]], EXPECTED_COMMAND_IDS)
        self.assertEqual(set(results["environment"]), set(EXPECTED_ENVIRONMENT))
        self.assertEqual(len(results["commands"]), len(EXPECTED_COMMANDS))
        for command, expected_command in zip(results["commands"], EXPECTED_COMMANDS):
            self.assertEqual(command["id"], expected_command["id"])
            self.assertEqual(command["command"], expected_command["command"])
            self.assertIsInstance(command["exit_code"], int)
            if {"tests", "passed", "failed", "errors"}.issubset(command):
                self.assertEqual(command["tests"], command["passed"] + command["failed"] + command["errors"])
            if {"test_files", "passed", "failed", "errors"}.issubset(command):
                self.assertEqual(command["test_files"], command["passed"] + command["failed"] + command["errors"])
            if command["exit_code"] == 0:
                self.assertEqual(command.get("failed", 0) + command.get("errors", 0), 0)
            if "audit_vulnerabilities" in command:
                audit = command["audit_vulnerabilities"]
                self.assertEqual(audit["total"], sum(audit[level] for level in ("moderate", "high", "critical")))
            if "expected_error_classes" in command:
                self.assertEqual(command["failed"], sum(command["expected_error_classes"].values()))

    def test_results_envelope_rejects_nested_and_provenance_mutations(self) -> None:
        results = _load("baseline-results.json")
        self.assertEqual(_validate_results_envelope(REPOSITORY, results), EXPECTED_BASELINE_COMMIT)
        mutations: list[tuple[str, object]] = []

        def mutate(label: str, function: object) -> None:
            candidate = deepcopy(results)
            function(candidate)
            mutations.append((label, candidate))

        mutate("schema", lambda value: value.__setitem__("schema", "evcrate-phase1-results/v0"))
        mutate("baseline commit", lambda value: value.__setitem__("baseline_commit", "0" * 40))
        mutate("environment value", lambda value: value["environment"].__setitem__("cwd", "host checkout"))
        mutate("environment extra key", lambda value: value["environment"].__setitem__("secret", "unexpected"))
        mutate("precondition value", lambda value: value["precondition_diagnostics"][0].__setitem__("resolution", "skip"))
        mutate("precondition extra key", lambda value: value["precondition_diagnostics"][0].__setitem__("extra", True))
        mutate("command result", lambda value: value["commands"][0].__setitem__("result", "unverified"))
        mutate("command extra key", lambda value: value["commands"][0].__setitem__("extra", True))
        mutate("command wrong type", lambda value: value["commands"][2].__setitem__("tests", "193"))
        mutate("command reorder", lambda value: value.__setitem__("commands", list(reversed(value["commands"]))))
        mutate("command duplicate", lambda value: value["commands"].__setitem__(1, deepcopy(value["commands"][0])))
        mutate("audit nested value", lambda value: value["commands"][3]["audit_vulnerabilities"].__setitem__("high", 16))
        mutate("audit nested extra key", lambda value: value["commands"][3]["audit_vulnerabilities"].__setitem__("unknown", 0))
        mutate("advisor class value", lambda value: value["commands"][5]["expected_error_classes"].__setitem__("AUTH_UNAVAILABLE", 5))
        mutate("advisor class extra key", lambda value: value["commands"][5]["expected_error_classes"].__setitem__("OTHER", 0))
        for label, candidate in mutations:
            with self.subTest(mutation=label):
                with self.assertRaises(ValueError):
                    _validate_results_envelope(REPOSITORY, candidate)

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "results.json"
            path.write_text(json.dumps(results), encoding="utf-8")
            with patch("tests.capture_phase1_baseline.execute_command_matrix", return_value=EXPECTED_COMMANDS):
                verify_results(REPOSITORY, path)
    def test_decisions_and_commit_links_are_exactly_scoped(self) -> None:
        baseline_commit = _load("baseline.json")["baseline_commit"]
        for name in ("baseline-results.json", "failure-cases.json", "compatibility-decisions.json", "recovery-scenarios.json"):
            self.assertEqual(_load(name)["baseline_commit"], baseline_commit, name)
        decisions = _load("compatibility-decisions.json")
        self.assertEqual(decisions["baseline_commit"], EXPECTED_BASELINE_COMMIT)
        self.assertEqual(set(decisions), {"schema", "baseline_commit", "preserved", "deprecated_after_parity", "unresolved"})
        self.assertEqual(
            {key: decisions[key] for key in EXPECTED_COMPATIBILITY_DECISIONS},
            EXPECTED_COMPATIBILITY_DECISIONS,
        )

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
        self.assertEqual(baseline_commit, EXPECTED_BASELINE_COMMIT)
        try:
            head = _commit(REPOSITORY, None)
        except ValueError:
            head = None
        if head is not None:
            self.assertEqual(_commit(REPOSITORY, head), head)
            with self.assertRaises(ValueError):
                _commit(REPOSITORY, "0" * 40)
            subprocess.run(
                [replay_tool("git"), "-c", f"safe.directory={REPOSITORY}", "cat-file", "-e", f"{baseline_commit}^{{commit}}"],
                cwd=REPOSITORY,
                env=replay_environment(),
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
