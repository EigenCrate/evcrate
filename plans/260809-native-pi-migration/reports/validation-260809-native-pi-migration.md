# Native Pi migration validation

**Date:** 2026-08-09  
**Scope:** isolated implementation validation only; no live Pi HOME was modified.

## Evidence

- `python3 distribute.py --build` regenerated the Pi projection deterministically.
- `npm test` passed: 119 Python tests and 35 Node Pi extension tests.
- `python3 distribute.py --check` passed after the test run.
- `npm pack --pack-destination <tmp>` is exercised by the native runtime test. It installs the actual tarball in isolation, runs build/check/publish from that installation, and verifies the required distribution scripts, target manifests, and Pi adapter sources are included.
- Temporary `EVCRATE_HOME` / `EVCRATE_STATE_HOME` publish dry-run, publish, and second dry-run completed. The second Pi settings operation was a no-op.
- The native runtime test installs exact Pi `0.84.1` and both pinned packages, verifies their installed versions, discovers `/plan`, `/fix:fast`, `/cook:auto:fast`, `pi-subagents`' `/subagents-doctor`, the 17 generated agents, and generated skills under the default HOME root. It repeats command discovery with a copied runtime-only `PI_CODING_AGENT_DIR`.
- `npm pack --dry-run` reported 1,891 packaged files with no Python bytecode.
- A focused final review found no Critical or High blockers for isolated validation; its runtime timeout and generated-skill discovery findings were addressed before the final test run.

## Implemented safety coverage

- Canonical hook mapping preserves handler order and marks privacy/scout handlers as safety-class.
- The native hook adapter contains script paths, bounds process/output execution, blocks safety hook failures, maps Pi tool/reason payloads, parses injected context, and scopes `EVCRATE_*` session values to the lifecycle.
- Command shell timeout/abort terminates the POSIX process group; a descendant regression test covers it.
- XML closing-tag directive translation has a regression test.
- Shared Pi settings tests cover no-op byte preservation, managed package replacement, stale managed Pi-file removal, `pi-code` conflict forms, symlink rejection, and concurrent HOME mutation abort.
- Hook path containment uses platform-aware relative-path validation while retaining realpath checks.

## Remaining user-controlled gate

No user-approved live cutover was performed. Before publishing to a live Pi HOME, the user must remove `npm:pi-code` manually, stop Pi processes, review a live `--publish --dry-run --json`, and explicitly approve publication.
