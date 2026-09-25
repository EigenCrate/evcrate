# Phase 01 — Freeze cross-project scope/data contract

## Context links
[Plan](./plan.md) · [domain research](./research/history-domain.md) · [host research](./research/host-authorization.md) · [current cross-repo contract](../260920-1603-dam-hopper-advisor-plugin/cross-repo-contract.md) · [architecture](../../docs/system-architecture.md#proposed-cross-project-history-design-not-implemented). Depends on Phase 00 security gate; precedes both implementations.

## Overview
2026-09-24; priority P1; estimate 6h; status DONE (2026-09-24); implementation complete; review approved 9.5/10 (2026-09-24). Joint freeze in both repositories; preserve history-record format v1 and exact v1 wire semantics.

## Key Insights
`src/protocol/advisor-plugin-data-api.ts:296-333,447-477` rejects extra keys. Metrics already expose `history-root` scope (`advisor-metrics.ts:19-22`); host `*` target grant is not an owner history-root grant. No browser-provided path or identity may grant history.

## Requirements
Version plugin data API as v2, keeping eight read method names and v1 unchanged until paired cutover. Define root vs project scope in host/runner/worker, install-bound owner root identity/revision, authenticated-session admission for every account of that server, and revocation/version handshake fixtures. No project registration or per-account grant for root history. Define query `project_id: string|null` on summary and page (null = all in root context, forced matching project in project context); refresh selects context scope, not caller-supplied `target:'*'`. Include bounded per-project inventory `{project_id, label?, count}` from the same snapshot, independent of active filters. Define a versioned, owner-safe metadata sidecar for future EVCrate project display names, keyed by hash, with unknown fallback for older projects; labels are not identity. Avoid raw paths/oversized inventory; establish max descriptors and truncation/incomplete indicator. Unknown selected ID is invalid input, not implicit All Projects.

## Architecture
Root history mode is activated by trusted plugin installation binding to its owner root; it is not the configured-target wildcard. Host and runner authorize authenticated actor, installation, source and revisions at open/invoke. UI may select `All Projects`, but domain query only filters discovered IDs. Summary/page/Overview share canonical project/task/metric filters and snapshot ID. Detail retains snapshot+record_ref and project provenance; `record_ref` includes project ID. Configuration and Evaluations continue using separately bound sources and explicitly display that History filters do not affect them. Extend host contract version/fixtures for new source scope; reject mismatched package/protocol versions.

## Related code files
- **EVCrate modify** `src/protocol/advisor-plugin-data-api.ts`, `scripts/generate-advisor-plugin-data-schema.mjs`, `plugin/backend/data-api.cjs`, `plugin/contracts/` (new generated v2 schema and manifest; preserve v1 fixtures until paired cutover, never hand edit generated outputs), `tests/fixtures/advisor-plugin/` plus versioned positive/negative cases, `plugin/manifest.json` (generated/validated package authority).
- **Host modify** `packages/plugin-sdk/src/runner-protocol.ts`, `server/src/plugins/contract.rs`, SDK schema/fixture definitions under `packages/plugin-sdk/` and host contract tests. Confirm exact file ownership before edits; update docs in both repositories at implementation time.

## Implementation Steps
1. Freeze exact root source/install/all-authenticated admission, explicit development-only auth behavior, scope version negotiation and revocation; no per-project registration or user grant administration.
2. Define strict v2 context/query/inventory and separate owner-safe project-name sidecar format and sanitization/limits; retain execution/outcome history v1 and project-only behavior.
3. Generate machine schemas/manifests and positive/negative fixtures in both repos; confirm SDK version/capability handshake and deterministic artifact pairing.
4. Freeze measured scan/project/task/time/memory and response ceilings against 21-project fixture; gate if current limits cannot support observed data honestly.

## Todo list
- [x] Freeze install-bound root, all-authenticated actor admission, scope and wire shapes jointly.
- [x] Update validators/generator/generated artifacts and host fixtures.
- [x] Reject unknown roots, paths, project IDs and stale contract versions.
## Success Criteria
Host, worker, bridge and generated schema agree on version/scope; installed root access requires authenticated actor but no manual per-user grant. Project-only v1 behavior stays valid; root v2 has negative fixtures for anonymous/invalid session/unknown project and malformed inventory/name metadata.

## Risk Assessment
Version skew between independently deployed host/plugin: fail handshake before opening iframe/context; stage matched artifact pair and retain rollback pair. Count can change with retention: never pin 230 as schema constant.

## Security Considerations
Root access is tied to authenticated actor plus trusted installed owner root, separately from wildcard target/operation grants; never treat a guest as authenticated. Project names are owner-safe display-only metadata, never access authority; missing names display abbreviated IDs. Never echo HOME paths.

## Next steps
Host and worker implementations (Phases 02 and 03) can proceed independently after joint contract freeze.
