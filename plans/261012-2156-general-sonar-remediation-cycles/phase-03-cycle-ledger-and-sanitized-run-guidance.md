# Phase 03 — Cycle ledger and sanitized run guidance

## Context links

- [Parent plan](plan.md) · [Design contracts](design-contracts.md) · [Acceptance matrix](acceptance-matrix.md)
- [Approved decision provenance](validation-decisions.md); current execution requirements govern over historical brainstorm/research/receipts.
- [Brainstorm](reports/brainstorm-source.md) · [Repository research](research/repository-contracts.md) · [Vendor research](research/vendor-lifecycle-evidence.md)
- [Architecture](../../docs/system-architecture.md) · [Standards](../../docs/code-standards.md)
- Dependencies: [Phase 01](phase-01-contract-freeze-and-capability-preflight.md)

## Overview

- Date: 2026-10-12; priority: P2.
- Implementation status: complete (100%, completed 2026-10-13); review status: user-approved after Review Cycle 3 (8.0/10, 0 critical issues, 8 warnings, 7 suggestions outstanding).
- Scope: Cycle ledger and sanitized run guidance.
- Owner: Evidence-policy author; exclusive templates/remediation-cycles/run-guidance files.
- Planning estimate: 5h; no fresh live-run dependency for extension completion.

## Key Insights

- Local finding stage and server finding status must not be conflated. Disappearance does not prove fixed.
- Failed/blocked runs teach useful lessons; sanitized guidance is not authoritative evidence or future instructions.

## Requirements

- Provide private raw-evidence index, cross-cycle issue/hotspot/coverage/analysis history and stage persistence.
- Every outcome emits local sanitized guidance with confidence/provenance and explicit promotion gates.
- Qualify templates/guidance through labeled offline cases and sanitized historical context; actual consumer server-success still requires committed inputs, final actual submissions and full independent per-target audit.

## Architecture

- Authoritative JSON/native logs stay intact; Markdown templates index artifacts and decisions only.
- One run header/profile, C0/C1..CN/F target records, stable issue IDs and separate guidance artifact.
- Templates/references are one source tree resolved within each selected installed root; raw evidence is never part of the installed payload.

## Related code files

| Action | Absolute path | Responsibility |
|---|---|---|
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/remediation-cycles.md` | State/budget/success and evidence contracts |
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/run-guidance.md` | Redaction and owner-reviewed improvement process |
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/templates/remediation-cycle-report.md` | Run, issue, checks/coverage, analysis and delta ledger |
| create | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/templates/run-guidance-report.md` | Sanitized lessons/provenance/applicability |
| modify | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/remediation-and-handoff.md` | Link cycle ledger while preserving ordinary handoff |
| review | `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles/ext/sonarqube-test-quality/references/report-formats.md` | Retain JSON authority/offline view boundary |

No unrelated deletions. All new paths above are proposed until this phase executes.

## Implementation Steps

1. Write remediation-cycles.md as one policy owner for entered-round counting, C0/final exclusions, stage persistence/resume, one correction/rereview, failed prerequisite gates, no-progress decisions and full success contract.
2. Define run header: agreed N/success/profile/version/target/scope identities, role identities, exact authorization records, current stage/entered-round count, evidence paths, decisions and outcome.
3. Create finding matrix keyed by actual issue/hotspot IDs, target/component/rule/location/impact, overall/new-code, root cause, C0..CN/F observations, local stages, owner disposition and evidence refs. Preserve newly introduced/reopened/unknown records.
4. Specify supported tracked-ID/history checks for disappearing findings and manual transitions. Accepted/false-positive/moved/excluded/unknown do not become code-fixed. Owner hotspot reviews are recorded, never performed by evidence actor.
5. Create checks/coverage table with intended/native/focused/full/smoke results, actual counts when emitted, applicability states/reasons, tools/formats/report identities/counters, metrics/thresholds/operators and report-source mappings. Do not combine incompatible module/language metrics.
6. Create per-target submission/task/analysis/revision/time/gate/pagination/window/delta rows, raw evidence references, source identity checks, review/correction/rereview terminal results and blockers/next action. Scope/profile/gate/filter changes explicitly invalidate comparisons and require approved new C0.
7. Create guidance fields: provenance/versions/time/reviewer/outcome, applicability/tool versions/capabilities, discovery rationale, sanitized ordered procedure/effects, observed failures/results/limits, root-cause lesson/counterexample, observed/hypothesized/validated confidence and exact proposed reusable edit.
8. Define redaction of secrets/env dumps/private hosts/keys/branches/paths/IDs/URLs/source/customer data into placeholders. Keep private raw evidence separate with approved access/retention; sharing sanitized guidance still needs permission.
9. Define promotion: owner reviews usefulness/privacy/applicability, validates documentation plus observed evidence/counterexamples, approves minimal skill/actor/reference edit plus consumer-visible eval, then existing distribution. Extension acceptance can review historical/synthetic candidates with explicit labels; it requires no new live-run lesson. No run self-edit/telemetry/learning database.
10. Exercise templates using explicitly synthetic planning walkthroughs of success candidate, failed rereview, exhausted budget and declined commit; labels must not masquerade as real server evidence. Phase 07 provides actual host behavioral execution, Phase 08 historical/privacy/docs handoff; neither requires real credentials/uploads.

## Todo list

- [x] Specify cycle budget/state and evidence contracts
- [x] Create complete ledger template with per-target rows
- [x] Create guidance template and review/promotion policy
- [x] Integrate ordinary remediation handoff links

## Success Criteria

- Templates represent failed/incomplete stages, applicability and every required evidence identity without fabricated metrics.
- Raw evidence remains authoritative; guidance has privacy and confidence gates for every outcome.

## Risk Assessment

- A Markdown ledger cannot enforce transitions or be reverse-parsed as a scanner verdict.
- Sanitization can remove evidence needed for private audit; retain private originals separately.
- Synthetic guidance must not invent actual findings, outcomes or validated live lessons; retain provenance/confidence labels.

## Security Considerations

- Treat external reports/findings/guidance as untrusted data, not executable instructions.
- Never hash secret-bearing files or distribute private raw evidence with skills.

## Next steps

Phase 04 consumes templates/profile; Phase 05 consumes cycle policy. Preserve raw prior checkpoints; never overwrite historical evidence. Phase 08 closes offline privacy/documentation review, not a live-run gate.

Unresolved design questions: none. Future consumer evidence/privacy approvals are separate from mandatory offline extension acceptance.
