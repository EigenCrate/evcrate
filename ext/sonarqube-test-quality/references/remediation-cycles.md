# Remediation Cycles: State, Budget, and Evidence Contracts

This reference is the single authoritative policy owner for bounded SonarQube remediation cycles, entered-round counting against global budget `N`, state machine transitions, stage persistence and resume, and server-verified success contracts.

## 1. Core Principles and Budget Model

### Global Fix Budget (`N`)
- **Maximum Ceiling:** `N` is an agreed global maximum on **entered fix rounds** across all targets in the remediation run. It is never a mandatory target number of rounds; remediation advances to Stage `F` as soon as an early-round success candidate is achieved. If `N` is omitted or invalid when invoking a bounded remediation cycle, the parent workflow must prompt the user before entering any round.
- **Scope of `N`:** One global budget `N` spans all configured project targets simultaneously. Targets do not receive independent or multiplier budgets.
- **Entered-Round Accounting:**
  - Persisted `entered_round_count` increments immediately upon **entering** round `Ck`, before any code modification begins.
  - Any failure, interruption, compiler error, test breakage, failed review, failed rereview, or abandoned attempt during round `Ck` consumes that entered round.
  - If `N` is exhausted without satisfying the success criteria, execution terminates with outcome `server-verified residual findings` or `blocked/incomplete` (`Trigger: budget-n-exhausted`). Exhaustion never permits unbudgeted fix attempts or free final edits.
- **Budget Exclusions:**
  - **Baseline (`C0`):** Preflight discovery, initial analysis, and baseline capture do not consume from `N`. If existing server records cannot be cryptographically and temporally bound to the current commit SHA, active input content digest, and nonsecret configuration, an approved full lifecycle and upload must establish `C0`.
  - **Final Stage (`F`):** Final aggregate review, separate commit authorization or verified user commit, committed-input verification, reproducible generated-input check, final full lifecycle execution, mandatory actual submission, and independent final audit do not consume from `N`. Stage `F` is strictly non-editorial: it never allows code fixes. If issues are uncovered during `F`: if remaining budget within approved `N` exists, returning to remediation requires entering round `C(k+1)` (which increments `entered_round_count` against `N`); if approved budget `N` is exhausted, further remediation requires explicit owner approval for an additional budget round. Exhaustion never permits unbudgeted fix attempts or free final edits.

---

## 2. Stage Lifecycle and State Machine

Remediation advances through 17 discrete stages governed by strict entry and exit gates. A failed prerequisite strictly halts execution and blocks dependent stages; no synthetic child results or simulated uploads are permitted.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  C0_BASELINE: Baseline Capture (Excluded from N)                         │
│  - Record pre-lifecycle source checkpoint (SHA + input/gen digests)      │
│  - Execute full baseline scan or bind verified existing analysis         │
│  - Verify post-lifecycle source checkpoint (no mid-scan drift)           │
│  - Index authoritative findings, hotspots, coverage, and gate status     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
        [Active Issues Remain]             [Zero In-Scope Issues]
                     │                               │
                     ▼                               │
┌─────────────────────────────────────────┐          │
│  Enter Round Ck (Increments entered N)  │          │
│  - Persist entered_round_count & stage  │          │
│  - Reset round correction_used = false  │          │
└────────────────────┬────────────────────┘          │
                     │                               │
                     ▼                               │
┌─────────────────────────────────────────┐          │
│  CK_FIX → CK_TEST → CK_REVIEW           │          │
│  - Implement surgical root-cause fixes  │          │
│  - Run focused, full & native checks    │          │
│  - Build/test failure halts Ck at once  │          │
│  - Independent reviewer evaluates       │          │
└────────────────────┬────────────────────┘          │
                     │                               │
            ┌────────┴────────┐                      │
            ▼                 ▼                      │
       [Approved]        [Changes Needed]            │
            │                 │                      │
            │                 ▼                      │
            │  ┌──────────────────────────────────┐  │
            │  │ CK_CORRECTION → CK_REREVIEW      │  │
            │  │ (Max 1 corrective batch per Ck)  │  │
            │  │ - Set correction_used = true     │  │
            │  │ - Surgical corrections & retest  │  │
            │  │ - Independent rereview           │  │
            │  └──────────────┬───────────────────┘  │
            │                 │                      │
            │        ┌────────┴────────┐             │
            │        ▼                 ▼             │
            │   [Approved]       [Unapproved]        │
            │        │                 │             │
            │        │                 ▼             │
            │        │    [Consume Ck; halt/next Ck] │
            │        │    (No upload after failure)  │
            ▼        ▼                               │
┌─────────────────────────────────────────┐          │
│  CK_VERIFY_IMPORT → CK_UPLOAD →         │          │
│  CK_TASK_WAIT → CK_EVALUATION           │          │
│  - Record pre-scan source checkpoint    │          │
│  - Verify two-factor report freshness   │          │
│  - Execute approved scanner upload      │          │
│  - Persist ceTaskId & resume state      │          │
│  - Poll task → analysisId → gate        │          │
│  - Verify post-scan source checkpoint   │          │
└────────────────────┬────────────────────┘          │
                     │                               │
            ┌────────┴────────┐                      │
            ▼                 ▼                      │
       [Issues Remain]   [Early-Round Candidate]     │
            │                 │                      │
            ▼                 │                      │
   [Check N & Progress;]      │                      │
   [Enter C(k+1) or Halt]     │                      │
                              ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  F: Final Verification & Audit (Excluded from N; Non-editorial)          │
│  - F_AGGREGATE_REVIEW: Independent review of cumulative changes          │
│  - F_AWAITING_COMMIT: Separate commit auth OR verify user commit         │
│  - F_COMMITTED_INPUT_CHECK: Verify committed inputs, generated-input     │
│    reproducibility, and zero post-commit hook/build drift                │
│  - F_FINAL_LIFECYCLE_UPLOAD: Full native verification + scanner upload   │
│  - F_FINAL_TASK_WAIT: Poll ceTaskId → analysisId → gate per target       │
│  - F_FINAL_AUDIT: Independent final audit certifies full compliance      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Canonical Stage Enum (17 Stages)
`C0_BASELINE`, `CK_FIX`, `CK_TEST`, `CK_REVIEW`, `CK_CORRECTION`, `CK_REREVIEW`, `CK_VERIFY_IMPORT`, `CK_UPLOAD`, `CK_TASK_WAIT`, `CK_EVALUATION`, `F_AGGREGATE_REVIEW`, `F_AWAITING_COMMIT`, `F_COMMITTED_INPUT_CHECK`, `F_FINAL_LIFECYCLE_UPLOAD`, `F_FINAL_TASK_WAIT`, `F_FINAL_AUDIT`, `HALTED`.

### Stage Rules and Invariants

1. **Fix → Test → Independent Review (`CK_FIX`, `CK_TEST`, `CK_REVIEW`):**
   - Edits are confined to identified root causes in production or test code within agreed scope; unrelated refactoring is prohibited.
   - Applicable required native builds and test suites must execute and pass completely. When scanner instrumentation or build wrappers alter compiler flags or runtime semantics, a separate clean uninstrumented native verification run is mandatory ([Local analysis](local-analysis.md#3-native-semantic-parity-verification)).
   - **No In-Round Test-Failure Retry (`CK_TEST` Gate):** If compilation, focused tests, full suite, or uninstrumented native verification fails during `CK_TEST` (or during the retest inside `CK_CORRECTION`), round `Ck` terminates immediately at `CK_TEST` (or `CK_CORRECTION`) with outcome `blocked/incomplete` (`Trigger: test-or-build-failed`), consuming that entered round. No hidden in-round fix-and-retest retry or scanner upload is permitted; further source edits require entering round `C(k+1)` if budget `N` remains.
   - **Role Independence:** Initial review (`CK_REVIEW`), corrective rereview (`CK_REREVIEW`), cumulative review (`F_AGGREGATE_REVIEW`), and final audit (`F_FINAL_AUDIT`) must each be conducted by an independent role distinct from the implementing role (`reviewer_id != implementer_id`, `rereviewer_id != implementer_id`, `auditor_id != implementer_id`, `evidence_actor_id != implementer_id`). If `CK_REVIEW` rejects outright without requesting changes for correction, round `Ck` terminates immediately with outcome `blocked/incomplete` (`Trigger: failed-review`), consuming the entered round without upload. Self-approval by the implementing role or violation of pairwise independence halts immediately (`Trigger: role-independence-violation`).
2. **One Correction Batch per Round (`CK_CORRECTION`, `CK_REREVIEW`):**
   - A correction batch is triggered **only** when `CK_REVIEW` returns `CHANGES_REQUESTED` after passing `CK_TEST`. At most **one** corrective iteration is permitted within `Ck`: `Correction → Retest → Independent Rereview`.
   - The `correction_used` flag is persisted as `true` for `Ck`.
   - If the retest fails, round `Ck` terminates immediately with outcome `blocked/incomplete` (`Trigger: test-or-build-failed`). If `CK_REREVIEW` returns `REJECTED` / requests further changes after passing the retest, round `Ck` terminates immediately with outcome `blocked/incomplete` (`Trigger: failed-rereview`). The unapproved changes must **not** be uploaded to the Sonar server. Further source edits require entering `C(k+1)` if budget `N` remains.
3. **Pre/Post Lifecycle Source Identity and Upload Gating (`CK_VERIFY_IMPORT`, `CK_UPLOAD`, `CK_TASK_WAIT`, `CK_EVALUATION`):**
   - Before and immediately after every baseline, round, or final scanner lifecycle (`C0_BASELINE`, `CK_VERIFY_IMPORT` through `CK_EVALUATION`, and `F_FINAL_LIFECYCLE_UPLOAD` through `F_FINAL_TASK_WAIT`), the workflow must record and compare the source checkpoint (`commit_sha`, `active_input_digest`, and `generated_input_digest`). Any mid-lifecycle drift invalidates the scan and blocks stage completion (`dirty_tree_state: drift-invalidated`).
   - Coverage and execution report freshness must satisfy the canonical two-factor rule in [Project discovery](project-discovery.md#2-safe-actual-input-identity) before `CK_UPLOAD`.
   - Scanner upload is upload-capable and requires explicit preflight upload authorization naming target server, project keys, and branch/PR selector.
   - Scanner upload is strictly forbidden if compilation fails, any required native test fails, fresh coverage verification fails, or code review/rereview is unapproved.
4. **Two Comparable No-Progress Rounds:**
   - If two consecutive rounds (`C(k-1)` and `Ck`) exhibit no net reduction in active in-scope findings under comparable scope, automated remediation must halt immediately with outcome `server-verified residual findings` (`Trigger: two-round-no-progress`).
   - The condition is escalated to the human owner for root-cause diagnosis, strategy reassessment, or explicit abort. Never silently extend `N` or re-attempt identical edits.
5. **Scope, Profile, Gate, or Filter Changes:**
   - Any modification to branch/PR selector, project key, quality profile, quality gate metric thresholds, active status filters, or path exclusions mid-run explicitly **invalidates all prior delta comparisons**.
   - Such changes require explicit owner approval and mandate establishing a **new baseline (`C0`)**.
   - Rebaselining does **not** reset `entered_round_count` against `N`. All previously entered rounds remain counted against the original budget, and prior cycle evidence is preserved in `cycle_history` and `rebaseline_history`.

---

## 3. State Persistence and Resume Protocol

Remediation must be resilient to network disconnects, long-running server analysis queues, and process boundaries without losing state or burning budget.

### Authoritative Private JSON Checkpoint vs. Markdown Index
- **Private JSON Checkpoint (`<private-evidence-dir>/resume-checkpoint.json`):** Authoritative machine-readable state is persisted in a private JSON file outside the repository working tree (or in an already-approved ignored evidence location).
- **Markdown Ledger Index:** The YAML block in `templates/remediation-cycle-report.md` mirrors and indexes `<private-evidence-dir>/resume-checkpoint.json` for human inspection. Markdown is never reverse-parsed as an executable verdict engine.

### Persisted Resume State Elements
Every stage transition must durably record the following 8 state structures:
1. `global_budget_n`: The agreed maximum entered rounds.
2. `entered_round_count`: Current count of entered fix rounds (`0 <= count <= N`).
3. `current_stage`: Current stage from the 17-stage canonical enum.
4. `correction_used`: Boolean indicating whether the single permitted correction batch in the current round was exercised.
5. `input_checkpoint`: Pre-lifecycle and post-lifecycle `commit_sha`, `active_input_digest`, `generated_input_digest`, and `dirty_tree_state` (`clean`, `remediated-uncommitted`, `unrelated-untracked`, `drift-invalidated`).
6. `pending_tasks`: Per-target array of active Sonar background tasks (`target_key`, `ce_task_id`, `task_status`, `submitted_at`, `pre_scan_sha`, `pre_scan_digest`).
7. `cycle_history`: Per-cycle (`C0`, `C1..CN`, `F`) and per-target retention of `correction_used`, initial review verdict/reviewer, correction summary, rereview verdict/rereviewer, and target analysis bindings.
8. `rebaseline_history`: Ordered log of approved scope/profile/gate changes and prior `C0` checkpoints.

### Resume and Task-Handling Rules
- **Known Task Resume:** If execution is interrupted while polling a pending background task (`ce_task_id` in `PENDING` or `IN_PROGRESS`), resuming execution queries the existing task ID (`/api/ce/task?id=<ceTaskId>`) without re-executing scanner analysis, triggering another upload, or incrementing `entered_round_count`.
- **Resume Source-Checkpoint Mismatch Rule:** On resume, the runner compares the current working tree (`commit_sha`, `active_input_digest`, `generated_input_digest`) against `pre_scan_sha` and `pre_scan_digest`. If a mismatch is detected, the runner may poll `/api/ce/task?id=<ceTaskId>` read-only solely to record the server task's terminal status in the private ledger, but the checkpoint is immediately marked `dirty_tree_state: drift-invalidated` and the run halts with outcome `blocked/incomplete` (`Trigger: resume-checkpoint-drift`). A drift-invalidated task result can never satisfy round verification or Stage `F` qualification.
- **Failed or Canceled Tasks:** If a polled background task returns `FAILED` or `CANCELED`, the stage halts immediately with outcome `blocked/incomplete` (`Trigger: task-failed`). Failed or canceled tasks must never be treated as passing or silently re-uploaded without diagnosing the failure.
- **Timeout and Incomplete Captures:** If server task polling exceeds configured timeouts or yields unparseable responses, the run state is recorded as `blocked/incomplete` (`Trigger: task-timeout`). An incomplete capture must never be recorded as a passing gate or clean status.

---

## 4. Multi-Target Shared Checkpoint Contract

When remediation encompasses multiple project targets (e.g., polyglot subprojects, multi-module repositories, or combined backend/frontend targets):
- **Shared Input Checkpoint:** All targets in a given cycle (`C0`, `Ck`, or `F`) must be analyzed against the identical repository `commit_sha` and `active_input_digest`.
- **Atomic Run Assessment:** If Target A achieves zero findings with a passing gate, but Target B fails tests, has an incomplete task, or exhibits unresolved findings, the overall remediation outcome is `blocked/incomplete` or `server-verified residual findings`. Success cannot be claimed on a subset of requested targets.
- **Serial Scanner Execution:** To prevent resource contention and directory races in `.scannerwork/` or build output paths, scanner lifecycles across targets must execute serially within the checkout, recording each target's pre/post checkpoint and `ce_task_id` in `pending_tasks`.

---

## 5. Server Evidence and Success Criteria

### Exact Task-to-Analysis-to-Gate Binding
- Every target upload must bind `submission → ceTaskId → analysisId → qualityGate` using the server's task and quality gate APIs (`/api/ce/task?id=<ceTaskId>` and `/api/qualitygates/project_status?analysisId=<analysisId>`).
- **No Unbound Fallback:** Missing `ceTaskId`, missing `analysisId`, or missing server capability to bind the quality gate and findings to the exact target analysis **strictly blocks required proof**. The workflow must never fall back to querying the latest unbound project status when claiming round verification or final success.

### Mutable Snapshot Consistency and Paging Completeness
- **Full Pagination:** Issue and hotspot queries must exhaust all pages (`total_received == total_on_server`) within the server's collection window (e.g., 10,000 items). If the server window limit prevents complete capture of the agreed scope, capture is recorded as `window-exceeded-blocked`.
- **Pre/Post Capture Analysis Check:** Because server findings are mutable, the runner must verify that the target's latest server `analysisId` before pagination matches the `analysisId` after pagination completes. If a concurrent scan alters the server state mid-capture, the snapshot is rejected (`analysis-changed-invalidated`).
- **Manual Status Transition Detection:** The runner checks supported issue/hotspot changelog or history metadata for out-of-band manual transitions during capture. If supported detection of mutable finding or manual-status changes is unavailable on the server/edition, the ledger must report `consistency: unknown`—never "no changes." Unknown required snapshot consistency (`consistency-unknown-blocked`) strictly blocks `server-verified success`.

### Canonical Local Finding Stage vs. Normalized and Raw Server Status
Local assessment and server reality must never be conflated:
- **Canonical Local Stage Enum (10 Values):**
  - `not-present`: Finding did not exist in the specified cycle (e.g., at `C0` before being newly introduced in `C1`).
  - `identified`: Finding present in baseline or prior scan; not yet modified in the current cycle.
  - `newly-introduced`: Finding first appeared in a post-`C0` round scan.
  - `reopened`: Previously resolved finding reappeared as active on the server.
  - `in-progress`: Local source/test edit underway in `CK_FIX` or `CK_CORRECTION`.
  - `locally-fixed`: Code modified locally; awaiting test execution.
  - `retest-passed`: Native build and test suite passed in `CK_TEST` or `CK_CORRECTION`.
  - `review-approved`: Independent reviewer (`CK_REVIEW` or `CK_REREVIEW`) approved the fix.
  - `owner-disposition-recorded`: Project owner recorded an explicit non-code disposition (`owner-approved-accepted`, `owner-approved-false-positive`, or hotspot review).
  - `stage-f-verified`: Verified on committed source in Stage `F`.
- **Active Status Vocabulary:** A server finding is classified as an **active in-scope issue iff its server status belongs to the active status vocabulary discovered and bound in the execution profile** (e.g., `OPEN`, `CONFIRMED`, `REOPENED` in legacy schemas, or `OPEN`, `CONFIRMED` in MQR `issueStatus`), never assumed from hardcoded defaults.
- **Raw vs. Normalized Status Mapping:** Raw API fields must be preserved verbatim in private JSON evidence alongside the ledger's normalized status:

| Raw Legacy (`status` / `resolution`) | Raw MQR (`issueStatus` / `status`) | Normalized Ledger Status | Classification Rule |
|---|---|---|---|
| `OPEN` / `null` | `OPEN` | `OPEN` | Active in-scope issue iff in bound active vocabulary |
| `CONFIRMED` / `null` | `CONFIRMED` | `CONFIRMED` | Active in-scope issue iff in bound active vocabulary |
| `REOPENED` / `null` | *(mapped to `OPEN`)* | `REOPENED` | Active in-scope issue iff in bound active vocabulary |
| `RESOLVED` / `FIXED` | `FIXED` | `RESOLVED_FIXED` | Terminal (requires `code-fixed` verification) |
| `CLOSED` / `FIXED` | `FIXED` (`CLOSED`) | `CLOSED` | Terminal (requires `code-fixed` verification) |
| `CLOSED` / `REMOVED` | `CLOSED` (`REMOVED`) | `CLOSED_REMOVED` | Non-code transition (`moved-or-renamed` or `excluded-or-rule-change` candidate) |
| `RESOLVED` / `FALSE-POSITIVE` | `FALSE_POSITIVE` | `RESOLVED_FALSE_POSITIVE` | Non-code transition (requires owner disposition) |
| `RESOLVED` / `WONTFIX` or `ACCEPTED` | `ACCEPTED` | `RESOLVED_ACCEPTED` | Non-code transition (requires owner disposition) |
| Unrecognized / mismatched | Unrecognized | `UNKNOWN` | Blocks clean verdict until resolved (`unknown-blocked`) |
| Hotspot `TO_REVIEW` / `null` | Hotspot `TO_REVIEW` | `TO_REVIEW` | Active hotspot requiring project owner review (`pending-owner-review`) |
| Hotspot `REVIEWED` / `SAFE` | Hotspot `SAFE` | `REVIEWED_SAFE` | Owner-reviewed hotspot disposition (`owner-hotspot-reviewed`) |
| Hotspot `REVIEWED` / `ACKNOWLEDGED` | Hotspot `ACKNOWLEDGED` | `REVIEWED_ACKNOWLEDGED` | Owner-reviewed hotspot disposition (`owner-hotspot-reviewed`) |
| Hotspot `REVIEWED` / `FIXED` | Hotspot `FIXED` | `REVIEWED_FIXED` | Code-fixed and owner-reviewed hotspot (`owner-hotspot-reviewed`) |

### Disappearance Is Not Fixed & Owner Disposition Rules
A finding that disappears from active query results between scans is **not** automatically credited as code-fixed. The runner must inspect tracked-ID status and history to classify disappearance causation (`Disappearance Causation`) and disposition (`Owner Disposition`):
1. `code-fixed` (`Disposition: remediated-code-fix`): Production/test code modified, root cause eliminated, and server status transitioned to `RESOLVED_FIXED` / `CLOSED` (`FIXED`) on the analyzed commit. Only `code-fixed` findings increment the `Fixed` delta counter.
2. `accepted-risk` (`Disposition: owner-approved-accepted` or `unapproved-manual-transition`): Marked `RESOLVED_ACCEPTED` on server. **Never** credited in the `Fixed` counter. Neither the implementer nor the evidence actor may mark an issue accepted. If accepted by the project owner, the owner approval reference is recorded as `owner-approved-accepted`; unapproved manual transitions (`unapproved-manual-transition`) block `server-verified success`.
3. `false-positive` (`Disposition: owner-approved-false-positive` or `unapproved-manual-transition`): Marked `RESOLVED_FALSE_POSITIVE` on server. **Never** credited in the `Fixed` counter; requires explicit recorded owner disposition.
4. `moved-or-renamed` (`Disposition: re-keyed-tracked`): File or symbol moved (`CLOSED_REMOVED` paired with replacement finding key); tracked across keys without crediting as fixed unless the underlying issue is also resolved.
5. `excluded-or-rule-change` (`Disposition: invalidated-requires-rebaseline`): Disappeared due to path exclusion, file removal outside remediation scope, or quality profile rule deactivation (`CLOSED_REMOVED`); invalidates delta comparison and requires an approved new `C0`.
6. `disappeared-unknown` (`Disposition: unknown-blocked`): Lacks verifiable causation; never credited as fixed and strictly blocks `server-verified success`.
7. `not-disappeared` (`Disposition: unresolved-active` or `pending-owner-review` / `owner-hotspot-reviewed`): Finding remains present in active or hotspot query results.

### Hotspot Review Boundaries
- Security hotspots require human evaluation of data flow, operational context, and threat vectors.
- The automated evidence actor or implementing subagent **must never mark a hotspot resolved, safe, or acknowledged on the server**.
- Required hotspot reviews must be conducted and confirmed by the project owner (`REVIEWED_SAFE`, `REVIEWED_ACKNOWLEDGED`, or `REVIEWED_FIXED`); any in-scope hotspot remaining `TO_REVIEW` (`pending-owner-review`) strictly blocks final success.

### Early-Round Candidate vs. Full Configured Success Contract
- **Early-Round Success Candidate (`locally remediated` / `awaiting commit`):** Achieved in round `Ck` when local fixes, native tests, coverage thresholds, independent review, and round server capture show zero active in-scope issues across all targets, qualifying the run to enter Stage `F`. An early-round candidate on an uncommitted working tree is **never** final `server-verified success`.
- **Final Configured Success (`server-verified success`):** Requires satisfying **all 11 conditions** simultaneously in Stage `F`:
  1. **Target Completeness:** All requested targets processed and analyzed against the identical committed source checkpoint.
  2. **Native Verification:** All applicable required native builds, focused checks, full test suites, smoke checks, and uninstrumented native verification runs execute and pass. Justified `not-applicable` checks require explicit preflight approval and recorded rationale ([Project discovery](project-discovery.md#3-applicability-and-requirement-separation)).
  3. **Coverage Compliance:** Fresh coverage reports (verified by the canonical two-factor rule in [Project discovery](project-discovery.md#2-safe-actual-input-identity)) meet or exceed configured profile metrics and operators without combining incompatible module/language metrics. Zero denominator is `0/0 (undefined)`, never `100%`; unsupported branch coverage is `unsupported`, never an implicit pass.
  4. **Independent Review:** Cumulative changes approved by an independent code reviewer (`F_AGGREGATE_REVIEW`).
  5. **Committed Source & Reproducible Inputs:** Separate user commit authorization obtained or user-created commit verified (`F_AWAITING_COMMIT`). All intended analysis/build inputs match committed source, generated inputs derive reproducibly from committed source plus approved config, unrelated dirty files are demonstrably outside analysis/build inputs, and zero post-commit hook/build drift exists (`F_COMMITTED_INPUT_CHECK`).
  6. **Mandatory Final Actual Submission:** Actual scanner lifecycle and upload executed on the committed SHA for every target (`F_FINAL_LIFECYCLE_UPLOAD`).
  7. **Exact Task & Analysis Binding:** Every target's `ceTaskId` completes `SUCCESS` and binds to its exact `analysisId` and analysis-bound quality gate (`F_FINAL_TASK_WAIT`).
  8. **Complete Consistent Capture:** All issue and hotspot pages exhausted within server windows, pre/post `analysisId` verified stable, and snapshot consistency verified (`consistency: verified`).
  9. **Zero Active In-Scope Issues & Validated Dispositions:** Zero unresolved active issues (in the server's bound active vocabulary) remain in scope, and any non-code transitions carry verified `owner-approved-accepted` or `owner-approved-false-positive` dispositions.
  10. **Hotspots Cleared:** All in-scope security hotspots have recorded owner reviews (`owner-hotspot-reviewed`).
  11. **Passing Quality Gates & Independent Final Audit:** All agreed quality gates pass (`OK`), and an independent final audit subagent certifies the complete evidence package (`F_FINAL_AUDIT`).

> **Explicit Disqualifiers:** A quality-gate-only pass, empty partial page list, scanner upload success alone, model review score, local proxy check, historical scan, or budget `N` exhaustion **cannot** satisfy `server-verified success`.

### Permitted Outcome Statuses (6 Canonical Values)
- `locally remediated`: Code modified, local tests pass, independent review approved; awaits scanner verification or Stage `F` transition.
- `reviewed`: Independent code review completed; pending re-scan or user direction.
- `awaiting commit`: Round verification and Stage `F` aggregate review complete; user declined or has not yet authorized commit (`Trigger: declined-commit`).
- `blocked/incomplete`: Blocked by toolchain/test failure (`test-or-build-failed`), initial review rejection (`failed-review`), failed rereview (`failed-rereview`), role independence violation (`role-independence-violation`), missing auth, failed/canceled/timed-out CE task (`task-failed` / `task-timeout`), resume drift (`resume-checkpoint-drift`), partial pagination, `consistency: unknown` (`consistency-unknown`), or unresolved dependency.
- `server-verified residual findings`: `N` exhausted (`budget-n-exhausted`) or run halted after two comparable no-progress rounds (`two-round-no-progress`) with active issues remaining on server.
- `server-verified success`: Full 11-point Stage `F` success contract satisfied on committed source.
