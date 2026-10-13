# Phase 05 — Bounded remediation command and final audit

## Context links

- [Parent plan](plan.md) · [Design contracts](design-contracts.md) · [Acceptance matrix](acceptance-matrix.md)
- [Approved decision provenance](validation-decisions.md); current execution requirements govern over historical brainstorm/research/receipts.
- [Brainstorm](reports/brainstorm-source.md) · [Repository research](research/repository-contracts.md) · [Vendor research](research/vendor-lifecycle-evidence.md)
- [Architecture](../../docs/system-architecture.md) · [Standards](../../docs/code-standards.md)
- Dependencies: [Phase 02](phase-02-neutral-discovery-and-scanner-lifecycles.md), [Phase 03](phase-03-cycle-ledger-and-sanitized-run-guidance.md), [Phase 04](phase-04-portable-sonar-evidence-actor.md)

## Overview

- Date: 2026-10-12; priority: P2.
- Implementation status: complete (100%, completed 2026-10-13); review status: approved (user-approved after Review Cycle 2: 8/10, 0 critical, 6 warnings, 5 suggestions; 80/80 tests pass).
- Scope: Bounded remediation command and final audit.
- Owner: Command integration owner; exclusive command entrypoint plus SKILL route integration.
- Planning estimate: 6h; actual host/offline behavior proof required, no new live Sonar completion gate.

## Key Insights

- N counts entered remediation rounds including failures; no hidden retry or free final corrective edits.
- Early success candidate stops fixing, but does not replace mandatory committed-source final qualification.

## Requirements

- Thin portable command orchestrates real roles and waits for all required terminal results.
- No automatic commits/pushes/worktrees, weakened assertions, rule suppression or scope changes.
- Offline extension acceptance exercises every N/lifecycle/identity/authority/final-success transition without real credentials/uploads. Actual consumer server-verified success still requires final actual submission, committed inputs and exact full consistent per-target tasks/analysis/gates/findings/hotspots/coverage plus independent audit.

## Architecture

- Command loads sibling domain policy and actor prompt within its selected `.agents/skills/` or `.claude/skills/` root; parent drives C0 → at most N rounds → Final F. No cross-root/source-cwd fallback.
- Direct local full-scanner route is distinct from separately invoked authorized Jenkins route.

## Related code files

| Action | Absolute path | Responsibility |
|---|---|---|
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/commands/cmd-sonar-remediate/SKILL.md` | Thin portable command skill |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/SKILL.md` | Link explicit bounded cycle route |
| review | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/remediation-cycles.md` | Single policy owner; avoid conflicting command copies |

No unrelated deletions. All new paths above are proposed until this phase executes.

## Implementation Steps

1. Define arguments as target context, optional positive-integer maximum N, optional explicit scope and evidence destination; no executable flags. If N absent ask; invalid N requires resolution, not inferred default. Host invocation syntax stays host-specific.
2. Load sibling domain entrypoint and neutral discovery/cycle references from that command's selected installed root, then actual evidence actor prompt. Resolve available real implementer/tester/independent reviewer roles without requiring EVCrate names. Missing real independent child capability blocks this orchestrated route only.
3. Preflight approved profile/safe source identity/target set/auth/success/side effects/uploads/evidence location/privacy. Existing prior analysis only qualifies C0 if bound to current source/configuration; otherwise approve and perform full verification/upload. C0 consumes no fix round.
4. Freeze active statuses/filters/scope/exclusions/profile/gate/new-code identities. Any explicit approved change requires new baseline and documented budget decision; never resets spent rounds or yields apparent remediation progress.
5. On entering Ck persist entered count/current stage before fix; scan/snapshot exact checkpoint, prioritize root causes and preserve behavior/callers. Implementer edits coherent scoped batch; tester runs relevant intended checks/smoke. Failed/incomplete child results block dependent stages.
6. Independent reviewer assesses exact source and test artifacts, returns terminal disposition. Allow one corrective batch only, affected retest and independent rereview. Further required edits require next remaining round; unsuccessful rereview consumes current round without forced upload.
7. For passed prerequisites invoke evidence actor for approved full lifecycle, actual per-target submissions, task waits and complete capture; tester checks actual resulting artifacts. Reuse identical trustworthy evidence only where safe; input drift invalidates relevant gates.
8. Persist every outcome, issue delta, coverage/result/applicability, review/rereview, target identities, owner blockers and next action. Resume same submitted task/stage; no extra round for waiting. After two comparable no-progress rounds surface root cause/owner decisions; never silently extend N.
9. Stop fixing early only when full round success criteria hold; do not call it final committed success. Exhaustion with residual findings stays residual/blocked; exhausted final is verification only, no source fixes.
10. Final F: independent aggregate code review; request separate commit authorization or accept user-created commit; no auto push. Declined commit leaves awaiting-commit progress. Validate all intended inputs match committed revision/history and generated provenance; unrelated dirty files remain only if outside analysis/build inputs.
11. Recheck commit hooks/builds/effective config; rerun correct full native/scanner lifecycle and mandatory actual final submission. Wait exact tasks and complete consistent all-target gate/findings/coverage/hotspot evidence; independent final auditor receives raw artifact refs and exact source. If final source correction needed request explicit further budget.
12. Emit honest outcome and private ledger plus sanitized guidance for every completed/failed/exhausted/blocked run. Final report names exercised checks, remaining owner prerequisites and unqualified limits; never gate-only clean, historical results or fake 100%. Phase 07 executes these decisions in labeled offline host scenarios; no fresh consumer server run is required for extension completion.

## Todo list

- [x] Implement thin sibling command prompt and role binding
- [x] Specify C0/global N/correction/failure/resume transitions
- [x] Specify separately authorized commit and mandatory final upload/audit
- [x] Preserve ordinary routes and all-outcome reporting

## Success Criteria

- N=1 failed rereview ends without upload/free edit; waiting resumes same task without budget increase; C0/F excluded.
- Declined upload/commit and missing actor results cannot yield server-verified success; every target/owner condition must pass final audit.

## Risk Assessment

- Prompt-only state may be lost on interruption; durable ledger/stage/task identities mandatory before dependent work.
- User scope changes cannot be used to hide active issues or reset N.
- Historical/offline success scenarios do not qualify actual consumer runs or waive any final committed-source evidence.

## Security Considerations

- Independent reviewer is not implementer; wait all read-only review slice terminal results before dependent actions.
- No findings/hotspot mutation, tool/config version change, automatic sharing, commit/push/worktree/stash/reset.

## Next steps

Phase 06 installs integrated assets into explicitly selected roots; Phase 07 exercises command decisions/independent roles in a real available host; Phase 08 historical review/docs closes offline extension acceptance, not committed-source live runs.

Unresolved design questions: none. Mandatory offline host/eval proof is distinct from future consumer auth/upload/commit/hotspot prerequisites.
