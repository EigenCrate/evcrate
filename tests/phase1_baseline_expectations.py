"""Pinned expectations for the Phase 1 baseline evidence."""

EXPECTED_TARGETS = {"claude", "codex", "gemini", "antigravity", "pi"}
EXPECTED_REGISTRY = {
    "schema_version": 1,
    "targets": {name: f"{name}/manifest.json" for name in sorted(EXPECTED_TARGETS)},
}
EXPECTED_TARGET_OUTPUTS = {
    "antigravity": (".antigravity",),
    "claude": (".claude",),
    "codex": (".codex", ".agents"),
    "gemini": (".gemini",),
    "pi": (".pi",),
}
EXPECTED_MANIFESTS = {
    "antigravity": "7461dc64e6fd4e2606115028c9e1778140407840ab7e2e08c9237bae63faaaac",
    "claude": "68d626ffb554367892000c7590f8a608028503b9d63ab87f1a629d0a69d36e7a",
    "codex": "89a921eff962ab21231538428254405ea7a3b3f3b26a73aebd8b3a51d4d3e296",
    "gemini": "14ff3912847d8a84791abcf0bc282c4b8208460639f86492e7039440bde6da59",
    "pi": "eab0f2be6532e4cc2c26101b8024bc7cc1e1910b188e2bbdd1142367e50e5f72",
}
EXPECTED_BUILD_MANIFEST = "603f50a638653998beb13534eadf7f628a02e972c7539900983c7a3e1be78206"
EXPECTED_OUTPUTS = {
    ".agents": (724, "8390c46045385e3be8ada3a8f93f2e173e9c3705d1682b6f4450c9a18a338aa2", "3ae1344ee31aac5936c363eed7d02ece0e0c682f9b799457cde94a2a9efc49c3"),
    ".antigravity": (777, "28233dad1a106108f19a4aa92bc18bdc3db981e5aa088fbd7dcdea2e23216e79", "157a0f63fffc9173bdddb6c5623a3f8399adc32578f401a000eaf978b81d5737"),
    ".claude": (924, "12a8fc84f69ece75181232093fdf2b9e520bf5b2f6f0eff4670a15c1b6329b80", "2b53f597d35bd738e2e6718342abb7e7eaaa9cc943e9e75c39790ad7572d8814"),
    ".codex": (87, "eca9dce4b9dbcbefe01aa077b3b1bce3600b56f5fa6809db65420cbf663969b3", "7162d82470957b0357aa1a13d94eb08050b7b3fb0110751cb59cef89bf6c409d"),
    ".gemini": (880, "51d997be1f6369624903a6321a178ea5a42e77765c3b32a3c3f634bdc9e3eba7", "8f5e647da7f40f87516d3bf1493edc7e8f9b4ff7daadf7c9b1197bd1990b2d1c"),
    ".pi": (813, "cadcc2cfd62124c501219fdb219d09d6becc507e3980d9d91cb51f2cffa26911", "0d006183bdfc29eb9c3bc51da5950f9b3514a4f83ff49aba63880cbd876645c5"),
}
EXPECTED_DOCUMENTS = {
    "AGENTS.md": "dda19a76f3c57ec6ec9e13f5e5d27cce2f3fd478fb04bf555b61ec6d000c90f9",
    "GEMINI.md": "c2fde0db729f77cdda7b21445093d2150a06f3db0e45166ca0d16a26fa3571b0",
}

EXPECTED_ENVIRONMENT = {
    "cwd": "disposable archived checkout of baseline commit",
    "home": "disposable empty HOME and EVCRATE_HOME",
    "python": "3.14.7",
    "node": "24.16.0",
    "npm": "11.13.0",
    "network": "not required for Python, local artifact, or advisor tests; npm dependencies installed from lockfile",
}
EXPECTED_COMMANDS = [
    {"id": "local-generation", "command": "python3 distribute.py --build", "exit_code": 0, "result": "verified local artifacts generated"},
    {"id": "local-check", "command": "python3 distribute.py --check", "exit_code": 0, "result": "generated artifacts are deterministic and current"},
    {"id": "python-regression-suite", "command": "python -m unittest discover -s tests -p 'test_*.py' -q", "exit_code": 0, "tests": 193, "passed": 193, "failed": 0, "errors": 0},
    {"id": "npm-dependencies", "command": "npm ci --ignore-scripts", "exit_code": 0, "packages_added": 429, "audit_vulnerabilities": {"total": 21, "moderate": 3, "high": 17, "critical": 1}},
    {"id": "pi-regression-suite", "command": "node --test .evcrate/targets/pi/tests/*.test.mjs", "exit_code": 0, "test_files": 51, "passed": 51, "failed": 0, "errors": 0},
    {"id": "advisor-routing-suite", "command": "npm run test:advisor-routing", "exit_code": 1, "tests": 105, "passed": 97, "failed": 8, "required_for_phase_gate": False, "classification": "host-dependent live CLI capability/authentication gates", "expected_error_classes": {"AUTH_UNAVAILABLE": 6, "CLI_VERSION_UNSUPPORTED": 1, "EFFORT_UNSUPPORTED": 1}},
]
EXPECTED_COMMAND_IDS = [command["id"] for command in EXPECTED_COMMANDS]
EXPECTED_PRECONDITIONS = [
    {"condition": "publish before local generation", "observed": "two publication tests reject missing .antigravity artifact", "resolution": "run local generation before publication tests"},
    {"condition": "tests run beneath a real user checkout", "observed": "Codex help resolver selects ancestor .claude/commands", "resolution": "run from a disposable archived checkout, not only with HOME overridden"},
    {"condition": "Pi tests before npm dependency preparation", "observed": "27 of 31 test files pass; four cannot import typebox", "resolution": "run npm ci --ignore-scripts in the disposable checkout"},
]

EXPECTED_FAILURE_CASES = [
    {"id": "normalized-path-traversal", "invariant": "Repository-relative paths reject traversal and platform separators.", "test": "tests/test_distribution_build.py::DistributionBuildTest.test_normalized_paths_reject_traversal_and_windows_separators", "expected_error": "HashingError"},
    {"id": "overlay-baseline-file-collision", "invariant": "An overlay cannot replace a baseline-owned file.", "test": "tests/test_distribution_build.py::DistributionBuildTest.test_overlay_rejects_baseline_file_collision", "expected_error": "OverlayError"},
    {"id": "overlay-file-directory-collision", "invariant": "An overlay cannot cross a file/directory boundary.", "test": "tests/test_distribution_build.py::DistributionBuildTest.test_overlay_rejects_file_directory_collision", "expected_error": "OverlayError"},
    {"id": "overlay-symlink-escape", "invariant": "Overlay inputs cannot escape through symlinks.", "test": "tests/test_distribution_build.py::DistributionBuildTest.test_overlay_rejects_symlink_escape", "expected_error": "OverlayError"},
    {"id": "source-symlink-rejection", "invariant": "Generated source trees reject symlinks before promotion.", "test": "tests/test_distribution_build.py::DistributionBuildTest.test_source_symlink_is_not_followed_and_baseline_rejects_it", "expected_error": "BuildError"},
    {"id": "stale-build-lock", "invariant": "Concurrent repository operations fail closed.", "test": "tests/test_distribution_build.py::DistributionBuildTest.test_repository_lock_rejects_concurrent_operation", "expected_error": "BuildError"},
    {"id": "interrupted-build-recovery", "invariant": "Interrupted local promotion restores the prior artifact and clears its journal.", "test": "tests/test_distribution_build.py::DistributionBuildTest.test_recovery_restores_outputs_after_interruption", "expected_result": "prior output restored; recovery journal removed"},
    {"id": "stale-publication-hash", "invariant": "Stale source/runtime authorization blocks HOME mutation.", "test": "tests/test_distribution_publish.py::DistributionPublishTest.test_stale_source_hash_blocks_before_home_mutation", "expected_error": "PublishError"},
    {"id": "stale-runtime-hash", "invariant": "A changed advisor runtime blocks HOME mutation.", "test": "tests/test_distribution_publish.py::DistributionPublishTest.test_stale_runtime_hash_blocks_before_home_mutation", "expected_error": "PublishError"},
    {"id": "stale-output-hash", "invariant": "A changed generated output blocks HOME mutation.", "test": "tests/test_distribution_publish.py::DistributionPublishTest.test_changed_claude_output_hash_blocks_before_home_mutation", "expected_error": "PublishError"},
    {"id": "missing-output-hash", "invariant": "Missing output authorization blocks HOME mutation.", "test": "tests/test_distribution_publish.py::DistributionPublishTest.test_missing_claude_output_authorization_blocks_before_home_mutation", "expected_error": "PublishError"},
    {"id": "home-symlink-rejection", "invariant": "Managed HOME paths and ancestors cannot be symlinked.", "test": "tests/test_distribution_publish_symlinks.py::DistributionPublishSymlinkTest.test_managed_destination_symlink_is_rejected_without_mutation", "expected_error": "PublishError"},
    {"id": "interrupted-home-recovery", "invariant": "Interrupted HOME publication restores completed roots before resuming.", "test": "tests/test_distribution_publish.py::DistributionPublishTest.test_recovery_restores_marker_recorded_backup", "expected_result": "backup restored; release marker consumed"},
    {"id": "pi-settings-merge", "invariant": "Pi settings preserve user keys and merge only managed package identities.", "test": "tests/test_distribution_pi_settings.py::PiSettingsPublicationTest.test_publish_merges_only_packages_and_keeps_settings_out_of_managed_paths", "expected_result": "merge-update; user settings preserved"},
    {"id": "pi-settings-conflict", "invariant": "A conflicting pi-code package is non-destructive and fails closed.", "test": "tests/test_distribution_pi_settings.py::PiSettingsPublicationTest.test_pi_code_conflict_is_dry_run_only_and_non_destructive", "expected_error": "PublishError"},
    {"id": "pi-settings-symlink", "invariant": "Pi settings symlinks are rejected before mutation.", "test": "tests/test_distribution_pi_settings.py::PiSettingsPublicationTest.test_symlinked_settings_are_rejected_before_mutation", "expected_error": "PublishError"},
    {"id": "pi-settings-concurrent-change", "invariant": "Concurrent Pi HOME changes abort before promotion.", "test": "tests/test_distribution_pi_settings.py::PiSettingsPublicationTest.test_concurrent_pi_home_change_aborts_before_promotion", "expected_error": "PublishError"},
]
EXPECTED_FAILURE_IDS = [case["id"] for case in EXPECTED_FAILURE_CASES]
