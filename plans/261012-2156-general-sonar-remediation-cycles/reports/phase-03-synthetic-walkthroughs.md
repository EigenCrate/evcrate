# Phase 03 Synthetic Planning Walkthroughs

> **DATA NOTICE & SYNTHETIC EVIDENCE LABEL:**
> All scenarios, hashes, metrics, and findings in this document are **explicitly synthetic planning fixtures** designed to exercise the exact tables, enums, and state transition rules in `ext/sonarqube-test-quality/references/remediation-cycles.md`, `references/run-guidance.md`, `templates/remediation-cycle-report.md`, and `templates/run-guidance-report.md`.
> **They are NOT real SonarQube server evidence, NOT Phase 07 actual host behavioral executions, and NOT Phase 08 live qualification.**
> **Packaging Boundary Note:** Adding `templates` to `ext/sonarqube-test-quality/package.json#files` and `lib/install.js` installed payload inventory is owned and verified in Phase 06 (`phase-06-transactional-two-skill-installer-and-package.md`).

---

## 1. Unified §5 Per-Cycle, Per-Target Ledger Exercises (W-01 through W-04)

*Exercises the exact 18-column §5 table structure from `templates/remediation-cycle-report.md` across all four required synthetic walkthroughs:*
- **W-01 (`RUN-261012-w01-candidate`):** Early-round success candidate across two targets (`target-backend`, `target-frontend`) sharing input checkpoint (`SHA: 1a2b3c4d5e`, `sha256:aaa111`), budget `N = 3`, entered rounds `1 / 3`.
- **W-02 (`RUN-261012-w02-rereview`):** Failed rereview in `C1` after 1 correction batch (`correction_used: true`), budget `N = 2`, entered rounds `1 / 2`. Halts at `CK_REREVIEW`; **upload strictly blocked**.
- **W-03 (`RUN-261012-w03-exhausted`):** Budget exhaustion (`N = 1`, entered rounds `1 / 1`) with 1 issue `code-fixed` and 2 active issues remaining (`server-verified residual findings`).
- **W-04 (`RUN-261012-w04-declined`):** Round `C1` candidate enters Stage `F`, passes `F_AGGREGATE_REVIEW`, and user declines commit at `F_AWAITING_COMMIT` (`awaiting commit`).

| Cycle / Round | Target ID | Stage Reached / Halted At | Pre / Post Source Checkpoint (`SHA` + Digest) | Submission Timestamp | Captured `ceTaskId` & Status | Bound `analysisId`, Revision & Time | Analysis-Bound Gate Status | Paginated Issues (`Rcvd / Total / Pages`) | Paginated Hotspots (`Rcvd / Total / Pages`) | Window Ceiling Status | Pre / Post `analysisId` Stability | Manual Transition Check | Snapshot Consistency | Delta vs `C0` (`Fixed / Resid / New / Reopen / Unk / NonCodeDisp`) | Review / Correction / Rereview Terminal Verdicts | Private Raw Evidence References | Blockers & Next Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `W-01: C0` | `target-backend` | `C0_BASELINE` | `pre == post` (`1a2b3c4d5e`, `sha256:000`) | `2026-10-12T10:00:00Z` | `TSK-0001` (`SUCCESS`) | `ANA-0001` / `1a2b3c4d5e` / `10:00:40Z` | `ERROR` | `2 / 2 / 1p` (Complete) | `1 / 1 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `Baseline: 0 / 2 / 0 / 0 / 0 / 0` | `N/A (Baseline)` | `<private-evidence-dir>/w01-c0-back.json` | Enter `C1` (`1/3`) |
| `W-01: C0` | `target-frontend` | `C0_BASELINE` | `pre == post` (`1a2b3c4d5e`, `sha256:000`) | `2026-10-12T10:02:00Z` | `TSK-0002` (`SUCCESS`) | `ANA-0002` / `1a2b3c4d5e` / `10:02:35Z` | `ERROR` | `1 / 1 / 1p` (Complete) | `0 / 0 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `Baseline: 0 / 1 / 0 / 0 / 0 / 0` | `N/A (Baseline)` | `<private-evidence-dir>/w01-c0-front.json` | Enter `C1` (`1/3`) |
| `W-01: C1` | `target-backend` | `CK_EVALUATION` | `pre == post` (`1a2b3c4d5e+dirty`, `sha256:aaa111`) | `2026-10-12T10:20:00Z` | `TSK-1001` (`SUCCESS`) | `ANA-1001` / `1a2b3c4d5e` / `10:20:45Z` | `OK` | `0 / 0 / 1p` (Complete) | `1 / 1 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `2 / 0 / 0 / 0 / 0 / 1 hotspot-reviewed` | `Review: APPROVED (<independent-reviewer-role>); Corr: false; Rereview: NOT_APPLICABLE` | `<private-evidence-dir>/w01-c1-back.json` | Early-round candidate |
| `W-01: C1` | `target-frontend` | `CK_EVALUATION` | `pre == post` (`1a2b3c4d5e+dirty`, `sha256:aaa111`) | `2026-10-12T10:22:00Z` | `TSK-1002` (`SUCCESS`) | `ANA-1002` / `1a2b3c4d5e` / `10:22:40Z` | `OK` | `0 / 0 / 1p` (Complete) | `0 / 0 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `1 / 0 / 0 / 0 / 0 / 0` | `Review: APPROVED (<independent-reviewer-role>); Corr: false; Rereview: NOT_APPLICABLE` | `<private-evidence-dir>/w01-c1-front.json` | Outcome: `locally remediated`; advance to Stage `F` |
| `W-02: C1` | `target-core` | `CK_REREVIEW` | `pre == post` (`2b3c4d5e6f+dirty`, `sha256:bbb222`) | `not-submitted (blocked: failed-rereview)` | `not-submitted (blocked: failed-rereview)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `Unverified (pre-upload halt at CK_REREVIEW)` | `Review: CHANGES_REQUESTED (<independent-reviewer-role>); Corr: true; Rereview: REJECTED (<independent-rereviewer-role>)` | `<private-evidence-dir>/w02-c1-rereview.json` | Outcome: `blocked/incomplete` (`failed-rereview`); enter `C2` (`2/2`) or halt |
| `W-03: C1` | `target-service` | `CK_EVALUATION` | `pre == post` (`3c4d5e6f7a+dirty`, `sha256:ccc333`) | `2026-10-12T11:15:00Z` | `TSK-3001` (`SUCCESS`) | `ANA-3001` / `3c4d5e6f7a` / `11:15:50Z` | `ERROR` | `2 / 2 / 1p` (Complete) | `0 / 0 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `1 / 2 / 0 / 0 / 0 / 0` | `Review: APPROVED (<independent-reviewer-role>); Corr: false; Rereview: NOT_APPLICABLE` | `<private-evidence-dir>/w03-c1-issues.json` | Outcome: `server-verified residual findings` (`budget-n-exhausted`, `1/1`) |
| `W-04: F` | `target-module` | `F_AWAITING_COMMIT` | `pre == post` (`4d5e6f7a8b+dirty`, `sha256:ddd444`) | `not-submitted (blocked: declined-commit)` | `not-submitted (blocked: declined-commit)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `not-applicable (pre-upload halt)` | `Pending Stage F committed-source upload` | `Aggregate Review: APPROVED (<independent-reviewer-role>); Final Audit: NOT_REACHED` | `<private-evidence-dir>/w04-f-review.json` | Outcome: `awaiting commit` (`declined-commit`); preserve dirty tree |

---

## 2. Populated Stage `F` Qualification Table for W-04 (Declined Commit)

*Exercises the exact §6 table and `APPROVED | DECLINED | PENDING | NOT_REACHED` enums from `templates/remediation-cycle-report.md`:*

| Sub-Stage | Gate Item | Status / Record | Verification Evidence |
|---|---|---|---|
| `F_AGGREGATE_REVIEW` | **Cumulative Aggregate Review** | `APPROVED` | `<independent-reviewer-role>` terminal report `<private-evidence-dir>/w04-f-review.json` |
| `F_AWAITING_COMMIT` | **Separate Commit Authorization / User Commit** | `DECLINED` | User declined commit authorization at `F_AWAITING_COMMIT`; working tree preserved without `git commit/stash/reset/push` |
| `F_COMMITTED_INPUT_CHECK` | **Committed Intended Input Verification** | `PENDING` | Awaiting user-created commit |
| `F_COMMITTED_INPUT_CHECK` | **Reproducible Generated Inputs** | `NOT_APPLICABLE` | Profile has no generated inputs |
| `F_COMMITTED_INPUT_CHECK` | **Post-Commit Hook & Build Drift Check** | `NOT_REACHED` | Blocked by `DECLINED` commit authorization |
| `F_FINAL_LIFECYCLE_UPLOAD` | **Mandatory Final Actual Submission** | `NOT_REACHED` | Blocked until committed source checkpoint is verified |
| `F_FINAL_TASK_WAIT` | **Per-Target Final Task, Analysis & Gate** | `NOT_REACHED` | Blocked until final upload executes |
| `F_FINAL_AUDIT` | **Independent Final Audit Verdict** | `NOT_REACHED` | Outcome remains `awaiting commit`, never `server-verified success` |

---

## 3. Edge Cases (E-01 through E-04) and Resume/Rebaseline/No-Progress Walkthroughs (W-06 through W-08)

| ID | Scenario & Observation | Exact Ledger Fields & Enum Values Recorded | Policy Rule Verified |
|---|---|---|---|
| **E-01** | **Partial Pagination Rejection:** `issues/search` reports `total: 150`, but only page 1 (`100 / 150 / 1p`) was fetched. | `Paginated Issues: 100 / 150 / 1p (Partial)`; `Snapshot Consistency: invalidated`; `Outcome: blocked/incomplete` | Unexhausted pagination (`total_received != total_on_server`) strictly blocks completeness. |
| **E-02** | **Analysis Collision / Unknown Consistency:** Server `analysisId` changes mid-capture (`ANA-001 → ANA-002`), or server lacks manual-transition changelog support. | `Pre/Post analysisId Stability: analysis-changed-invalidated`; `Manual Transition Check: consistency: unknown`; `Snapshot Consistency: consistency-unknown-blocked` | Contaminated or unknown-consistency snapshots block `server-verified success` (`Trigger: consistency-unknown`). |
| **E-03** | **Disappearing Finding via Accepted Risk:** Issue `AX-999` transitions to `RESOLVED/WONTFIX → RESOLVED_ACCEPTED`. | `Local Stage: owner-disposition-recorded`; `Disappearance Causation: accepted-risk`; `Owner Disposition: owner-approved-accepted`; `Delta vs C0: 0 fixed / ... / 1 owner-approved-accepted` | Never increments `Fixed` counter. Requires recorded owner approval; `unapproved-manual-transition` blocks `server-verified success`. |
| **E-04** | **Multi-Target Partial Failure:** `target-api` passes (`CK_EVALUATION`), but `target-worker` fails a unit test in `CK_TEST`. | `target-api: CK_EVALUATION (PASS)`; `target-worker: CK_TEST (not-submitted (blocked: test-or-build-failed))`; `Outcome: blocked/incomplete` | Shared checkpoint is atomic; `CK_TEST` failure halts the round immediately with no in-round test-fix retry. |
| **W-06** | **Task-Wait Resume & Drift Check:** Interrupted in `CK_TASK_WAIT` with `ce_task_id: TSK-6001`. | If tree matches `pre_scan_sha` + `pre_scan_digest`: polls `/api/ce/task?id=TSK-6001` with `entered_round_count` unchanged (`1/3`). If tree drifted: polls read-only, sets `dirty_tree_state: drift-invalidated`, halts `blocked/incomplete` (`resume-checkpoint-drift`). | Resume never re-uploads or burns budget; working-tree drift invalidates the resumed task. |
| **W-07** | **Scope/Profile Rebaseline Without Budget Reset:** Owner switches Quality Profile after `C1` (`1/3`). | Appends entry to `rebaseline_history`; captures new baseline `C0'`; preserves `entered_round_count: 1` (`global_budget_n: 3`, 2 rounds left). | Rebaselining invalidates prior deltas and requires new `C0` without resetting spent budget `N`. |
| **W-08** | **Two-Round Comparable No-Progress Halt:** `C0` has 4 active issues; `C1` (`1/4`) and `C2` (`2/4`) both end with 4 active issues (`0` net reduction). | `Stage Reached: HALTED`; `Outcome: server-verified residual findings`; `Trigger: two-round-no-progress`; `Entered Rounds: 2 / 4` | Halts after two comparable no-progress rounds and escalates to owner without burning `C3` or `C4`. |

---

## 4. Sanitized Guidance Emission Summary Across All Walkthroughs (W-01 through W-08)

*All synthetic walkthrough guidance artifacts adhere to the Provenance-to-Confidence Ceiling in `references/run-guidance.md` (`Provenance: synthetic` strictly caps all summary and per-observation confidence labels at `hypothesized`):*

| Guidance ID (Neutral Slug) | Originating Run Outcome & Trigger | Provenance | Summary & Per-Observation Confidence | Owner Reviewer Identity | Candidate Promotion Status |
|---|---|---|---|---|---|
| `GD-261012-w01-early-candidate` | `locally remediated` (`none`) | `synthetic` | `hypothesized` | `pending-owner-review` | `not-applicable (synthetic walkthrough)` |
| `GD-261012-w02-failed-rereview` | `blocked/incomplete` (`failed-rereview`) | `synthetic` | `hypothesized` | `pending-owner-review` | `not-applicable (synthetic walkthrough)` |
| `GD-261012-w03-budget-exhausted` | `server-verified residual findings` (`budget-n-exhausted`) | `synthetic` | `hypothesized` | `pending-owner-review` | `not-applicable (synthetic walkthrough)` |
| `GD-261012-w04-declined-commit` | `awaiting commit` (`declined-commit`) | `synthetic` | `hypothesized` | `pending-owner-review` | `not-applicable (synthetic walkthrough)` |
| `GD-261012-w06-task-resume` | `locally remediated` / `blocked/incomplete` (`resume-checkpoint-drift`) | `synthetic` | `hypothesized` | `pending-owner-review` | `not-applicable (synthetic walkthrough)` |
| `GD-261012-w07-scope-rebaseline` | `reviewed` (`none`) | `synthetic` | `hypothesized` | `pending-owner-review` | `not-applicable (synthetic walkthrough)` |
| `GD-261012-w08-no-progress-halt` | `server-verified residual findings` (`two-round-no-progress`) | `synthetic` | `hypothesized` | `pending-owner-review` | `not-applicable (synthetic walkthrough)` |
