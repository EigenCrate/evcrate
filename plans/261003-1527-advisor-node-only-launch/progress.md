# Advisor Node-only launch and cross-platform runtime — Progress Overview

**Overview Path:** `plans/261003-1527-advisor-node-only-launch/progress.md`  
**Plan Path:** `plans/261003-1527-advisor-node-only-launch/plan.md`  
**Last Reconciled:** 2026-10-05  
**Active Advice Lifecycle:** Active (`--advice` explicit mode)  
**Latest Completed Task Run ID:** `10471d50-a4f7-4b40-8001-0164b8f7b09b` (Phase 06)  
**Current Selected Phase:** Phase 06 — candidate regeneration and Linux requalification (Rule 94 handback from Phase 07)

---

## Phase Reconciliation Matrix

| Phase | Title | Captured Status | Current Status | Completion Basis / Scope | Evidence Links | Prerequisites / Blockers |
|---|---|---|---|---|---|---|
| **01** | Baseline and contract | Pending | **Completed (Durable)** | Approved source snapshot (`9d4b799e` + 20 synced assets), 8-target manifest, exact caller inventory, Node-only launch contract in `system-architecture.md` and `code-standards.md`, 460/460 tests passing, review score 9.5/10. Sealed via controller task run `77cef843-37ab-4d93-8460-ab30d1fcd961`. | [Completion Receipt](./reports/phase-01-completion-receipt.md) · [Baseline Report](./reports/phase-01-baseline.md) | None (Completed) |
| **02** | Node-only callers | Pending | **Completed (Durable)** | Canonical workflows (`advisor-mentoring.md`), skills (`SKILL.md:31`, `brief-contract.md:25`), README, 8 consult calls in E02/E03, and 4 test launchers unified on explicit Node. 460/460 tests passed, review score 9.8/10, synchronized across 8 targets. Sealed via controller task run `260bc5fe-f26a-4740-aaaf-9315dca30c7e`. | [Completion Receipt](./reports/phase-02-completion-receipt.md) · [Caller Report](./reports/phase-02-callers.md) | Phase 01 (Cleared) |
| **03** | Linux launch verification | Pending | **Completed (Durable)** | Real isolated lifecycle smoke, launch/error regressions, portable Windows fixtures, 0o644 execute-bit independence, interactive console N15 pty verification. 331/331 tests passed, review score 9.9/10, commit `d6fa5061`. Sealed via controller task run `0ef7af0d-8ee1-4c9b-9f32-df134e89ba9b`. | [Completion Receipt](./reports/phase-03-completion-receipt.md) · [Launch Report](./reports/phase-03-linux-launch.md) | Phase 02 (Cleared) |
| **04** | Darwin native build | Pending | **Completed (Durable)** | Safe native primitive contract, arm64/x64 compile-only Mach-O artifacts (`advisor-native.node`) and provenance (`artifacts.json`), Darwin loader (`darwin-platform.cjs`), 44-file closure in controller inventory and build manifests, 382/382 tests passing, review score 8.4/10, commit `fdb14a93`. Sealed via controller task run `5c43c689-72a7-4000-a7c2-4c62671db0ca`. | [Completion Receipt](./reports/phase-04-completion-receipt.md) · [Build Report](./reports/phase-04-darwin-build.md) | Phase 03 (Cleared) |
| **05** | Darwin runtime integration | Pending | **Completed (Durable)** | State/baseline/history/process/workspace integration reviewed; Score: 9.6/10. 0 Critical Issues. Capability parent ownership scoped with `owns_parent` in native C and synced Mach-O binaries; array mutation eliminated; 245/245 tests pass, 0 regressions. Sealed via controller task run `0ed8b6dc-250b-4e8d-84c5-1d68e08c6709`, commit `7b1ba613`. | [Completion Receipt](./reports/phase-05-completion-receipt.md) · [Cycle 1 Report](./reports/code-review-261004-1914-phase-05-darwin-runtime-integration.md) · [Cycle 2 Report](./reports/code-review-261004-1959-phase-05-darwin-runtime-integration.md) · [Cycle 3 Report](../reports/code-review-261004-2026-phase-05-darwin-runtime-integration.md) | Phase 04 (Cleared) |
| **06** | Package and Linux qualification | Pending | **Reopened — candidate regeneration and Linux requalification required** | Original run generated an 8-target candidate; 758 tests passed (25 win32 skips), `release:check` and `distribute:check` passed, and the 7,410-file bundle round-tripped. Phase 07 found a stale `.omp` build-manifest hash in that candidate; regenerate the manifest and runner fixes on Linux, rerun gates, and freeze a replacement bundle. | [Original Completion Receipt](./reports/phase-06-completion-receipt.md) · [Original Review](./reports/code-review-261004-2215-phase-06-package-linux-qualification.md) · [Phase 07 Report](./reports/phase-07-windows-qualification.md) | Rule 94: refresh candidate and repeat Linux qualification before Phase 07 resumes |
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
- **Current work:** Phase 06 reopened. Its original run passed its recorded Linux gates, but Phase 07 invalidated that candidate because of a stale `.omp` build-manifest hash. Regenerate and requalify on Linux before freezing a replacement bundle.
- **Phase 07 audit:** Complete and handed back to Phase 06 under Rule 94 on 2026-10-05. The reachable native suites passed 111/111; the separate launch-behavior suite failed, so this is not a Phase 07 qualification completion.
- **Next steps:**
  1. Phase 06 regenerates the `.omp` manifest and applies Cycle 2 native-runner fixes before rerunning Linux gates and freezing a new bundle.
  2. Phase 07 reruns the required four-row matrix and authentic attached-console exercise against that same candidate; missing Node 22.19.0, PowerShell 7, and interactive-console prerequisites must be resolved or explicitly remain blocked.
  3. Phase 08 starts only after final-candidate Windows qualification.
