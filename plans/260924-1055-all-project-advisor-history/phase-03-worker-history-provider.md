# Phase 03 — EVCrate owner-safe all-project history worker

## Context links
[Plan](./plan.md) · [Phase 01 contract](./phase-01-cross-project-contract.md) · [domain research](./research/history-domain.md) · [provider architecture](../../docs/codebase-summary.md#owner-safe-plugin-read-provider-phase-e01). Depends on contract freeze, integrates with Phase 02.

## Overview
2026-09-24; priority P1; estimate 8h. **Status: DONE (2026-09-24).** Verification: 354/354 tests passed (0 failed, 0 skipped); review approved 9.5/10; canonical advisor checkpoint complete. Evidence: [test report](../reports/testerphase03final-260924-1621-phase-03-owner-safe-history-worker.md); [code review](../reports/code-review-260924-1628-phase-03-owner-safe-history-worker.md). One bounded snapshot spanning eligible project directories; no local filesystem browsing API.

## Key Insights
`history-scanner.cjs:56-75` only traverses `root/projectId`; `:132-153` record_ref hashes task+consultation but not project. `cursor-manager.cjs:61-76` checks scalar filter fields not accepted plural metric filters. `snapshot-store.cjs:29-37` estimated size ignores normalized records. Root mode increases workload and collision risk.

## Requirements
Current single-target behavior unchanged. Root scope scans only SHA-256 IDs under the installed owner root, with owner/non-symlink directory chain and descriptor-pinned file checks, shared scan bytes/time/record/project/task caps; mark incomplete on cap exhaustion. Validate execution/outcome IDs against enclosing project/task/consultation. Inventory counts reflect accepted rows from one snapshot; read an optional owner-only project-ID-keyed metadata sidecar for a bounded sanitized display name, falling back to short ID for old/unknown entries. On future consultations EVCrate's authoritative history writer derives a safe name from verified canonical project context and records it once; do not modify history v1 execution/outcome or store full paths. Summary/page/Overview share identical project/task/status/outcome/backend/time filters and honest completeness. Detail remains project-aware and fingerprinted. Preserve cancellation, context-local stale snapshots, 128 MiB aggregate/2 snapshots/context TTL and <=1 MiB pages; qualify estimates with retained normalized records.

## Architecture
At context open `context-table.cjs`/`binding.cjs` validate trusted root scope; project provider remains exact-target. `history-scanner.cjs` traverses sorted project IDs and bounded task/file readers. The existing authoritative advisor history writer stores a small `project_id`/display-name sidecar under that project directory with existing owner-only atomic I/O patterns; metadata failure degrades the name only, not usable advice/history. Provider safely rereads the sidecar, checks ID against enclosing directory and validates controls/length; identical names remain distinct via ID. Snapshot captures scope/inventory/rows/secure refs. Shared canonical filter logic serves metrics/page; cursor HMAC binds snapshot, selection/filters/sort with project tie-break. Detail never synthesizes paths from browser queries.

## Related code files
- **EVCrate modify** authoritative advisor history writer (`history-store.cjs`, located from controller closure/build manifest before editing), history metadata validation and writer fixtures; `plugin/backend/{binding.cjs,context-table.cjs,history-scanner.cjs,history-provider.cjs,snapshot-store.cjs,cursor-manager.cjs,history-detail.cjs,provider.cjs,data-api.cjs}`; generated packaged closure via `scripts/build-advisor-plugin-candidate.mjs`. Do not edit generated runtime copies directly.
- **EVCrate modify tests** `tests/plugin/{provider.test.mjs,provider-cancellation.test.mjs,provider-source-safety.test.mjs}`, existing advisor history-writer fixtures and protocol fixtures; reuse conventions. Host edits only through Phase 02/05.

## Implementation Steps
1. Admit trusted root scope only from approved worker context; prevent caller from setting HOME, root path, grant, or arbitrary ID. Verify root and each project directory owner/type/path chain.
2. Scan sorted children under shared budgets; validate on-disk IDs and optional owner-only project-name sidecars; diagnose bad/partial entries without paths; preserve cancellation and prior snapshot correctly.
3. Add safe project-name recording at advisor-history creation (canonical ID binding, sanitized basename, owner-only atomic metadata, collision/unknown fallback). Store project-aware refs, bounded inventory and accurate memory estimate; implement canonical metrics/page parity, project-aware cursor/detail.
4. Exercise future name persistence, malformed/missing/stale metadata, same-name projects, historical fallback, multi-project fixture, bad/duplicate IDs, symlink swaps, partial scans, pagination, ties, concurrent revocation and detail changes.

## Todo list
- [x] Trusted root context plus safe bounded multi-directory scan.
- [x] Safe project-name producer and owner-safe reader with historical ID fallback.
- [x] Match summary/page/Overview filters, inventory, record refs and signed cursors across projects.
- [x] Negative source, identity, cursor, budget and cancellation coverage.

## Success Criteria
Authorized refresh enumerates eligible records/projects (230/21 only if data still matches) and filters evcrate to its matching 27 when unchanged. New consultations appear with a safe stored project label; legacy unnamed projects show short IDs without hiding records. Cross-project reads cannot escape root or leak stale detail/cursor; summary/table/Overview agree; incomplete scans are labeled.

## Risk Assessment
256 MiB existing scan budget or 128 MiB snapshot cap may be insufficient at scale; qualify and report incomplete rather than increasing silently. Filtering large record arrays per page may impact latency; profile before optimizing. `record_ref` format change invalidates old cursors: pair cutover/version negotiation.

## Security Considerations
Stored names must not carry paths, secrets, control characters or authority; invalid metadata cannot hide valid history. Check project/task/consultation identity and file descriptor chain before use. Never expose raw owner HOME paths in inventory.

## Next steps
Connect UI with scope metadata in Phase 04 and run paired qualification Phase 05.
