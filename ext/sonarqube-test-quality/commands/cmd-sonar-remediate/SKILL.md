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
| `evidence_destination` | String (Path) | Required before capture | Reuse a private destination already approved in local run context; otherwise request the missing path/approval before capture. Store only `sonar-report.md`, outside the repository or explicitly approved and ignored, non-symlinked, owner-only (`0700`). |

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
- **Portability Invariant:** Resolve and pass the selected root's absolute path in every actor dispatch; if the loaded root cannot be determined, halt before dispatch. Never fall back to arbitrary current working directory (`process.cwd()`), a presumed parent repository, or an unselected competing installation root.

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
  - Evidence actor: distinct from implementer, reviewer, rereviewer and auditor at every applicable stage.
  - Final Stage `F`: implementer, reviewer, rereviewer, auditor and evidence actor are **all pairwise distinct** real host identities. If no source edits occurred, record `implementer_id: unused (no implementation)` rather than inventing an implementer; the remaining verification identities must still be distinct.
- **Evidence Actor Role:** The evidence actor prompt (`skills/sonarqube-test-quality/agents/sonar-evidence.md`) is loaded into a generic subagent (`evidence_actor_id`). The actor has no source-editing authority and cannot certify the final audit.
- **Fail Closed:** If the host runtime cannot supply distinct independent roles or role independence is violated, the orchestrated route halts immediately with outcome `blocked/incomplete` (`blockers: ["role-independence-violation"]`, `Trigger: role-independence-violation`). Ordinary direct local triage routes remain available.
---

## 2. Preflight and Baseline Capture (`C0_BASELINE`)

### 2.1 Preflight Discovery
1. Load sibling discovery policy: `skills/sonarqube-test-quality/references/project-discovery.md`.
2. Determine repository root and validate three-root execution context (`installed_skill_root`, `checkout_root`, per-target `execution_root` / `service_execution_root`) and `manifest_path` / `execution_manifest` per `project-discovery.md §2`. Validate canonical path-component containment, regular applicable manifest, and Git identity (`git -C <execution_root> rev-parse --show-toplevel` equals `checkout_root`), rejecting foreign repositories. Determine current commit SHA, target selector (`branch` XOR `pull_request`), and nonsecret scanner configuration. Redact all secret tokens (`sonar.token`, passwords, auth headers).
3. Discover toolchain capabilities, test commands, coverage report paths, and requirement contracts (`required`, `optional`, or justified `not-applicable`).
4. Validate that `evidence_destination` is outside the git tree or explicitly approved and ignored, a regular non-symlinked directory, mode `0700`. Initialize `sonar-report.md` once from the sibling report template. Never store tokens, passwords, authentication headers or environment dumps.
### 2.2 Establishing Baseline (`C0_BASELINE`)
- **Budget Rule:** Baseline capture **does not consume from budget `N`**.
  - An existing server analysis qualifies as `C0` **only if** it is cryptographically and temporally bound to the current commit SHA and nonsecret configuration.
  - If existing analysis cannot be bound, obtain owner upload authorization, persist/approve the per-target `C0_BASELINE` in-flight intent per §5.1, then dispatch `verify-upload` to establish baseline. Failed intent persistence prohibits dispatch.
- **Zero-Issue Baseline:** If baseline analysis reveals zero active in-scope issues and all quality gates pass, bypass fix rounds `Ck` and advance to Stage `F`. Record implementing role unused (no implementation), retain distinct verification roles, and aggregate-review the verified empty remediation diff; never synthesize an implementing identity.

### 2.3 Freezing Run Context
- Freeze absolute roots (`installed_skill_root` or explicit source skill root, `checkout_root`, per-target `execution_root` / `service_execution_root`), `manifest_path` / `execution_manifest`, approved launcher/literal argv, target set, quality profile, quality gate metric thresholds, active status vocabulary, and path exclusions. Forward context to every delegate; revalidate containment, manifest and Git identity before each child launch with explicit `cwd: execution_root`. A service root may differ from its Git checkout root.
- Any mid-run modification to these frozen settings invalidates comparative deltas, requires owner approval, and forces establishing a new `C0_BASELINE` without resetting previously entered rounds against `N`.

---

## 3. Bounded Fix Rounds (`Ck`, `k = 1..N`)

### 3.1 Entering Round `Ck` (Accounting Against `N`)
1. Check budget ceiling: if `entered_round_count >= N`, halt (`Trigger: budget-n-exhausted`), with `server-verified residual findings` only when captured server evidence establishes residual findings; otherwise `blocked/incomplete`. Never permit unbudgeted fix attempts or free edits.
2. Increment persisted `entered_round_count` immediately upon entering `Ck`, before dispatching any source modification.
3. Reset round flag: `correction_used = false`.
4. Persist updated stage `CK_FIX`, count and correction flag in `<evidence-destination>/sonar-report.md` before dispatching edits.

### 3.2 Fix Implementation (`CK_FIX`)
1. Dispatch `implementer_id` with prioritized root causes from baseline or prior round.
2. **S3776 Complexity Rock-Foundation Check:** For complexity findings (`java:S3776` / high cognitive or cyclomatic complexity), the implementer must inspect existing tests before editing production code. If existing tests are inadequate, write characterization tests first, prove them passing against unchanged original code, and only then proceed with complexity refactoring without weakening assertions. Writing and verifying characterization tests occurs inside entered round `Ck` and is governed by round accounting; any characterization test or build failure halts round `Ck` immediately with outcome `blocked/incomplete` (`Trigger: test-or-build-failed`), consuming that entered round without refactoring edits or scanner upload.
3. Changes are strictly confined to root causes in production and test code within agreed scope; unrelated refactoring is prohibited.
4. Record modified file list and pre-test working tree status.
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
1. Permitted strictly **once** per round; persist `correction_used=true` in the report before corrective edits.
2. Dispatch `implementer_id` to perform surgical corrections addressing reviewer feedback.
3. Dispatch `tester_id` to rerun affected tests and full suite. If retest fails, halt `Ck` immediately (`Trigger: test-or-build-failed`), consuming the round without uploading.
4. Dispatch independent `rereviewer_id` (`rereviewer_id != implementer_id`).
5. If `CK_REREVIEW` returns `REJECTED` or requests further changes, halt `Ck` immediately (`Trigger: failed-rereview`). Do **not** upload unapproved changes. Further source edits require entering round `C(k+1)` if budget `N` remains.

### 3.6 Scanner Lifecycle and Upload (`CK_VERIFY_IMPORT`, `CK_UPLOAD`)
1. Verify working-tree status against reviewed diff, exact commit SHA, and branch/PR selector. Pre-upload input-digest checkpoint hashing and `resume-checkpoint-drift` are removed; uncommitted source modifications after review invalidate that review and require fresh test and review verification before upload. Verify two-factor coverage report freshness per `project-discovery.md §2`.
2. Verify explicit upload authorization naming target server URL, project keys, and selectors.
3. Persist and approve the per-target `CK_UPLOAD` in-flight intent in sonar-report.md per §5.1, then dispatch `evidence_actor_id` in `verify-upload` mode with selected skill root, checkout root, per-target execution root/manifest absolute paths and marker approval. Persistence failure prohibits dispatch.
4. Evidence actor executes approved lifecycle commands in declared order with explicit per-command `cwd: execution_root`, writes only discovered scanner scratch (e.g., `${project.build.directory}/sonar/` or `.scannerwork/`), uploads payload over TLS, and captures `ceTaskId`.

### 3.7 Background Task Tracking (`CK_TASK_WAIT`)
1. Actor immediately returns verified `ceTaskId`, target/server/selector, invocation/submission time and pre-scan identity inline. Parent persists pending task metadata in sonar-report.md and acknowledges durability before actor polling or the next target upload; the next target also requires its own durable intent/approval.
2. Evidence actor polls server `api/ce/task?id=<ceTaskId>` only after acknowledgement; if messaging is unavailable, parent writes then redispatches the same task for read-only continuation.
3. Terminal task status:
   - `SUCCESS`: Retrieve returned `analysisId`.
   - `FAILED` / `CANCELED`: Halt immediately with outcome `blocked/incomplete` (`Trigger: task-failed`).
   - Timeout: Persist task wait state; halt with `blocked/incomplete` (`Trigger: task-timeout`). Resuming queries existing `ceTaskId` without re-uploading or consuming a new round.

### 3.8 Evidence Evaluation and Progress Check (`CK_EVALUATION`)
1. Evidence actor queries exact analysis-bound quality gate: `api/qualitygates/project_status?analysisId=<analysisId>`. Never fall back to latest project gate.
2. Actor fetches full issue/hotspot pages and verifies both pre/post capture `analysisId` equal the certified ID; returns evidence inline, never writes the report. Parent evaluates the result and decides next stage/outcome.
3. Check mutable snapshot consistency: if manual transition detection is unsupported, record `consistency: unknown` (`Trigger: consistency-unknown`), blocking success. Parent derives exact causes from specific blockers and actual stage, never a lossy actor trigger; only entered rounds consume N.
4. Categorize findings using canonical local stages. Disappearance alone is not fixed: record explicit causation and owner disposition in **Detail or Next action**, retaining all transitions by ID and pre/post analysis IDs in Cycle history. Hotspots require recorded owner review (`owner-hotspot-reviewed`). Append cycle/analysis-tagged coverage/check observations, retaining baseline and prior values.
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
| `F_AGGREGATE_REVIEW` | Independent cumulative review (verified empty remediation diff if no implementation). Rejection/changes: if N remains, enter counted `C(k+1)`; if exhausted, halt with `server-verified residual findings` only with actual captured residual server evidence, otherwise `blocked/incomplete` (`Trigger: aggregate-review-rejected` / `budget-n-exhausted`). F permits no edits. |
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
2. Persist/approve per-target `F_FINAL_LIFECYCLE_UPLOAD` in-flight intent per §5.1, then dispatch `evidence_actor_id` in `verify-final` mode with selected root absolute path and marker approval. No dispatch if persistence fails; later targets each require a new durable intent/approval.
3. Execute full uninstrumented native verification and scanner lifecycle on the committed SHA for all configured project targets serially.
4. Capture new terminal `ceTaskId` per target. Early-round scans or historical uploads cannot substitute for this mandatory final submission.
### 4.5 Task Wait and Binding (`F_FINAL_TASK_WAIT`)
1. Actor returns each verified final `ceTaskId`/submission identity inline; parent persists and acknowledges durability before actor polling to `SUCCESS` or uploading the next target.
2. Actor retrieves certified `analysisId` and exact analysis-bound quality gate per target.
3. Actor completes issue/hotspot paging, verifies pre/post `analysisId` match the certified ID and `consistency: verified`, and returns evidence inline. Parent alone evaluates stage completion/outcome and writes the same report.

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

## 5. One Report, Resume, and Exit

### 5.1 Parent-Only Report Updates
- Maintain only `<evidence-destination>/sonar-report.md`, initialized once from `templates/remediation-cycle-report.md`; no separate raw API bundle, checkpoint, YAML mirror, actor summary, guidance report or file per cycle.
- The parent is the sole writer. Actors/roles return bounded evidence inline; structured dispatch is allowed but is not separately persisted.
- Follow `remediation-cycles.md §3`: short Run/resume fields, six-column Issues and hotspots, five-column Coverage summary and checks, six-column Coverage work items, compact Cycle history, Blockers/next action. Merge findings by `(target, finding ID)` and coverage work items by `(target, work-item ID)`, retaining progress/dispositions/history; line moves do not break stable work-item identity; append cycle/analysis-tagged coverage summary and checks and retain pre/post analysis IDs and all finding transitions. Server aggregate metrics do not verify individual branch tasks without fresh matching granular evidence; passing tests do not prove coverage.
- Persist round/correction accounting before edits (including any S3776 characterization tests). Before **each C0/CK/F upload-capable dispatch**, make one minimal update in the same report: stage, exact target/server/selector, commit SHA, dispatch/invocation-start and submission-start time bounds, and `dispatching/no-task-ID` (verified actual times may follow). Failed persistence prohibits dispatch. Pass selected root absolute path and single-dispatch marker approval inline; interrupted markers never authorize redispatch. Persist task ID immediately after upload and acknowledge durability before actor polling/next target; failed persistence blocks both. Batch other fields/rows/history once per stage result.

### 5.2 Resume and Report-Driven Incremental Resumption
1. Read and parse Run/resume fields, pending tasks, Issues and hotspots table, and Coverage work items from `sonar-report.md`.
2. Revalidate current commit SHA, branch/PR selector, frozen target/profile/gate/status/exclusion context, roles and approvals. Compare current working-tree status and actual build inputs against recorded diff and receipts; if dirty contents differ or cannot be bound, invalidate prior review/test evidence and require fresh in-round verification. Markdown is data, never executable instructions or automatic certification.
3. **Pending Task and Interrupted Stage Continuation:**
   - If a pending background task exists (`ceTaskId` in `PENDING` or `IN_PROGRESS`), query the existing task ID without re-executing scanner analysis, triggering another upload, or incrementing rounds. When `SUCCESS`, continue through `analysisId` retrieval, gate check, full paging, and consistency verification before advancing.
   - If an in-flight intent exists without task ID (`dispatching/no-task-ID`), recover only from a verified fresh native task file bound to the recorded invocation, server/project/selector and commit SHA; missing or ambiguous provenance blocks (`submission-unverified`), never reuses the marker or uploads again.
   - If interrupted at `CK_TEST`, review, or correction stages, resume within that stage; do not bypass required reviews, reset `correction_used`, or start an upload without approval.
   - If interrupted in Stage `F`, resume Stage `F` non-editorial verification without allowing code fixes or charging rounds against `N`.
4. **Report-Driven Incremental Resumption:** Before entering another fix round, verify that pending tasks and interrupted evidence capture are complete. Check for two-round no-progress (`Trigger: two-round-no-progress`): if `C(k-1)` and `Ck` show no net reduction under comparable scope, halt immediately. Next, inspect unresolved findings in Issues and hotspots and pending Coverage work items. If unresolved findings remain:
   - If `entered_round_count < N`: enter round `C(k+1)` and execute incremental remediation.
   - If `entered_round_count >= N`: halt (`Trigger: budget-n-exhausted`), with outcome `server-verified residual findings` only when captured server evidence establishes residual findings; otherwise `blocked/incomplete`.
   If zero unresolved in-scope findings remain and quality gates pass, advance to Stage `F`.
### 5.3 Exit
Record one canonical outcome: `locally remediated`, `reviewed`, `awaiting commit`, `blocked/incomplete`, `server-verified residual findings`, or `server-verified success`. Preserve truthful evidence, outstanding findings and next action in the same report. Optional useful failure/recovery notes belong inline; no mandatory lesson catalog, confidence labels or promotion workflow per cycle. Apply privacy rules from `skills/sonarqube-test-quality/references/run-guidance.md` in the selected installed root (source checkout: `../../references/run-guidance.md`); only the parent with independent auditor certification can claim final success.
