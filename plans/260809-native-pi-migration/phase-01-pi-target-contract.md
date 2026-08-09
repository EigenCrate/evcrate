# Phase 01 — Pi Target and Distribution Contract

## Context

- [Plan](./plan.md)
- [Research](./reports/research-260809-pi-native-migration.md)
- [Architecture](../../docs/system-architecture.md)

## Overview

- **Priority:** P1
- **Status:** DONE
- **Completed:** 260809
- **Goal:** establish the architecture, hashing, staging, and shared-file transaction contracts required by a first-class `.pi` target before generating runtime content.
- **Effort:** 8–12h

## Requirements

- Register a `pi` target with one owned output root: `.pi`.
- Resolve local/staged/HOME Pi paths through `DistributionContext`; no ad hoc HOME lookup in Python distribution code.
- Run `migrate_claude_to_pi.py` through the manifest adapter contract with an explicit contained `PI_OUTPUT_DIR` during build/check.
- Hash the adapter entrypoint and declared `pi_adapter/**` helper sources symmetrically during build and publication verification.
- Add a typed shared-JSON operation for `agent/settings.json`; dry-run and real publish must use the same pure merge plan inside the `.pi` candidate.
- Preserve current Claude, Codex/agents, Gemini, and Antigravity outputs byte-for-byte.
- Include Pi source/overlay/adapter-source hashes in `.evcrate/build-manifest.json`; reject undeclared output roots and overlay files, while generated inventory is validated by adapter tests.

## Related files

### Create

- `.evcrate/targets/pi/manifest.json` — Pi output, `files/` overlay, adapter sources, HOME binding, and shared-settings declaration.
- `migrate_claude_to_pi.py` — thin staging-only adapter CLI/coordinator; implementation is completed in Phase 02.
- `distribution/pi_settings.py` — pure `pi-settings-v1` package merge/conflict plan.
- `tests/test_migrate_claude_to_pi.py` — adapter path and deterministic-output fixtures.
- `tests/test_distribution_pi_settings.py` — shared-file planning, preservation, conflict, no-op, and recovery fixtures.

### Modify

- `.evcrate/targets/manifest.json` — add `pi` registry entry.
- `distribution/context.py` — add `local_pi`, `target_pi`, and `.pi` to local-root validation.
- `distribution/manifest.py` — add validated `adapter_sources` and `SharedJsonSpec` fields.
- `distribution/staging.py` — require `PI_OUTPUT_DIR=<stage>/.pi`, hash adapter source trees, and preserve adapter → overlay → runtime → patch order.
- `distribution/publish_verification.py` — recompute the same adapter-source hashes.
- `distribution/publish.py`, `distribution/publish_inventory.py`, `distribution/publish_recovery.py`, `distribution/contracts.py`, and `distribution/gates.py` as needed — carry typed shared-file metadata through candidate planning, diff, promotion, marker ownership, rollback, and recovery.
- Distribution manifest/context/staging/publish tests — assert Pi registration, root ownership, hashes, shared merge, and promotion.
- `docs/system-architecture.md` — reconcile the structured delegation/native hook/shared-settings design before implementation.

## Implementation steps

1. Reconcile architecture/research with the validated Pi 0.84.1 and `pi-subagents` 0.44.0 contracts; capture a clean build-manifest/output hash baseline.
2. Add context helpers for `.evcrate/source/.pi` and `HOME/.pi`; include `.pi` in nested source roots and legacy root rejection.
3. Extend manifest schema with contained `adapter_sources` and shared JSON declarations; reject duplicate/escaping/symlinked sources and destinations outside the declared binding.
4. Define `.evcrate/targets/pi/files/` as the overlay root and list every overlay file as `files/...` in `owned_paths`. The adapter must never emit an overlay-owned path.
5. Add `PI_OUTPUT_DIR` to staging, hash adapter helpers in build and publish verification, and keep one `.pi → .pi` HOME binding. There is no nested binding.
6. Implement one pure Pi settings plan used by `publish_diff` and candidate construction. Normalize string/object package identities, preserve unknown values, keep settings out of `managed_paths`, classify `merge-create/update/noop/conflict`, clean failed candidates, and rollback exact original bytes. Snapshot the HOME root before candidate copy and recheck immediately before promotion; abort/recover if Pi sessions, package cache metadata, settings, or other files changed concurrently.
7. Add a minimal adapter that rejects missing/escaped/symlinked paths and emits an empty valid Pi skeleton only inside staging; provide no unconstrained direct-global mode or convenience script.
8. Extend tests for missing/changed helper sources, adapter/overlay collision, source/output escape, malformed/symlinked settings, old managed-entry removal, `pi-code` conflict, concurrent HOME mutation, interrupted recovery, stale hash, and unchanged existing targets.
9. Run build twice and prove byte-identical non-Pi outputs before Phase 02.

## Success criteria

- `python3 distribute.py --build` creates `.evcrate/source/.pi` and records its owner plus adapter entrypoint/helper/overlay hashes.
- `python3 distribute.py --check` detects Pi drift without writes.
- Removing/corrupting the Pi manifest or adapter fails closed.
- Existing generated target hashes remain unchanged except the registry/build-manifest additions.

## Risks and controls

- **Root/overlay ownership collision:** manifest validation must reject duplicate `.pi` ownership and adapter writes to `files/`-owned destinations.
- **Shared settings/session corruption:** require quiescent Pi for live publication, recheck the HOME snapshot before promotion, use candidate-only pure merge, test semantic preservation/exact no-op/rollback bytes, and clean up validation failure.
- **Stale helper code:** typed `adapter_sources` hashed identically at build and publish verification.
- **Unexpected target churn:** snapshot and compare old output trees before promotion.
- **Direct migrator misuse:** require explicit source/output paths and reject non-staging/global defaults.
