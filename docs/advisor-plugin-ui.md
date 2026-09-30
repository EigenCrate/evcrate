# DamHopper Advisor Plugin — Embedded UI

**Status:** Original embedded UI Phase E03 completed 2026-09-21 (review 9.2/10); all-project advisor history Phases 00–05 completed 2026-09-24 (6/6, 100%; paired release qualified). Workspace Advisor Phases 00–08 are implemented (9/10; Phase 08 navigation/package cutover review approved 9.8/10); Phase 09 paired qualification, rollout, and production deployment remain open.
**Scope:** Provider-neutral React application, D00 UI bridge client, and opaque-origin package entry
**Authority:** `viewer/src/providers/`, shared viewer state/views, `plugin/ui/`, and `plugin/manifest.json`
**Related:** [Phase E03 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-03-embedded-four-view-ui.md), [Phase 04 all-project history plan](../plans/260924-1055-all-project-advisor-history/phase-04-project-filter-ui.md), [Phase 05 qualification](../plans/260924-1055-all-project-advisor-history/phase-05-cross-repo-qualification.md), [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md), [E03 review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md), [E03 validation](../plans/reports/tester-260921-1717-phase-e03-embedded-four-view-ui.md), [Workspace Advisor host contract](./workspace-advisor-host-contract.md), [system architecture](./system-architecture.md#9-damhopper-advisor-plugin-replacement)
**Phase 04 evidence:** [Implementation record](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md) · [Review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md).

**Phase 05 placement evidence:** [Implementation record](../plans/260929-1346-advisor-workspace-panel/phase-05-workspace-panel-placement.md) · [Cycle 2 review](../plans/reports/code-review-260929-2332-phase-05-cycle-2-workspace-panel-placements.md) · [Evidence handoff](../plans/reports/docs-manager-260929-2357-phase-05-persistent-workspace-placement.md). G5 directly asserts iframe DOM identity with a mocked `PluginHost`; internal FrameSession/snapshot continuity is not measured by that fixture.

**Phase 07 disclosure evidence:** [Phase 07 record](../plans/260929-1346-advisor-workspace-panel/phase-07-bound-source-disclosures.md) · [Cycle 2 review](../plans/reports/code-review-260930-0400-phase-07-cycle-2-disclosures.md) · [UI design guidelines](./design-guidelines.md#accessible-component-specifications).

**Phase 08 navigation/package evidence:** [Implementation record](../plans/260929-1346-advisor-workspace-panel/phase-08-navigation-and-package-cutover.md) · [Review](../plans/reports/code-review-260930-0707-phase-08-standalone-navigation-cutover.md) (9.8/10; 41/41 tests across EVCrate and DamHopper).

## Purpose and boundary

E03 kept one application and one four-view surface while separating data acquisition
from presentation. `AdvisorDataProvider` is the only data dependency of `App` and the
views. The current plugin path uses the authenticated, transferred `MessagePort`
supplied by the DamHopper host through `DamHopperPortProvider`.

```text
                    shared App + reducer + four views
                                  |
                       AdvisorDataProvider
                                  |
                     DamHopperPortProvider
                      bounded MessagePort
                                  |
                       host bridge -> worker/provider
```

At E03 completion, the architecture also included a local File System Access
adapter (`StandalonePickerProvider`) for the standalone viewer. That picker/reader
source was subsequently removed. Workspace Advisor Phase 08 also completed the
standalone navigation and direct-route cutover; joint G4 qualification/sign-off
still requires external Linux owner-runner and separate-LAN evidence.

## Provider contract

`viewer/src/providers/advisor-data-provider.ts` exports the immutable context
descriptor (`kind`, safe label, capabilities, frame session, activation generation,
availability, source flags, and optional trusted `workspaceContext`), lifecycle
subscription, and the eight E00 data operations:

- `refreshHistory`, `getHistorySummary`, `getHistoryPage`, `getHistoryDetail`;
- `readCurrentPolicy`, `listEvaluations`, `readEvaluation`, `compareEvaluations`;
- `cancel(requestId)` and optional `destroy()`;
- a `workspace-project-changed` provider event and optional `sendUiIntent(intent)`
  for the host's `activate` / `dismiss` UI intents.

The contract returns E00 domain values and does not expose actor tokens, cookies,
absolute paths, runner sockets, source bindings, or arbitrary network functions.
The embedded descriptor label uses an explicit custom label, then the host
bootstrap plugin ID, then `DamHopper Advisor`; it is not account or project identity.

At E03 completion, `StandalonePickerProvider` wrapped `HistoryReader` and local
policy/evaluation readers behind the shared contract. Those modules are historical
only and no longer exist in the repository. `DamHopperPortProvider` owns the current
embedded transport and uses the same interface, so view code does not fork for plugin
mode.

## Bridge and lifecycle

`bridge-contract.ts` pins the UI bridge protocol to `1.0.0` and recognizes 11 envelope
types: `host.bootstrap`, `frame.ready`, `frame.portAck`, `request`, `cancel`,
`response`, `context.revoked`, `availability.changed`, `host.contextReady`,
`host.workspaceChanged`, and `frame.uiIntent`. The Workspace Advisor negotiates the
`workspace-advisor-v1` extension; generic plugins retain the base handshake.

The port provider:

1. waits for a validated host bootstrap containing plugin ID, capabilities, nonce,
   frame session, activation generation, and any negotiated extension/context;
2. binds the transferred port once and acknowledges the exact nonce in
   `frame.portAck`;
3. for the Advisor extension, stays unavailable and queues data requests until
   `host.contextReady` confirms that the host opened the authorized context. Generic
   plugins retain the base ready-after-ack path;
4. binds every request to bridge version, frame session, generation, request ID,
   operation, and payload; the host accepts only operations in its effective allowlist;
5. emits `workspace-project-changed` only for a higher revision with the same
   `authorityKey`. A change to authority requires host revocation and a new session;
6. sends `frame.uiIntent` only for `activate` or `dismiss`; cancellation, revocation,
   and port errors reject queued/pending requests, and teardown closes the port.

Opaque-origin `origin: null` is not treated as identity. Host-owned WindowProxy,
nonce acknowledgement, transferred-port binding, and generation checks are the
identity boundary. Host authorization remains required for every operation.

## State and four views

`app-state-types.ts`, `app-actions.ts`, `app-state-reducer.ts`,
`app-state-selectors.ts`, and `app-state.ts` form one immutable `useReducer` model.
`AppState.activityScope` is separate from editable filters and starts at
`'workspace-project'`; the available values are `'workspace-project'` and `'all'`.
`UiHistoryFilters` contains task-run and metric filters only; it has no editable
`project_id`. `selectHistoryQuery` evaluates the trusted Workspace context and
returns an explicit unavailable reason instead of guessing identity or widening scope.

The selector fails closed for a missing/unadmitted project, malformed project ID,
revoked/unavailable provider, missing history permission, unavailable history
scope, or All without `history-root` authority. It returns no query and a reason.
For Workspace history, scope/filter changes clear page, cursor, selection, and
detail, increment `historyQueryRevision`, then request summary and first page
from the same snapshot; they do not refresh it.

App creates request IDs from a prefix, timestamp, and per-instance increasing
sequence. Provider identity and `contextEpoch` fence responses, errors, and
loading cleanup; the reducer also checks epoch and, for history, frame session,
generation, and query revision. Context change, revocation, disconnect, or
incompatibility advances the epoch and clears old-domain data and candidate reveal.

Refresh is manual. It starts authorized history, policy, and evaluation-list
requests independently; failure in one does not block another. No provider
refresh runs automatically on mount, tab change, scope/filter change, selection
change, or timer. The history permission gates history only; policy/evaluations
use their independent host grants and bound sources. Without a selected Workspace
project, Refresh makes no provider calls.

The shared views are:

| View | Observable behavior |
|---|---|
| Overview | Counts, rates, missingness, latency, and methodological limitations; shares the Workspace activity-scope control with History. |
| History/detail | Shared scope control, task/metric filters, inventory-backed labels/counts, server-filtered pages, lazy detail, and changed/missing states. |
| Configuration | Current owner policy is independent of History scope; a native disclosure keeps full routing policy/runtime parameters collapsed. History-scoped route metrics use cards below 640px (including 180–260px docks) and a table at >=640px. |
| Evaluations | Bound evaluation source stays independent from History scope. Header separates descriptor/group counts; descriptors page 10 per view, Inspect shows an inline status/metadata card, and explicit Compare sends at most the first 32 descriptors. Group details use deterministic Candidate A/B labels while blinded; drawer Escape closes only the drawer and focus returns on unmount. |


## Workspace activity scope and identity

`ActivityScopeControl` is shared by Overview and History. It presents the host-selected
Workspace project or All History; it is not a project picker and never changes the
Workspace selection. The initial state is `'workspace-project'`. The selected
project ID comes from the trusted `AdvisorWorkspaceContext`, not a form field.

- `'workspace-project'` sends the selected canonical ID as `project_id`.
- `'all'` sends `project_id: null` and is usable only with root-history authority.
- Root All includes valid-ID retained activity without requiring Workspace
  registration or display-label metadata; labels never supply identity.
- All is unavailable without an admitted project, root-history scope, or an
  available provider; the query selector additionally checks the history grant.
- Project IDs are identity. Inventory labels are presentation only, with an
  abbreviated ID when a label is missing. The table and detail retain provenance.

For the Workspace provider, Overview and History use the same server-filtered summary.
Scope and filter changes reuse the current snapshot and request its summary/first page;
a new history scan requires explicit Refresh. Query revisions discard older replies.
These controls filter already-authorized history and do not change host authorization.

Refresh independently requests authorized history, current policy, and the
evaluation list. Policy and evaluations remain bound to their separately granted
sources and are not filtered by History scope. Changing tabs, scope, or filters
does not auto-refresh any domain. No selected Workspace project means no provider
calls, because the selected project identifies the profile.

The component is `viewer/src/components/activity-scope-control.tsx`; it shows the
selected project label, disabled states, and a reason when All History is unavailable.
`data-controls.tsx` exposes provider-neutral manual Refresh/Cancel controls and the
current source label. `status-banner.tsx` reports readiness, stale retention,
revocation, unsupported capability, scan facts, and the local diagnostic/privacy
boundary. Rendering remains inert text with semantic tables, labeled
tabs/panels/drawers, visible focus, and keyboard controls.


## Embedded package

`plugin/ui/plugin-main.tsx` creates `DamHopperPortProvider` and renders the shared
`App`; `plugin-document.html` is the minimal mount. `plugin/ui/vite.config.ts`
produces an ES2020 IIFE, removes external script/style references, inlines CSS and
JavaScript, writes `plugin/ui/index.html`, and emits no sourcemaps. E03's 2026-09-21
validation recorded a 328,337-byte document (under 5 MiB); this is historical size
evidence, not a current rebuild or release-asset verification.

`plugin/manifest.json` declares:

```json
{"entry":"ui/index.html","mode":"opaque-srcdoc"}
```

At the E03 package build, the candidate builder conditionally included
`ui/index.html`, added standalone UI navigation to the generated manifest, and
recorded size/SHA-256/mode in its 64-entry inventory. This is historical E03 evidence.
The current Phase 08 package retains the opaque-srcdoc UI entry but sets
`navigation: []` and `hostVersionRange: ">=0.7.0"`. DamHopper launches Advisor in
Workspace; the retired `/plugins/evcrate.advisor` route returns `not-visible` before
plugin list, asset, token, or frame preparation. Generic plugin hosting remains.

## Security and acceptance boundary

Focused bridge/state suites cover handshake, request/response, cancellation,
late-message suppression, context revocation, stale/detail transitions, and provider
metadata. Package checks verify the self-contained document, manifest, inventory,
and empty standalone-navigation contract. DamHopper tests confirm the retired Advisor
route fails closed before plugin list/asset/frame preparation while generic routes
remain. Security/accessibility checks reject external assets, `eval`/`Function`,
network clients, filesystem pickers, `<base>`, and external form actions. These static
and repository checks do not replace D04/G2 LAN host sandbox, CSP, or asset gates.

E03 validation recorded on 2026-09-21: **68/68 tests passed** (23 focused UI tests,
14 viewer browser/build tests, 22 worker tests, and 9 plugin contract tests); the
review found zero critical blockers. This is historical repository/package evidence,
not G2/G4 qualification. Phase 08 has implemented the standalone cutover; joint G4
qualification/sign-off remains unverified, and source cutover does not authorize
production release.
Workspace Advisor Phase 04 review records **28/28 targeted tests**, strict
TypeScript checking with zero errors, and a passing V-E3 call-count smoke. The
smoke confirms view/scope/filter changes do not call `history.refresh`; see the
[phase record](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md)
and [review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md).

## Source map

- Providers: `viewer/src/providers/{advisor-data-provider,bridge-contract,dam-hopper-port-provider}.ts`
- State/app: `viewer/src/{app,app-actions,app-state,app-state-reducer,app-state-selectors,app-state-types}.ts*`
- Views/components: `viewer/src/views/{overview-view,history-view,history-detail,configuration-view,evaluations-view}.tsx`, `viewer/src/components/{activity-scope-control,data-controls,status-banner}.tsx`
- Embedded entry/build: `plugin/ui/{plugin-document.html,plugin-main.tsx,vite.config.ts}`, `scripts/build-advisor-plugin-candidate.mjs`
- Phase 04 state regressions: `tests/plugin/ui-state.test.mjs` and
  `tests/viewer/phase-04-viewer-scope-and-requests.test.mjs`.

## Unresolved questions

- D04 must confirm host-enforced sandbox/CSP and authenticated inert byte delivery;
  joint G2 LAN acceptance must also confirm generic-plugin navigation/direct-load
  behavior. The Advisor-specific retired route is deliberately fail-closed.
- The external Linux owner-runner and separate-LAN evidence plus joint sign-off
  required for G4 are not available. The Phase 08 source/package cutover does not
  establish joint G4 qualification or production release authorization.
