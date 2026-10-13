# Phase 04 — Portable Sonar Evidence actor

## Context links

- [Parent plan](plan.md) · [Design contracts](design-contracts.md) · [Acceptance matrix](acceptance-matrix.md)
- [Approved decision provenance](validation-decisions.md); current execution requirements govern over historical brainstorm/research/receipts.
- [Brainstorm](reports/brainstorm-source.md) · [Repository research](research/repository-contracts.md) · [Vendor research](research/vendor-lifecycle-evidence.md)
- [Architecture](../../docs/system-architecture.md) · [Standards](../../docs/code-standards.md)
- Dependencies: [Phase 02](phase-02-neutral-discovery-and-scanner-lifecycles.md), [Phase 03](phase-03-cycle-ledger-and-sanitized-run-guidance.md)

## Overview

- Date: 2026-10-12; priority: P2.
- Implementation status: complete (100%, completed 2026-10-13); review status: user-approved after Review Cycle 3 (7.0/10; critical resume drift-ordering defect patched with targeted regression test; 10 schema/evidence-integrity warnings tracked for follow-up; 49/49 tests pass).
- Scope: Portable Sonar Evidence actor.
- Owner: Evidence actor author; exclusive agents/sonar-evidence.md.
- Planning estimate: 6h; actual host child proof required, fresh live Sonar run not required for extension completion.

## Key Insights

- Upload success is not compute success; exact completed task must bind analysis and gate.
- Current issue/hotspot endpoints are mutable; identity checks do not provide transactional isolation.

## Requirements

- Use a real generic host child with bounded writes and no source/status mutations.
- Terminal result explicitly distinguishes complete/passed, failed, unavailable and incomplete capture.
- Qualify consumer mode/lifecycle/auth/evidence decisions via labeled offline behavioral scenarios with real independent children. Actual future server-success requires final actual submission on committed inputs and exact complete consistent per-target task/analysis/gate/findings/hotspots/coverage audit.

## Architecture

- Actor modes snapshot / verify-upload / verify-final share domain policy, approved profile and exact target/source identity.
- Serial approved lifecycle per checkout; independently correlated evidence per target returned via artifacts.
- Actor prompt and policy resolve from the selected installed root, never the other copy or source checkout.

## Related code files

| Action | Absolute path | Responsibility |
|---|---|---|
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/agents/sonar-evidence.md` | Portable actor request/result, execution/evidence limits |
| review | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/local-analysis.md` | Reuse lifecycle/auth/recovery policy |
| review | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/remediation-cycles.md` | Reuse budget/success/state policy |

No unrelated deletions. All new paths above are proposed until this phase executes.

## Implementation Steps

1. Write portable prompt without native agent registration, EVCrate-specific role names or host frontmatter assumptions. Require actual child identity, host permission limits and trusted approved tooling; state prompt policy is not sandbox enforcement.
2. Specify request: profile/version, mode, safe input identity, server/project target set/selectors/scope, ordered approved commands/effects/upload authority, round/stage, evidence destination and prior task/analysis identity for resume. Reject missing required authority/capability rather than simulating a child.
3. Snapshot mode performs only authorized query/capture; cannot upload or remediate. verify-upload/verify-final execute only approved lifecycle commands and expected writes/network effects. Credentials remain in approved process mechanisms, never inspected or echoed.
4. Before execution validate exact checkout and inputs; after generators/builds/hooks recheck safe input manifest/effective config. If unexpected source changes invalidate review/test evidence, block dependent upload/audit and return specific drift evidence.
5. Execute supported lifecycle in approved order, verifying applicable intended checks and fresh imported coverage/report-source mappings. Preserve separate native check results when instrumentation changes semantics; failed stages report documented recovery boundary, not blind retry.
6. Capture actual submission task metadata for each target; persist stage/IDs before waiting. Await SUCCESS/FAILED/CANCELED using target capability, honoring interruption as incomplete. Resume known task without re-upload, spending new round or inventing timeout success.
7. Bind completed task analysis/revision/time and analysis-specific gate when supported. Preserve actual capabilities and correlation limits; never substitute latest project gate for required exact analysis proof.
8. Collect all requested pages/totals of issues/hotspots/metrics with same frozen filters; detect server pagination/window limits. Check analysis identity before/after and collection-window/manual transitions where supported. If supported manual-transition detection is unavailable, terminal consistency is explicitly unknown, never assumed unchanged. Concurrent scans or unverified/unknown required mutable-state consistency block completeness.
9. Return terminal artifact references: actual stage/status, commands/results/applicability, input checks, test/coverage identity/format/metrics, per-target task/analysis/gate and complete paging/consistency, blockers, sanitized guidance candidates. Never inline secrets or claim clean from partial data.
10. Verify labeled offline policy walk-throughs for wrong selector, auth gap, stale report, task failure, cross-target drift and manual status changes; Phase 07 observes actual independent child execution. Implementer/tester/reviewer remain separate; actor cannot owner-review hotspots or approve its own audit. No real credentials/uploads are required to close extension acceptance.

## Todo list

- [x] Write portable mode/request/result contract
- [x] Specify exact lifecycle/task capture/resume
- [x] Specify complete mutable evidence checks
- [x] Review hard authority and failure boundaries

## Success Criteria

- All modes have explicit permitted effects and terminal evidence contracts; no native registration or source edits.
- A single incomplete target/capture/correlation blocks aggregate success; actor never mutates finding/hotspot statuses.

## Risk Assessment

- Native build/scanner plugins can run scripts; safe approved project tooling and host restrictions required.
- Unsupported exact gate API or pagination ceiling must be an honest required-proof blocker.
- Offline snapshots/models exercise rejection policy only; cannot qualify real task correlation or new-extension scanner behavior.

## Security Considerations

- Never extract CLI keychain tokens or echo scanner secrets; stop if approved safe mechanism unavailable.
- No CI/trust changes, commit/push, tool upgrades, source cleanup or implicit workspace isolation.

## Next steps

Phase 05 binds real actor dispatch. Phase 07 observes actual root-attributed child behavior; Phase 08 reviews historical lessons and offline handoff. Actual uploads/tasks/final audit belong to separately approved future consumer runs.

Unresolved design questions: none. Required host/eval capability remains an extension gate; real Sonar access remains a consumer-run prerequisite.
