# Native Pi migration validation

**Date:** 2026-08-09  
**Scope:** isolated implementation validation only; no live Pi HOME was modified.

## Evidence

- `python3 distribute.py --build` regenerated the Pi projection deterministically.
- `npm test` passed: 117 Python tests and 34 Node Pi extension tests.
- `python3 distribute.py --check` passed after the test run.
- `npm pack --dry-run` is exercised by the Node suite and verifies `distribution/**`, `distribute.py`, and the Pi extension overlay are package-included.
- Temporary `EVCRATE_HOME` / `EVCRATE_STATE_HOME` publish dry-run, publish, and second dry-run completed. The second Pi settings operation was a no-op.
- The Node smoke suite installs Pi `0.84.1`, loads the generated EVCrate extension from a copied alternate `PI_CODING_AGENT_DIR`, and does not write to the generated source tree.

## Implemented safety coverage

- Canonical hook mapping preserves handler order and marks privacy/scout handlers as safety-class.
- The native hook adapter contains script paths, bounds process/output execution, blocks safety hook failures, maps Pi tool/reason payloads, parses injected context, and scopes `EVCRATE_*` session values to the lifecycle.
- Command shell timeout/abort terminates the POSIX process group; a descendant regression test covers it.
- XML closing-tag directive translation has a regression test.
- Shared Pi settings tests cover no-op byte preservation, managed package replacement, `pi-code` conflict forms, symlink rejection, and concurrent HOME mutation abort.

## Remaining user-controlled gate

No user-approved live cutover was performed. Before publishing to a live Pi HOME, the user must remove `npm:pi-code` manually, stop Pi processes, review a live `--publish --dry-run --json`, and explicitly approve publication.
