# Phase 05 — Runtime tiers, actor overrides and picker

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [provider phase](./phase-04-companion-provider-runtime.md).
- Dependencies: Phases 02 and 04; real Phase 03 templates for smoke.

## Overview
- Date: 2026-10-12; priority P1; status: DONE (2026-10-12; 100%; Review Cycle 2 approved 8/10; user approved; model catalog validation, scoped versioned binding store, pure resolver, QuickPick configuration commands, diagnostics display, and loader integration; 34/34 companion tests, 232/232 adapter tests pass; live native checks deferred to Phase 09 per user gate amendment); implementation review: complete; design-summary review: [Advisor](./reports/advisor-review.md); verification: [tester report](../reports/tester-261012-1251-phase05-runtime-tiers-and-picker.md), [code review](./reports/evc-code-reviewer-261012-1256-phase-05-runtime-bindings-and-picker-cycle-2.md).
- Let users bind opus/sonnet/haiku and override individual actors using available catalog models without republish.

## Key Insights
- Opaque `(vendor,id)` is stored identity; ordinary agent selector is exact current display name/vendor.
- Unique opaque IDs can still share host selector names; reject ambiguity, never choose first catalog entry.
- Canonical inherit is not a fourth concrete tier and must remain omission unless actor explicitly overridden.

## Requirements
- User-initiated initial `selectChatModels`; no `sendRequest`, token-count probe or hidden latest-model selection.
- Unsynced local user defaults plus installation-scoped root workspace overrides partitioned by profile/window/root/authority; retain on republish/uninstall and preserve cancellation.
- Cross-scope actor specificity outranks tier bindings (`root actor > user actor > root tier > user tier`, with canonical `inherit` omitted unless an actor override is set); reset restores source intent or reveals the lower layer.

## Architecture
- Pure resolver takes intent, layered bindings and catalog snapshot; returns inherited/resolved/unresolved state plus provenance.
- Editor Quick Pick wraps resolver/store, lists vendor/name/ID and layer being changed; no webview/provider router.
- Store exact schema/revision; invalid/corrupt state shown, not automatically overwritten with defaults.

## Related code files
- Create: extension `src/model-catalog.ts`, `binding-store.ts`, `binding-resolver.ts`, `configuration-commands.ts`.
- Modify: extension `src/extension.ts`, package `contributes.commands`; provider integrates resolver without import cycles.
- Create future permanent behavior suites: `tests/vscode-companion/binding-resolution.test.mjs`, `binding-state.test.mjs` following existing Node test conventions/dedicated extension build.
- Delete: no old actor-model aliases/configuration compatibility path.

## Implementation Steps
1. Query available catalog only after configuration gesture; handle empty/multiple/error outcomes. Sort display for usability, but never infer preferred/latest identity.
2. Validate identity/name bounds and selector uniqueness against pinned host matcher semantics. An ambiguous vendor/name is disabled with reason even if IDs differ. Preserve third-party qualified names and case sensitivity.
3. Load strict versioned unsynced state from global user defaults and root workspace layer. Partition by local profile/window/root/authority and reject unsupported remote contexts without falling back to local state; no editor settings or published `.evcrate.json` mutation.
4. Implement resolver chain: `root actor override → user-default actor override → canonical inherit omission → root tier → user-default tier → unresolved`. Explicit actor `inherit` omits `model`; clearing a root override reveals the user-default layer or canonical intent. Root tier never overrides a user-default actor choice.
5. Implement tier picker and actor picker with source/layer preview; prompt explicit user/root scope. Commit once on confirmed selection, increment revision; cancellation changes neither persisted state nor provider inventory.
6. Implement reset exact key/layer and installation selector. Do not clear unknown/unrelated user extension state or change another root's selection.
7. Integrate provider derivation using exact current selector; only missing-tier dependent actors withheld. Show configuration guidance while unrelated valid/inherit actors remain registered.
8. Add deterministic behavior cases: cross-scope overrides (`root actor > user actor > root tier > user tier`), inherit/clear transitions, missing/removed identity, duplicate selector, wrong vendor/case, corrupt schema, local profile/root/window isolation and unsupported-authority rejection, cancel preserving revision.
9. Launch real command palette in isolated local native host; bind all required tiers, deliberately override `evc-planner`, override inherited designer then reset it. After obtaining explicit per-session user approval naming the exact isolated profile/workspace, selected models and invocation scope, invoke direct/child and inspect native model metadata; verify canonical/published bytes unchanged and bindings survive republish.

## Todo list
- [x] Catalog/selector identity validation implemented.
- [x] Scoped versioned binding store implemented.
- [x] Resolver precedence/inherit/reset implemented.
- [x] Tier/actor/root picker and cancel semantics implemented.
- [x] Automated binding and picker-handler regressions passed (34/34 companion tests, 232/232 adapter tests).
- [ ] Native command/picker/direct/subagent smoke — transferred to Phase 09 under the 2026-10-12 user gate amendment.

## Success Criteria
- User selects available identities once; all required actors resolve without build/publication.
- Diagnostics, derived frontmatter and native-observed choice agree in exercised direct/subagent and cross-scope precedence cases.
- No silent tier substitution, version ranking, inherited designer pin or scope leakage.

## Risk Assessment
- Native eligibility/cost policy may override/reject chosen model; show host limitation, never claim picker ensures inference access.
- VS Code state isolation/profile behavior must match Phase 01 native evidence; do not assume sync/profile sharing.

## Security Considerations
- Store no credentials/catalog inference objects; bounded plain model identities only.
- Only user gesture creates/changes a binding; no repository prompt can authorize a selection.

## Next steps
- Phase 06 refreshes effective inventory and exposes stale/unavailable diagnostics.
- Phase 06 carryover items:
  - `W-A`: Root-only bindings post-reload catalog query & subscription trigger (restore catalog resolution without requiring configure re-run).
  - `W-B`: Align diagnostics display with provider withdrawal on corrupt state (provider withdraws all actors; diagnostics alignment).
  - `W-C`: Exact raw identity and selector handling (avoid lossy whitespace trimming on vendor/id/name).
  - `W-D`: Regression tests for root-only activation, corrupt-state clear, and persisted scope/revision/cancellation assertions.

## Unresolved questions
- Host selector limitations remain qualification-bound; unsupported model entry is not silently replaced. Step 9 live native editor smoke (command palette invocation, native model metadata inspection) is deferred to Phase 09 per the 2026-10-12 user gate amendment.
