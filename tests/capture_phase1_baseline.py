#!/usr/bin/env python3
"""Capture deterministic Phase 1 target and manifest evidence."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from tests.phase1_baseline_support import (
    authorized_hashes as _authorized_hashes,
    commit as _commit,
    output as _output,
    require_canonical_environment,
    replay_environment,
    replay_tool,
)
from tests.phase1_baseline_oracle import authoritative_targets, file_list_hash, hash_file, safe_relative
from tests.phase1_baseline_expectations import (
    EXPECTED_BASELINE_COMMIT,
    EXPECTED_BUILD_MANIFEST,
    EXPECTED_COMMANDS,
    EXPECTED_ENVIRONMENT,
    EXPECTED_DOCUMENTS,
    EXPECTED_MANIFESTS,
    EXPECTED_PRECONDITIONS,
    EXPECTED_REGISTRY,
    EXPECTED_OUTPUTS,
    EXPECTED_TARGET_OUTPUTS,
    EXPECTED_TARGETS,
)


SCHEMA = "evcrate-phase1-baseline/v1"


def _sanitized_environment(home: Path) -> dict[str, str]:
    return replay_environment(home)


def _archive_member_name(member: tarfile.TarInfo) -> str:
    """Validate one portable regular-file/directory archive entry."""

    raw_name = member.name
    if not isinstance(raw_name, str):
        raise ValueError("Archived baseline contains a non-text member name")
    name = raw_name.rstrip("/")
    if not safe_relative(name):
        raise ValueError(f"Archived baseline contains an unsafe entry: {raw_name!r}")
    if not (member.isdir() or member.isfile()) or member.issym() or member.islnk():
        raise ValueError(f"Archived baseline contains a non-regular entry: {raw_name!r}")
    return name


def _archive_checkout(
    repository: Path,
    baseline_commit: str,
    destination: Path,
    environment: dict[str, str] | None = None,
) -> Path:
    """Materialize a symlink-free checkout of the verified commit."""

    archive = destination / "baseline.tar"
    environment = replay_environment(destination) if environment is None else environment
    environment = require_canonical_environment(environment)
    try:
        os.lstat(archive)
    except FileNotFoundError:
        pass
    except OSError as error:
        raise ValueError("Unable to inspect archived baseline path") from error
    else:
        raise ValueError("Archived baseline path already exists")
    subprocess.run(
        [replay_tool("git"), "-c", f"safe.directory={repository}", "archive", "--format=tar", "-o", str(archive), baseline_commit],
        cwd=repository,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        archive_details = os.lstat(archive)
    except OSError as error:
        raise ValueError("Git did not materialize the archived baseline") from error
    if stat.S_ISLNK(archive_details.st_mode) or not stat.S_ISREG(archive_details.st_mode):
        raise ValueError("Git archive output is not a regular file")
    checkout = destination / "checkout"
    try:
        checkout.mkdir(mode=0o700)
    except FileExistsError as error:
        raise ValueError("Archived baseline checkout path already exists") from error
    seen: set[str] = set()
    with tarfile.open(archive, "r") as stream:
        for member in stream:
            relative = _archive_member_name(member)
            if relative in seen:
                raise ValueError(f"Archived baseline contains a duplicate entry: {relative}")
            seen.add(relative)
            stream.extract(member, checkout, filter="data")
    return checkout


def _run(command: list[str], checkout: Path, environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    if not command:
        raise ValueError("Replay command cannot be empty")
    environment = require_canonical_environment(environment)
    command = [replay_tool(command[0]), *command[1:]]
    return subprocess.run(
        command,
        cwd=checkout,
        env=environment,
        capture_output=True,
        text=True,
    )


def _capture_generated_checkout(repository: Path, verified_commit: str) -> dict[str, Any]:
    """Capture only artifacts generated inside an archived, pinned checkout."""

    source_root = repository / ".evcrate" / "source"
    registry_path = repository / ".evcrate" / "targets" / "manifest.json"
    build_path = repository / ".evcrate" / "build-manifest.json"
    registry_data = _json(registry_path)
    if registry_data != EXPECTED_REGISTRY:
        raise ValueError("Target registry is not the accepted Phase 1 registry")
    build_data = _json(build_path)
    build_digest = hash_file(build_path)
    if build_digest != EXPECTED_BUILD_MANIFEST:
        raise ValueError(
            "Archived baseline build manifest does not match the pinned post-build digest: "
            f"{build_digest} != {EXPECTED_BUILD_MANIFEST}"
        )
    registry_data, registry, manifests = authoritative_targets(repository)
    if set(registry.targets) != EXPECTED_TARGETS:
        raise ValueError("Target registry does not contain every supported target")
    output_hashes = _authorized_hashes(
        repository, source_root, manifests, registry, build_data
    )
    expected_outputs = {
        root for manifest in manifests for root in manifest.output_roots
    }
    expected_outputs.update(
        document for manifest in manifests for document in manifest.project_docs
    )
    if set(output_hashes) != expected_outputs:
        raise ValueError("Build output authorization does not match target outputs")

    targets: dict[str, Any] = {}
    for name, manifest_path in registry.targets.items():
        manifest = next(item for item in manifests if item.name == name)
        manifest_data = _json(manifest_path)
        manifest_key = f"{manifest.name}/manifest.json"
        if manifest.name != name:
            raise ValueError(f"Target registry name mismatch: {name}")
        manifest_digest = hash_file(manifest_path)
        if manifest_digest != EXPECTED_MANIFESTS[name]:
            raise ValueError(f"Target manifest is not the accepted Phase 1 manifest: {name}")
        if manifest_digest != build_data["source_hashes"][manifest_key]:
            raise ValueError(f"Target manifest hash drift: {manifest.name}")
        if set(manifest.output_roots) != set(EXPECTED_TARGET_OUTPUTS[name]):
            raise ValueError(f"Target output ownership drift: {manifest.name}")
        outputs = {
            root: _output(source_root / root, output_hashes[root])
            for root in manifest.output_roots
        }
        documents = {}
        for document in manifest.project_docs:
            digest = hash_file(source_root / document)
            if digest != output_hashes[document]:
                raise ValueError(f"Project document hash drift: {document}")
            documents[document] = {"sha256": digest}
        targets[name] = {
            "manifest_sha256": manifest_digest,
            "manifest": manifest_data,
            "outputs": outputs,
            "project_docs": documents,
        }

    selected_build_fields = {
        key: build_data[key]
        for key in (
            "schema_version", "source_hashes", "adapter_hashes", "runtime_hashes",
            "output_hashes", "owners", "home_policy", "validation",
        )
    }
    selected_build_fields["manifest_sha256"] = build_digest
    evidence = {
        "schema": SCHEMA,
        "baseline_commit": verified_commit,
        "source_tree": {
            "commit": verified_commit,
            "materialization": "git-archive",
            "artifacts": "post-build-and-check",
        },
        "target_registry": registry_data,
        "build_manifest": selected_build_fields,
        "targets": targets,
    }

    # The constants are independent of the implementation's generated files;
    # checking every manifest, inventory, and document here makes a replay fail
    # closed instead of merely accepting successful build/check exit codes.
    if selected_build_fields["output_hashes"] != {
        root: values[1] for root, values in EXPECTED_OUTPUTS.items()
    } | EXPECTED_DOCUMENTS:
        raise ValueError("Archived output authorization hashes are not the pinned baseline")
    for target, target_data in targets.items():
        if target_data["manifest_sha256"] != EXPECTED_MANIFESTS[target]:
            raise ValueError(f"Archived target manifest digest drift: {target}")
        for root, inventory in target_data["outputs"].items():
            expected_count, expected_tree, expected_files = EXPECTED_OUTPUTS[root]
            if inventory["tree_hash"] != expected_tree or inventory["file_count"] != expected_count:
                raise ValueError(f"Archived output inventory drift: {root}")
            if file_list_hash(inventory["files"]) != expected_files:
                raise ValueError(f"Archived output file-list inventory drift: {root}")
        for document, document_data in target_data["project_docs"].items():
            if document_data["sha256"] != EXPECTED_DOCUMENTS[document]:
                raise ValueError(f"Archived document digest drift: {document}")
    fixture_path = REPOSITORY_ROOT / "tests" / "fixtures" / "phase-1-baseline" / "baseline.json"
    if fixture_path.is_file():
        recorded = _json(fixture_path)
        # During a deliberate fixture regeneration the new source_tree field
        # is not present yet; all artifact and inventory fields must still
        # match the immutable recorded evidence byte-for-byte.
        for key in ("baseline_commit", "target_registry", "build_manifest", "targets"):
            if recorded.get(key) != evidence[key]:
                raise ValueError(f"Archived evidence differs from fixture field: {key}")
    return evidence


def _summary(output: str) -> tuple[int, int, int, int]:
    text = output.replace("\r", "")
    match = re.search(r"Ran\s+(\d+)\s+tests?", text)
    if match is None:
        match = re.search(r"(?:ℹ|#)\s+tests\s+(\d+)", text)
    if match is None:
        raise ValueError("Could not determine test count from command output")
    tests = int(match.group(1))
    passed_match = re.search(r"(?:ℹ|#)\s+pass(?:ed)?\s+(\d+)", text)
    failed_match = re.search(r"(?:ℹ|#)\s+fail(?:ed)?\s+(\d+)", text)
    errors_match = re.search(r"(?:ℹ|#)\s+(?:error|cancelled)\w*\s+(\d+)", text)
    failed = int(failed_match.group(1)) if failed_match else len(re.findall(r"^FAIL:", text, re.MULTILINE))
    errors = int(errors_match.group(1)) if errors_match else len(re.findall(r"^ERROR:", text, re.MULTILINE))
    passed = int(passed_match.group(1)) if passed_match else tests - failed - errors
    return tests, passed, failed, errors


def execute_command_matrix(repository: Path, baseline_commit: str) -> list[dict[str, Any]]:
    """Execute every declared baseline command in a clean, sanitized checkout."""

    if baseline_commit != EXPECTED_BASELINE_COMMIT:
        raise ValueError("Baseline replay must use the pinned Phase 1 commit")
    with tempfile.TemporaryDirectory(prefix="evcrate-phase1-replay-") as temporary:
        root = Path(temporary)
        environment = replay_environment(root)
        verified_commit = _commit(repository, baseline_commit, environment)
        checkout = _archive_checkout(repository, verified_commit, root, environment)
        results: list[dict[str, Any]] = []

        generated = _run(["python3", "distribute.py", "--build"], checkout, environment)
        if generated.returncode != 0:
            raise ValueError("local-generation command failed during baseline replay")
        results.append({"id": "local-generation", "command": "python3 distribute.py --build", "exit_code": 0, "result": "verified local artifacts generated"})

        checked = _run(["python3", "distribute.py", "--check"], checkout, environment)
        if checked.returncode != 0:
            raise ValueError("local-check command failed during baseline replay")
        _capture_generated_checkout(checkout, verified_commit)
        results.append({"id": "local-check", "command": "python3 distribute.py --check", "exit_code": 0, "result": "generated artifacts are deterministic and current"})

        python_command = ["python", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-q"]
        python_result = _run(python_command, checkout, environment)
        python_output = python_result.stdout + "\n" + python_result.stderr
        if python_result.returncode != 0:
            raise ValueError("Python regression suite failed during baseline replay")
        tests, passed, failed, errors = _summary(python_output)
        results.append({"id": "python-regression-suite", "command": "python -m unittest discover -s tests -p 'test_*.py' -q", "exit_code": 0, "tests": tests, "passed": passed, "failed": failed, "errors": errors})

        npm_result = _run(["npm", "ci", "--ignore-scripts"], checkout, environment)
        npm_output = npm_result.stdout + "\n" + npm_result.stderr
        if npm_result.returncode != 0:
            raise ValueError("npm dependency preparation failed during baseline replay")
        added = re.search(r"added\s+(\d+)\s+packages?", npm_output)
        audited = re.search(r"audited\s+(\d+)\s+packages?", npm_output)
        vulnerabilities = re.search(r"(\d+)\s+vulnerabilities?\s*\(([^)]*)\)", npm_output)
        if added is None or audited is None or vulnerabilities is None:
            raise ValueError("npm output did not contain complete package/audit counts")
        severities = {name: int(count) for count, name in re.findall(r"(\d+)\s+(moderate|high|critical)", vulnerabilities.group(2))}
        results.append({
            "id": "npm-dependencies",
            "command": "npm ci --ignore-scripts",
            "exit_code": 0,
            "packages_added": int(added.group(1)),
            "packages_audited": int(audited.group(1)),
            "audit_vulnerabilities": {"total": int(vulnerabilities.group(1)), "moderate": severities.get("moderate", 0), "high": severities.get("high", 0), "critical": severities.get("critical", 0)},
        })

        pi_result = _run(["node", "--test", *sorted(str(path.relative_to(checkout)) for path in (checkout / ".evcrate/targets/pi/tests").glob("*.test.mjs"))], checkout, environment)
        pi_output = pi_result.stdout + "\n" + pi_result.stderr
        if pi_result.returncode != 0:
            raise ValueError("Pi regression suite failed during baseline replay")
        pi_tests, pi_passed, pi_failed, pi_errors = _summary(pi_output)
        results.append({"id": "pi-regression-suite", "command": "node --test .evcrate/targets/pi/tests/*.test.mjs", "exit_code": 0, "test_files": pi_tests, "passed": pi_passed, "failed": pi_failed, "errors": pi_errors})

        advisor = _run(["npm", "run", "test:advisor-routing"], checkout, environment)
        advisor_output = advisor.stdout + "\n" + advisor.stderr
        advisor_tests, advisor_passed, advisor_failed, advisor_errors = _summary(advisor_output)
        class_messages = {
            "AUTH_UNAVAILABLE": "Advisor CLI authentication is unavailable",
            "CLI_VERSION_UNSUPPORTED": "Advisor CLI version is unsupported",
            "EFFORT_UNSUPPORTED": "Advisor effort is unsupported by the active host",
        }
        if advisor.returncode != 1 or advisor_failed != 8 or advisor_errors != 0:
            raise ValueError("Advisor-routing result did not match the declared host-dependent gate")
        failure_blocks = re.split(r"\ntest at ", advisor_output)[1:]
        results.append({"id": "advisor-routing-suite", "command": "npm run test:advisor-routing", "exit_code": 1, "tests": advisor_tests, "passed": advisor_passed, "failed": advisor_failed, "required_for_phase_gate": False, "classification": "host-dependent live CLI capability/authentication gates", "expected_error_classes": {name: sum(message in block for block in failure_blocks) for name, message in class_messages.items()}})
        return results


def _strict_keys(value: Any, keys: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{label} has unexpected fields")


def _nonnegative_int(value: Any, label: str) -> None:
    if type(value) is not int or value < 0:
        raise ValueError(f"{label} must be a non-negative integer")


def _validate_command_result(command: Any, expected: dict[str, Any], index: int) -> None:
    label = f"Results command {index}"
    if not isinstance(command, dict):
        raise ValueError(f"{label} must be an object")
    if command.get("id") != expected["id"]:
        raise ValueError(f"{label} has an unexpected id or order")
    command_shapes: dict[str, set[str]] = {
        "local-generation": {"id", "command", "exit_code", "result"},
        "local-check": {"id", "command", "exit_code", "result"},
        "python-regression-suite": {"id", "command", "exit_code", "tests", "passed", "failed", "errors"},
        "npm-dependencies": {"id", "command", "exit_code", "packages_added", "packages_audited", "audit_vulnerabilities"},
        "pi-regression-suite": {"id", "command", "exit_code", "test_files", "passed", "failed", "errors"},
        "advisor-routing-suite": {"id", "command", "exit_code", "tests", "passed", "failed", "required_for_phase_gate", "classification", "expected_error_classes"},
    }
    command_id = expected["id"]
    _strict_keys(command, command_shapes[command_id], label)
    if not isinstance(command["command"], str) or command["command"] != expected["command"]:
        raise ValueError(f"{label} command text is not canonical")
    if type(command["exit_code"]) is not int or command["exit_code"] != expected["exit_code"]:
        raise ValueError(f"{label} exit status is not canonical")
    if command_id in {"local-generation", "local-check"}:
        if not isinstance(command["result"], str) or command["result"] != expected["result"] or command["exit_code"] != 0:
            raise ValueError(f"{label} local result is not canonical")
    elif command_id in {"python-regression-suite", "pi-regression-suite"}:
        count_key = "tests" if command_id == "python-regression-suite" else "test_files"
        for key in (count_key, "passed", "failed", "errors"):
            _nonnegative_int(command[key], f"{label}.{key}")
        if command[count_key] != command["passed"] + command["failed"] + command["errors"]:
            raise ValueError(f"{label} counts do not add up")
        if command["exit_code"] != 0 or command["failed"] or command["errors"]:
            raise ValueError(f"{label} successful suite has failures or errors")
    elif command_id == "npm-dependencies":
        for key in ("packages_added", "packages_audited"):
            _nonnegative_int(command[key], f"{label}.{key}")
        audit = command["audit_vulnerabilities"]
        _strict_keys(audit, {"total", "moderate", "high", "critical"}, f"{label}.audit_vulnerabilities")
        for key in ("total", "moderate", "high", "critical"):
            _nonnegative_int(audit[key], f"{label}.audit_vulnerabilities.{key}")
        if audit["total"] != sum(audit[key] for key in ("moderate", "high", "critical")):
            raise ValueError(f"{label} audit counts do not add up")
    elif command_id == "advisor-routing-suite":
        for key in ("tests", "passed", "failed"):
            _nonnegative_int(command[key], f"{label}.{key}")
        if command["tests"] != command["passed"] + command["failed"]:
            raise ValueError(f"{label} advisor counts do not add up")
        if command["exit_code"] != 1 or command["required_for_phase_gate"] is not False:
            raise ValueError(f"{label} advisor gate status is not canonical")
        if command["classification"] != expected["classification"]:
            raise ValueError(f"{label} advisor classification is not canonical")
        classes = command["expected_error_classes"]
        _strict_keys(classes, {"AUTH_UNAVAILABLE", "CLI_VERSION_UNSUPPORTED", "EFFORT_UNSUPPORTED"}, f"{label}.expected_error_classes")
        for key, value in classes.items():
            _nonnegative_int(value, f"{label}.expected_error_classes.{key}")
        if command["failed"] != sum(classes.values()):
            raise ValueError(f"{label} advisor error classes do not add up")
    if command != expected:
        raise ValueError(f"{label} result is not the pinned baseline observation")


def _validate_results_envelope(repository: Path, expected: dict[str, Any]) -> str:
    _strict_keys(
        expected,
        {"schema", "baseline_commit", "environment", "commands", "precondition_diagnostics"},
        "Results fixture envelope",
    )
    if expected["schema"] != "evcrate-phase1-results/v1":
        raise ValueError("Results fixture schema is unsupported")
    if expected["baseline_commit"] != EXPECTED_BASELINE_COMMIT:
        raise ValueError("Results fixture baseline commit is not the pinned baseline")
    baseline_commit = expected["baseline_commit"]
    if not isinstance(baseline_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", baseline_commit):
        raise ValueError("Results fixture must declare a 40-character commit hash")
    _commit(repository, baseline_commit)
    environment = expected["environment"]
    _strict_keys(environment, set(EXPECTED_ENVIRONMENT), "Results environment")
    if environment != EXPECTED_ENVIRONMENT or not all(isinstance(value, str) for value in environment.values()):
        raise ValueError("Results fixture environment metadata is not canonical")
    preconditions = expected["precondition_diagnostics"]
    if not isinstance(preconditions, list) or preconditions != EXPECTED_PRECONDITIONS:
        raise ValueError("Results fixture precondition diagnostics are not canonical")
    for index, diagnostic in enumerate(preconditions):
        _strict_keys(diagnostic, {"condition", "observed", "resolution"}, f"Precondition diagnostic {index}")
        if not all(isinstance(diagnostic[key], str) for key in ("condition", "observed", "resolution")):
            raise ValueError(f"Precondition diagnostic {index} has an invalid value")
    commands = expected["commands"]
    if not isinstance(commands, list) or len(commands) != len(EXPECTED_COMMANDS):
        raise ValueError("Results fixture commands are incomplete")
    ids: list[str] = []
    for index, (command, expected_command) in enumerate(zip(commands, EXPECTED_COMMANDS, strict=True)):
        _validate_command_result(command, expected_command, index)
        ids.append(command["id"])
    if len(set(ids)) != len(ids) or ids != [command["id"] for command in EXPECTED_COMMANDS]:
        raise ValueError("Results fixture command IDs are duplicated or out of order")
    return baseline_commit


def verify_results(repository: Path, results_path: Path) -> None:
    expected = _json(results_path)
    baseline_commit = _validate_results_envelope(repository, expected)
    actual = execute_command_matrix(repository, baseline_commit)
    if actual != expected["commands"]:
        raise ValueError(
            "Recorded baseline command results are stale or incomplete: "
            + json.dumps({"expected": expected["commands"], "actual": actual}, sort_keys=True)
        )


def _json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def capture(repository: Path, baseline_commit: str | None) -> dict[str, Any]:
    if baseline_commit != EXPECTED_BASELINE_COMMIT:
        raise ValueError("Baseline capture must use the pinned Phase 1 commit")
    with tempfile.TemporaryDirectory(prefix="evcrate-phase1-capture-") as temporary:
        root = Path(temporary)
        environment = replay_environment(root)
        verified_commit = _commit(repository, baseline_commit, environment)
        checkout = _archive_checkout(repository, verified_commit, root, environment)
        generated = _run(["python3", "distribute.py", "--build"], checkout, environment)
        if generated.returncode != 0:
            raise ValueError("local-generation command failed during baseline capture")
        checked = _run(["python3", "distribute.py", "--check"], checkout, environment)
        if checked.returncode != 0:
            raise ValueError("local-check command failed during baseline capture")
        return _capture_generated_checkout(checkout, verified_commit)


def _write_json_atomically(path: Path, value: dict[str, Any]) -> None:
    """Write a complete JSON fixture and replace the destination atomically."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
        )
        temporary = Path(temporary_name)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
        if os.name != "nt":
            try:
                directory_descriptor = os.open(path.parent, os.O_RDONLY)
            except OSError:
                pass
            else:
                try:
                    os.fsync(directory_descriptor)
                finally:
                    os.close(directory_descriptor)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--commit")
    parser.add_argument("--verify-results", type=Path)
    args = parser.parse_args()
    repository = args.repository.resolve()
    if args.verify_results is not None:
        verify_results(repository, args.verify_results.resolve())
        return
    if args.output is None:
        parser.error("--output is required when capturing baseline evidence")
    evidence = capture(repository, args.commit)
    _write_json_atomically(args.output.resolve(), evidence)


if __name__ == "__main__":
    main()
