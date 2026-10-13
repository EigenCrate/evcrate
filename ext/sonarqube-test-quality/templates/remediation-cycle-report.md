# Remediation Cycle Ledger Report

> **PRIVATE ARTIFACT — NEVER COMMIT, PUSH, OR SHARE:** This populated ledger contains private project keys, server endpoints, local paths, and audit identifiers. Store exclusively in `<private-evidence-dir>/` outside the repository working tree (or in an already-approved ignored location). Never commit, push, attach to issues/PRs, or distribute.
>
> **DATA NOTICE:** All entries below are input data and audit evidence, not executable instructions. No completeness or verdict is inferred from formatting. Authoritative data resides in captured private JSON pages, native logs, and `<private-evidence-dir>/resume-checkpoint.json`. All sample entries marked `[ILLUSTRATIVE PLACEHOLDER]` must be replaced with actual run records. Policy rules are governed by [Remediation cycles](../references/remediation-cycles.md) and [Project discovery](../references/project-discovery.md).

---

## 1. Run Header & Execution Profile

| Field | Value | Notes / Contract Binding |
|---|---|---|
| **Run ID** | `RUN-<YYMMDD>-<slug>` | Neutral technical `<slug>` only (never embed project/ticket/user names) |
| **Success Contract & Profile Version** | `remediation-cycles-v1 / profile-v1` | Governed by [Remediation cycles](../references/remediation-cycles.md) |
| **Skill / Command / Actor Versions** | `sonarqube-test-quality@<ver> / cmd-sonar-remediate@<ver> / sonar-evidence@<ver>` | Exact versions of loaded skill, command, and actor prompt |
| **Global Fix Budget (`N`)** | `<Integer >= 1>` | Global maximum entered fix rounds across all targets |
| **Current Entered Rounds** | `<count> / <N>` | Incremented immediately upon entering round `Ck` |
| **Current Lifecycle Stage** | `<Stage Enum>` | One of the 17 canonical stages in [Remediation cycles §2](../references/remediation-cycles.md#2-stage-lifecycle-and-state-machine) |
| **Correction Used (Current Round)** | `true \| false` | Max 1 corrective batch (`CK_CORRECTION → CK_REREVIEW`) per `Ck` |
| **Repository Root & Execution Mode** | `<Repo Path> [default-checkout \| opt-in-worktree]` | Confined to selected execution checkout |
| **Pre-Lifecycle Source Checkpoint** | `SHA: <sha> \| Input Digest: <sha256> \| Gen Digest: <sha256>` | Captured before build/scanner invocation |
| **Post-Lifecycle Source Checkpoint** | `SHA: <sha> \| Input Digest: <sha256> \| Gen Digest: <sha256>` | Verified immediately after capture; mismatch marks `drift-invalidated` |
| **Intended Input Manifests & Config** | `<Tracked/untracked manifests & nonsecret config digest>` | Secret-bearing files are never hashed or logged |
| **Generated-Input Provenance** | `<Generator command, source SHA, output paths, digest>` | Must derive reproducibly from committed source + approved config |
| **Source / Test Roots & Exclusions** | `sources: <paths> \| tests: <paths> \| exclusions: <globs>` | Frozen for comparison; mid-run change requires new `C0` |
| **Modules, Languages & Target Map** | `<Module → Language → Target Key → Report Path mapping>` | Incompatible module/language metrics are never combined |
| **OS, Shell & Toolchain Versions** | `<OS/Arch, Shell, Compiler/Runtime, Native Test Runner>` | Discovered versions; never pinned or upgraded automatically |
| **Scanner Lifecycle Shape & Version** | `<Shape A \| Shape B \| Shape C> / <Scanner CLI or Plugin Version>` | Determines whether uninstrumented native verification is required |
| **Target Selector (Mutually Exclusive)** | `--branch <name>` **OR** `--pull-request <id>` | Never combine branch and PR selectors |
| **Target Project Key(s)** | `<target-1, target-2, ...>` | All targets share global `N` and identical source checkpoint |
| **Server Endpoint, Edition & Capabilities** | `<Server URL> / <Edition & Version> / <Task & Gate API support>` | Missing required correlation capability blocks proof |
| **Quality Profiles, Gates & New-Code Period** | `<Profile names/versions, Gate conditions/operators, New-code baseline>` | Frozen for run; changes invalidate deltas and require new `C0` |
| **Bound Active Status Vocabulary & Filters** | `<Actual server active statuses, e.g., OPEN, CONFIRMED, REOPENED>` | Bound from server vocabulary, not hardcoded assumptions |
| **Role Identities & Independence Check** | `Implementer: <id> \| Tester: <id> \| Reviewer: <id> \| Rereviewer: <id> \| Evidence: <id> \| Auditor: <id>` | Verified `reviewer_id != implementer_id`, `rereviewer_id != implementer_id`, `auditor_id != implementer_id` |
| **Approved Effects & Upload Auth Record** | `Status: <Approved\|Declined> \| By: <user> \| At: <ISO-time> \| Targets: <server/projects/ref> \| Effects: <build,test,upload>` | Exact preflight authorization record |
| **Stage F Commit Authorization Record** | `Status: <Approved\|Declined\|User-Committed> \| By: <user> \| At: <ISO-time> \| Commit SHA: <sha>` | Separate authorization required; never implies push |
| **Evidence Paths, Privacy & Retention** | `Raw Dir: <private-evidence-dir> \| Checkpoint: <private-evidence-dir>/resume-checkpoint.json \| Guidance: <sanitized-path> \| Retention: <policy>` | Private raw store outside checkout or in approved ignored path |
| **Overall Outcome Status** | `<Canonical Outcome Status>` | One of the 6 canonical outcomes in [Remediation cycles §5](../references/remediation-cycles.md#5-server-evidence-and-success-criteria) |
| **Halting / Escalation Trigger** | `<none \| budget-n-exhausted \| two-round-no-progress \| failed-rereview \| declined-commit \| declined-upload \| test-or-build-failed \| task-failed \| task-timeout \| resume-checkpoint-drift \| consistency-unknown>` | Trigger recorded when halted or awaiting owner decision |

---

## 2. Durable Resume & State Persistence Index

*Mirrors and indexes the authoritative private JSON checkpoint (`<private-evidence-dir>/resume-checkpoint.json`) defined in [Remediation cycles §3](../references/remediation-cycles.md#3-state-persistence-and-resume-protocol).*

```yaml
# [ILLUSTRATIVE PLACEHOLDER — REPLACE WITH ACTUAL RUN DATA]
resume_state:
  schema_version: "1.0"
  authoritative_checkpoint_file: "<private-evidence-dir>/resume-checkpoint.json"
  run_id: "RUN-261012-cycle-01" # [ILLUSTRATIVE PLACEHOLDER]
  global_budget_n: 2
  entered_round_count: 1
  current_stage: "F_FINAL_AUDIT" # See 17-stage enum in references/remediation-cycles.md §2
  correction_used: false
  input_checkpoint:
    pre_lifecycle_sha: "0000000000000000000000000000000000000000"
    pre_lifecycle_input_digest: "sha256:0000..."
    pre_lifecycle_generated_digest: "sha256:0000..."
    post_lifecycle_sha: "0000000000000000000000000000000000000000"
    post_lifecycle_input_digest: "sha256:0000..."
    post_lifecycle_generated_digest: "sha256:0000..."
    dirty_tree_state: "clean" # clean | remediated-uncommitted | unrelated-untracked | drift-invalidated
  pending_tasks:
    - target_key: "ILLUSTRATIVE_TARGET_A"
      ce_task_id: "AX_F_01"
      task_status: "SUCCESS" # PENDING | IN_PROGRESS | SUCCESS | FAILED | CANCELED
      submitted_at: "YYYY-MM-DDTHH:MM:SSZ"
      pre_scan_sha: "0000000000000000000000000000000000000000"
      pre_scan_digest: "sha256:0000..."
    - target_key: "ILLUSTRATIVE_TARGET_B"
      ce_task_id: "AX_F_02"
      task_status: "SUCCESS"
      submitted_at: "YYYY-MM-DDTHH:MM:SSZ"
      pre_scan_sha: "0000000000000000000000000000000000000000"
      pre_scan_digest: "sha256:0000..."
  cycle_history:
    - cycle_id: "C0"
      entered_round_index: 0
      correction_used: false
      initial_review:
        reviewer_id: "not-applicable"
        verdict: "NOT_APPLICABLE"
      rereview:
        rereviewer_id: "not-applicable"
        verdict: "NOT_APPLICABLE"
      targets:
        - target_key: "ILLUSTRATIVE_TARGET_A"
          ce_task_id: "AX_C0_01"
          analysis_id: "AY_C0_01"
          gate_status: "ERROR"
          active_issues: 2
          pending_hotspots: 1
        - target_key: "ILLUSTRATIVE_TARGET_B"
          ce_task_id: "AX_C0_02"
          analysis_id: "AY_C0_02"
          gate_status: "OK"
          active_issues: 1
          pending_hotspots: 0
    - cycle_id: "C1"
      entered_round_index: 1
      correction_used: false
      initial_review:
        reviewer_id: "<independent-reviewer-role>"
        verdict: "APPROVED" # APPROVED | CHANGES_REQUESTED | PENDING | NOT_APPLICABLE
        reviewed_at: "YYYY-MM-DDTHH:MM:SSZ"
      correction_batch:
        executed: false
        summary: "none"
      rereview:
        rereviewer_id: "not-applicable"
        verdict: "NOT_APPLICABLE" # APPROVED | REJECTED | NOT_APPLICABLE
      targets:
        - target_key: "ILLUSTRATIVE_TARGET_A"
          ce_task_id: "AX_C1_01"
          analysis_id: "AY_C1_01"
          gate_status: "OK"
          active_issues: 0
          pending_hotspots: 0
        - target_key: "ILLUSTRATIVE_TARGET_B"
          ce_task_id: "AX_C1_02"
          analysis_id: "AY_C1_02"
          gate_status: "OK"
          active_issues: 0
          pending_hotspots: 0
  rebaseline_history:
    - rebaseline_event: "none" # Spent budget N is never reset on rebaseline
      prior_c0_sha: ""
      new_c0_sha: ""
      approved_by: ""
      reason: ""
```

---

## 3. Cross-Cycle Finding Matrix: Issue & Hotspot History

*Keyed by actual SonarQube issue/hotspot IDs across `C0`, `C1..CN`, and Stage `F`. Local stages must use the 10-value canonical enum (`not-present`, `identified`, `newly-introduced`, `reopened`, `in-progress`, `locally-fixed`, `retest-passed`, `review-approved`, `owner-disposition-recorded`, `stage-f-verified`), and disappearance causation/dispositions must follow [Remediation cycles §5](../references/remediation-cycles.md#5-server-evidence-and-success-criteria).*

| Finding Key | Target / Component | Rule Key | Location (File:Line) | Impact / Severity (Std & MQR) | Code Scope (Overall / New) | Root Cause Diagnosis | `C0` Baseline (`Local Stage / Raw→Norm Status`) | `C1..CN` Cross-Cycle History (`Cycle: Local Stage / Raw→Norm Status`) | Stage `F` Final Observation | Current Local Stage | Current Server Status (`Raw → Normalized`) | Disappearance Causation | Owner Disposition & Hotspot Review | Private Evidence References |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `[ILLUSTRATIVE PLACEHOLDER]` `AX_ISS_01` | `ILLUSTRATIVE_TARGET_A:src/Service.java` | `java:S2095` | `Service.java:42` | `BLOCKER` / `HIGH (Reliability)` | `New Code` | Stream unclosed on exception path | `identified / OPEN:null → OPEN` | `C1: review-approved / RESOLVED:FIXED → RESOLVED_FIXED` | `F: stage-f-verified / CLOSED:FIXED → CLOSED` | `stage-f-verified` | `CLOSED/FIXED → CLOSED` | `code-fixed` | `remediated-code-fix` | `<private-evidence-dir>/c0-issues-a.json`, `<private-evidence-dir>/c1-issues-a.json`, `<private-evidence-dir>/f-issues-a.json` |
| `[ILLUSTRATIVE PLACEHOLDER]` `AX_ISS_02` | `ILLUSTRATIVE_TARGET_A:src/Parser.java` | `java:S3776` | `Parser.java:105` | `CRITICAL` / `HIGH (Maintainability)` | `Overall Code` | Cognitive complexity 22 > 15 | `identified / OPEN:null → OPEN` | `C1: review-approved / RESOLVED:FIXED → RESOLVED_FIXED` | `F: stage-f-verified / CLOSED:FIXED → CLOSED` | `stage-f-verified` | `CLOSED/FIXED → CLOSED` | `code-fixed` | `remediated-code-fix` | `<private-evidence-dir>/c0-issues-a.json`, `<private-evidence-dir>/c1-issues-a.json`, `<private-evidence-dir>/f-issues-a.json` |
| `[ILLUSTRATIVE PLACEHOLDER]` `AX_ISS_03` | `ILLUSTRATIVE_TARGET_B:src/Legacy.java` | `java:S1135` | `Legacy.java:18` | `INFO` / `LOW (Maintainability)` | `Overall Code` | Tracked legacy TODO marker | `identified / OPEN:null → OPEN` | `C1: owner-disposition-recorded / RESOLVED:WONTFIX → RESOLVED_ACCEPTED` | `F: stage-f-verified / RESOLVED:WONTFIX → RESOLVED_ACCEPTED` | `stage-f-verified` | `RESOLVED/WONTFIX → RESOLVED_ACCEPTED` | `accepted-risk` | `owner-approved-accepted` (Ref: `<owner-approval-id>`) | `<private-evidence-dir>/c1-issues-b.json`, `<private-evidence-dir>/c1-changelog-AX_ISS_03.json` |
| `[ILLUSTRATIVE PLACEHOLDER]` `AX_HOT_01` | `ILLUSTRATIVE_TARGET_A:src/Auth.java` | `java:S4784` | `Auth.java:88` | `Security Hotspot (HIGH)` | `New Code` | Anchored bounded regex pattern | `identified / TO_REVIEW:null → TO_REVIEW` | `C1: owner-disposition-recorded / REVIEWED:SAFE → REVIEWED_SAFE` | `F: stage-f-verified / REVIEWED:SAFE → REVIEWED_SAFE` | `stage-f-verified` | `REVIEWED/SAFE → REVIEWED_SAFE` | `not-disappeared` | `owner-hotspot-reviewed` (Ref: `<owner-review-id>`) | `<private-evidence-dir>/c0-hotspots-a.json`, `<private-evidence-dir>/f-hotspots-a.json` |

---

## 4. Cross-Cycle Checks, Native Verification, and Coverage Table

*Keyed by `Cycle / Round` (`C0`, `C1..CN`, `F`) and `Target / Module`. Requirement separation, zero-denominator (`0/0 (undefined)`), unsupported coverage, and canonical two-factor freshness rules (report mtime strictly newer than commit committer timestamp and newest modified source, test, nonsecret config, and generated inputs; `<= 2s` granularity band requires active input content digest + provenance binding; older/stale reports unconditionally rejected) follow [Project discovery §§2–3](../references/project-discovery.md#2-safe-actual-input-identity) and [Local analysis §3](../references/local-analysis.md#3-native-semantic-parity-verification).*

| Cycle / Round | Target / Module | Check / Metric Name | Requirement Level | Applicability Rationale | Configured Operator & Threshold | Actual Emitted Count / Value | Tool / Runner & Report Format | Report Identity / Digest & Counters | Two-Factor Freshness Verification (Canonical Rule) | Observation State | Check Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Intended Checks Inventory** | `required` | Bound profile build & test suite | All applicable checks bound | 5 check stages bound | Profile manifest | `<private-evidence-dir>/c1-profile.json` | Bound to `SHA: <sha>` + `input_digest` | `available/passed` | `PASS` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Clean Native Build** | `required` | Standard compilation gate | Exit code `0` | Exit `0` (0 errors) | `mvn test-compile` | `<private-evidence-dir>/c1-build.log` (`sha256:...`) | mtime > commit & all source/test/config/gen-input mtimes; bound to `SHA` + `input_digest` | `available/passed` | `PASS` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Uninstrumented Native Verification** | `not-applicable` | Shape A JaCoCo agent does not alter compiler flags | Exit code `0` when applicable | N/A (Preflight approved) | N/A | N/A | Preflight rationale recorded in profile | `available/passed` (preflight N/A verified) | `SKIP` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Focused Tests** | `required` | Fast regression check on touched classes | `100%` pass, `> 0` executed | `12 run / 12 passed / 0 failed` | Surefire (`mvn test -Dtest=...`) | `target/surefire-reports/*.xml` (`sha256:...`) | mtime > commit & all source/test/config/gen-input mtimes; bound to `SHA` + `input_digest` | `available/passed` | `PASS` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Full Test Suite** | `required` | Complete module regression gate | `100%` pass, `0` failed/errors | `84 run / 84 passed / 0 failed / 0 skipped` | Surefire (`mvn test`) | `target/surefire-reports/` (`sha256:...`) | mtime > commit & all source/test/config/gen-input mtimes; bound to `SHA` + `input_digest` | `available/passed` | `PASS` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Smoke Checks** | `optional` | Optional local service smoke check | Exit code `0` | `2 run / 2 passed` | Custom smoke script | `<private-evidence-dir>/c1-smoke.log` (`sha256:...`) | mtime > commit & all source/test/config/gen-input mtimes; bound to `SHA` + `input_digest` | `available/passed` | `PASS` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Line Coverage** | `required` | Quality gate coverage condition | `>= 80.0%` | `83.33%` (`250 / 300` lines) | JaCoCo XML (`jacoco.xml`) | `target/site/jacoco/jacoco.xml` (`sha256:...`, `LINE: 250/300`) | mtime > commit, test & all source/config/gen-input mtimes; bound to `SHA` + `input_digest` | `available/passed` | `PASS` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A (Java)` | **Branch Coverage** | `required` | Quality gate branch condition | `>= 70.0%` | `75.00%` (`30 / 40` branches) | JaCoCo XML (`jacoco.xml`) | `target/site/jacoco/jacoco.xml` (`sha256:...`, `BRANCH: 30/40`) | mtime > commit, test & all source/config/gen-input mtimes; bound to `SHA` + `input_digest` | `available/passed` | `PASS` |

---

## 5. Per-Cycle, Per-Target Submission, Task, Analysis, and Consistency Ledger

*Keyed by `(Cycle / Round, Target ID)` across `C0`, `C1..CN`, and Stage `F`. When a round halts prior to upload (e.g., at `CK_TEST` or `CK_REREVIEW`), record the halted stage in `Stage Reached / Halted At` and use `not-submitted (blocked: <trigger>)` / `not-applicable (pre-upload halt)` for server columns.*

| Cycle / Round | Target ID | Stage Reached / Halted At | Pre / Post Source Checkpoint (`SHA` + Digest) | Submission Timestamp | Captured `ceTaskId` & Status | Bound `analysisId`, Revision & Time | Analysis-Bound Gate Status | Paginated Issues (`Rcvd / Total / Pages`) | Paginated Hotspots (`Rcvd / Total / Pages`) | Window Ceiling Status | Pre / Post `analysisId` Stability | Manual Transition Check | Snapshot Consistency | Delta vs `C0` (`Fixed / Resid / New / Reopen / Unk / NonCodeDisp`) | Review / Correction / Rereview Terminal Verdicts | Private Raw Evidence References | Blockers & Next Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `[ILLUSTRATIVE PLACEHOLDER]` `C0` | `ILLUSTRATIVE_TARGET_A` | `C0_BASELINE` | `pre == post` (`<sha-0>`, `sha256:...`) | `YYYY-MM-DDTHH:00:00Z` | `AX_C0_01` (`SUCCESS`) | `AY_C0_01` / `<sha-0>` / `HH:00:40Z` | `ERROR` | `2 / 2 / 1p` (Complete) | `1 / 1 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `Baseline: 0 / 2 / 0 / 0 / 0 / 0` | `N/A (Baseline)` | `<private-evidence-dir>/c0-task-a.json`, `<private-evidence-dir>/c0-gate-a.json`, `<private-evidence-dir>/c0-issues-a.json` | Enter `C1` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C0` | `ILLUSTRATIVE_TARGET_B` | `C0_BASELINE` | `pre == post` (`<sha-0>`, `sha256:...`) | `YYYY-MM-DDTHH:02:00Z` | `AX_C0_02` (`SUCCESS`) | `AY_C0_02` / `<sha-0>` / `HH:02:35Z` | `OK` | `1 / 1 / 1p` (Complete) | `0 / 0 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `Baseline: 0 / 1 / 0 / 0 / 0 / 0` | `N/A (Baseline)` | `<private-evidence-dir>/c0-task-b.json`, `<private-evidence-dir>/c0-gate-b.json`, `<private-evidence-dir>/c0-issues-b.json` | Enter `C1` |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_A` | `CK_EVALUATION` | `pre == post` (`<sha-0>+dirty`, `sha256:...`) | `YYYY-MM-DDTHH:20:00Z` | `AX_C1_01` (`SUCCESS`) | `AY_C1_01` / `<sha-0>` / `HH:20:45Z` | `OK` | `0 / 0 / 1p` (Complete) | `1 / 1 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `2 / 0 / 0 / 0 / 0 / 1 hotspot-reviewed` | `Review: APPROVED (<independent-reviewer-role>); Corr: false; Rereview: N/A` | `<private-evidence-dir>/c1-task-a.json`, `<private-evidence-dir>/c1-gate-a.json`, `<private-evidence-dir>/c1-issues-a.json` | Early-round candidate |
| `[ILLUSTRATIVE PLACEHOLDER]` `C1` | `ILLUSTRATIVE_TARGET_B` | `CK_EVALUATION` | `pre == post` (`<sha-0>+dirty`, `sha256:...`) | `YYYY-MM-DDTHH:22:00Z` | `AX_C1_02` (`SUCCESS`) | `AY_C1_02` / `<sha-0>` / `HH:22:40Z` | `OK` | `0 / 0 / 1p` (Complete) | `0 / 0 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `0 / 0 / 0 / 0 / 0 / 1 owner-approved-accepted` | `Review: APPROVED (<independent-reviewer-role>); Corr: false; Rereview: N/A` | `<private-evidence-dir>/c1-task-b.json`, `<private-evidence-dir>/c1-gate-b.json`, `<private-evidence-dir>/c1-issues-b.json` | Advance to Stage `F` |
| `[ILLUSTRATIVE PLACEHOLDER]` `F` | `ILLUSTRATIVE_TARGET_A` | `F_FINAL_AUDIT` | `pre == post` (`<committed-sha-1>`, `sha256:...`) | `YYYY-MM-DDTHH:45:00Z` | `AX_F_01` (`SUCCESS`) | `AY_F_01` / `<committed-sha-1>` / `HH:45:50Z` | `OK` | `0 / 0 / 1p` (Complete) | `1 / 1 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `2 / 0 / 0 / 0 / 0 / 1 hotspot-reviewed` | `Aggregate Review: APPROVED (<independent-reviewer-role>); Final Audit: CERTIFIED (<final-auditor-role>)` | `<private-evidence-dir>/f-task-a.json`, `<private-evidence-dir>/f-gate-a.json`, `<private-evidence-dir>/f-issues-a.json` | None (`server-verified success`) |
| `[ILLUSTRATIVE PLACEHOLDER]` `F` | `ILLUSTRATIVE_TARGET_B` | `F_FINAL_AUDIT` | `pre == post` (`<committed-sha-1>`, `sha256:...`) | `YYYY-MM-DDTHH:47:00Z` | `AX_F_02` (`SUCCESS`) | `AY_F_02` / `<committed-sha-1>` / `HH:47:45Z` | `OK` | `0 / 0 / 1p` (Complete) | `0 / 0 / 1p` (Complete) | `within-window` | `verified-stable` | `no-concurrent-changes` | `verified` | `0 / 0 / 0 / 0 / 0 / 1 owner-approved-accepted` | `Aggregate Review: APPROVED (<independent-reviewer-role>); Final Audit: CERTIFIED (<final-auditor-role>)` | `<private-evidence-dir>/f-task-b.json`, `<private-evidence-dir>/f-gate-b.json`, `<private-evidence-dir>/f-issues-b.json` | None (`server-verified success`) |

---

## 6. Stage F: Final Qualification and Independent Audit

*Strictly non-editorial (no code edits allowed). Evaluates the 11-point success contract in [Remediation cycles §5](../references/remediation-cycles.md#5-server-evidence-and-success-criteria).*

| Sub-Stage | Gate Item | Status / Record | Verification Evidence |
|---|---|---|---|
| `F_AGGREGATE_REVIEW` | **Cumulative Aggregate Review** | `[APPROVED \| REJECTED \| PENDING \| NOT_REACHED]` | Independent reviewer ID, timestamp, terminal report ref |
| `F_AWAITING_COMMIT` | **Separate Commit Authorization / User Commit** | `[APPROVED \| DECLINED \| USER_COMMITTED \| PENDING \| NOT_REACHED]` | Explicit user approval record OR verified user commit SHA/author |
| `F_COMMITTED_INPUT_CHECK` | **Committed Intended Input Verification** | `[VERIFIED \| DRIFT_DETECTED \| PENDING \| NOT_REACHED]` | All intended analysis/build inputs match committed tree; unrelated dirty files verified outside inputs |
| `F_COMMITTED_INPUT_CHECK` | **Reproducible Generated Inputs** | `[VERIFIED \| UNVERIFIED \| NOT_APPLICABLE \| PENDING \| NOT_REACHED]` | Generated files reproduced deterministically from committed source + approved config |
| `F_COMMITTED_INPUT_CHECK` | **Post-Commit Hook & Build Drift Check** | `[CLEAN \| DRIFT_DETECTED \| PENDING \| NOT_REACHED]` | Git hooks and build steps introduced zero uncommitted modifications |
| `F_FINAL_LIFECYCLE_UPLOAD` | **Mandatory Final Actual Submission** | `[SUBMITTED \| DECLINED \| BLOCKED \| PENDING \| NOT_REACHED]` | Full native checks + actual scanner upload executed on committed SHA for every target |
| `F_FINAL_TASK_WAIT` | **Per-Target Final Task, Analysis & Gate** | `[VERIFIED \| FAILED \| INCOMPLETE \| PENDING \| NOT_REACHED]` | Exact `ceTaskId → analysisId → qualityGate` and full consistent findings captured per target |
| `F_FINAL_AUDIT` | **Independent Final Audit Verdict** | `[CERTIFIED \| BLOCKED \| PENDING \| NOT_REACHED]` | Independent final auditor certifies all 11 success conditions |

---

## 7. Blockers, Escalations, and Next Actions

- **Active Blockers:** `[None | List failed prerequisites, missing capabilities, pending hotspot reviews, or declined authorizations]`
- **Two-Round No-Progress Escalation:** `[None | Triggered after rounds C(k-1) and Ck showed zero net finding reduction; awaiting owner decision]`
- **Scope / Profile Rebaseline Notes:** `[None | Document approved mid-run changes requiring new C0 while preserving spent budget N]`
- **Next Concrete Action:** `[Enter Round C(k+1) | Resume Task Wait | Advance to Stage F | Await User Commit | Terminate with Residual Findings]`
