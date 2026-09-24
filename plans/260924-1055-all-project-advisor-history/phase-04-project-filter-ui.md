# Phase 04 — Account-wide project selector and honest UI identity

## Context links
[Plan](./plan.md) · [Phase 01 contract](./phase-01-cross-project-contract.md) · [UI guide](../../docs/advisor-plugin-ui.md) · [source review](./reports/summary-review.md) · [validation](../reports/phase04testerfinal-260924-1842-account-wide-project-selector-honest-ui-identity.md) · [final review](../reports/code-review-260924-2004-phase-04-project-filter-ui-re-review.md). Depends on Phases 01–03 paired contract/worker.

## Overview
2026-09-24; priority P1; estimate 4h; **DONE** (2026-09-24). Review approved **9.8/10**; **188/188 tests passed** (0 failed, 0 skipped); implementation and review remediation complete. The iframe remains provider-only; no HOME, file picker or generic network access.

## Key Insights
`viewer/src/app-state-types.ts:50-53` already reserves `project_id`; `app-state-selectors.ts:69-82` drops it from domain query; `app.tsx:110-181` fetches summary/page using query without project ID. `history-view.tsx:80-137` lacks project selector, `:145-189` has no project column and uses consultation ID as row key. `dam-hopper-port-provider.ts:49-59` hardcodes `evcrate` label. Current history detail response guard omits cautions/checks-only (`history-detail.tsx:206-251`). Host navigation labels every long ID `EVCrate Advisor` (`use-plugin-navigation.ts:91-99`).

## Requirements
History shows `Project: [All Projects (total) ▼]` by default for the installed owner-root source; every authenticated account has this view. Projects show bounded EVCrate-persisted labels, approved bound names, or an abbreviated ID when unknown, plus accepted count. One-project contexts show that project only. Add project ID/name per row and detail; Overview follows History filter. Reset cursor/page/detail on changes; fence late replies by sequence, frame and scope generation. Show zero/incomplete/revoked states honestly. Configuration stays available only under its own permission, visibly labeled “Current owner policy — not filtered by History project”; Evaluations shows its actual bound corpus/source with the same scope disclaimer. Neither silently aggregates. Resolve source-review residuals #2/#3/#5 and test no-subtle SHA fallback #6.

## Architecture
Provider descriptor/context supplies trusted display scope metadata (versioned bridge), never an authorization path. App query forwards `project_id` to backend for both summary/page; inventory is bound to snapshot, not computed from current page. Keep Overview and History on the same selected query/summary. On project/context switch clear selection and cached rows immediately; no stale previous-project details. Host navigation should use trusted manifest title/publisher identity with neutral fallback; plugin UI label from actual context/scope. Render advisor result section if any of recommendation/rationale/must-fix/cautions/success-checks present.

## Related code files
- **EVCrate modify** `viewer/src/{app.tsx,app-state-types.ts,app-state-reducer.ts,app-state-selectors.ts,app-actions.ts}`, `viewer/src/views/{history-view.tsx,history-detail.tsx,overview-view.tsx,configuration-view.tsx,evaluations-view.tsx}`, `viewer/src/providers/{advisor-data-provider.ts,bridge-contract.ts,dam-hopper-port-provider.ts}`, `viewer/src/styles.css` only where necessary; `tests/viewer/` behavioral tests.
- **Host modify** `packages/ui/src/plugins/use-plugin-navigation.ts`, `packages/ui/src/components/PluginHostPage.tsx`, `packages/ui/src/plugins/plugin-document.test.ts` and existing navigation tests. Frozen bridge contract/fixture updates from Phase 01.

## Implementation Steps
1. Thread authorized scope/inventory from provider into app state with generation/session fences; no hardcoded evcrate target label.
2. Use server-side project selection for summary/page/Overview; dropdown names/counts from snapshot inventory with stored-name-or-short-ID fallback. Display project column, compact detail and explicit source labels on Configuration and Evaluations; reset rows/cursors/detail on change.
3. Fix cautions/checks-only response condition and neutral host navigation labels. Add no-WebCrypto SHA fixture against known digest; inspect max-size fallback interactivity.
4. Cover keyboard selector, ARIA labels, mobile table overflow, empty/partial/expired state, switch while request/detail is in flight, viewer back/forward, anonymous access and disabled/unbound installation.

## Todo list
- [x] Scope inventory and selector/row labels from authorized snapshot.
- [x] Server-filtered summary/page/Overview with fences and independent Configuration/Evaluation source labels.
- [x] Correct label/response edge cases; test no-subtle digest.

## Review Findings & Next Steps
- [x] Fix Critical Issue: Restore `<OverviewView state={state} />` in `viewer/src/app.tsx` main block.
- [x] Fix Warning 1: Use `selectSelectedRow(state)` instead of `selectSelectedRecord(state)` in `viewer/src/views/history-view.tsx:62`.
- [x] Fix Warning 2: Enforce single-project UI lock (disabled, no "All Projects") when `scope.kind === 'project'`.
## Success Criteria
All Projects shows aggregate valid count and paginated records for every authenticated account; selecting evcrate yields matching subset and Overview, switching back restores aggregate. Configuration/Evaluations explicitly show their separately bound sources and non-filtered scope. No stale cross-project drawer/cursor or unrelated plugin UUID mislabeled EVCrate.

## Risk Assessment
Inventory under malicious or missing names could leak paths; expose only vetted label or short ID. React rendering of historical text stays inert. No client aggregate of one page.

## Security Considerations
UI project choice filters authorized records only; host/runner grant and worker scope remain decisive. Never reveal HOME/source paths in label, errors or bridge.

## Next steps
Perform full paired acceptance, deploy and rollback gate in Phase 05.
