---
title: "General Sonar remediation cycles"
description: "Add portable bounded Sonar cycles with dual-root skill installation, independent evidence, report-informed policy and offline-qualified handoff."
status: in-progress
priority: P2
effort: 49h
branch: feat/general-sonar-remediation-cycles
tags: [feature, sonarqube, skills, remediation, evidence]
created: 2026-10-12
---

# General Sonar remediation cycles

Phase 01 contract freeze and capability preflight DONE (100%, completed 2026-10-12, review approved); Phase 02 neutral discovery and scanner lifecycles DONE (100%, completed 2026-10-12, review approved); Phase 03 cycle ledger and sanitized run guidance DONE (100%, completed 2026-10-13, user-approved after Review Cycle 3: 8.0/10, 0 critical, 8 warnings, 7 suggestions); Phase 04 portable Sonar Evidence actor DONE (100%, completed 2026-10-13, user-approved after Review Cycle 3: 7/10 with critical resume drift-ordering defect patched, 10 warnings, 6 suggestions; 49/49 tests pass); Phase 05 bounded remediation command and final audit DONE (100%, completed 2026-10-13, user-approved after Review Cycle 2: 8/10, 0 critical, 6 warnings, 5 suggestions; 80/80 tests pass); Phase 06 dual-root transactional two-skill installer and package DONE (100%, completed 2026-10-13, review approved after Review Cycle 2: 8.5/10, 0 critical, 4 warnings, 4 suggestions; 99/99 tests pass); Phase 07 behavioral evals and installed host smoke DONE (100%, completed 2026-10-13, user-approved after Review Cycle 2: 8.5/10, 0 critical, 4 warnings, 4 suggestions; 114/114 tests pass); Phase 08 partial handoff delivered (100% offline deliverables complete 2026-10-13; live host unexercised). [Approved decision provenance](validation-decisions.md) · [Current contracts](design-contracts.md) · [Current acceptance matrix](acceptance-matrix.md).

**Reconciled execution:** all eight phases/contracts/matrix now integrate approved decisions. Current authorization supersedes the interview's snapshot-preservation instruction; [immutable brainstorm](reports/brainstorm-source.md), research and old dated receipts remain history, not overrides. No deferred apply-addendum step.

## Workspace and workflow

- Worktree: `/home/loidinh/WS/worktrees/evcrate-general-sonar-remediation-cycles`.
- Feature branch: `feat/general-sonar-remediation-cycles`; base current local `main`, `4dc038338b2bd5cd4b7ac3ac400e769e7d682bdf`.
- Original checkout preserved. Base was one commit behind recorded `origin/main`; no pull/reset/rebase, commit or push performed.
- `/evc-cmd-plan-x-hard` workflow applied in this runtime; planning skill loaded directly. Two independent research terminal results synthesized by parent. No nested command runner advertised; no subprocess command execution implied.
- Active-plan setter attempted with absolute plan path; `EVCRATE_SESSION_ID` absent, so runtime session activation did not persist. This path is the explicit handoff.
- Local-only handoff: `.gitignore:63` ignores `plans/**/*`. Plans are not tracked/staged; architecture is the only tracked modification and contains self-contained prose without links to this ignored plan. No ignore-rule change, force-staging, commit or push.

## Scope and decisions

Standalone `ext/sonarqube-test-quality/` only: neutral domain policy, `cmd-sonar-remediate`, portable evidence actor, private ledger/sanitized guidance. Extend existing required `--target agents` to explicit `agents|claude|both` for `.agents/skills/` and `.claude/skills/` (no default both). One source tree, 18 proposed files/two entrypoints per selected root, 36 both; selected-root-only writes/same-root links and guarded cross-root caught-failure rollback. Package/host/evals/docs and historical-report-informed offline handoff; no new live gate.

N is a global maximum; entered failed/incomplete rounds count. C0/F consume no fix round, one correction/rereview per round, no free final edits. **Actual consumer server-success**, not offline extension acceptance, requires committed intended inputs/reproducible generators, final actual per-target submissions/exact tasks/analysis/gates/full consistent findings/hotspots/coverage and independent audit; passing applicable checks, zero active issues, required owner reviews/configured conditions. Commit separately authorized, no implied push.

No workflow engine, daemon, canonical commands/agents/registry/projections, native host registration/settings, auto worktrees/commit/push, status mutation/suppression, CI/trust changes, tool upgrades/universal pins, universal coverage percentage or self-modifying/external learning.

## Phases

| # | Phase | Status / progress | Depends on | Detail |
|---|---|---|---|---|
| 01 | Contract freeze and capability preflight | DONE (100%, completed 2026-10-12) | — | [Phase 01](phase-01-contract-freeze-and-capability-preflight.md) |
| 02 | Neutral discovery and scanner lifecycles | DONE (100%, completed 2026-10-12, review approved) | 01 | [Phase 02](phase-02-neutral-discovery-and-scanner-lifecycles.md) |
| 03 | Cycle ledger and sanitized run guidance | DONE (100%, completed 2026-10-13, user-approved after Review Cycle 3: 8.0/10, 0 critical, 8 warnings, 7 suggestions) | 01 | [Phase 03](phase-03-cycle-ledger-and-sanitized-run-guidance.md) |
| 04 | Portable Sonar Evidence actor | DONE (100%, completed 2026-10-13, user-approved after Review Cycle 3) | 02, 03 | [Phase 04](phase-04-portable-sonar-evidence-actor.md) |
| 05 | Bounded command and final audit | DONE (100%, completed 2026-10-13, user-approved after Review Cycle 2: 8/10, 0 critical, 6 warnings, 5 suggestions; 80/80 tests pass) | 02, 03, 04 | [Phase 05](phase-05-bounded-remediation-command-and-final-audit.md) |
| 06 | Dual-root two-skill installer and package | DONE (100%, completed 2026-10-13, review approved after Review Cycle 2: 8.5/10, 0 critical, 4 warnings, 4 suggestions; 99/99 tests pass) | 04, 05 | [Phase 06](phase-06-transactional-two-skill-installer-and-package.md) |
| 07 | Behavioral evals and installed host smoke | DONE (100%, completed 2026-10-13, user-approved after Review Cycle 2: 8.5/10, 0 critical, 4 warnings, 4 suggestions; 114/114 tests pass) | 02–06 | [Phase 07](phase-07-behavioral-evals-and-installed-host-smoke.md) |
| 08 | Historical-report review, docs and offline handoff | Partial handoff delivered (100% offline deliverables complete 2026-10-13; live host unexercised) | 07 | [Phase 08](phase-08-live-qualification-documentation-and-handoff.md) |

## Execution / validation gates

One integration owner; only 02/03 may author independently after contract freeze, both terminal results before actor work. Consumer builds/scans stay serial per checkout/target set. Required offline gates: integrated actual package checks, extracted packed agents/claude/both installs and exact collisions/concurrency/rollback, actual available host/version/loaded-root/independent-child terminal evidence, full executed labeled offline behavioral eval/privacy/docs proof. Duplicate discovery needs supported explicit selection/isolation, not assumed precedence; unavailable/ambiguous required host/eval remains blocked.

Phase 08 reviews supplied historical summary only (56 tests / 46.48% line / 63.91% branch; focused change not analyzed afterward), not new-extension runtime proof/corporate defaults. No fresh real-project/scanner-auth/coverage/upload/task/live matrix required to complete extension. Future consumer actual server-success retains complete per-run final evidence; offline/synthetic/historical contexts cannot qualify it.

## Deliverable review

[Current reconciliation receipt](reports/validation-reconciliation.md) records current planning checks, not implementation success. [Initial](reports/plan-validation.md) and [interview](reports/validation-interview.md) receipts remain historical; snapshot preservation is superseded. Research/architecture unchanged. Phase 01 and Phase 02 DONE (100%, completed 2026-10-12, review approved); Phase 03 DONE (100%, completed 2026-10-13, user-approved after Review Cycle 3: 8.0/10, 0 critical, 8 warnings, 7 suggestions); Phase 04 DONE (100%, completed 2026-10-13, user-approved after Review Cycle 3: 7/10, 49/49 tests pass); Phase 05 DONE (100%, completed 2026-10-13, user-approved after Review Cycle 2: 8/10, 0 critical, 6 warnings, 5 suggestions; 80/80 tests pass); Phase 06 DONE (100%, completed 2026-10-13, review approved after Review Cycle 2: 8.5/10, 0 critical, 4 warnings, 4 suggestions; 99/99 tests pass); Phase 07 DONE (100%, completed 2026-10-13, user-approved after Review Cycle 2: 8.5/10, 0 critical, 4 warnings, 4 suggestions; 114/114 tests pass); Phase 08 partial handoff delivered (100% offline deliverables complete 2026-10-13; live host unexercised).

## Validation Summary

**Validated:** 2026-10-12. **Questions asked:** 4.

- Confirmed: install into both `.agents/skills/` and `.claude/skills/` via explicit target selection.
- Confirmed: no new live gate; supplied report is historical procedural reference, not new-extension runtime proof.
- Confirmed: keep plans local; tracked architecture has no ignored-plan links.
- Current execution docs integrate all approved choices now; implementation checklists remain unchecked, estimates unchanged at 49h. No source implementation, install or runtime qualification performed by reconciliation.

## Unresolved questions

Design: none. Implementation prerequisites: actual consuming-host/root discovery and real independent children/eval execution. Future remediation-run prerequisites separately include approved project/toolchain/analyzer/auth/tests/coverage/uploads/commit/hotspot/evidence policy; they do not reintroduce a live gate for extension implementation.
