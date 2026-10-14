# Remediation Cycles: State, Budget, and Evidence Contracts

This reference is the single authoritative policy owner for bounded SonarQube remediation cycles, entered-round counting against global budget `N`, state machine transitions, stage persistence and resume, and server-verified success contracts.

## 1. Core Principles and Budget Model

### Global Fix Budget (`N`)
- **Maximum Ceiling:** `N` is an agreed global maximum on **entered fix rounds** across all targets in the remediation run. It is never a mandatory target number of rounds; remediation advances to Stage `F` as soon as an early-round success candidate is achieved. If `N` is omitted or invalid when invoking a bounded remediation cycle, the parent workflow must prompt the user before entering any round.
- **Scope of `N`:** One global budget `N` spans all configured project targets simultaneously. Targets do not receive independent or multiplier budgets.
- **Entered-Round Accounting:**
  - Persisted `entered_round_count` increments immediately upon **entering** round `Ck`, before any code modification begins.
  - Any failure, interruption, compiler error, test breakage, failed review, failed rereview, or abandoned attempt during round `Ck` consumes that entered round.
  - If `N` is exhausted without satisfying the success criteria, execution terminates with `server-verified residual findings` only when captured server evidence establishes remaining findings; otherwise `blocked/incomplete` (`Trigger: budget-n-exhausted`). Exhaustion never permits unbudgeted fix attempts or free final edits.
- **Budget Exclusions:**
  - **Baseline (`C0`):** Preflight discovery, initial analysis, and baseline capture do not consume from `N`. If existing server records cannot be cryptographically and temporally bound to the current commit SHA and nonsecret configuration, an approved full lifecycle and upload must establish `C0`.
  - **Final Stage (`F`):** Final aggregate review, separate commit authorization or verified user commit, committed-input verification, reproducible generated-input check, final full lifecycle execution, mandatory actual submission, and independent final audit do not consume from `N`. Stage `F` is strictly non-editorial: it never allows code fixes. If issues are uncovered during `F`: if remaining budget within approved `N` exists, returning to remediation requires entering round `C(k+1)` (which increments `entered_round_count` against `N`); if approved budget `N` is exhausted, further remediation requires explicit owner approval for an additional budget round. Exhaustion never permits unbudgeted fix attempts or free final edits.

---

## 2. Stage Lifecycle and State Machine

Remediation advances through 17 discrete stages governed by strict entry and exit gates. A failed prerequisite strictly halts execution and blocks dependent stages; no synthetic child results or simulated uploads are permitted.

| Phase | Ordered stages and gates |
|---|---|
| Baseline (outside N) | `C0_BASELINE`: bind existing analysis or approved full lifecycle/upload on current commit SHA; collect complete findings, hotspots, coverage and gate. |
| Enter Ck | Persist incremented count, `CK_FIX`, and `correction_used=false` before any edits. |
| Fix/review | `CK_FIX` → `CK_TEST` → `CK_REVIEW`; required test/build failure or rejected review halts without upload. |
| One correction | Only `CHANGES_REQUESTED` permits `CK_CORRECTION` → retest → `CK_REREVIEW`; persist `correction_used=true` before edits; failed retest or unapproved rereview halts. |
| Verify round | `CK_VERIFY_IMPORT` → `CK_UPLOAD` → `CK_TASK_WAIT` → `CK_EVALUATION`; source/freshness checks, approved upload, durable task ID, exact task/analysis/gate binding, complete consistent capture. |
| Continue/stop | Remaining issues: enforce N and two comparable no-progress rounds. Early candidate: enter F, never certify uncommitted source. |
| Final (outside N, no edits) | `F_AGGREGATE_REVIEW` → `F_AWAITING_COMMIT` → `F_COMMITTED_INPUT_CHECK` → `F_FINAL_LIFECYCLE_UPLOAD` → `F_FINAL_TASK_WAIT` → `F_FINAL_AUDIT`; actual committed-source upload and independent audit mandatory. |

### Canonical Stage Enum (17 Stages)
`C0_BASELINE`, `CK_FIX`, `CK_TEST`, `CK_REVIEW`, `CK_CORRECTION`, `CK_REREVIEW`, `CK_VERIFY_IMPORT`, `CK_UPLOAD`, `CK_TASK_WAIT`, `CK_EVALUATION`, `F_AGGREGATE_REVIEW`, `F_AWAITING_COMMIT`, `F_COMMITTED_INPUT_CHECK`, `F_FINAL_LIFECYCLE_UPLOAD`, `F_FINAL_TASK_WAIT`, `F_FINAL_AUDIT`, `HALTED`.

### Stage Rules and Invariants

1. **Fix → Test → Independent Review (`CK_FIX`, `CK_TEST`, `CK_REVIEW`):**
   - Edits are confined to identified root causes in production or test code within agreed scope; unrelated refactoring is prohibited.
   - **S3776 Complexity Rock-Foundation Requirement:** For complexity findings (`java:S3776` / cognitive or cyclomatic complexity), the implementer must inspect existing tests for the target method before modifying production code. If test coverage or behavioral assertions are inadequate, the implementer must first write characterization tests capturing existing observable behaviors (inputs, outputs, exceptions, state changes), prove them passing against unchanged production code, and only then perform complexity refactoring without weakening assertions. Any characterization test or build failure halts round `Ck` immediately with outcome `blocked/incomplete` (`Trigger: test-or-build-failed`), consuming that entered round without refactoring edits or scanner upload. Writing and verifying characterization tests occurs inside entered round `Ck` and is governed by round accounting.
   - Applicable required native builds and test suites must execute and pass completely. When scanner instrumentation or build wrappers alter compiler flags or runtime semantics, a separate clean uninstrumented native verification run is mandatory ([Local analysis](local-analysis.md#3-native-semantic-parity-verification)).
   - **No In-Round Test-Failure Retry (`CK_TEST` Gate):** If compilation, focused tests, full suite, or uninstrumented native verification fails during `CK_TEST` (or during the retest inside `CK_CORRECTION`), round `Ck` terminates immediately at `CK_TEST` (or `CK_CORRECTION`) with outcome `blocked/incomplete` (`Trigger: test-or-build-failed`), consuming that entered round. No hidden in-round fix-and-retest retry or scanner upload is permitted; further source edits require entering round `C(k+1)` if budget `N` remains.
   - **Role Independence:** Initial review (`CK_REVIEW`), corrective rereview (`CK_REREVIEW`), cumulative review (`F_AGGREGATE_REVIEW`), and final audit (`F_FINAL_AUDIT`) must each be conducted by an independent role distinct from the implementing role (`reviewer_id != implementer_id`, `rereviewer_id != implementer_id`, `auditor_id != implementer_id`, `evidence_actor_id != implementer_id`). If `CK_REVIEW` rejects outright without requesting changes for correction, round `Ck` terminates immediately with outcome `blocked/incomplete` (`Trigger: failed-review`), consuming the entered round without upload. Self-approval by the implementing role or violation of pairwise independence halts immediately (`Trigger: role-independence-violation`).
2. **One Correction Batch per Round (`CK_CORRECTION`, `CK_REREVIEW`):**
   - A correction batch is triggered **only** when `CK_REVIEW` returns `CHANGES_REQUESTED` after passing `CK_TEST`. At most **one** corrective iteration is permitted within `Ck`: `Correction → Retest → Independent Rereview`.
   - The `correction_used` flag is persisted as `true` for `Ck`.
   - If the retest fails, round `Ck` terminates immediately with outcome `blocked/incomplete` (`Trigger: test-or-build-failed`). If `CK_REREVIEW` returns `REJECTED` / requests further changes after passing the retest, round `Ck` terminates immediately with outcome `blocked/incomplete` (`Trigger: failed-rereview`). The unapproved changes must **not** be uploaded to the Sonar server. Further source edits require entering `C(k+1)` if budget `N` remains.
3. **Lifecycle Source Identity and Upload Gating (`CK_VERIFY_IMPORT`, `CK_UPLOAD`, `CK_TASK_WAIT`, `CK_EVALUATION`):**
   - Retain exact commit SHA, branch/PR selector, and CE task/analysisId correlation across scanner lifecycles (`C0_BASELINE`, `CK_VERIFY_IMPORT` through `CK_EVALUATION`, and `F_FINAL_LIFECYCLE_UPLOAD` through `F_FINAL_TASK_WAIT`). Heavy pre/post input-digest checkpoint hashing (`active_input_digest`, `generated_input_digest`) and `resume-checkpoint-drift` halting triggers are removed; source validity is verified via Git working-tree status, actual build-input inspection, and trusted lifecycle receipts. Any uncommitted source modification after review invalidates that review and requires fresh test and review verification before upload.
   - Coverage and execution report freshness must satisfy the canonical two-factor rule in [Project discovery](project-discovery.md#2-safe-actual-input-identity) before `CK_UPLOAD`.
   - Scanner upload is upload-capable and requires explicit preflight upload authorization naming target server, project keys, and branch/PR selector.
   - Scanner upload is strictly forbidden if compilation fails, any required native test fails, fresh coverage verification fails, or code review/rereview is unapproved.
4. **Two Comparable No-Progress Rounds:**
   - If two consecutive rounds (`C(k-1)` and `Ck`) exhibit no net reduction in active in-scope findings under comparable scope, automated remediation must halt immediately with outcome `server-verified residual findings` (`Trigger: two-round-no-progress`).
   - The condition is escalated to the human owner for root-cause diagnosis, strategy reassessment, or explicit abort. Never silently extend `N` or re-attempt identical edits.
5. **Scope, Profile, Gate, or Filter Changes:**
   - Any modification to branch/PR selector, project key, quality profile, quality gate metric thresholds, active status filters, or path exclusions mid-run explicitly **invalidates all prior delta comparisons**.
   - Such changes require explicit owner approval and mandate establishing a **new baseline (`C0`)**.
   - Rebaselining does **not** reset `entered_round_count` against `N`. All previously entered rounds remain counted; preserve prior cycle evidence and approved rebaseline changes in the report's Cycle history.

---

## 3. State Persistence and Resume Protocol

Remediation must be resilient to network disconnects, long-running server analysis queues, and process boundaries without losing state or burning budget.

### One Maintained Markdown Report
- Initialize `<evidence-destination>/sonar-report.md` once from [the report template](../templates/remediation-cycle-report.md). The destination defaults automatically to `<checkout_root>/.sonar-evidence/`, ensuring `.sonar-evidence/` is added to `.gitignore` if not already ignored to eliminate interactive destination prompts. A pre-approved path outside the checkout can also be specified. The directory must be regular, non-symlinked, owner-only (`0700` directory).
- The orchestrator is the **only report writer**. Evidence actors return bounded evidence inline; other roles return their results, not separate maintained reports.
- API JSON is transient input, not a required stored bundle. No separate checkpoint, YAML mirror, actor summary, guidance report, or file per cycle. Native test logs, coverage outputs and scanner scratch remain tool-produced artifacts, not additional skill reports.
- Use short fixed-column tables: **Run/resume** key/value; **Issues and hotspots** (`Issue | File | Detail | Local status | Server status | Next action`); **Coverage summary and checks** (`Target / file | Metric / check | Value | Requirement | Status / next action`); **Coverage work items** (`Target / file | Uncovered lines / branches | Detail | Test to add | Local status | Server verification`); **Cycle history** (`Cycle | Target | Checkpoint | Task / analysis / gate | Completeness / consistency | Result`); **Blockers / next action**.
- Run/resume fields retain `global_budget_n`, `entered_round_count`, `current_stage`, `correction_used`, exact commit SHA, branch/PR selector, tree state, frozen target selectors/profile/gate thresholds/status vocabulary/exclusions, roles and approvals. Pending submissions retain stage, exact target/server/selector, commit SHA, recorded dispatch/invocation-start and submission-start time bounds, verified actual scanner/submission times when available, status (`dispatching/no-task-ID` before dispatch), and task ID when known.
- Cycle history retains each cycle/target's round context (commit SHA / cycle label), task/analysis/gate binding including pre/post capture analysis IDs, counts/pages/window/errors/consistency, initial review/reviewer, correction and rereview/rereviewer, all finding transitions (including new, reopened, fixed and non-code/disappeared), deltas, final-audit result and approved rebaseline changes. Keep explicit causation and owner disposition in finding Detail/Next action, referenced by ID in history. Compact cell text is sufficient; do not duplicate the same evidence in multiple views.
- Merge finding rows by **(target, issue/hotspot ID)**. Preserve prior local progress, tests/reviews, owner dispositions and historical findings; never replace the table with the latest active list. Keep ID, kind, component/path, full location/range, message, rule, type/severity, MQR quality/severity impacts, effort, tags, flow/secondary locations and relevant timestamps in Issue/File/Detail. Keep raw server status/resolution/issueStatus alongside normalization in Server status; local status stays independent.
- Collect all issues and hotspots, not only active or high-severity findings; determine active scope from the frozen vocabulary. For tracked IDs absent from a complete capture, inspect status/history before classifying disappearance. Partial/error captures never erase prior rows or imply zero findings.
- Preserve all returned coverage/check observations, raw counts/denominators, metric scope (overall/new, target/file), operators/thresholds, applicability and freshness in **Coverage summary and checks**. Tag each row with cycle and analysis ID (or `not-yet-bound` for native checks) in Target/file or Status/next action; append observations and retain baseline/prior values, never overwrite them with a later cycle. Missing, unsupported, zero and `0/0 (undefined)` are distinct; never aggregate incompatible metrics.
- Merge **Coverage work items** rows by **(target, work-item ID)**. Work-item IDs are stable parent-assigned identifiers distinct from Sonar finding issue IDs and CE task IDs; line moves and refactorings do not break identity. Ground gaps in fresh native coverage reports and source inspection; Sonar aggregate counts cannot infer locations, branch conditions, or new-code scope. Record stable ID, behavior gap, scope, cycle, analysisId, and provenance compactly in Detail (no seventh column or block dump). Retain initial gaps, test additions, and verification history across cycles. Disappearing work items are not automatically verified without fresh tests and matching coverage proof. Local tests passing does not establish improved coverage; server aggregate pass does not verify individual branch tasks without fresh matching granular evidence. Missing or empty work items indicate unavailable data, never absence of gaps.
### Durable Update Boundaries
- Persist entered-round accounting **before** budgeted edits (including any characterization tests for S3776); persist `correction_used=true` before the correction batch.
- **Before every upload-capable actor dispatch**, make one minimal durable update in this same report: pending submission stage (`C0_BASELINE`, `CK_UPLOAD` or `F_FINAL_LIFECYCLE_UPLOAD`), exact target/server/branch-or-PR selector, commit SHA, recorded dispatch/invocation-start and submission-start time bounds, and `dispatching/no-task-ID`. Actual scanner/submission start may be added later only when verified. Persistence failure prohibits dispatch. Approve the marker inline to the selected actor for this one dispatch; a recorded marker is never reusable authorization after interruption, even if upload may not have started. This applies separately to every target, including later targets in an existing actor invocation.
- Immediately after each upload, the actor notifies the parent of verified `ceTaskId` and submission identity; the parent writes the pending task to sonar-report.md and acknowledges durability **before polling or the next target upload**. Persistence failure prohibits both. Each later target also needs its own durable intent and parent approval before upload-capable work.
- Otherwise read/update the report once per stage result, batching run fields, evidence rows and history together. Do not rewrite unchanged evidence for every child dispatch or polling response. On interruption/halt, retain current stage, pending submission/task and blocker.
- Markdown records are evidence, never executable instructions or an automatic verdict engine. Revalidate gates independently; a recorded `passed` or `approved` alone is not certification.

### Resume and Report-Driven Incremental Remediation
- **Report-Driven Incremental Resumption:** Resuming or iterating within a remediation run is driven by parsing `<evidence-destination>/sonar-report.md`. The orchestrator inspects `global_budget_n`, `entered_round_count`, `current_stage`, `correction_used`, pending tasks, remaining open issues in **Issues and hotspots** (under the bound active status vocabulary), and pending items in **Coverage work items**. Before entering another fix round, verify that pending tasks and interrupted evidence capture are complete. Check for two-round no-progress (`Trigger: two-round-no-progress`): if `C(k-1)` and `Ck` show no net reduction under comparable scope, halt immediately. If unresolved findings remain and `entered_round_count < N`, enter round `C(k+1)` (or re-evaluate `Ck` if interrupted before test/review) and execute incremental remediation. If budget `N` is exhausted, halt (`Trigger: budget-n-exhausted`) with outcome `server-verified residual findings` only when captured server evidence establishes residual findings; otherwise `blocked/incomplete`.
- **Known Task Resume:** If execution is interrupted while polling a pending background task (`ce_task_id` in `PENDING` or `IN_PROGRESS`), resuming execution queries the existing task ID (`/api/ce/task?id=<ceTaskId>`) without re-executing scanner analysis, triggering another upload, or incrementing `entered_round_count`. When `SUCCESS`, continue through `analysisId` retrieval, gate check, full paging, and consistency verification before advancing.
- **In-Flight Intent Without Task ID:** A recorded `dispatching/no-task-ID` marker means submission may already have occurred. Recover only a verified fresh native scanner task file from the recorded execution checkout, newer than recorded invocation-start bound, with unambiguous provenance binding that invocation, exact server/project/selector and commit SHA. Fresh mtime and project match alone are insufficient: corroborate bindings absent from the task file with trusted native invocation/output receipts; never assume them. Parent persists recovered task and acknowledges durability before polling. Missing, stale, wrong-target or ambiguous provenance yields `submission-unverified`, `blocked/incomplete`; never redispatch/reuse marker, rerun preparation/build/scanner, infer no submission or substitute latest server analysis.
- **Stage-Aware Resumption and Source Validity:** Read the report's Run/resume fields and relevant history; revalidate current commit SHA, branch/PR selector, frozen context, roles, and working tree state. Compare current working-tree status and actual build inputs against recorded diff and receipts; if dirty contents differ or cannot be bound, invalidate prior review/test evidence and require fresh in-round verification. Pre/post lifecycle input-digest hashing and `resume-checkpoint-drift` halting triggers are removed. If interrupted during `CK_FIX`, `CK_TEST`, or `CK_REVIEW`, re-evaluate current working tree against recorded evidence; uncommitted source edits invalidate prior reviews and require fresh test and review verification under existing round rules. If a round terminated with terminal test or review failure, do not retry edits within that round; advance to `C(k+1)` if budget `N` remains. If interrupted in Stage `F`, resume Stage `F` non-editorial verification without allowing code fixes or charging rounds against `N`.
- **Context Changes:** Any modification to branch/PR selector, project key, quality profile, quality gate metric thresholds, active status filters, or path exclusions requires owner-approved rebaseline without resetting `entered_round_count`.
- **Failed or Canceled Tasks:** If a polled background task returns `FAILED` or `CANCELED`, the stage halts immediately with outcome `blocked/incomplete` (`Trigger: task-failed`). Failed or canceled tasks must never be treated as passing or silently re-uploaded without diagnosing the failure.
- **Timeout and Incomplete Captures:** If server task polling exceeds configured timeouts or yields unparseable responses, the run state is recorded as `blocked/incomplete` (`Trigger: task-timeout`). An incomplete capture must never be recorded as a passing gate or clean status.
- **Parent Cause and Budget Authority:** Actor triggers are advisory; derive the exact halt cause and outcome from specific blockers, actual stage and captured evidence, using existing canonical causes. Never turn an approval, role, selector or coverage blocker into `test-or-build-failed`. Only actual entered rounds consume N; baseline, final verification and resume consume none, regardless of actor labels.
---

## 4. Multi-Target Shared Context Contract

When remediation encompasses multiple project targets (e.g., polyglot subprojects, multi-module repositories, or combined backend/frontend targets):
- **Shared Target Context:** All targets in a given cycle (`C0`, `Ck`, or `F`) must be analyzed against the identical repository `commit_sha` and branch/PR context. Multi-digest checkpoint hashing is removed.
- **Atomic Run Assessment:** If Target A achieves zero findings with a passing gate, but Target B fails tests, has an incomplete task, or exhibits unresolved findings, the overall remediation outcome is `blocked/incomplete` or `server-verified residual findings`. Success cannot be claimed on a subset of requested targets.
- **Serial Scanner Execution:** To prevent resource contention and directory races in `.scannerwork/` or build output paths, scanner lifecycles across targets must execute serially within the checkout, recording each target's commit SHA and `ce_task_id` in `pending_tasks`.
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
- **Raw vs. Normalized Status Mapping:** Preserve raw API status, resolution and issueStatus values verbatim alongside normalization in the report's Server status cell, not in a separate JSON artifact:

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
A finding that disappears from active query results between scans is **not** automatically credited as code-fixed. Inspect tracked-ID status and history; record explicit disappearance causation and owner disposition in the existing **Detail or Next action** cell, with the transition retained in Cycle history:
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
- `blocked/incomplete`: Blocked by toolchain/test failure (`test-or-build-failed`), initial review rejection (`failed-review`), failed rereview (`failed-rereview`), role independence violation (`role-independence-violation`), declined upload authorization (`declined-upload`), missing auth, failed/canceled/timed-out CE task (`task-failed` / `task-timeout`), unverified submission (`submission-unverified`), partial pagination, `consistency: unknown` (`consistency-unknown`), or unresolved dependency.
- `server-verified residual findings`: `N` exhausted (`budget-n-exhausted`) or run halted after two comparable no-progress rounds (`two-round-no-progress`) with active issues remaining on server.
- `server-verified success`: Full 11-point Stage `F` success contract satisfied on committed source.
