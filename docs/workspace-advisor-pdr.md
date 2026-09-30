# Workspace Advisor Product Requirements

This page contains FR-25–FR-33 from the [Project Overview and PDR](./project-overview-pdr.md). Workspace Advisor Phases 00–09 are complete; Phase 09 paired qualification passed, while production rollout and deployment remain subject to explicit operator authorization. See the [plan](../plans/260929-1346-advisor-workspace-panel/plan.md) and [Phase 09 qualification report](../plans/260929-1346-advisor-workspace-panel/reports/phase-09-qualification.md).

### FR-25: Workspace Advisor host admission and identity (Phase 01)

**Status:** Phase 01 admission and identity completed and approved 2026-09-29; Phase 02 status is recorded in [FR-26](#fr-26-history-scope-and-unmapped-record-preservation-phase-02).

**Requirement:** An authenticated Workspace user must select a registered, resolvable project/worktree to identify the owning DamHopper connection and profile before Advisor admission. The host returns a server-resolved descriptor with canonical project identity, actual history/context scope, and actor-effective operations. Client-supplied profile, actor, project ID, root path, scope, or permission overrides never establish authority.

**Acceptance:**
- `plugins:describeView` accepts only the non-null `{installationId, target}` request at `POST /api/plugins/view-context`; unknown authority fields reject. No selection, unavailable target, or unauthenticated access does not fall back to another project, profile, or root.
- The server resolves the configured target/worktree, canonicalizes its directory, and computes lowercase SHA-256 over exact UTF-8 path bytes. Unsupported encoding and unsafe roots fail; labels remain display-only.
- The descriptor distinguishes `historyScope` (`history-root`, `project`, `unavailable`) from the existing runner `contextScope` (`history-root`, `project`). The enabled owner-history source implies only `history.refresh`, `history.summary`, `history.page`, and `history.detail`; policy/evaluation access still requires existing grants and remains available when history is unavailable.
- `authorityKey` fences authority changes using installation, package, scope, security/source revision, and target-binding identity. It is equality metadata, not a credential; asset reads, context open, and invocation continue to reauthorize.
- Server integration and authorization checks cover admission failures, forged identity fields, canonical ID parity, global-root A→B key stability, and distinct history/project/policy/evaluation grants. See the [Workspace Advisor host contract](./workspace-advisor-host-contract.md) and [Phase 01 evidence](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md).

### FR-26: History scope and unmapped-record preservation (Phase 02)

**Status:** Phase 02 completed and approved 2026-09-29 (review 9.6/10); Phases 03–08 are complete under [FR-27](#fr-27-negotiated-workspace-bridge-and-reusable-host-phase-03), [FR-28](#fr-28-workspace-advisor-viewer-scope-and-request-state-phase-04), [FR-29](#fr-29-persistent-workspaceadvisorhost-placement-phase-05), [FR-30](#fr-30-compact-activity-views-and-accessible-tabs-phase-06), [FR-31](#fr-31-configuration-and-evaluations-disclosures-phase-07), and [FR-32](#fr-32-standalone-navigation-and-package-cutover-phase-08). Phase 09 paired qualification is complete under [FR-33](#fr-33-paired-qualification-documentation-and-release-handoff-phase-09).

**Requirement:** In `history-root` scope, All (`project_id: null`) includes structurally valid records with canonical project IDs even when Workspace registration or display-label metadata is absent. Project scope remains bound to its context and cannot widen. Policy/evaluation reads retain independent profile-bound sources and grants.

**Acceptance:**
- A valid-ID Project U fixture with no registration or sidecar label appears in root All and has a usable page/detail; `label` remains `null`.
- The fixture reports 6 discovered directories, 7 accepted records (A=3, worktree=1, B=2, U=1), and 2 invalid records (malformed JSON and directory/payload ID mismatch).
- Project-scoped null queries remain bound; foreign project IDs reject; pagination cursors remain bound to the exact snapshot/query.
- Bounded, cancelled, and deadline-limited scans preserve explicit completeness/diagnostic accounting. Separately granted policy/evaluation reads work without a history root.
- Phase 02 preserved existing v1 storage/v2 wire and the production provider; it did not establish an ID-less format, an exhaustive production-history census, or Workspace rollout. Phase 09 later qualified the paired Workspace candidate.

**Evidence:** [Phase 02 record](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md) and [approved review](../plans/reports/code-review-260929-1850-phase-02-history-scope-and-unmapped-records.md).

### FR-27: Negotiated Workspace bridge and reusable host (Phase 03)

**Status:** Completed and approved 2026-09-29 (review 9.7/10).

**Requirement:** The Advisor SDK, DamHopper host, and EVCrate viewer negotiate the Workspace bridge extension and share one lifecycle for generic plugin routes and Workspace embedding. Trusted context becomes usable only after the host opens the authorized context; bridge messages do not grant or widen data permissions.

**Acceptance:**
- The `1.0.0` bridge negotiates `workspace-advisor-v1`; generic plugins retain the base handshake. Envelopes are fenced by bridge version, frame session, and activation generation, with strict context/operation validation and bounded payloads.
- `host.contextReady` follows nonce acknowledgement and authorized context open with expected scope/activation. The viewer waits for it before reporting Advisor data readiness.
- `host.workspaceChanged` accepts only a higher revision under the same `authorityKey`; it updates selected-project metadata without replacing the frame/context. Changed authority or owner revokes and replaces the session before stale content can render.
- `frame.uiIntent` is limited to `activate` / `dismiss` and accepted only for a negotiated, Ready, visible session. It is UI intent, not a data operation.
- `usePluginHost` owns metadata/context resolution, asset verification, owner-change fencing, in-place same-authority selection updates, and session disposal. `PluginHost` is reusable presentation; `PluginHostPage` remains a thin route wrapper.
- Paired tests cover bridge validation/readiness, same-authority selection, owner/authority transitions, pending cancellation, and generic-plugin compatibility.

**Evidence:** [Phase 03 record](../plans/260929-1346-advisor-workspace-panel/phase-03-bridge-and-reusable-host.md) and [Cycle 2 review](../plans/reports/code-review-260929-2056-phase-03-bridge-and-reusable-host-cycle-2.md). The review records 81 targeted tests and no critical findings; the implementation summary reports 145 passing tests across both repositories.

**Boundary:** Phase 03 completes bridge and reusable-host implementation. Persistent placement, standalone cutover, and paired qualification were downstream at Phase 03 completion and are now recorded under FR-29, FR-32, and FR-33. Production deployment remains subject to operator authorization.

### FR-28: Workspace Advisor viewer scope and request state (Phase 04)

**Status:** Completed 2026-09-29; review approved 9.5/10.

**Requirement:** The shared viewer keeps activity scope separate from Workspace
selection and metric filters, uses trusted Workspace identity for history queries,
and fences asynchronous data commits across scope and authority changes.

**Acceptance:**
- `AppState.activityScope` is `'workspace-project' | 'all'` and defaults to the
  Workspace project. `ActivityScopeControl` is shared by Overview and History;
  it does not change Workspace selection.
- `UiHistoryFilters` has no editable `project_id`. `selectHistoryQuery` derives
  it from the admitted Workspace context and returns no query for missing or
  malformed identity, unavailable/revoked context, absent history permission, or
  All without `history-root` authority.
- For Workspace history, scope/filter changes invalidate the old page, cursor,
  selection, and detail, advance the query revision, and request a summary plus
  first page from the existing snapshot. They do not start a new history refresh.
- App-generated request IDs use a monotonically increasing sequence. Captured
  `contextEpoch` fences response/error/loading commits; authority/context loss
  advances the epoch and clears retained data, bound-source wrappers, and
  candidate reveal before new results are accepted.
- User-triggered Refresh independently requests authorized history, current
  policy, and the evaluation list. Missing Workspace selection makes no provider
  calls. Tab, scope, filter, selection, and timer changes do not auto-refresh.
  Policy/evaluations keep their independent bound sources and grants.
- Phase 04 review reports 28/28 focused tests, clean strict TypeScript checking,
  and a passing V-E3 smoke proving no `history.refresh` on scope/filter/view
  transitions. See the [phase record](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md),
  [review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md),
  and [UI guide](./advisor-plugin-ui.md).

**Boundary:** Phase 04 proves viewer state behavior. Persistent placement was implemented in Phase 05; Phases 06–09 have since completed, including paired candidate qualification under [FR-33](#fr-33-paired-qualification-documentation-and-release-handoff-phase-09). Production deployment remains subject to operator authorization.

### FR-29: Persistent WorkspaceAdvisorHost placement (Phase 05)

**Status:** Implementation Cycle 2 review-approved on 2026-09-29 (9.8/10). This approves placement implementation only; Phase 09 subsequently qualified the paired candidate, while explicit operator release authorization and production deployment remain separate.

**Requirement:** Keep one selected-project Advisor host and frame mounted at Workspace scope while projecting it into the active IDE, Terminal, or compact Workspace placement. Visual hide/show and mode changes must not change authority, re-prepare the session, or start data refreshes.

**Acceptance:**
- `WorkspacePage` mounts one `WorkspaceAdvisorHost` outside shell-mode branches. IDE, Terminal, and compact `AdvisorPanelSlot`s register geometry and activation only; they do not own or reparent an iframe.
- IDE, Terminal, and compact placements use their measured content rectangle and default z-indexes 15, 25, and 35. Terminal reserves its floating resize-grip inset. Measurement follows slot resize, viewport resize/scroll, app zoom, and floating-panel layout changes with coalesced work and effect cleanup; no idle polling.
- A hidden host remains mounted but hidden, pointer-disabled, `inert`, and `aria-hidden`. Hiding returns focus to the launcher when available; Escape and negotiated `activate` intent route to Workspace panel actions.
- No selected project passes null project/target/connection; `use-plugin-host.ts` revokes stale authority and returns `unavailable/no-project` before preparation. Project/profile/owner/authority changes remain revocation boundaries, not placement transitions.
- The G5 Chromium fixture asserts one unchanged iframe DOM node through IDE → Terminal → compact → IDE and hide/reopen. The fixture mocks `PluginHost`; it does not directly assert a live `FrameSession` identifier, viewer snapshot, history-refresh count, or the no-project API-call count. See the [Phase 05 contract](./workspace-advisor-host-contract.md#phase-05-persistent-workspace-panel-placement), [evidence handoff](../plans/reports/docs-manager-260929-2357-phase-05-persistent-workspace-placement.md), and [Cycle 2 review](../plans/reports/code-review-260929-2332-phase-05-cycle-2-workspace-panel-placements.md).

**Boundary:** Phase 05 qualifies persistent placement at the UI implementation boundary. Phases 06–09 subsequently completed, including paired candidate qualification; production deployment remains a separate operator decision.

### FR-30: Compact activity views and accessible tabs (Phase 06)

**Status:** Completed 2026-09-30; Cycle 2 code review approved 10/10.

**Requirement:** Provide compact Overview and History views and accessible
navigation among the four existing views without changing the history API, host
bridge, or manual-refresh lifecycle. Compact layouts preserve information and
actions; they do not redefine the Workspace project or All History authority.

**Acceptance:**
- Preserve `#overview`, `#history`, `#configuration`, and `#evaluations`. Tabs
  expose tablist/tab semantics, selection state, roving keyboard focus, and
  Arrow/Home/End navigation; Escape remains available to the host panel.
- Share the Workspace Project/All History control between Overview and History.
  Explain and disable All when project, root-history authority, or provider is
  unavailable; never expose an independent project picker or infer All without a project.
- Preserve all six Overview rate metrics, latency quantiles and sample counts,
  outcome/missingness/diagnostic limitations; compact cards change composition only.
- Preserve History filters, stable cursor paging, all row fields, Inspect/detail
  access, and loading/changed/missing/error/ready detail states.
- Distinguish empty, loading, unavailable, error, stale-prior-snapshot, and
  incomplete-snapshot states; scope changes must not present prior-scope metrics.
- Tab, scope, filter, detail, and disclosure interactions never invoke history
  refresh. Refresh and Cancel remain explicit controls; narrow containers avoid
  page-level horizontal overflow and keep keyboard focus visible.

**Evidence:** [Phase 06 plan](../plans/260929-1346-advisor-workspace-panel/phase-06-compact-activity-views.md) and [Cycle 2 review](../plans/reports/code-review-260930-0226-phase-06-cycle-2-compact-activity-views.md). Final phase status records 55/55 tests (43 EVCrate viewer and 12 DamHopper browser) plus clean TypeScript checks in both repositories.

**Boundary:** Phase 06 completes the viewer presentation slice. Phase 07 disclosures followed under [FR-31](#fr-31-configuration-and-evaluations-disclosures-phase-07); Phases 08–09 subsequently completed, including paired candidate qualification. Explicit operator approval and production deployment remain separate.


### FR-31: Configuration and Evaluations disclosures (Phase 07)

**Status:** Completed 2026-09-30; Cycle 2 code review approved 9.6/10.

**Requirement:** Keep current owner policy and history-scoped route evidence distinct; make bound-source evaluation descriptors, comparisons, and details inspectable without implicit comparison or candidate-identity reveal.

**Acceptance:**
- Configuration keeps the owner-policy source/status/revision/observed time separate from history-scoped route metrics. Ready policy details use a native disclosure collapsed by default; permission, loading, missing, migration, changed, and error states remain visible.
- Historical route groups show the active History scope. Cards serve widths below 640px, including 180–260px docks; at >=640px a wide table replaces the cards without horizontal page overflow.
- Evaluations identify the History-independent bound source and distinguish descriptor counts from actual group counts. Comparison is explicit and sends no more than the first 32 available descriptor references with their expected revisions.
- Descriptors page 10 per view with page clamping. Inspect explicitly reads one descriptor at its expected revision and shows loading/error/ready feedback plus ready-document metadata.
- Comparable group summaries use case, response, human-score, and automated-score collections. Candidate reveal defaults off; sorted unique IDs across those collections map consistently to Candidate A/B labels. Raw identities, routes, effort, build, and prompt details stay absent from rendered text/attributes and blinded React keys until the separate reveal action; context change/revocation/disconnect clears reveal.
- The selected-group detail region consumes Escape at `window` capture phase so host-panel Escape remains untriggered, then restores mount-time focus on unmount.

**Evidence:** [Phase 07 record](../plans/260929-1346-advisor-workspace-panel/phase-07-bound-source-disclosures.md) and [Cycle 2 review](../plans/reports/code-review-260930-0400-phase-07-cycle-2-disclosures.md). The review reports 13/13 targeted tests, 100/100 related tests, clean TypeScript checking, and a clean UI build.

**Boundary:** At Phase 07 completion, navigation/package cutover and paired qualification remained downstream. Phases 08–09 have since completed; explicit operator release authorization and production deployment remain separate.

### FR-32: Standalone navigation and package cutover (Phase 08)

**Status:** Completed 2026-09-30; review approved 9.8/10; 41/41 tests passed across EVCrate and DamHopper.

**Requirement:** Make `evcrate.advisor` available through Workspace placement only. Remove its standalone navigation and direct-route admission without changing generic plugin hosting or hiding other plugins.

**Acceptance:**
- DamHopper excludes only exact installation ID `evcrate.advisor` from standalone navigation and preserves other plugin IDs, including other `evcrate` publishers.
- `/plugins/evcrate.advisor` returns `PluginUnavailableState reason="not-visible"` before metadata/list, asset, token, or frame preparation; generic `/plugins/:installationId` remains available.
- The generated EVCrate manifest uses `navigation: []` and `hostVersionRange: '>=0.7.0'`, retaining the opaque-srcdoc UI entry and all eight read capabilities.
- Qualification server/client use `workspace_url`/`workspaceUrl` and launch Advisor through the explicit Workspace Activity Bar launcher.
- The deterministic package archive and candidate are regenerated; their SHA-256 identities are recorded in the [changelog](./project-changelog.md).

**Evidence:** [Phase 08 record](../plans/260929-1346-advisor-workspace-panel/phase-08-navigation-and-package-cutover.md) and [review](../plans/reports/code-review-260930-0707-phase-08-standalone-navigation-cutover.md), which records the archive verification, `cargo check`, and 41/41 passing tests.

**Boundary:** At Phase 08 completion, paired qualification, explicit operator approval, and production deployment remained separate. Phase 09 subsequently qualified the candidate; release authorization and production deployment remain an operator decision.

### FR-33: Paired qualification, documentation, and release handoff (Phase 09)

**Status:** Completed 2026-09-30; 11/11 browser qualification scenarios passed, 4 screenshots captured, 49/49 EVCrate UI tests passed, and 13/13 DamHopper browser tests passed.

**Requirement:** Exercise and verify the paired candidate across authenticated runtime, persistent placements, activity scope transitions, and bound-source disclosures without bypass or mock-only substitution.

**Acceptance:**
- Execute consolidated command groups V-E1/E2/E3, V-D1/D2/D3/D4, V-P1 across both checkouts with clean test and type checking results.
- Validate S01–S16 qualification matrix: remote load, frame isolation (sandbox allow-scripts, opaque src, localStorage/cookie/fetch blocked), overview refresh, history list and inspection, configuration disclosure, evaluations tab, protected direct asset access, same-route connection reuse, profile owner switch revocation, and reload fence creation.
- Capture and preserve four clean qualification screenshots: overview, history detail, configuration disclosure, and counsel evaluations.
- Synchronize all affected documentation across EVCrate and DamHopper checkouts and issue paired qualification report and handoff.

**Evidence:** [Phase 09 plan](../plans/260929-1346-advisor-workspace-panel/phase-09-paired-qualification.md) and [Phase 09 qualification report](../plans/260929-1346-advisor-workspace-panel/reports/phase-09-qualification.md).

**Boundary:** Phase 09 qualifies the paired candidate; production rollout, registry publication, and production deployment remain subject to explicit operator release authorization.
