# Phase 06 — Refresh, immutable generations and diagnostics

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [binding phase](./phase-05-runtime-bindings-and-picker.md).
- Dependencies: Phases 03–05 real runtime and bindings.

## Overview
- Date: 2026-10-12; priority P1; status: DONE (2026-10-12; revisioned coalesced single-flight refresh, scoped atomic-swap template watcher, persistent authority storage accounting/locking, and runtime diagnostics v1 implemented; 41/41 companion tests, 98/98 adapter tests pass; live native editor smoke deferred to Phase 09 per user gate amendment) (100%); implementation review: complete; design-summary review: [Advisor](./reports/advisor-review.md).
- Refresh contributed provider inventory and newly discovered or explicitly reselected/reloaded invocations on catalog/config/template changes, preserve running turns, document cached-selection reselection/reload limits and expose truthful unresolved states.

## Key Insights
- Stable `lm.onDidChangeChatModels` exists; use re-query, not polling.
- API does not enforce invocation-time interception or guarantee stale selected-resource removal is fail-closed; provider refresh updates contributed inventory, while already-selected cached agents may require explicit reselection or window reload.
- Runtime diagnostics must distinguish contributed selector from actual host-observed model.

## Requirements
- Bounded single-flight revisioned reconciliation, complete-generation publication and cancellation.
- Root/catalog invalidation immediately withdraws affected current inventory; late promises cannot revive it.
- Running URI generations retained until safe disposal; proposed caps calibrated by Phase 01 measurements, and exhaustion blocks new derivation with manual closed-editor cleanup guidance (distinct from window reload) when automatic reclamation is unproven.

## Architecture
- Reconcile snapshot binds root/template hashes, binding/catalog revision and trust/host tuple.
- Events → coalesced reconcile → validate → stage concrete generation → provider swap → diagnostic snapshot.
- Old immutable resources remain separate; no midway file overwrite or inference model swap.

## Related code files
- Create: extension `src/refresh-controller.ts`, `diagnostics.ts`.
- Modify: extension `resource-storage.ts`, `agent-provider.ts`, `model-catalog.ts`, `binding-store.ts`, `installation-roots.ts`, `extension.ts`.
- Future behavior suites: `tests/vscode-companion/refresh-lifecycle.test.mjs`, `resource-storage.test.mjs`.
- Delete: any spike watcher/poll/retry helpers not needed by final event path; no scaffolds.

## Implementation Steps
1. Wire catalog change, binding state, exact enrolled template inventory watcher, selected root/workspace/trust events. Ignore derived-storage events; dispose all subscriptions.
2. Implement revisioned single-flight refresh and proposed 200 ms coalescing; capture immutable inputs, discard obsolete results, never overlap writes/publish partial files.
3. On catalog/root/trust invalidation withdraw affected contribution first; re-query/revalidate and publish only current state. Empty/error snapshots retain stored choices but do not expose previously resolved model as current.
4. Generate immutable paths under local profile/authority/root/instance UUID; never delete another window/host instance's generations. Native safe-use proof must cover two windows, extension-host restart and restored chat; neither window reload nor a new extension-host lifecycle ID authorizes old-generation reclamation.
5. Enforce Phase-01-calibrated per-instance generation/byte limits and shared persistent-store budget before allocation, with bounded accounting. At exhaustion block new derivation with explicit guidance; do not silently ignore edits or delete uncertain live/restored-session resources. When safe automatic reclamation is unproven, require manual cleanup only after all editor windows/processes using the affected storage are fully closed (preserving user bindings and published resources, and warning that restored chats may reference removed generations—never treating window reload as storage cleanup).
   Follow Design §6 for safe manual cleanup: retire referencing sessions or establish safe-reopen proof before removing generations. Fully closing the editor plus a warning is not permission to delete possibly referenced resources.
6. Implement diagnostics command with canonical tier, root/authority, identity/selector, actor/tier/default source, template and state revisions, contributed/withheld reason, explicit reselection/window-reload guidance after binding/catalog/template updates for already-selected cached agents, and separate closed-editor storage-cleanup guidance when caps are reached. Label host observation only when available from real native evidence.
7. Handle republish/template schema change, removed actor, root delete, trust revoke, deactivation/reactivation and older extension incompatibility. Preserve user choices; restore only when exact identity becomes valid again.
8. Write deterministic transitions for superseded snapshots, event bursts, removed IDs not resurrected, partial writes, root/authority switch, shared-store budget, two instance ownership and deactivation. Test outcome/state invariants, not event-forwarding mock echoes.
9. After obtaining explicit per-session user approval naming the exact isolated profile/workspace, all prior and rebound models that may execute, and the invocation scope, run native smoke for binding edits during a running turn, model/template removal, two windows, extension-host restart/restored chat, root switch and trust revoke. Hash published roots before/after; prove active turns keep their immutable resource/model, provider refresh updates contributed inventory, and any newly discovered actor or any actor invoked after explicit reselection or window reload resolves to the exact updated model (any wrong model on new discovery or after explicit reselection/window reload, or any failure of trust/source invalidation, tool/delegation restrictions or hooks fails acceptance). Record native race evidence when an already-selected cached agent executes with a stale model *prior* to explicit reselection/window reload, and prove recovery via explicit reselection or window reload under the narrow cached-agent exception.

## Todo list
- [x] Event-driven single-flight refresh implemented.
- [x] Immutable generation retention/bounds implemented.
- [x] Invalidated inventory cannot reappear from stale work.
- [x] Effective/unresolved diagnostics implemented.
- [x] Automated transition, lifecycle, storage-accounting, and diagnostics regressions passed (41/41 companion tests, 98/98 adapter tests).
- [ ] Live native running-turn, race-evidence, and reselection/reload recovery smoke — deferred to Phase 09 per the 2026-10-12 user gate amendment.

## Success Criteria
- Configuration/catalog/template edits refresh contributed provider inventory and newly discovered or explicitly reselected/reloaded invocations without republish; active turn retains its immutable resource/model, and cached-selection recovery via explicit reselection/window reload is verified.
- Missing/removed/ambiguous states explicit; publication hashes unchanged; no event loop or unbounded generation growth; budget exhaustion blocks new derivation without deleting uncertain referenced resources and directs to fully closed-editor manual cleanup (not window reload).
- Observed cached-agent selection race and unintended-model limitation *prior* to explicit reselection/window reload documented with native evidence, without waiving model correctness after new discovery/reselection/reload, trust/source invalidation, tool/delegation restrictions or hooks.

## Risk Assessment
- Selected actor removal or rebinding may still use cached host state until explicit reselection or window reload. Mitigation: native race evidence, explicit reselection/window-reload guidance, and strict post-reselection/reload model verification (keeping selection-recovery reload distinct from closed-editor storage cleanup, and never waiving trust, restrictions or hooks).
- Watcher bursts/concurrent publish can read mixed bytes. Validate complete inventory/hash revision, never publish partial snapshots.

## Security Considerations
- Diagnostics omit prompts/tool traces/secrets and hide unsafe full source contents.
- No network inference, new telemetry or root-provided executable discovery.

## Next steps
- Phase 07 packages complete extension; Phase 09 requalifies final packaged bytes.

## Unresolved questions
- Exact observed cached-selection race behavior and measured retention caps are recorded in Phase 01/09; Step 9 live native editor smoke (running-turn invariance, race-evidence capture, two-window/restart retention, and reselection/window-reload recovery) is deferred to Phase 09 per the 2026-10-12 user gate amendment; any model mismatch after new discovery/reselection/window reload, restriction/hook/trust bypass or unsafe deletion of referenced generations blocks qualification.
