# Advisor Node-only launch and cross-platform runtime — Progress Overview

**Overview Path:** `plans/261003-1527-advisor-node-only-launch/progress.md`  
**Plan Path:** `plans/261003-1527-advisor-node-only-launch/plan.md`  
**Last Reconciled:** 2026-10-05  
**Active Advice Lifecycle:** Active (`--advice` explicit mode)  
**Latest Completed Task Run ID:** `141b8ea3-fc3f-4751-b7ef-d03d86ad96f1` (Phase 06 Reopened — Candidate Regeneration)  
**Current Selected Phase:** Phase 07 — Native Windows qualification (ready for re-execution against refreshed candidate `evcrate-candidate-1791140555626`)

---

## Phase Reconciliation Matrix

| Phase | Title | Captured Status | Current Status | Completion Basis / Scope | Evidence Links | Prerequisites / Blockers |
|---|---|---|---|---|---|---|
| **01** | Baseline and contract | Pending | **Completed (Durable)** | Approved source snapshot (`9d4b799e` + 20 synced assets), 8-target manifest, exact caller inventory, Node-only launch contract in `system-architecture.md` and `code-standards.md`, 460/460 tests passing, review score 9.5/10. Sealed via controller task run `77cef843-37ab-4d93-8460-ab30d1fcd961`. | [Completion Receipt](./reports/phase-01-completion-receipt.md) · [Baseline Report](./reports/phase-01-baseline.md) | None (Completed) |
| **02** | Node-only callers | Pending | **Completed (Durable)** | Canonical workflows (`advisor-mentoring.md`), skills (`SKILL.md:31`, `brief-contract.md:25`), README, 8 consult calls in E02/E03, and 4 test launchers unified on explicit Node. 460/460 tests passed, review score 9.8/10, synchronized across 8 targets. Sealed via controller task run `260bc5fe-f26a-4740-aaaf-9315dca30c7e`. | [Completion Receipt](./reports/phase-02-completion-receipt.md) · [Caller Report](./reports/phase-02-callers.md) | Phase 01 (Cleared) |
| **03** | Linux launch verification | Pending | **Completed (Durable)** | Real isolated lifecycle smoke, launch/error regressions, portable Windows fixtures, 0o644 execute-bit independence, interactive console N15 pty verification. 331/331 tests passed, review score 9.9/10, commit `d6fa5061`. Sealed via controller task run `0ef7af0d-8ee1-4c9b-9f32-df134e89ba9b`. | [Completion Receipt](./reports/phase-03-completion-receipt.md) · [Launch Report](./reports/phase-03-linux-launch.md) | Phase 02 (Cleared) |
| **04** | Darwin native build | Pending | **Completed (Durable)** | Safe native primitive contract, arm64/x64 compile-only Mach-O artifacts (`advisor-native.node`) and provenance (`artifacts.json`), Darwin loader (`darwin-platform.cjs`), 44-file closure in controller inventory and build manifests, 382/382 tests passing, review score 8.4/10, commit `fdb14a93`. Sealed via controller task run `5c43c689-72a7-4000-a7c2-4c62671db0ca`. | [Completion Receipt](./reports/phase-04-completion-receipt.md) · [Build Report](./reports/phase-04-darwin-build.md) | Phase 03 (Cleared) |
| **05** | Darwin runtime integration | Pending | **Completed (Durable)** | State/baseline/history/process/workspace integration reviewed; Score: 9.6/10. 0 Critical Issues. Capability parent ownership scoped with `owns_parent` in native C and synced Mach-O binaries; array mutation eliminated; 245/245 tests pass, 0 regressions. Sealed via controller task run `0ed8b6dc-250b-4e8d-84c5-1d68e08c6709`, commit `7b1ba613`. | [Completion Receipt](./reports/phase-05-completion-receipt.md) · [Cycle 1 Report](./reports/code-review-261004-1914-phase-05-darwin-runtime-integration.md) · [Cycle 2 Report](./reports/code-review-261004-1959-phase-05-darwin-runtime-integration.md) · [Cycle 3 Report](../reports/code-review-261004-2026-phase-05-darwin-runtime-integration.md) | Phase 04 (Cleared) |
| **06** | Package and Linux qualification | Pending | **Completed (Durable Regeneration)** | Candidate regenerated (ID: `evcrate-candidate-1791140555626`, 7,410 files, 132,976,902 bytes, archive SHA: `6a720dfb136fb80ccd624cdca63dbce3ca18ba08fe75a2ef322c90f3d7a5b3a9`, manifest SHA: `365f145bb0deefe9eabad83ac6c9f9e598e7bb80f275c435e54a17321ee7c86a`). Repaired `.omp` build manifest output hash; `distribute:check` and `release:check` passed; `node-launch.test.cjs` passed 9/9 in extracted candidate; 778 tests passing (753 pass, 25 win32 platform skips); Cycle 2 native-runner fixes verified; review score 9.8/10. Sealed via controller task run `141b8ea3-fc3f-4751-b7ef-d03d86ad96f1`. | [Regeneration Receipt](./reports/phase-06-141b8ea3-fc3f-4751-b7ef-d03d86ad96f1-completion-receipt.md) · [Regeneration Review](../reports/code-review-261005-0231-phase-06-qualification-regeneration.md) · [Original Receipt](./reports/phase-06-completion-receipt.md) | Cleared for Phase 07 |
| **07** | Native Windows qualification | Pending | **Audit Complete / Handed back to Phase 06 (Rule 94; 2026-10-05); formal qualification invalidated** | Reachable Windows PowerShell 5.1 × Node 24.21.0 row: 111/111 native test assertions passed across three suites (48 + 19 + 44); installed lifecycle and PowerShell UTF-8 transport passed. Required `node-launch-behavior` suite failed (1 passed, 8 failed) with `PUBLICATION_FAILED` due to stale `.evcrate/build-manifest-omp.json`; the candidate is invalid. Cycle 2 review: 8.8/10, 0 critical issues. | [Phase Report](./reports/phase-07-windows-qualification.md) · [Cycle 1 Review](./reports/code-review-261005-0043-phase-07-native-windows-qualification.md) · [Cycle 2 Review](./reports/code-review-261005-0110-phase-07-native-windows-qualification.md) | Phase 06 candidate refresh; exact Node 22.19.0, PowerShell 7, and attached interactive console remain unavailable prerequisites |
| **08** | Documentation and handoff | Pending | Planned | Evidence-bounded docs, final gates and precise support labels | [Phase Contract](./phase-08-documentation-handoff.md) | Requires final-candidate Phase 07 qualification |

---

## Active Phase Summary & Next Steps

- **Durably completed phases (5/8):**
  - `Phase 01`: Baseline and launch contract (Completed, Task Run `77cef843-37ab-4d93-8460-ab30d1fcd961`, Score: 9.5/10)
  - `Phase 02`: Node-only callers (Completed, Task Run `260bc5fe-f26a-4740-aaaf-9315dca30c7e`, Score: 9.8/10, Commit: `a6b6f7c4`)
  - `Phase 03`: Linux launch verification (Completed, Task Run `0ef7af0d-8ee1-4c9b-9f32-df134e89ba9b`, Score: 9.9/10, Commit: `d6fa5061`)
  - `Phase 04`: Darwin native build (Completed, Task Run `5c43c689-72a7-4000-a7c2-4c62671db0ca`, Score: 8.4/10, Commit: `fdb14a93`)
  - `Phase 05`: Darwin runtime integration (Completed, Task Run `0ed8b6dc-250b-4e8d-84c5-1d68e08c6709`, Score: 9.6/10, Commit: `7b1ba613`)
- **Current work:** Phase 06 candidate regeneration and Linux requalification complete. Candidate ID `evcrate-candidate-1791140555626` frozen and verified (7,410 files, archive SHA: `6a720dfb...`). All gates passing. Requalification review passed (9.8/10).
- **Phase 07 status:** Ready for requalification execution against new candidate bundle.
- **Next steps:**
  1. Phase 07 executes qualification on native Windows host against candidate `evcrate-candidate-1791140555626` using the embedded Cycle 2 runner.
  2. Phase 07 reruns the required four-row matrix and authentic attached-console exercise against that same candidate; missing Node 22.19.0, PowerShell 7, and interactive-console prerequisites must be resolved or explicitly remain blocked.
  3. Phase 08 starts only after final-candidate Windows qualification.
