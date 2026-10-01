---
description: "Start coding & testing an existing plan"
argument-hint: "[plan] [--advice]"
---
**MUST READ** `CLAUDE.md` then **THINK HARDER** to start working on the following plan follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before interpreting the plan, read `.claude/workflows/advisor-mentoring.md` and
derive `WORK_ARGUMENTS` plus explicit/default advice mode from the raw arguments.
Use `WORK_ARGUMENTS` as the plan input everywhere below. Apply the canonical
`## Caller lifecycle binding` in `.claude/workflows/advisor-mentoring.md` and the
shared default stuck-escalation contract throughout this command:
- **Durable state ownership**: The parent command is the sole owner of the task-state lifecycle. Child subagents (`tester`, `debugger`, `code-reviewer`, `project-manager`, `docs-manager`, `git-manager`, `ui-ux-designer`) report terminal artifacts, evidence, and actual changed paths; they never operate controller state or stage/commit behind the parent.
- **Run identity & handoff**: If entering with an existing active run (from prior direction/decision/stuck run or router handoff), retain `task_run_id`, phase, root, current state revision, and prior counsel/disposition/outcome. Resume an already-active action without duplicating it: complete its authorized bounded work, execute actual declared validation, and record a truthful matching outcome advancing the baseline before the next review reservation. Before new authorized bounded writes, require `accept` with a registered correction action. For disputed counsel (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action, collect read-only evidence or an explicit resolution while preserving the captured baseline unchanged, and obtain fresh same-run counsel before mutation or a resolved outcome; never invent an action or outcome to reserve that consultation. Never initialize a new UUID to bypass stale evidence or correction counters.
- **Fresh first review**: If no prior active advice run exists, do NOT initialize state at command start just to track implementation. Implementation (Step 2), actual validation (Step 3), reviewer output (Step 4), and planned finalization artifacts settle first (writer barrier). Build `baseline_paths` as the union of authorized writable paths and selected read-only `evidence.files`/artifacts (`authorized_paths` contains only writable paths). Call `state init` immediately before reservation in Step 4, with no intervening file edits or git status/index changes.
- **Baseline stability**: Freeze all baseline paths (not only current citations) during reservation, inference, disposition, and from final outcome to completion.

---

## Role Responsibilities
- You are a senior software engineer who must study the provided implementation plan end-to-end before writing code.
- Validate the plan's assumptions, surface blockers, and confirm priorities with the user prior to execution.
- Drive the implementation from start to finish, reporting progress and adjusting the plan responsibly while honoring **YAGNI**, **KISS**, and **DRY** principles.

**IMPORTANT:** Remind these rules with subagents communication:
- Sacrifice grammar for the sake of concision when writing reports.
- In reports, list any unresolved questions at the end, if any.
- Ensure token efficiency while maintaining high quality.

---

## Step 0: Plan Detection & Phase Selection

**If `WORK_ARGUMENTS` is empty:**
1. Find latest `plan.md` in `./plans` | `find ./plans -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-`
2. Parse plan for phases and status, auto-select next incomplete (prefer IN_PROGRESS or earliest Planned)

**If `WORK_ARGUMENTS` provided:** Use that plan and detect which phase to work on (auto-detect or use argument like "phase-2").

**Output:** `✓ Step 0: [Plan Name] - [Phase Name]`

**Subagent Pattern (use throughout):**
```
Task(subagent_type="[type]", prompt="[task description]", description="[brief]")
```

**Blocking delegation rule:** Every Task/subagent call is synchronous. The parent must wait for the terminal response, verify the requested report/artifact and validation status, and only then continue. For parallel calls, explicitly say **wait for all agents**, collect one terminal result per call, and stop on any interrupted, timed-out, missing, or partial result.

**Wait-loop protocol:** After each Task call, record the returned agent identity and use the native wait operation for that same agent. A response such as **"No agents completed yet"** is expected polling feedback, not a timeout: immediately wait again. Do not use shell `sleep`, start another task, ask for approval, synthesize a score, restart, or interrupt the agent while it is active. Polling intervals and the three-review-cycle limit do not end the gate; the cycle counter advances only after every required reviewer/advisor result is terminal, and a user fix decision is required before beginning another cycle. If the parent runtime terminates first, report the review gate incomplete with the agent identity and no fabricated result.

---

## Workflow Sequence

**Rules:** Follow steps 1-6 in order. Each step requires output marker starting with "✓ Step N:". Mark each complete in TodoWrite before proceeding. Do not skip steps.

---

## Step 1: Analysis & Task Extraction

Read plan file completely. Map dependencies between tasks. List ambiguities or blockers. Identify required skills/tools and activate from catalog. Parse phase file and extract actionable tasks.

**TodoWrite Initialization & Task Extraction:**
- Initialize TodoWrite with `Step 0: [Plan Name] - [Phase Name]` and all command steps (Step 1 through Step 6)
- Read phase file (e.g., phase-01-preparation.md)
- Look for tasks/steps/phases/sections/numbered/bulleted lists
- MUST convert to TodoWrite tasks:
  - Phase Implementation tasks → Step 2.X (Step 2.1, Step 2.2, etc.)
  - Phase Testing tasks → Step 3.X (Step 3.1, Step 3.2, etc.)
  - Phase Code Review tasks → Step 4.X (Step 4.1, Step 4.2, etc.)
- Ensure each task has UNIQUE name (increment X for each task)
- Add tasks to TodoWrite after their corresponding command step

**Output:** `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list or "none"]`

Mark Step 1 complete in TodoWrite, mark Step 2 in_progress.

---

## Step 2: Implementation

Implement selected plan phase step-by-step following extracted tasks (Step 2.1, Step 2.2, etc.). Mark tasks complete as done. For UI work, call `ui-ux-designer` subagent: "Implement [feature] UI per ./docs/design-guidelines.md". Use `ai-multimodal` skill for image assets, `imagemagick` for editing. Run type checking and compile to verify no syntax errors.

**Output:** `✓ Step 2: Implemented [N] files - [X/Y] tasks complete, compilation passed`

Mark Step 2 complete in TodoWrite, mark Step 3 in_progress.

---

## Step 3: Testing

Write tests covering happy path, edge cases, and error cases. Call `tester` subagent: "Run test suite for plan phase [phase-name]". If ANY tests fail: STOP, call `debugger` subagent: "Analyze failures: [details]", fix all issues, re-run `tester`. Repeat until 100% pass.

**Testing standards:** Unit tests may use mocks for external dependencies (APIs, DB). Integration tests use test environment. E2E tests use real but isolated data. Forbidden: commenting out tests, changing assertions to pass, TODO/FIXME to defer fixes.

**Output:** `✓ Step 3: Tests [X/X passed] - All requirements met`

**Validation:** If X ≠ total, Step 3 INCOMPLETE - do not proceed.

Mark Step 3 complete in TodoWrite, mark Step 4 in_progress.

---

## Step 4: Code Review & Approval ⏸ BLOCKING GATE

Call exactly one `code-reviewer` subagent per review cycle: "Review changes for plan phase [phase-name]. Check security, performance, architecture, YAGNI/KISS/DRY. Return a terminal report with score (X/10), critical issues list, warnings list, suggestions list, reviewed files, validation commands/results, and unresolved questions. Do not return a progress-only response."

**Review completion gate:** Stay in the wait loop for the same reviewer until its terminal result arrives. Only then display findings and request approval. A terminal failure, interruption, cancellation, or parent-runtime termination fails the gate; do not invent a score or silently launch a replacement. If the user says to keep waiting, continue polling the same reviewer identity.

**Advice gate & lifecycle placement:** In explicit advice mode:
- **Cycle 1 reservation**: After reviewer terminal output arrives and before displaying findings or requesting approval:
  - If a fresh review run: initialize task state immediately before reservation (`baseline_paths` = authorized writable paths UNION selected read-only `evidence.files`/artifacts, with read-only files omitted from `authorized_paths`).
  - If an active run has a registered action, finish its bounded work, actual validation, and matching truthful outcome before reservation without duplicating the action. Disputed counsel without an active action uses read-only evidence/resolution and fresh same-run consultation before writes or a resolved correction outcome; do not invent an outcome to reserve that consultation.
  - Enter the canonical checkpoint dispatcher exactly once at `review:step-4` for this review cycle. Supply bounded evidence, declared validation commands/output, relevant prior counsel, and owner disposition per `## Caller lifecycle binding`.
  - Freeze all baseline paths during reservation, inference, and disposition.
  - A dispatcher failure or non-`ADVICE_READY` result leaves Step 4 incomplete. Include advisor must-fix guidance in the findings.

**Interactive Review-Fix Cycle (max 3 cycles):**

**Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.**

```
review_cycles = 0
LOOP:
  1. IF review_cycles >= 3:
     → Output: "⚠ 3 review cycles completed. Final decision required."
     → AskUserQuestion: "Approve with noted issues" / "Abort workflow"
     → STOP; do not start another review or advisor call
  2. Run code-reviewer → wait for its terminal result; get score, critical_count, warnings, suggestions

  3. IF the reviewer result is missing, partial, interrupted, cancelled,
     timed-out, or failed: STOP the gate; do not increment review_cycles.

  4. IF explicit advice mode: enter the canonical dispatcher → wait for its terminal result

  5. IF explicit advice mode and the advisor result is missing, partial,
     interrupted, cancelled, timed-out, or failed: STOP the gate; do not
     increment review_cycles.

  6. review_cycles++ only after every required reviewer/advisor result is terminal

  7. DISPLAY FULL REVIEWER + ADVISOR FINDINGS AND SUMMARY TO USER:
     ┌─────────────────────────────────────────┐
     │ Code Review Results: [score]/10         │
     ├─────────────────────────────────────────┤
     │ Summary: [what implemented], tests      │
     │ [X/X passed]                            │
     ├─────────────────────────────────────────┤
     │ Critical Issues ([N]): MUST FIX         │
     │  - [issue] at [file:line]               │
     │ Warnings ([N]): SHOULD FIX              │
     │  - [issue] at [file:line]               │
     │ Suggestions ([N]): NICE TO HAVE         │
     │  - [suggestion]                         │
     └─────────────────────────────────────────┘

  8. Use AskUserQuestion (header: "Review & Approve"):
     IF critical_count > 0 OR advisor has must-fix items:
       - "Fix critical issues" → implement fixes, re-run tester, GOTO LOOP
       - "Fix all issues" → implement all fixes, re-run tester, GOTO LOOP
       - "Dispute advisor findings with evidence" → collect read-only evidence/resolution, GOTO LOOP
       - "Approve anyway" → PROCEED to Step 5
       - "Abort" → stop workflow
     ELSE:
       - "Approve" → PROCEED to Step 5
       - "Fix warnings/suggestions" → implement fixes, re-run tester, GOTO LOOP
       - "Abort" → stop workflow

  9. IF user selects any fix or dispute option:
     IF review_cycles >= 3:
       → Output: "⚠ 3 review cycles completed. Final decision required."
       → AskUserQuestion: "Approve with noted issues" / "Abort workflow"
       → STOP; do not run another fix/test/reviewer/advisor sequence
     ELSE IF explicit advice mode AND counsel is disputed:
       → Record reject-with-evidence, need-evidence, or reconcile without correction metadata
       → Collect read-only evidence or an explicit resolution, preserving captured baseline
       → Obtain fresh same-run counsel before any corrective mutation or resolved correction outcome
       → GOTO LOOP within the review cap; do not register invented work or record a corrective outcome for this evidence-only branch
     ELSE (accepted corrections, or DEFAULT mode):
       → In explicit advice mode, record accept with one bounded action and declared validation command before writes; resume an already-active action rather than registering it twice
       → Implement accepted fixes within authorized scope, re-run tester to verify no regressions
       → In explicit advice mode, parent records matching truthful state outcome with actual changed paths and declared test results, advancing baseline
       → GOTO LOOP
```

**Critical issues:** Security vulnerabilities (XSS, SQL injection, OWASP), performance bottlenecks, architectural violations, principle violations.

**Output formats:**
- Waiting: `⏸ Step 4: Code reviewed - [score]/10 - WAITING for user approval`
- After fix: `✓ Step 4: [old]/10 → Fixed [N] issues → [new]/10 - User approved`
- Approved: `✓ Step 4: Code reviewed - [score]/10 - User approved`

**Validation:** Step 4 INCOMPLETE until user explicitly approves.

Mark Step 4 complete in TodoWrite, mark Step 5 in_progress.

---

## Step 5: Finalize

**Prerequisites:** User approved in Step 4 (verified above).

- In explicit advice mode: follow the substantive finalization lifecycle in `## Caller lifecycle binding`. Planned docs, status, and onboarding paths are authorized writable paths. Parent records `state disposition` for finalization (registering the bounded action and declared validation command) BEFORE executing any finalization writes or Git index transitions.
- In default mode: preserve ordinary approved/validated completed status without durable controller dependencies or controller state operations.

1. **STATUS UPDATE - BOTH MANDATORY - PARALLEL EXECUTION:**
- **Call** `project-manager` sub-agent:
  - In explicit advice mode: "Update plan status in [plan-path]. Record implementation and finalization settled, with durable completion pending. Do NOT mark phase as DONE prematurely. Update roadmap."
  - In default mode: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp. Update roadmap."
- **Call** `docs-manager` sub-agent: "Update docs for plan phase [phase-name]. Changed files: [list]."

2. **ONBOARDING CHECK:** Detect onboarding requirements (API keys, env vars, config) + generate summary report with next steps. (In explicit advice mode, substantive reports settle before final outcome under registered finalization action).

3. **AUTO-COMMIT (after steps 1 and 2 complete):**
- Run only if: Steps 1 and 2 successful + User approved + Tests passed
- Auto-stage, commit with conventional commit message based on actual changes
- In explicit advice mode: staging and commit transitions settle before recording the final outcome.
- In default mode: preserve standard commit behavior without durable controller operations.

4. **CONTROLLER OUTCOME & COMPLETION (Explicit Advice Mode):**
- In explicit advice mode:
  - Enforce writer barrier: all documentation/roadmap writes, onboarding configuration, and selected Git staging/commit settle before recording final outcome.
  - Run declared validation across all finalized deliverables.
  - Parent records ONE truthful `state outcome` matching the registered finalization action, reporting actual changed paths and declared validation status. (A no-change outcome is valid ONLY if zero actual files were changed, declared validation passed, disposition was accept, and no must-fix/unresolved-question items remain).
  - Parent executes `state complete` to seal the task run. The durable completion receipt is authoritative; only then is the phase durably DONE.
  - After sealing, freeze all captured baseline paths: never mutate sealed evidence, documentation, reports, or index after completion, and never prescribe copying DONE into captured files after completion. Any post-completion administrative receipt must remain OUTSIDE the captured baseline snapshot, identify the approved snapshot, and not claim unreviewed edits.
- In default mode: no controller state operations (`state disposition`, `state outcome`, `state complete`); phase is completed upon approval and validation, and marked DONE with timestamp in Step 1.

**Validation:** Steps 1 and 2 must complete successfully. Step 3 (auto-commit) runs only if conditions met. In explicit advice mode, `state complete` must succeed before phase completion.

Mark Step 5 complete in TodoWrite.

**Phase workflow finished. Ready for next plan phase.**

---

## Critical Enforcement Rules

**Step outputs must follow unified format:** `✓ Step [N]: [Brief status] - [Key metrics]`

**Examples:**
- Step 0: `✓ Step 0: [Plan Name] - [Phase Name]`
- Step 1: `✓ Step 1: Found [N] tasks across [M] phases - Ambiguities: [list]`
- Step 2: `✓ Step 2: Implemented [N] files - [X/Y] tasks complete`
- Step 3: `✓ Step 3: Tests [X/X passed] - All requirements met`
- Step 4: `✓ Step 4: Code reviewed - [score]/10 - User approved`
- Step 5: `✓ Step 5: Finalize - Status updated - Git committed`

**If any "✓ Step N:" output missing, that step is INCOMPLETE.**

**TodoWrite tracking required:** Initialize at Step 0, mark each step complete before next.

**Mandatory subagent calls:**
- Step 3: `tester`
- Step 4: `code-reviewer`
- Step 5: `project-manager` AND `docs-manager` (when user approves)

**Blocking gates:**
- Step 3: Tests must be 100% passing
- Step 4: User must explicitly approve (via AskUserQuestion)
- Step 5: Both `project-manager` and `docs-manager` must complete successfully; in explicit advice mode, `state complete` must succeed before phase completion


**REMEMBER:**
- Do not skip steps. Do not proceed if validation fails. Do not assume approval without user response.
- One plan phase per command run. Command focuses on single plan phase only.
- You can always generate images with `ai-multimodal` skill on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skill to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` or similar tools as needed.
