# All-Project Advisor History Contract

**Status:** COMPLETE — Phases 00–05 finished 2026-09-24 (6/6, 100%). Phase 05 paired release qualified; review approved 9.8/10. See the [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md).

This guide records the coordinated EVCrate/DamHopper boundary for all-project advisor history. Phases 02–04 implement host admission, owner-safe scanning, and snapshot-backed UI filtering; Phase 05 closes paired qualification. Production deployment remains a separate operator action.

## Versioning and compatibility

- `evcrate-advisor-data` v2 adds explicit history scope/query metadata while retaining the same eight method names. Version 1 schemas and semantics remain supported and unchanged; on-disk execution/outcome history also remains v1.
- The generated contract manifest advertises supported versions `1` and `2`. Keep the host SDK, worker, UI bridge, generated schemas, and fixtures paired during rollout; reject incompatible contract versions rather than silently weakening v1 validation.

## Scope and project filtering

Root history is a separate authority from configured host targets. The agreed owner-root policy allows every authenticated account on that server to read retained history, without per-account grants or historical project registration. The trusted plugin installation binds the owner's history root; the host/runner contract requires reauthorization of the authenticated actor, installation, source, and current revisions. A configured-target `*` grant, browser-provided path, or project display name does not grant root access.

The v2 `history.summary` and `history.page` query includes `project_id: string | null`:

- In `history-root` scope, `null` means All Projects; a SHA-256 project ID selects one discovered project.
- In `project` scope, the context remains bound to its one project; a query cannot widen it to root history or another project.
- Refresh derives its source from the trusted context, not a caller-supplied wildcard target or filesystem path.

## Snapshot inventory

Refresh and summary expose the per-project inventory for the same bounded history snapshot; the inventory is independent of active project/task/metric filters. Summary results include it, while refresh may return `null` when no inventory is available. Each item contains a canonical `project_id`, nullable display `label`, and record `count`:

```json
{"project_id":"<sha256>","label":"Example","count":12}
```

The inventory is capped at 500 unique entries. Its `total_projects` and `unfiltered_total_records` describe the snapshot before query filtering; Phase 05 observed 21 projects / 237 accepted consultations, not contract constants.

## Versioned owner-safe display metadata

The sidecar is versioned independently from the data API. Version 1 maps canonical project IDs to display metadata:

```json
{"version":1,"projects":{"<sha256>":{"name":"Example","updated_at":1720000000000}}}
```

The EVCrate history writer records a sanitized project basename once in a `project-metadata.json` sidecar keyed by project ID under the cross-platform trusted-files policy (written atomically without UID/SID/0600 mode restrictions; prior owner-only requirement superseded); metadata failures do not block consultation history. The worker checks the project-local sidecar first, then the root-level map. If neither has a valid name, the label is `null` and the UI can show an abbreviated project ID. Names are display-only, never identity or authorization; strict validation rejects leading/trailing whitespace, control characters, path separators, `~`, HOME/USERPROFILE references, and escaped control sequences. Do not infer labels from filesystem paths or expose absolute HOME paths.

## Host runner scope descriptor

The companion runner protocol defines:

```ts
type ContextScopeKind = 'project' | 'history-root';

interface ContextScopeDescriptor {
  kind: ContextScopeKind;
  rootIdentity?: string;
  sourceRevision?: number;
}
```

`context.open` accepts the optional descriptor; its result may include `scopeKind` identifying the established scope. The matching Rust host contract serializes the scope kind as `project` or `history-root` and uses camel-case descriptor fields. This typed scope distinguishes owner-root history from a single project context; host authorization and revalidation remain the authority.

## Host authorization and context (Phase 02)

DamHopper persists an installation-bound `OwnerHistorySource` with `rootPath`, `rootIdentity` (64-character lowercase SHA-256), positive `sourceRevision`, and `allAuthenticatedHistoryRead`. An administrator supplies it during installation approval or replaces it with an expected security revision; replacement advances registry and security revisions.

An authenticated actor with a valid session epoch may enter `history-root` scope only when the installed source enables account-wide history. Without an explicit user grant, the host permits only `history.refresh`, `history.summary`, `history.page`, and `history.detail`. `--no-auth` remains denied; project scope and policy/evaluation operations retain their existing grant checks. A configured-target `*` grant alone does not authorize root history.

Before each `context.open`, the API reads the enabled installation from the runner and refreshes its process-local source cache when configured. This is per-open hydration, not startup hydration. It sends a typed descriptor containing scope kind, root identity, and source revision; the descriptor does not carry the owner root path.

The runner independently checks the persisted enabled installation, root-history capability, and descriptor identity/revision. It rejects missing, symlink, or non-directory roots. The cross-platform trusted-files policy has no filesystem UID-ownership gate.

Revision-guarded source replacement clears the API source cache and invalidates that installation's contexts; the next open rehydrates the current source from the runner. Phases 02–04 complete host authorization, owner-safe scanning/name persistence, and snapshot-backed project filtering/source labels. Phase 05 completed paired qualification; see the evidence summary below. The 21-project / 237-consultation result is an observation, not a contract constant.

**Evidence:** [Phase 02 plan](../plans/260924-1055-all-project-advisor-history/phase-02-host-authorization-context.md), [validation](../plans/reports/tester-260924-1424-phase02-host-root-authorization-context.md), and [review](../plans/reports/code-review-260924-1436-phase-02-host-root-authorization.md).

## Owner-safe all-project history worker (Phase 03)

The worker uses its configured history root for `history-root` scope; callers cannot supply a scan path. Root scans traverse sorted SHA-256 project IDs and non-symlink directories under shared project/task/consultation, record, and byte budgets, operating under the cross-platform trusted-files policy (filesystem UID gates removed). Cap exhaustion marks the snapshot incomplete. Project scope stays bound to its one target.

Bounded reads open files with `O_RDONLY | O_NOFOLLOW`, then validate the opened descriptor's regular-file type, single-link status, and size under the cross-platform trusted-files policy (descriptor owner UID checks removed). Execution/outcome IDs are checked against their enclosing project/task/consultation directories; malformed or mismatched outcome data remains `invalid` rather than being misreported as `missing`, without discarding its valid execution record. Detail rereads compare device, inode, size, and content fingerprints before returning data.

Pagination cursors are HMAC-bound to the snapshot, query hash, and offset. Project selection and filters are covered by the query hash; stable ordering is `started_at` descending, then `project_id`, `task_run_id`, and `consultation_id` ascending.

The candidate builder now reuses `collectPluginPackageRecords` from `scripts/plugin/package-inventory.cjs`, so candidate packaging and manifest inventory share one closure authority.

Phase 03 review approved **9.5/10** with no critical/high findings; it records an optional recommendation to require `rootIdentity` explicitly for `history-root` worker contexts. Verification recorded **354/354 test executions passed**, with no failures or skips; package, candidate-manifest, and distribution checks passed.

**Evidence:** [Phase 03 plan](../plans/260924-1055-all-project-advisor-history/phase-03-worker-history-provider.md) and [review](../plans/reports/code-review-260924-1628-phase-03-owner-safe-history-worker.md).

## Paired qualification and release decision (Phase 05)

The 2026-09-24 qualification reconciles 273/273 cross-repository test executions (0 failed, 0 skipped), deterministic candidate and distribution package verification, and a 9.8/10 review with no critical findings. The direct history-root provider read accepted 237 of 237 consultations across 21 projects in 191.48 ms with no diagnostics. It was not a new live DamHopper browser session, and production deployment is not claimed.

**Evidence:** [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md), [test report](../plans/reports/tester-260924-2115-phase-05-paired-qualification.md), and [code review](../plans/reports/code-review-260924-2125-phase-05-paired-qualification.md).

## Source map and phase boundary

- EVCrate contract: `src/protocol/advisor-plugin-data-api.ts`, `scripts/generate-advisor-plugin-data-schema.mjs`, `plugin/contracts/evcrate-advisor-data-v2.schema.json`, `plugin/contracts/contract-manifest.json`, and `plugin/backend/data-api.cjs`.
- Phase 03 worker/provider implementation: `plugin/backend/{binding.cjs,context-table.cjs,history-scanner.cjs,snapshot-store.cjs,cursor-manager.cjs,history-provider.cjs,provider.cjs}`, `.evcrate/source/.evcrate/bin/lib/advisor/history-store.cjs`, and `scripts/build-advisor-plugin-candidate.mjs`.
- Companion host contract and Phase 02 implementation: `packages/plugin-sdk/src/runner-protocol.ts`; `server/src/plugins/{registry_state.rs,lifecycle.rs,authorization.rs,contract.rs,api_service.rs,worker_supervisor.rs}` and `server/src/api/plugin_admin.rs` in DamHopper's `feat-plugin-platform` workspace.
- Phase 04 UI: EVCrate `viewer/src/{app.tsx,app-state-types.ts,app-actions.ts,app-state-reducer.ts,app-state-selectors.ts,app-state.ts}`, `viewer/src/views/{history-view,history-detail,overview-view,configuration-view,evaluations-view}.tsx`, and `viewer/src/providers/{advisor-data-provider,dam-hopper-port-provider}.ts`; companion DamHopper `packages/ui/src/plugins/use-plugin-navigation.ts` and `packages/ui/src/components/PluginHostPage.tsx`.
- Phase boundaries: Phases 00–05 are complete (6/6, 100%); paired release is qualified. See the [project plan](../plans/260924-1055-all-project-advisor-history/plan.md), [Phase 05](../plans/260924-1055-all-project-advisor-history/phase-05-cross-repo-qualification.md), [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md), and [Phase 01](../plans/260924-1055-all-project-advisor-history/phase-01-cross-project-contract.md), [Phase 02](../plans/260924-1055-all-project-advisor-history/phase-02-host-authorization-context.md), [Phase 03](../plans/260924-1055-all-project-advisor-history/phase-03-worker-history-provider.md), and [Phase 04](../plans/260924-1055-all-project-advisor-history/phase-04-project-filter-ui.md).
