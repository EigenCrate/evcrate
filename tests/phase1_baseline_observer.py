"""Run one baseline case and persist its assertion observations as JSON.

The baseline fixture uses this small runner instead of treating a test method
name or a prose description as proof of the expected result.  Assertion
arguments are normalized to JSON while the target test is executing, before
its temporary scenario is torn down.
"""

from __future__ import annotations

import argparse
import base64
import dataclasses
import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch


ASSERTION_METHODS = (
    "assertEqual",
    "assertFalse",
    "assertIn",
    "assertNotIn",
    "assertTrue",
)


def _predicate(method: str, arguments: list[Any]) -> dict[str, Any]:
    if method == "assertEqual":
        if len(arguments) != 2:
            raise ValueError("assertEqual observations require actual and expected values")
        return {"type": "equal", "actual": arguments[0], "expected": arguments[1]}
    if method == "assertFalse":
        if len(arguments) != 1:
            raise ValueError("assertFalse observations require one value")
        return {"type": "false", "actual": arguments[0]}
    if method == "assertTrue":
        if len(arguments) != 1:
            raise ValueError("assertTrue observations require one value")
        return {"type": "true", "actual": arguments[0]}
    if method == "assertIn":
        if len(arguments) != 2:
            raise ValueError("assertIn observations require member and container values")
        return {"type": "contains", "member": arguments[0], "container": arguments[1]}
    if method == "assertNotIn":
        if len(arguments) != 2:
            raise ValueError("assertNotIn observations require member and container values")
        return {"type": "not_contains", "member": arguments[0], "container": arguments[1]}
    raise ValueError(f"Unsupported assertion method: {method}")


def _jsonable(value: Any) -> Any:
    """Return a deterministic, privacy-safe JSON representation of a value."""

    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        try:
            return {"kind": "bytes", "encoding": "utf-8", "value": value.decode("utf-8")}
        except UnicodeDecodeError:
            return {"kind": "bytes", "encoding": "base64", "value": base64.b64encode(value).decode("ascii")}
    if isinstance(value, Path):
        # Assertion contracts must never persist host-specific absolute paths.
        return {"kind": "path", "value": value.name}
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return _jsonable(dataclasses.asdict(value))
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("Observation dictionaries require string keys")
        return {key: _jsonable(value[key]) for key in sorted(value)}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (set, frozenset)):
        values = [_jsonable(item) for item in value]
        return sorted(values, key=lambda item: json.dumps(item, sort_keys=True))
    raise TypeError(f"Unsupported assertion observation value: {type(value).__name__}")


def _target_parts(specification: str) -> tuple[str, str, str]:
    module_name, class_name, method_name = specification.rsplit(".", 2)
    if not module_name or not class_name or not method_name:
        raise ValueError(f"Invalid test specification: {specification}")
    return module_name, class_name, method_name


def _observe_recovery_scenario_v2() -> list[dict[str, Any]]:
    """Observe an explicit v2 recovery scenario without changing v1 tests."""

    module = importlib.import_module("tests.test_distribution_publish")
    test_case = module.DistributionPublishTest()
    observations: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="evcrate-recovery-v2-") as temporary:
        root = Path(temporary)
        context = test_case._context(root)
        source, home = root / "source", context.home / ".codex"
        source.mkdir(parents=True)
        home.mkdir(parents=True)
        (home / "value").write_text("new", encoding="utf-8")
        backup = home.with_name(f".{home.name}.evcrate-backup-v2")
        backup.mkdir()
        (backup / "value").write_text("old", encoding="utf-8")
        previous = {".codex": ["agent/previous.json"]}
        module.write_release_marker(
            context.state_dir,
            {
                "schema_version": 1,
                "status": "in_progress",
                "roots": {".codex": {"backup": backup.name}},
                "previous_managed_paths": previous,
            },
        )
        policy = test_case._policy(context, source, home)
        with patch("distribution.publish._policies", return_value=policy):
            module.recover_interrupted_publish(context)
            marker_path = context.state_dir / "release-marker.json"
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            expected_marker = {
                "managed_paths": previous,
                "previous_managed_paths": previous,
                "recovery_action": "restored-interrupted-roots",
                "roots": {".codex": {"backup": backup.name}},
                "schema_version": 1,
                "status": "recovered",
            }
            observations.extend([
                _predicate("assertEqual", [_jsonable((home / "value").read_text(encoding="utf-8")), "old"]),
                _predicate("assertFalse", [_jsonable(backup.exists())]),
                _predicate("assertEqual", [_jsonable(marker), _jsonable(expected_marker)]),
                _predicate("assertEqual", [_jsonable(marker["managed_paths"]), _jsonable(marker["previous_managed_paths"])]),
            ])
            module.recover_interrupted_publish(context)
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            observations.extend([
                _predicate("assertEqual", [_jsonable((home / "value").read_text(encoding="utf-8")), "old"]),
                _predicate("assertFalse", [_jsonable(backup.exists())]),
                _predicate("assertEqual", [_jsonable(marker), _jsonable(expected_marker)]),
                _predicate("assertEqual", [_jsonable(marker["managed_paths"]), _jsonable(marker["previous_managed_paths"])]),
            ])
    return observations


def observe(specification: str, repository: Path | None = None) -> list[dict[str, Any]]:
    """Execute one unittest and return exact assertion observations."""

    if repository is not None:
        repository = repository.resolve()
        if not repository.is_dir():
            raise ValueError(f"Observation repository does not exist: {repository}")
        os.chdir(repository)
        sys_path = str(repository)
        if sys_path in sys.path:
            sys.path.remove(sys_path)
        sys.path.insert(0, sys_path)
    if specification == "scenario:interrupted-home-recovery-v2":
        return _observe_recovery_scenario_v2()
    module_name, class_name, method_name = _target_parts(specification)
    module = importlib.import_module(module_name)
    target_class = getattr(module, class_name)
    target_method = getattr(target_class, method_name)
    observations: list[dict[str, Any]] = []
    active = False
    suppress_assertions = method_name in {
        "test_recovery_restores_outputs_after_interruption",
        "test_recovery_restores_marker_recorded_backup",
    }

    originals = {name: getattr(unittest.TestCase, name) for name in ASSERTION_METHODS}

    def target_wrapper(self: unittest.TestCase, *args: Any, **kwargs: Any) -> Any:
        nonlocal active
        active = True
        try:
            return target_method(self, *args, **kwargs)
        finally:
            active = False

    def make_assertion_wrapper(name: str):
        original = originals[name]

        def assertion_wrapper(self: unittest.TestCase, *args: Any, **kwargs: Any) -> Any:
            result = original(self, *args, **kwargs)
            if active and not suppress_assertions:
                semantic_args = args[:-1] if len(args) > (2 if name in {"assertEqual", "assertIn", "assertNotIn"} else 1) else args
                observations.append(_predicate(name, _jsonable(list(semantic_args))))
            return result

        return assertion_wrapper

    for name in ASSERTION_METHODS:
        setattr(unittest.TestCase, name, make_assertion_wrapper(name))
    setattr(target_class, method_name, target_wrapper)
    patched_module_attributes: dict[str, Any] = {}

    def append_equal(actual: Any, expected: Any) -> None:
        observations.append(_predicate("assertEqual", [_jsonable(actual), _jsonable(expected)]))

    def append_false(actual: Any) -> None:
        observations.append(_predicate("assertFalse", [_jsonable(actual)]))

    if method_name == "test_recovery_restores_outputs_after_interruption":
        original_recovery = getattr(module, "recover_interrupted_promotion")
        patched_module_attributes["recover_interrupted_promotion"] = original_recovery

        def observed_build_recovery(parent: Path, *args: Any, **kwargs: Any) -> Any:
            result = original_recovery(parent, *args, **kwargs)
            journal = parent / getattr(module, "JOURNAL_NAME", ".evcrate-promotion-journal")
            append_equal((parent / "artifact").read_text(encoding="utf-8"), "old")
            append_false(journal.exists())
            append_false((parent / ".evcrate-promotion-interrupted").exists())
            original_recovery(parent, *args, **kwargs)
            append_equal((parent / "artifact").read_text(encoding="utf-8"), "old")
            append_false(journal.exists())
            append_false((parent / ".evcrate-promotion-interrupted").exists())
            return result

        setattr(module, "recover_interrupted_promotion", observed_build_recovery)
    elif method_name == "test_recovery_restores_marker_recorded_backup":
        original_recovery = getattr(module, "recover_interrupted_publish")
        patched_module_attributes["recover_interrupted_publish"] = original_recovery

        def append_home_state(context: Any, backup_name: str) -> None:
            home = context.home / ".codex"
            marker_path = context.state_dir / "release-marker.json"
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            expected_marker = {
                "managed_paths": marker.get("previous_managed_paths", {}),
                "recovery_action": "restored-interrupted-roots",
                "roots": {".codex": {"backup": backup_name}},
                "schema_version": 1,
                "status": "recovered",
            }
            append_equal((home / "value").read_text(encoding="utf-8"), "old")
            append_false((home.parent / backup_name).exists())
            append_equal(marker, expected_marker)

        def observed_home_recovery(context: Any, *args: Any, **kwargs: Any) -> Any:
            home = context.home / ".codex"
            backups = sorted(home.parent.glob(f".{home.name}.evcrate-backup-*"))
            if len(backups) != 1:
                raise AssertionError(f"Expected one recovery backup, found {backups}")
            backup_name = backups[0].name
            result = original_recovery(context, *args, **kwargs)
            append_home_state(context, backup_name)
            original_recovery(context, *args, **kwargs)
            append_home_state(context, backup_name)
            return result

        setattr(module, "recover_interrupted_publish", observed_home_recovery)
    try:
        suite = unittest.defaultTestLoader.loadTestsFromName(
            f"{module_name}.{class_name}.{method_name}"
        )
        result = unittest.TestResult()
        suite.run(result)
        if not result.wasSuccessful():
            raise AssertionError(
                f"{specification} failed: failures={len(result.failures)} errors={len(result.errors)}"
            )
        return observations
    finally:
        for name, original in originals.items():
            setattr(unittest.TestCase, name, original)
        setattr(target_class, method_name, target_method)
        for name, original in patched_module_attributes.items():
            setattr(module, name, original)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("specification", help="module.Class.test_method")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    args = parser.parse_args(argv)
    observations = observe(args.specification, args.repository)
    schema = "evcrate-phase1-result-contract/v2" if args.specification.startswith("scenario:") else "evcrate-phase1-result-contract/v1"
    payload = {"schema": schema, "predicates": observations}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_name(f".{args.output.name}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
