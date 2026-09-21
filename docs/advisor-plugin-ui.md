# DamHopper Advisor Plugin — Embedded UI

**Status:** Phase E03 DONE (completed 2026-09-21; review approved 9.2/10)
**Scope:** Provider-neutral React application, D00 UI bridge client, and opaque-origin package entry
**Authority:** `viewer/src/providers/`, shared viewer state/views, `plugin/ui/`, and `plugin/manifest.json`
**Related:** [Phase E03 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-03-embedded-four-view-ui.md), [review](../plans/reports/code-review-260921-1718-phase-e03-embedded-four-view-ui.md), [validation](../plans/reports/tester-260921-1717-phase-e03-embedded-four-view-ui.md), [system architecture](./system-architecture.md#9-damhopper-advisor-plugin-replacement)

## Purpose and boundary

E03 keeps one application and one four-view surface while separating data acquisition
from presentation. `AdvisorDataProvider` is the only data dependency of `App` and the
views. The standalone adapter keeps the existing local explorer usable until G4;
the embedded adapter uses only the authenticated, transferred `MessagePort` supplied
by the DamHopper host. E03 does not claim joint G2 LAN acceptance, E04 publication,
or standalone retirement.

```text
                    shared App + reducer + four views
                                  |
                       AdvisorDataProvider
                         /                     \
  StandalonePickerProvider                 DamHopperPortProvider
  File System Access API                   bounded MessagePort
         (temporary G4 path)                    |
                                             host bridge -> worker/provider
```

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

`StandalonePickerProvider` is the only module that sees browser handles. It wraps
`HistoryReader`, policy/evaluation readers, and explicit picker actions, then maps
normalized local records to the same history, policy, and evaluation result shapes.
`DamHopperPortProvider` owns the embedded transport and uses the same interface, so
view code does not fork for plugin mode.

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
filters, remote summary/page entries, detail states (`loading`, `ready`, `changed`,
`missing`, `error`), current policy, evaluations, selection, and candidate reveal.
Late refresh/summary/page actions are ignored when generation or frame session no
longer matches. Context changes and revocation clear snapshots, cursors, detail,
policy, evaluations, and selection before new data is accepted. Plugin filters
request a new summary and first page; standalone filters operate on the local
snapshot.

The shared views are:

| View | Observable behavior |
|---|---|
| Overview | Counts, delivery/outcome ratios, latency, missingness, diagnostics, stale/unavailable status, and limitations. |
| History/detail | Fixed `started_at_desc` ordering, 100-row pages, status/outcome filters, bounded paging, and lazy detail drawer with explicit changed/missing states. |
| Configuration | Current account-wide policy with permission/status/revision/observation labels, alongside historical route groups; current policy is not historical evidence. |
| Evaluations | Bound-source list/read/compare, exact comparable digest groups, separate issue/empty states, provenance, and masked candidate details until reveal. |

`data-controls.tsx` hides standalone pickers in embedded mode. `status-banner.tsx`
reports readiness, stale retention, revocation, unsupported capability, scan facts,
and the local diagnostic/privacy boundary. Rendering remains inert text with
semantic tables, labeled tabs/panels/drawers, visible focus, and keyboard controls.

## Embedded package

`plugin/ui/plugin-main.tsx` creates `DamHopperPortProvider` and renders the shared
`App`; `plugin-document.html` is the minimal mount. `plugin/ui/vite.config.ts`
produces an ES2020 IIFE, removes external script/style references, inlines CSS and
JavaScript, writes `plugin/ui/index.html`, and emits no sourcemaps. The current
self-contained document is 328,337 bytes (under the 5 MiB limit).

`plugin/manifest.json` declares:

```json
{"entry":"ui/index.html","mode":"opaque-srcdoc"}
```

and navigation route `/plugins/evcrate.advisor` (`evcrate.advisor.overview`). The
candidate builder conditionally includes `ui/index.html`, adds the UI entrypoint and
navigation to the generated manifest, and records its size/SHA-256/mode in the
64-entry inventory. The embedded document is a package member, not a root release
asset.

## Security and acceptance boundary

The focused bridge/state suites cover handshake, request/response, cancellation,
late-message suppression, context revocation, stale/detail transitions, and provider
metadata. Four-view/package checks verify the self-contained document, manifest,
navigation, and inventory. Security/accessibility checks reject external assets,
`eval`/`Function`, fetch/WebSocket/XHR/EventSource, filesystem pickers, `<base>`, and
external form actions. These are static/package checks; host sandbox, CSP, hash
policy, authenticated byte delivery, and real LAN behavior remain D04/G2 gates.

Validation recorded for E03: **68/68 tests passed** (23 focused UI tests, 14 viewer
browser/build tests, 22 worker tests, and 9 plugin contract tests); the review found
zero critical blockers. Standalone viewer operation remains required until G4.

## Source map

- Providers: `viewer/src/providers/{advisor-data-provider,bridge-contract,dam-hopper-port-provider,standalone-picker-provider,standalone-data-mappers}.ts`
- State/app: `viewer/src/{app,app-actions,app-state,app-state-reducer,app-state-selectors,app-state-types}.ts*`
- Views/components: `viewer/src/views/{overview-view,history-view,history-detail,configuration-view,evaluations-view}.tsx`, `viewer/src/components/{data-controls,status-banner}.tsx`
- Embedded entry/build: `plugin/ui/{plugin-document.html,plugin-main.tsx,vite.config.ts}`, `scripts/build-advisor-plugin-candidate.mjs`
- Focused suites: `tests/plugin/{ui-bridge,ui-state,ui-four-views,ui-security-accessibility}.*`

## Unresolved questions

- D04 must confirm host-enforced sandbox/CSP, authenticated inert byte delivery, and
  navigation/direct-load behavior during joint G2 LAN acceptance.
- E04 must define package assembly and lifecycle integration; E03 does not authorize
  publication or standalone cutover.
