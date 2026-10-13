---
name: cmd-sonar-remediate
description: Execute bounded SonarQube remediation cycles across approved project targets within global budget N; orchestrate neutral discovery, independent fixes, tests, reviews, and evidence capture; verify committed-source final audit.
---

# Bounded Sonar Remediation Command (`cmd-sonar-remediate`)

## 1. Role, Composition, and Invocation Contract

### 1.1 Purpose and Execution Model
`cmd-sonar-remediate` is a thin, portable command skill that orchestrates bounded SonarQube remediation cycles. It coordinates real host subagent roles through a structured 17-stage state machine governed by the authoritative policy in `skills/sonarqube-test-quality/references/remediation-cycles.md`.

- **Thin Orchestrator:** The command prompt orchestrates lifecycle sequencing, role dispatch, gate verification, state persistence, and outcome reporting.
- **Single Policy Owner:** It strictly defers all budget definitions, stage transitions, status mappings, and success contracts to sibling references (`remediation-cycles.md`, `project-discovery.md`, `local-analysis.md`, `run-guidance.md`).
- **No Heavy Machinery:** Contains no executable daemon, background service, adapter registry, canonical agent identities (`evc-*`), or native engine hooks. Host invocation syntax is host-specific.

### 1.2 Arguments and Interactive Parameter Resolution
The command accepts structured or interactive inputs without executable CLI flags:

| Argument | Type | Requirement | Resolution Rule |
|---|---|---|---|
| `target_context` | String / Object | Optional | Project path, target selector (branch or pull request, never both), or target set. Defaults to active checkout. |
| `max_rounds_n` (`N`) | Integer (> 0) | **Mandatory** | Agreed maximum global ceiling on entered fix rounds. If omitted or invalid (<= 0, non-integer), **prompt the user immediately**. Never infer, assume, or default `N`. |
| `scope` | Object | Optional | Explicit module boundaries, file patterns, or issue keys. Modifications to scope mid-run require owner approval and rebaselining. |
| `evidence_destination` | String (Path) | Optional | Directory for authoritative private JSON checkpoints and raw artifacts. Must be outside the repository or in an approved ignored directory (mode `0700`). |

### 1.3 Installed Sibling Resolution
Assets resolve strictly within the **loaded installed skill root** containing this command:
- **Installed Root (`.agents` or `.claude`):**
  - Command: `<installed-root>/skills/cmd-sonar-remediate/SKILL.md`
  - Sibling Domain Skill: `<installed-root>/skills/sonarqube-test-quality/SKILL.md`
  - Sibling References: `<installed-root>/skills/sonarqube-test-quality/references/`
  - Evidence Actor: `<installed-root>/skills/sonarqube-test-quality/agents/sonar-evidence.md`
  - Templates: `<installed-root>/skills/sonarqube-test-quality/templates/`
- **Development Checkout Fallback:**
  - When invoked from source checkout `ext/sonarqube-test-quality/commands/cmd-sonar-remediate/SKILL.md`, resolve domain assets relative to the command file's own directory (`../../`).
- **Portability Invariant:** Never fall back to arbitrary current working directory (`process.cwd()`), a presumed parent repository, or an unselected competing installation root.

### 1.4 Role Binding and Independence Enforcement
Before entering any remediation stage, the parent orchestrator binds available real host subagents to operational roles. Roles require pairwise distinctness to guarantee independent verification:

| Operational Role | Assigned Identity | Mandatory Invariant |
|---|---|---|
| `implementer_id` | Subagent A | Authors code fixes; distinct from all reviewers, auditors, and actor |
| `tester_id` | Subagent B / Runner | Executes builds & tests |
| `reviewer_id` | Subagent C | Independent code review (`reviewer_id != implementer_id`) |
| `rereviewer_id` | Subagent D | Independent corrective rereview (`rereviewer_id != implementer_id`) |
| `evidence_actor_id` | Subagent E | Executes scanner lifecycles & evidence capture; distinct from implementer |
| `auditor_id` | Subagent F | Independent final audit certification (`auditor_id != implementer_id`) |

- **Independence Rules:**
  - Initial review: `reviewer_id != implementer_id`.
  - Corrective rereview: `rereviewer_id != implementer_id`.
  - Evidence actor: `evidence_actor_id != implementer_id`.
  - Final Stage `F`: `implementer_id`, `reviewer_id`, `rereviewer_id`, `auditor_id`, and `evidence_actor_id` must be **pairwise distinct** (`implementer_id != reviewer_id != rereviewer_id != auditor_id != evidence_actor_id`).
- **Evidence Actor Role:** The evidence actor prompt (`skills/sonarqube-test-quality/agents/sonar-evidence.md`) is loaded into a generic subagent (`evidence_actor_id`). The actor has no source-editing authority and cannot certify the final audit.
- **Fail Closed:** If the host runtime cannot supply distinct independent roles or role independence is violated, the orchestrated route halts immediately with outcome `blocked/incomplete` (`blockers: ["role-independence-violation"]`, `Trigger: role-independence-violation`). Ordinary direct local triage routes remain available.
---

## 2. Preflight and Baseline Capture (`C0_BASELINE`)

### 2.1 Preflight Discovery
1. Load sibling discovery policy: `skills/sonarqube-test-quality/references/project-discovery.md`.
2. Determine repository root, current commit SHA, target selector (`branch` XOR `pull_request`), and nonsecret scanner configuration. Redact all secret tokens (`sonar.token`, passwords, auth headers).
3. Discover toolchain capabilities, test commands, coverage report paths, and requirement contracts (`required`, `optional`, or justified `not-applicable`).
4. Validate that `evidence_destination` is outside the git tree or ignored, regular directory, mode `0700`. Authoritative private checkpoint JSON must never contain tokens, passwords, or authentication headers.
### 2.2 Establishing Baseline (`C0_BASELINE`)
- **Budget Rule:** Baseline capture **does not consume from budget `N`**.
  - An existing server analysis qualifies as `C0` **only if** it is cryptographically and temporally bound to the current commit SHA, active input content digest, and nonsecret configuration.
  - If existing analysis cannot be bound, obtain owner upload authorization and invoke the evidence actor in mode `verify-upload` at stage `C0_BASELINE` to execute the approved scanner lifecycle and establish baseline evidence.
- **Zero-Issue Baseline:** If baseline analysis reveals zero active in-scope issues and all quality gates pass, bypass fix rounds `Ck` and advance directly to Stage `F` for committed-source final qualification.

### 2.3 Freezing Run Context
- Freeze target set, quality profile, quality gate metric thresholds, active status vocabulary, and path exclusions.
- Any mid-run modification to these frozen settings invalidates comparative deltas, requires owner approval, and forces establishing a new `C0_BASELINE` without resetting previously entered rounds against `N`.

---

## 3. Bounded Fix Rounds (`Ck`, `k = 1..N`)

### 3.1 Entering Round `Ck` (Accounting Against `N`)
1. Check budget ceiling: if `entered_round_count >= N`, halt immediately with outcome `server-verified residual findings` (`Trigger: budget-n-exhausted`). Never permit unbudgeted fix attempts or free edits.
2. Increment persisted `entered_round_count` immediately upon entering `Ck`, before dispatching any source modification.
3. Reset round flag: `correction_used = false`.
4. Persist updated stage `CK_FIX` and round count in `<evidence-destination>/resume-checkpoint.json`.

### 3.2 Fix Implementation (`CK_FIX`)
1. Dispatch `implementer_id` with prioritized root causes from baseline or prior round.
2. Changes are strictly confined to root causes in production and test code within agreed scope; unrelated refactoring is prohibited.
3. Record modified file list and pre-test working tree status.

### 3.3 Test Execution (`CK_TEST`)
1. Dispatch `tester_id` to execute applicable native compilation, focused checks, and full test suites.
2. If scanner instrumentation alters compiler flags or runtime semantics, execute an uninstrumented native verification run (`clean build` + full test suite) per `local-analysis.md §3`.
3. Verify two-factor coverage report freshness per `project-discovery.md §2`.
4. **No In-Round Test-Failure Retry:** If compilation or any required native test fails, round `Ck` terminates immediately at `CK_TEST` with outcome `blocked/incomplete` (`Trigger: test-or-build-failed`), consuming that entered round. No in-round retry or scanner upload is permitted.

### 3.4 Independent Code Review (`CK_REVIEW`)
1. Dispatch independent `reviewer_id` (`reviewer_id != implementer_id`) to evaluate exact git diff and test evidence.
2. Return terminal review verdict:
   - `APPROVED`: Advance to stage `CK_VERIFY_IMPORT`.
   - `CHANGES_REQUESTED`: If `correction_used == false`, advance to `CK_CORRECTION`.
   - `REJECTED`: Halt round `Ck` with outcome `blocked/incomplete` (`Trigger: failed-review`), consuming the round without uploading.

### 3.5 Single Correction Batch (`CK_CORRECTION` and `CK_REREVIEW`)
1. Permitted strictly **once** per round (`correction_used` set to `true`).
2. Dispatch `implementer_id` to perform surgical corrections addressing reviewer feedback.
3. Dispatch `tester_id` to rerun affected tests and full suite. If retest fails, halt `Ck` immediately (`Trigger: test-or-build-failed`), consuming the round without uploading.
4. Dispatch independent `rereviewer_id` (`rereviewer_id != implementer_id`).
5. If `CK_REREVIEW` returns `REJECTED` or requests further changes, halt `Ck` immediately (`Trigger: failed-rereview`). Do **not** upload unapproved changes. Further source edits require entering round `C(k+1)` if budget `N` remains.

### 3.6 Scanner Lifecycle and Upload (`CK_VERIFY_IMPORT`, `CK_UPLOAD`)
1. Verify pre-upload source checkpoint (`commit_sha`, `active_input_digest`, `generated_input_digest`). If any input or generated file drifted during build/tests, abort immediately (`Trigger: resume-checkpoint-drift`).
2. Verify explicit upload authorization naming target server URL, project keys, and selectors.
3. Dispatch `evidence_actor_id` in mode `verify-upload` at stage `CK_UPLOAD`.
4. Evidence actor executes approved lifecycle commands in declared order, writes `.scannerwork/`, uploads payload over TLS, and captures `ceTaskId`.

### 3.7 Background Task Tracking (`CK_TASK_WAIT`)
1. Persist `ceTaskId` and submission metadata to `resume-checkpoint.json` before polling.
2. Poll server `api/ce/task?id=<ceTaskId>`.
3. Terminal task status:
   - `SUCCESS`: Retrieve returned `analysisId`.
   - `FAILED` / `CANCELED`: Halt immediately with outcome `blocked/incomplete` (`Trigger: task-failed`).
   - Timeout: Persist task wait state; halt with `blocked/incomplete` (`Trigger: task-timeout`). Resuming queries existing `ceTaskId` without re-uploading or consuming a new round.

### 3.8 Evidence Evaluation and Progress Check (`CK_EVALUATION`)
1. Query exact analysis-bound quality gate: `api/qualitygates/project_status?analysisId=<analysisId>`. Never fall back to latest project gate.
2. Fetch full issue and hotspot pages. Verify both pre-capture and post-capture server `analysisId` match the certified `analysisId`.
3. Check mutable snapshot consistency: if manual status transition detection is unsupported, record `consistency: unknown` (`Trigger: consistency-unknown`), blocking success.
4. Categorize findings using canonical local stages (`identified`, `in-progress`, `locally-fixed`, `retest-passed`, `review-approved`, `stage-f-verified`). Disappearance alone is not fixed; verify `Disappearance Causation` and `Owner Disposition`. Hotspots require recorded owner review (`owner-hotspot-reviewed`).
5. **Branching Decision:**
   - **Early-Round Candidate:** If zero active in-scope issues remain, all hotspots cleared, and gate passes across all targets, advance to **Stage `F`**. (Note: an early candidate on an uncommitted tree is `locally remediated` / `awaiting commit`, never final `server-verified success`).
   - **Issues Remain:**
     - Check for two comparable no-progress rounds: if `C(k-1)` and `Ck` show no net reduction in active findings under comparable scope, halt immediately with outcome `server-verified residual findings` (`Trigger: two-round-no-progress`).
     - If `entered_round_count < N`: enter round `C(k+1)`.
     - If `entered_round_count >= N`: halt with outcome `server-verified residual findings` (`Trigger: budget-n-exhausted`).

---

## 4. Final Verification and Audit (`Stage F`)

Stage `F` is strictly non-editorial and does not consume from budget `N`. Zero source or test edits are permitted.

| Stage Name | Mandatory Operational Action |
|---|---|
| `F_AGGREGATE_REVIEW` | Independent review of cumulative changes. If rejected or changes requested: Stage F is non-editorial; if budget N remains, enter `C(k+1)` (incrementing `entered_round_count`); if N is exhausted, halt with outcome `server-verified residual findings` (`Trigger: aggregate-review-rejected` / `budget-n-exhausted`). |
| `F_AWAITING_COMMIT` | Separate commit authorization or verify user-created commit. NO auto-push. |
| `F_COMMITTED_INPUT_CHECK` | Verify committed inputs, reproducibility, and zero post-commit hook drift |
| `F_FINAL_LIFECYCLE_UPLOAD` | Mandatory actual scanner lifecycle & upload on committed SHA for all targets (requires explicit upload authorization) |
| `F_FINAL_TASK_WAIT` | Poll ceTaskId -> analysisId -> gate per target |
| `F_FINAL_AUDIT` | Independent auditor certifies 11-point compliance package |
### 4.1 Aggregate Code Review (`F_AGGREGATE_REVIEW`)
Dispatch independent reviewer to assess the cumulative diff across all remediation rounds against repository architecture and code standards.

### 4.2 Commit Gating (`F_AWAITING_COMMIT`)
1. **Separate Authorization:** Request explicit user authorization to commit the approved changes, or inspect and verify an already-created user commit.
2. **Prohibited Action:** **NEVER auto-push** commits to remote repositories. Never create automated git worktrees, stashes, or branch resets.
3. **Declined Commit:** If the user declines commit authorization, record outcome `awaiting commit` (`Trigger: declined-commit`) and halt.

### 4.3 Committed Input and Reproducibility Verification (`F_COMMITTED_INPUT_CHECK`)
1. Verify working copy HEAD matches the committed SHA.
2. Verify all intended analysis and build inputs match committed source.
3. Verify generated inputs derive reproducibly from committed source plus approved nonsecret config.
4. Verify unrelated dirty files (if any) are demonstrably outside analysis and build inputs.
5. Verify zero post-commit hook or build drift (`dirty_tree_state: clean` or `unrelated-untracked`).

### 4.4 Mandatory Actual Final Submission (`F_FINAL_LIFECYCLE_UPLOAD`)
1. Verify explicit upload authorization naming target server URL, project keys, and selectors for `verify-final` upload per `agents/sonar-evidence.md §3.1`.
2. Dispatch `evidence_actor_id` in mode `verify-final`.
3. Execute full uninstrumented native verification and scanner lifecycle on the committed SHA for all configured project targets serially.
4. Capture new terminal `ceTaskId` per target. Early-round scans or historical uploads cannot substitute for this mandatory final submission.
### 4.5 Task Wait and Binding (`F_FINAL_TASK_WAIT`)
1. Poll `ceTaskId` to `SUCCESS`.
2. Retrieve certified `analysisId` and exact analysis-bound quality gate per target.
3. Complete full paging of issues and hotspots. Confirm pre/post `analysisId` matches the certified `analysisId` and `consistency: verified`.

### 4.6 Independent Final Audit (`F_FINAL_AUDIT`)
1. Dispatch independent auditor (`auditor_id`), distinct from implementer, reviewers, and evidence actor.
2. Auditor validates all 11 conditions of the **Full Configured Success Contract**:
   1. Target Completeness (all requested targets processed on committed SHA)
   2. Native Verification (all required builds and test suites passed)
   3. Coverage Compliance (fresh coverage meets profile thresholds; no 0/0=100%)
   4. Independent Review (`F_AGGREGATE_REVIEW` approved)
   5. Committed Source (commit authorized/verified; reproducible generated inputs)
   6. Mandatory Final Submission (actual upload on committed SHA executed)
   7. Exact Task & Analysis Binding (ceTaskId -> analysisId -> quality gate verified)
   8. Complete Consistent Capture (full pages, stable analysisId, consistency verified)
   9. Zero Active Issues (0 active in bound vocabulary; valid non-code dispositions)
   10. Hotspots Cleared (all in-scope hotspots have recorded owner reviews)
   11. Passing Quality Gates & Audit Certification (`OK` gate certified by auditor)
3. **Disqualifiers:** Missing final upload, uncommitted source, gate-only pass, model review score, local proxy check, historical scan, or `N` exhaustion **strictly disqualifies** `server-verified success`.
4. **Issue Discovery During Stage F:** If issues are uncovered during Stage `F`:
   - If remaining budget exists within approved `N`, returning to remediation requires entering round `C(k+1)` (incrementing `entered_round_count`).
   - If approved budget `N` is exhausted, further source edits require explicit owner approval for an additional budget round.
   - Stage `F` itself remains strictly non-editorial.

---

## 5. Persistence, State Resumption, and Guided Exit

### 5.1 Durable Private Checkpoint
On every stage transition, write authoritative JSON to `<evidence-destination>/resume-checkpoint.json`:
- `global_budget_n`: Integer N.
- `entered_round_count`: Current count of entered fix rounds.
- `current_stage`: Canonical 17-stage enum name.
- `correction_used`: Boolean.
- `input_checkpoint`: SHA, active input digest, generated digest, tree state.
- `pending_tasks`: Active `ceTaskId` per target.
- `cycle_history`: Per-round review verdicts, deltas, and analysis bindings.
- `rebaseline_history`: Log of approved scope/profile modifications.

### 5.2 Resuming Interrupted Execution
1. Load `resume-checkpoint.json`.
2. Verify current git HEAD and active input digest against `input_checkpoint`.
3. If drift is detected: mark `dirty_tree_state: drift-invalidated` and halt with `blocked/incomplete` (`Trigger: resume-checkpoint-drift`).
4. If zero drift: resume polling active `ceTaskId` directly without re-uploading or incrementing `entered_round_count`.

### 5.3 Outcome Reporting and Sanitized Run Guidance
Upon completion, halt, or failure, the orchestrator produces:
1. **Canonical Outcome:** One of 6 permitted statuses:
   - `locally remediated`
   - `reviewed`
   - `awaiting commit`
   - `blocked/incomplete`
   - `server-verified residual findings`
   - `server-verified success`
2. **Human Markdown Report:** Indexed in `<evidence-destination>/remediation-cycle-report.md` referencing private raw JSON evidence.
3. **Sanitized Run Guidance:** Generated in `<evidence-destination>/run-guidance-report.md` per `run-guidance.md §2`. Redacts tokens, secret environment variables, private URLs, and internal paths. Emits observed lessons, confidence labels, and candidate recommendations without self-modifying skills or transmitting external telemetry.
