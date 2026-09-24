# DamHopper Advisor Plugin — Embedded UI

**Status:** Phase E03 implementation completed 2026-09-21 (review 9.2/10); this guide preserves its historical architecture. All-project advisor history Phases 00–05 completed 2026-09-24 (6/6, 100%); its paired release is qualified.
**Scope:** Provider-neutral React application, D00 UI bridge client, and opaque-origin package entry
**Authority:** `viewer/src/providers/`, shared viewer state/views, `plugin/ui/`, and `plugin/manifest.json`
**Related:** [Phase E03 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-03-embedded-four-view-ui.md), [Phase 04 all-project history plan](../plans/260924-1055-all-project-advisor-history/phase-04-project-filter-ui.md), [Phase 05 qualification](../plans/260924-1055-all-project-advisor-history/phase-05-cross-repo-qualification.md), [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md), [E03 review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md), [E03 validation](../plans/reports/tester-260921-1717-phase-e03-embedded-four-view-ui.md), [system architecture](./system-architecture.md#9-damhopper-advisor-plugin-replacement)

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
source was subsequently removed from this repository. The cutover is an implemented
source change, not G4 acceptance: the required external Linux owner-runner and
separate-LAN evidence/sign-off are not present in this workspace.

## Provider contract

`viewer/src/providers/advisor-data-provider.ts` exports the immutable context
descriptor (`kind`, safe label, capabilities, frame session, activation generation,
availability, and source flags), lifecycle subscription, and the eight E00 data
operations:

- `refreshHistory`, `getHistorySummary`, `getHistoryPage`, `getHistoryDetail`;
- `readCurrentPolicy`, `listEvaluations`, `readEvaluation`, `compareEvaluations`;
- `cancel(requestId)` and optional `destroy()`.

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

`bridge-contract.ts` pins `UI_BRIDGE_VERSION` to `1.0.0` and validates the eight
bridge envelope types: `host.bootstrap`, `frame.portAck`, `frame.ready`, `request`,
`cancel`, `response`, `context.revoked`, and `availability.changed`.

The port provider:

1. waits for a validated host bootstrap containing plugin ID, capabilities, nonce,
   frame session, and activation generation;
2. binds the transferred port once, removes the window listener, and sends the exact
   nonce in `frame.portAck`;
3. dispatches only after `frame.ready`; every request carries session, bridge version,
   generation, request ID, operation, and parameters;
4. ignores responses for another session/generation, forwards cancellation by request
   ID, and rejects pending work on revocation or port errors;
5. publishes availability/context events to the reducer and closes the port on
   teardown.

Opaque-origin `origin: null` is not treated as identity. Host-owned WindowProxy,
nonce acknowledgement, transferred-port binding, and generation checks are the
identity boundary. Host authorization remains required for every operation.

## State and four views

`app-state-types.ts`, `app-actions.ts`, `app-state-reducer.ts`,
`app-state-selectors.ts`, and `app-state.ts` form one immutable `useReducer` model.
It tracks provider metadata, frame/session generation, snapshot IDs, canonical
filters, same-snapshot project inventory, remote summary/page entries, detail states
(`loading`, `ready`, `changed`, `missing`, `error`), current policy, evaluations,
selection, and candidate reveal. Late refresh/summary/page actions are ignored when
generation or frame session no longer matches. Context changes and revocation clear
snapshots, inventory, cursors, detail, policy, evaluations, and selection before
new data is accepted. History project/metric filters request a server-filtered
summary and first page, clearing old page/detail state; they do not fetch or
aggregate all history in the browser.

The shared views are:

| View | Observable behavior |
|---|---|
| Overview | Counts, delivery/outcome ratios, latency, missingness, diagnostics, stale/unavailable status, and limitations. |
| History/detail | Owner-root history starts at All Projects with inventory-backed counts/labels and server-filtered 100-row pages; single-project contexts stay locked; detail exposes project identity and changed/missing states. |
| Configuration | Current account-wide owner policy and permission/status/revision labels are not filtered by History project or presented as historical route evidence; historical route groups follow the selected History scope. |
| Evaluations | Bound evaluation source, explicitly not filtered by History project; list/read/compare, exact digest groups, provenance, separate issue/empty states, candidate masking/reveal. |

## Account-wide history and identity

In owner-root mode the selector starts at **All Projects** (`project_id: null`);
choosing a project sends its canonical ID with both summary and page requests.
The bounded inventory belongs to that snapshot and supplies per-project accepted
counts and display names; the All Projects count uses the unfiltered snapshot
total, not the currently loaded page. Overview shows the same server-filtered
summary as History. A project-scoped context shows its current project in a
disabled selector and cannot be widened.

Project IDs remain identity; only validated inventory labels are displayed, with
an abbreviated ID when a label is missing. The History table and detail retain
project provenance. Changing projects clears cached rows, selected detail, and
cursor; request-sequence plus frame/session-generation fences discard late
responses. These controls filter only already-authorized history and do not
change host/runner authorization.

Configuration continues to show current owner policy; Evaluations show their
bound source, and both explicitly say they are not filtered by History project.
The companion DamHopper host's `packages/ui/src/plugins/use-plugin-navigation.ts`
and `packages/ui/src/components/PluginHostPage.tsx` use plugin ID/publisher
metadata: only EVCrate metadata receives the “EVCrate Advisor” label; other
plugins retain their own identity rather than inheriting an EVCrate label.

`data-controls.tsx` exposes provider-neutral refresh/cancel controls and the current
source label. `status-banner.tsx` reports readiness, stale retention, revocation,
unsupported capability, scan facts, and the local diagnostic/privacy boundary.
Rendering remains inert text with semantic tables, labeled tabs/panels/drawers,
visible focus, and keyboard controls.

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
`ui/index.html`, added the UI entrypoint/navigation to the generated manifest, and
recorded size/SHA-256/mode in its 64-entry inventory. This is dated E03 package
evidence only; it does not verify current release assets or G4.

## Security and acceptance boundary

The focused bridge/state suites cover handshake, request/response, cancellation,
late-message suppression, context revocation, stale/detail transitions, and provider
metadata. Four-view/package checks verify the self-contained document, manifest,
navigation, and inventory. Security/accessibility checks reject external assets,
`eval`/`Function`, fetch/WebSocket/XHR/EventSource, filesystem pickers, `<base>`, and
external form actions. These are static/package checks; host sandbox, CSP, hash
policy, authenticated byte delivery, and real LAN behavior remain D04/G2 gates.

E03 validation recorded on 2026-09-21: **68/68 tests passed** (23 focused UI tests,
14 viewer browser/build tests, 22 worker tests, and 9 plugin contract tests); the
review found zero critical blockers. These are historical repository/package checks,
not G2/G4 qualification. G4 remains unverified, and standalone retirement is not
release-authorized.

## Source map

- Providers: `viewer/src/providers/{advisor-data-provider,bridge-contract,dam-hopper-port-provider}.ts`
- State/app: `viewer/src/{app,app-actions,app-state,app-state-reducer,app-state-selectors,app-state-types}.ts*`
- Views/components: `viewer/src/views/{overview-view,history-view,history-detail,configuration-view,evaluations-view}.tsx`, `viewer/src/components/{data-controls,status-banner}.tsx`
- Embedded entry/build: `plugin/ui/{plugin-document.html,plugin-main.tsx,vite.config.ts}`, `scripts/build-advisor-plugin-candidate.mjs`

## Unresolved questions

- D04 must confirm host-enforced sandbox/CSP, authenticated inert byte delivery, and
  navigation/direct-load behavior during joint G2 LAN acceptance.
- The external Linux owner-runner and separate-LAN evidence plus joint sign-off
  required for G4 are not available in this workspace. The source cutover does not
  establish G4 acceptance or authorize standalone retirement.
