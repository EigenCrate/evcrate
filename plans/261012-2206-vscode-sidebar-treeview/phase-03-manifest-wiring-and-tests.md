# Phase 03 — Manifest wiring, targeted commands and tests

Priority P2 · Status completed — DONE (100%; 2026-10-12) · Effort 4h · Wave 2, sequential; depends on both Wave 1 terminal handoffs
Completion evidence (2026-10-12): final VSIX SHA-256 `033f0b54466af9ba0ea4828c692cb7538bfbc14ba4c6389b7b2b236d93f4ff5a`; Companion `buildIdentity` `3285fa1e52d6f500095506b3c5b007828cac7646ed27e5aad3c52491aa58fdbe`; integrated tests 163/163 passed.

## Context and ownership
- [Overview / revised matrix](plan.md); [media contract](phase-01-vsix-media-packaging.md); [provider contract](phase-02-ambient-types-and-sidebar-provider.md).
- Modify only `extensions/vscode-model-bindings/{package.json,src/extension.ts,src/refresh-controller.ts,src/command-registration.ts,src/configuration-commands.ts}` and `tests/vscode-companion/contracts.test.mjs`.
- Create only `extensions/vscode-model-bindings/src/sidebar-snapshot.ts`, `tests/vscode-companion/sidebar-tree-provider.test.mjs`, and `tests/vscode-companion/sidebar-commands-and-packaging.test.mjs`; no deletions.
- Read existing configuration and refresh tests/harness, packaging regression tests, and `scripts/release/runtime-closure.cjs`; do not edit them, Phase 01/02 files, or generated outputs.

## Integration architecture
Committed refresh report -> revision-checked capture of scoped bindings/catalog -> cached `SidebarSnapshot` -> provider `refresh()` -> native TreeView. Initial snapshot is explicitly pending; in-flight reads retain the last committed snapshot. Newer settings than the report's inputs render pending, not applied. Tree clicks enter the existing command/scope/CAS pipeline with a validated optional target, never bypass it.

## Completed implementation
1. After both Wave 1 handoffs, consume their exact export/API contracts. Resolve any discrepancy with the owning writer before editing; do not modify provider, ambient types, icon, or media scripts yourself.
2. Add `contributes.viewsContainers.activitybar` entry `{ id: 'evcrate-sidebar', title: 'EVCrate', icon: 'media/evcrate-icon.svg' }`. Add `contributes.views['evcrate-sidebar']` entry `{ id: 'evcrate.modelBindingsView', name: 'Model Bindings' }`. Preserve existing five command contributions, capabilities, host tuple, extensionKind, activationEvents, and package/version parity.
3. Add exactly four `contributes.menus['view/title']` entries scoped by `when: 'view == evcrate.modelBindingsView'`: `evcrate.selectInstallation`, `evcrate.configureAgentModels`, `evcrate.clearModelBindings`, `evcrate.showModelBindings` (labeled as Diagnostics, never disguised as a Refresh action). Use stable group/order; use existing/native theme icons if placing entries in `navigation`, not new media files. Title actions have no preselected arguments and use existing interactive behavior.
4. Add final optional typed arguments to handlers: `handleConfigureAgentModels(...existingArgs, preselectedTier?: CanonicalModelTier | 'all')` and `handleConfigureActorModel(...existingArgs, preselectedActorId?: string)`. No-argument callers remain valid. With a target, skip only the tier/actor target picker; preserve scope, model, override-kind, cancellation, catalog subscription/requery, root-change check, CAS save, and refresh flow.
5. In `command-registration.ts`, consume the first `unknown` callback argument. Only `undefined` means normal Command Palette flow. Narrow tier by `typeof` plus exact allowed literals (`opus`, `sonnet`, `haiku`, `all`); actor by `typeof`, existing `ACTOR_ID_PATTERN`, and 64-character bound. Reject null/objects/unknown tier/malformed actor without writes or silently falling back to broader selection. Do not use inline unchecked casts.
6. Actor handler validates preselected actor against `getAvailableActorIds(getPluginFsPath())`. Capture intended installation/root identity before async pickers; before saving, recheck intended installation identity and actor membership, retaining existing root-scoped guard. A removed actor or changed installation aborts with no mutation, including user-default actor writes. Palette-selected actors receive the same stale-inventory protection. Tier `all` still writes exactly three tier selections atomically, retaining actor overrides.
7. Add `readonly onDidCompleteRefresh?: () => void` to `RefreshControllerOptions`. Capture prior `lastDiagnosticsReport` before `executeRefreshPass`; in the existing current-revision/non-disposed/activation-epoch commit branch, notify only when report identity changed, wrapped in a guarded `try { this._options.onDidCompleteRefresh?.(); } catch (err: unknown) { this._options.onErrorMessage?.(\`EVCrate: Sidebar callback failed: \${err instanceof Error ? err.message : String(err)}\`); }` so a callback exception is logged and never fails a committed pass or strands refresh waiters.
8. In `sidebar-snapshot.ts` and `extension.ts`, create provider and initial snapshot (`report`/bindings/catalog null, `settingsPending: true`) before startup refresh. Completion callback captures the committed `report` and reads scoped bindings only when `report.diagnostics.authority === 'local-file'` and `controller.currentRootIdentity === report.diagnostics.rootIdentity`. Require `userRes.ok && rootRes.ok` (revision zero is allowed only for a validated `ok: true` result with `bindings === null`, never for invalid/unsupported reads), `(rootBindings?.revision ?? 0) === report.rootBindingRevision`, `(userBindings?.revision ?? 0) === report.userBindingRevision`, and `(catalog === null ? report.diagnostics.catalogRevision === 0 : catalog.revision === report.diagnostics.catalogRevision)`. If a revision/root/scope mismatch is detected, set `settingsPending: true` and omit mismatched settings; allow at most one automatic follow-up `requestRefresh({ reason: 'bindings-updated' })` per mismatch streak (resetting the counter once a coherent snapshot commits) so pending settings reconcile without an unbounded retry loop.
9. Register `vscode.window.registerTreeDataProvider('evcrate.modelBindingsView', sidebarProvider)` before startup request. Add registration and provider disposables to context subscriptions. Ensure controller shutdown precedes provider disposal, callback cannot emit after deactivation, and reactivation replaces rather than leaks prior provider/emitter. Preserve exported diagnostics/refresh APIs and existing command/catalog/trust/workspace listeners.
10. Add table-driven behavior tests in the new sidebar test file, using existing Node test/module interception patterns or injected emitter seam. Exercise actual provider/controller/command handlers; stubs simulate host APIs only. Include a bindings-change-during-catalog-await case: committed actors retain report truth while tier settings show pending until a matching commit. Keep all code `<200 LOC` without compressed formatting. If existing reusable fixtures cannot fit full coverage, obtain parent authorization for explicitly Phase-03-owned split test/helper paths; do not reduce cases or edit shared harness without ownership.
11. Extend the existing manifest parity test in `contracts.test.mjs` with exact container/view/menu IDs and source icon availability/reference. Preserve current five-command and activation expectations. Keep this 191-line baseline under 200; place expanded provider/media/dispatch assertions in the new owned test file, not here.
The parent completed generated build integration, final validation/review, and feature status documentation on 2026-10-12. Verification results and the live-host qualification boundary are recorded below.

## Required test cases / measurable acceptance
| Area | Observable result |
|---|---|
| Tree topology | Exactly three roots, stable IDs, required tier order, canonical `Agents (17)`, dynamic noncanonical count, leaves have no children |
| Actor truth | Exact effective selector/source badges; inherit and withheld visible; removed stored IDs filtered, null-tier inherit retained; pending/no-root/remote/empty states distinct |
| Commands | Root command; `[opus]`, `[sonnet]`, `[haiku]`, `[all]`; actor `[actorId]`; preselected target bypasses only target picker |
| Palette compatibility | Undefined argument keeps existing scope -> tier/actor -> remaining picker order; cancellation causes no write/refresh |
| Argument safety | Null/object/bad tier/overlong or malformed actor/absent manifest actor rejected, zero writes; no casts substituting validation |
| Stale selection | Root/installation changed or actor removed during awaited picker aborts before root/user write; binding CAS remains intact |
| All tiers | Preselected `all` commits opus/sonnet/haiku together and preserves overrides; one successful save invokes refresh |
| Provider events | Explicit refresh emits one full-tree event; getters none; updated committed snapshot reflected after event; disposal stops events |
| Controller integration | New report on success/withdrawal/unchanged inventory fires once; retry-only retained report, stale/superseded/disposed passes fire none; retry's eventual committed result fires once |
| Registration | Correct view ID, registration before startup pass, provider/controller/registration disposed without emissions/leaks on deactivate/reactivate |
| Asset parity | Source and embedded package reference icon; VSIX icon bytes equal source, SVG XML default exists, receipt tracks all media/helper, required icon missing rejected |
| ZIP/freshness | Safe flat SVG accepted; nested/unsafe/unexpected/duplicate/corrupt entries rejected; unrecorded/modified/deleted SVG rejected in checkout; packed mode needs no source media |

Integrated tests use existing diagnostics builders/catalog/store helpers for realistic snapshots and inspect generated VSIX entries, descriptor, and receipt. Media mutation tests use isolated temporary checkout copies or helper fixtures, never mutate real project inputs during concurrent tests; packaging regressions stay in the parent gate.
## Parent validation gates (completed 2026-10-12)
1. Final VSIX, descriptor, and receipt produced with artifact identities recorded in the completion evidence above.
2. Companion, VSIX distribution, installed-runtime, and VS Code adapter suites — **163/163 passed**.
3. `check:vscode-companion` in development-checkout and packed-package modes — passed.
4. `validateVscodeCompanionClosure` — passed; 28 JavaScript files checked.
5. `distribute:check` — passed with `status: "ok"`.
6. Code review scored 9.4/10 with 0 critical issues; one warning and one DRY suggestion were fixed before final rebuild.
7. Live-host UX qualification remains separate and unclaimed; the broader runtime-model-bindings plan tracks its own host-dependent gates.

Results above are transcribed from the supplied final verification summary; no checks were rerun during this documentation update.

## Risks / side effects
Refresh returns `false` for unchanged inventory as well as failures; tree updates use committed report identity, not boolean success. Lock contention retains report and schedules another revision; report-identity notification avoids announcing stale state. Snapshot capture uses committed root and supported authority. Stable SVG packaging does not alter JS closure scanning or outer release assets.

## Completion and unresolved questions
Phase 03 is DONE (100%) on 2026-10-12. No implementation dispatch gate remains open. Live VS Code GUI/UX qualification is separate, host-dependent, and not claimed by this plan.

