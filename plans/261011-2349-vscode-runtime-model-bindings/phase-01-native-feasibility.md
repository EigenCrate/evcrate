# Phase 01 — Native feasibility before static cutover

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [API research](./research/native-provider-contract.md); [verification matrix](./verification-matrix.md).
- Dependencies: none. Existing static projection remains unchanged.

## Overview
- Date: 2026-10-12; priority P1; status: Offline complete / native gates BLOCKED; design-summary review: [Advisor](./reports/advisor-review.md).
- Prove chosen proposed provider can preserve existing harness behavior, not just compile declarations. Offline spike completed; native editor qualification gates remain NOT RUN / BLOCKED.

## Key Insights
- Provider input has no `pluginUri` override; extension attribution differs from plugin attribution.
- Source reads and old 1.140.0/0.68.0 receipts do not prove provider-backed runtime behavior.
- Selected/stale actor fallback is host-owned; provider removal is not an invocation interceptor.

## Requirements
- Use authorized isolated editor user-data/profile, synthetic non-sensitive workspace and test root, never main profile/settings; obtain prior explicit per-session user approval naming the exact isolated profile/workspace, selected models and live invocation scope before any quota-consuming check (session approval never authorizes extension install or persistent proposal enablement).
- Record actual version, commit, Copilot version, authority, trust, authenticated catalog access and proposal policy.
- Gate complete local scope: direct/subagent discovery/model binding, restrictions, hooks/references, refresh/reselection recovery, local project/HOME coexistence, multi-root and local profiles, plus unsupported-remote rejection (SSH, dev-container and WSL qualification/support claims are out of scope for this deliverable and must never silently fall back to local HOME/editor).

## Architecture
- Temporary private extension contributes concrete test `.agent.md` resources through `registerCustomAgentProvider` and change event.
- Existing plugin continues supplying supporting resources; no duplicate hook owner or spoofed source attribution.
- Pin candidate VS Code 1.140.0 commit `07f806f999227108933c2e30515b26eecc1fda74` / Copilot Chat 0.68.0 first; record any newer host as separate tuple.

## Related code files
- Read: `src/adapters/vscode/{agents.ts,hooks.ts,metadata-tools.ts,references.ts,adapter.ts}`, current native qualification docs.
- Future temporary files: isolated spike directory outside authoring/generated roots; not permanent package scaffolding.
- Create evidence: this plan's `reports/native-feasibility.md`, `reports/support-matrix.md` during implementation, not empty placeholders now.
- Modify/delete production files: none in this phase.

## Implementation Steps
1. Establish consented isolated launch and capture exact host tuple; proposal-disabled launch must show honest unavailable/setup state. Do not silently edit runtime args. Before any live model invocation in Steps 4–7, obtain explicit per-session approval naming the exact isolated profile/workspace, all candidate/previous/updated models that may be invoked (including during cached-selection race tests), and the invocation scope.
2. Build minimal temporary provider using pinned declarations and one inherited actor, one pinned actor, one `tools: []` / `agents: []` actor and one allowed-delegation actor. Add representative existing relative skill/workflow/script references.
3. Enumerate provider and picker inventories: every test name once, no competing static test names. Observe both direct selection and native custom-subagent lookup.
4. Strictly within the explicitly approved session/workspace/model/invocation scope, choose real catalog identities manually. Capture native model-selection metadata/logs for direct actor and child; compare exact emitted selector. Do not use model self-report as evidence. Exercise explicit subagent tool model, Auto/premium-cost policy and parent inheritance.
5. Within the approved session scope, prove native deny-all and leaf restrictions with harmless attempted read/delegation; prove positive allowed path. Prove privacy/scout hooks and session-context initialization actually run for provider-attributed actor. Inspect namespaced `/evc:cmd-*` skills, sibling skill references, workflows and installed script roots.
6. Within the approved session and model list (covering both prior and rebound models), update binding/catalog/template during a running turn; prove old turn keeps its immutable resource/model, provider refresh updates contributed inventory, and any newly discovered actor or any actor invoked after explicit reselection or window reload resolves to the updated model (any wrong model on new discovery or after explicit reselection/window reload fails acceptance). Remove or change a currently selected actor/model without reselection, record observed host cache/fallback race evidence, and prove recovery via explicit reselection or window reload. Under the confirmed narrow cached-agent exception, possible unintended-model execution for an already-selected cached agent *prior* to explicit reselection or window reload is accepted as a documented limitation—never waiving model correctness after new discovery/reselection/reload, trust/source invalidation, tool/delegation restrictions or hooks. Exercise empty/error catalog and selector collisions.
7. Exercise trust/source revocation, local project/HOME coexistence, two-folder multi-root selection and isolated local profiles, and verify that unsupported remote authorities (SSH/dev-container/WSL) fail closed without silent local HOME/editor fallback. Test two windows, root switching, extension-host restart/restored chat and generation retention; measure storage usage to calibrate proposed retention caps. Neither window reload nor a new extension-host lifecycle proves an issued URI is unused; when safe automatic reclamation is unproven, bounded retention with manual cleanup only after all editor windows/processes using the storage are fully closed is required.
   Exercise unsupported-authority guards locally, not by provisioning remote qualification tuples. Safe manual cleanup follows Design §6: fully close editors and retire referencing sessions or establish safe-reopen proof; closing alone never permits deleting possibly referenced generations.
8. Freeze local `extensionKind`/authority/source/retention bounds and local support tuples. Prove profile disabled-state preservation and installed build-identity inspection, not version-only matching. Manual instructions cannot pass automatic-install acceptance; missing required local native rows block.
9. Record redacted native receipts and failed/unavailable rows. Remove temporary spike after retaining proof. Any failed semantic gate (outside the narrow documented pre-reselection cached-agent model limitation) blocks Phase 02+ cutover; present redesign/support decision to user rather than silently changing architecture.

## Todo list
- [x] Host environment and permission policy evidence captured; live invocation approval BLOCKED.
- [ ] Actual direct/subagent model identity observed (BLOCKED - requires live editor session).
- [ ] Empty-tool/delegation and hooks/references proven natively (BLOCKED - requires live editor session).
- [ ] Update/removal/trust race and explicit reselection/reload recovery behavior recorded natively (BLOCKED).
- [x] Local project/HOME/multi-root/profile rows and unsupported-remote guards established in reports (offline contract only; native generation retention measurements remain unmeasured / BLOCKED pending live editor session).
- [x] Temporary spike removed; gate decision recorded: Phase 01 offline spike verified; native gates BLOCKED; Phase 02+ cutover gated.

## Success Criteria
- All semantic gates above pass for declared local tuples, with receipts tied to spike bytes, per-session live approval and host versions.
- Proposal-disabled, denied access, cached-selection race/recovery and unavailable/unsupported remote contexts recorded truthfully; unresolved required local rows mean blocked, not complete.
- If plugin hooks/source semantics cannot be preserved, stop. Private provider design is not accepted merely because agents appear.

## Risk Assessment
- Critical: cross-source plugin hooks may not attach. Mitigation: native stop gate, no production migration before proof.
- Model access or local GUI/profile environment missing: explicit per-session prerequisite, no mocked qualification; SSH/dev-container/WSL are outside this deliverable's support scope.

## Security Considerations
- No secrets/prompts/tool traces in receipts; capture only required selection/disposition metadata.
- Test tools on synthetic paths; catalog UI does not send inference. Each live qualification session requires prior explicit approval naming exact isolated profile/workspace, selected models and invocation scope (never implying extension install or proposal-enablement consent).

## Next steps
- Pass → Phase 02 interface freeze. Failure → report exact unsupported contract and obtain user decision; existing baseline untouched.

## Unresolved questions
- Which local host/profile tuples preserve cross-source hooks/references, what exact cached-agent race and reselection/reload recovery behavior occurs, and what measured generation retention bounds apply? Answer with native evidence here.
