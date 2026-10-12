# Phase 04 — Companion activation, root loading and provider

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [native contract](./research/native-provider-contract.md).
- Dependencies: Phase 02 freeze; Phase 03 intent required for end-to-end validation. Can develop independently from frozen real fixture contract.

## Overview
- Date: 2026-10-12; priority P1; status: DONE (2026-10-12; 100%; Review Cycle 3 approved 7/10; user approved; live native checks deferred to Phase 09 per user gate amendment); implementation review: complete; design-summary review: [Advisor](./reports/advisor-review.md); verification: [tester report](../reports/tester-261012-1108-phase-04-companion-provider-runtime-cycle-3.md), [code review](../reports/code-reviewer-261012-1117-phase-04-companion-provider-runtime-cycle-3.md).
- Implement real private extension activation, trusted source loading and single actor registration owner.

## Key Insights
- `registerCustomAgentProvider` is proposed, non-intercepting, URI-based.
- Resource/source attribution and host placement follow observed Phase 01 rules, not guessed `pluginUri` fields.
- A configured project root wins as a whole installation; an invalid project or unsupported remote authority cannot silently fall back to local HOME.

## Requirements
- Native guards for proposal absence, unsupported host/remote authority, trust and local profile/window isolation; distinguish installed vs active.
- Explicit local root enrollment (project/HOME coexistence, deterministic multi-root selection, local profiles), preserved user state, bounded/safe loading; SSH/dev-container/WSL are out of scope for this deliverable and cannot route into local installation/HOME roots.
- Concrete derived resources outside published roots; no static/native duplicate actors.

## Architecture
- Separate lifecycle/root loader/provider/renderer modules under `extensions/vscode-model-bindings/src/`.
- Source loader consumes strict immutable intent and reference provenance; renderer changes only model selector and structured reference base.
- Validated complete generation feeds provider; invalid actors omitted with reason, unaffected actors remain available.

## Related code files
- Create: extension `src/extension.ts`, `installation-roots.ts`, `agent-provider.ts`, `agent-renderer.ts`, `resource-storage.ts`, focused contract helpers as needed (<200 lines/module).
- Modify: extension package activation/events/`extensionKind`/trust capability fields from Phase 02; refine `extensions/vscode-model-bindings/src/{runtime-contracts.ts,contracts.ts,diagnostics-contracts.ts}` to resolve Phase 02 Review Cycle 2 items `W-A`, `W-B`, and `W-C` before persisting root identities or deriving storage namespaces; existing adapter shared contract only under one owner.
- Read supporting runtime: `src/adapters/vscode/{references.ts,hooks.ts,tool-inputs.ts,runtime-sources.ts}`.
- Create future behavior suites under `tests/vscode-companion/`; no production mock harness.
- Delete: no unrelated modules; temporary spike already removed in Phase 01.

## Implementation Steps
1. Activate appropriate qualified local extension host. Detect unsupported host/remote authority (SSH/dev-container/WSL), proposal-disabled and trust-not-granted states safely before provider registration without falling back to local HOME/roots; retain configure/setup commands where host permits.
2. Prerequisite from Phase 02 Review Cycle 2 before persisting identities or deriving storage namespaces: (a) make `validateLocalRootUri` / `rootIdentity` canonical serialization round-trip idempotent across spaces, `%`, `?`, `#`, Unicode, and Windows drives while rejecting control characters (`W-A`); (b) eliminate the value-import cycle between `contracts.ts` and `diagnostics-contracts.ts` via a leaf module (`W-B`); and (c) enforce `<=512` actor count, string length bounds, and `contributed`/`withheld` selector/reason coherence in `validateRuntimeDiagnosticsV1` (`W-C`). Then implement enrollment UI with exact root preview and authority, validating normalized URI/root containment and regular bounded descriptor/intent/templates without dynamic-importing installed root scripts or searching cwd ancestors.
3. Implement explicit single-folder project > HOME and invalid-project error. For multi-root select one root explicitly; persist local profile/window/root identity so folder ordering never changes policy. Enforce local URI/authority containment and reject unsupported remote authorities without ever reading or falling back to local HOME.
4. Reuse frozen parsers and native reference conventions. Resolve each immutable template's original relative paths to supporting published resources without rewriting external URLs or arbitrary prompt code.
5. Render inherited actor omitting `model`; pinned actor gets validated selector supplied by binding resolver. Preserve omitted-tools vs `[]`, delegation/visibility, skill/workflow metadata and current names.
6. Stage generation in extension-owned storage, verify bytes/reference targets, publish URI list after atomic readiness. Register provider once and emit change event only on actual inventory change.
7. Use observed cross-source hook mechanism without adding a second owner. If implementation reveals missing plugin hook or skill attribution despite spike, stop and reopen native gate.
8. Dispose provider/watchers on deactivation/trust change and withdraw affected resources; preserve user bindings. Do not delete active or uncertain URI generations.
9. Exercise real extension in isolated local host using generated Phase 03 intent (requiring separate explicit per-session user approval naming exact isolated profile/workspace, selected models and scope before any live model invocation): picker/subagent inventory, deny-all leaf actor, one allowed actor, references/hooks and trust revocation. Run focused behavior tests for safe loader and unsupported-authority boundaries, not API-forwarding mocks.

## Todo list
- [x] Guarded activation and root enrollment implemented (candidate root inspection and containment complete; interactive HOME quickpick enrollment transferred to Phase 05).
- [x] Project/HOME/authority/multi-root rules implemented (resolution precedence and fail-closed rules complete; interactive multi-root window selection persistence transferred to Phase 05).
- [x] Native renderer and safe storage implemented.
- [x] Single provider owner and disposal implemented.
- [x] Supporting-resource/restriction test suite passed (live native editor qualification deferred to Phase 09 per user gate amendment).

## Success Criteria
- Exactly one provider per host/window; current `evc-*` actors appear once after valid binding, never from static template paths.
- Unsafe/incompatible source cannot contribute or execute; untrusted workspace and unavailable proposal produce honest setup state.
- Derived body/restrictions/references preserved; published hashes unchanged.

## Risk Assessment
- Workspace URI, extension storage and hook filesystem authority may diverge in remote/non-local contexts. Reject mixed or unsupported remote authorities (SSH/dev-container/WSL) without silent local HOME/root fallback; qualify local host/profile tuples only.
- Relative reference rewriting can damage code/prose. Limit to existing structured reference semantics and prove consumer behavior.

## Security Considerations
- Workspace trust is not a signature; explicit root approval required. Hash integrity alone does not authorize scripts.
- Do not broaden allowed tools or imply OS sandbox; privacy/scout hooks remain independently qualified.

## Next steps
- Phase 05 adds persistent binding picker/resolver; Phase 06 adds full event/lifecycle diagnostics.

## Unresolved questions
- HOME root approval UI in `evcrate.selectInstallation` (currently lists workspace folders) and interactive multi-root window selection persistence are deferred to Phase 05 runtime bindings.
- Dedup hash reset on inventory withdrawal (`activeInventorySha256 = null`) to be formalized alongside Phase 05/06 lifecycle management.
- Live native editor qualification (cross-source plugin hook attribution, live host selector matching and child subagent model inheritance, cached-selection race/reselection recovery, and live generation retention) remains deferred to Phase 09 real-case verification per the 2026-10-12 user gate amendment.
- Remote authorities (SSH/dev-container/WSL) are out of scope for this deliverable and must fail closed without implicit local fallback; any unexpected local attribution or URI boundary issue reopens Phase 01.
