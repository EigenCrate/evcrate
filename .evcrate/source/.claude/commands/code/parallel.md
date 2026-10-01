---
description: "Execute parallel or sequential phases based on plan structure"
argument-hint: "[plan-path] [--advice]"
---
Raw implementation input: <raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before interpreting the plan, read `.claude/workflows/advisor-mentoring.md` and
derive `WORK_ARGUMENTS` plus explicit/default advice mode. Execute the plan from
`WORK_ARGUMENTS` and apply the canonical `## Caller lifecycle binding` in
`.claude/workflows/advisor-mentoring.md` and the shared default stuck-escalation contract:
- **Durable state ownership in parallel execution**: The parent command is the sole durable-state owner. Parallel child tasks (`fullstack-developer`, etc.) execute phase implementation within strict file ownership boundaries, reporting terminal artifacts, evidence, and actual changed paths back to the parent. Child tasks NEVER own or execute durable controller operations (`state init`, `checkpoint`, `disposition`, `outcome`, `complete`) and never stage or commit Git changes behind the parent.
- **Phase identity & context retention**: Phase identity is retained and bounded per its own phase; there is no blind context reset or UUID churn across phases.
- **Run identity & handoff**: If entering with an existing active run (from prior direction/decision/stuck run or router handoff), retain `task_run_id`, phase, root, current state revision, and prior counsel/disposition/outcome. Resume an already-active action without duplicating it: complete its authorized bounded work across parallel workers, execute actual declared validation, and record a truthful matching outcome advancing the baseline before the next review reservation. Before new authorized bounded writes, require `accept` with a registered correction action. For disputed counsel (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action, collect read-only evidence or an explicit resolution while preserving the captured baseline unchanged, and obtain fresh same-run counsel before mutation or a resolved outcome; never invent an action or outcome to reserve that consultation. Never initialize a new UUID to bypass stale evidence or correction counters.
- **Fresh first review**: If no prior active advice run exists, do NOT initialize state at command start just to track implementation. Implementation (Step 2A/2B), actual validation (Step 3), reviewer output (Step 4), and planned finalization artifacts settle first (writer barrier). Build `baseline_paths` as the union of authorized writable paths and selected read-only `evidence.files`/artifacts (`authorized_paths` contains only writable paths). Call `state init` immediately before reservation in Step 4, with no intervening file edits or git status/index changes.
- **Baseline stability**: Freeze all baseline paths (not only current citations) during reservation, inference, disposition, and from final outcome to completion.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Plan Analysis
- Read `plan.md` from given path
- **Check for:** Dependency graph, Execution strategy, Parallelization Info, File Ownership matrix
- **Decision:** IF parallel-executable → Step 2A, ELSE → Step 2B

### 2A. Parallel Execution
1. Parse execution strategy (which phases concurrent/sequential, file ownership)
2. Launch multiple `fullstack-developer` agents simultaneously for parallel phases
   - Pass: phase file path, environment info, file ownership boundaries
   - Child subagents report terminal artifacts and actual changed files back to the parent; child agents must never execute controller commands or stage Git changes
3. Wait for parallel group completion, verify no conflicts
4. Execute sequential phases (one agent per phase after dependencies)
5. Proceed to Step 3

### 2B. Sequential Execution
Follow `./.claude/workflows/primary-workflow.md`:
1. Use main agent step by step
2. Read `plan.md`, implement phases one by one
3. Use `project-manager` for progress updates
4. Use `ui-ux-designer` for frontend
5. Run type checking after each phase
6. Proceed to Step 3

### 3. Testing
- Use `tester` for full suite (NO fake data/mocks)
- If fail: `debugger` → fix → repeat

### 4. Code Review (Interactive Cycle)

Call `code-reviewer` subagent: "Review all changes from parallel/sequential execution. Check security, performance, architecture, YAGNI/KISS/DRY. Return score (X/10), critical issues list, warnings list, suggestions list."

**Advice gate & lifecycle placement:** In explicit advice mode:
- **Cycle 1 reservation**: After reviewer terminal output arrives and before findings are displayed, fixed, or approved:
  - If a fresh review run: initialize task state immediately before reservation (`baseline_paths` = authorized writable paths UNION selected read-only `evidence.files`/artifacts, with read-only files omitted from `authorized_paths`).
  - If an active run has a registered action, finish its bounded work, actual validation, and matching truthful outcome before reservation without duplicating the action. Disputed counsel without an active action uses read-only evidence/resolution and fresh same-run consultation before writes or a resolved correction outcome; do not invent an outcome to reserve that consultation.
  - Enter the canonical checkpoint dispatcher exactly once at `review:step-4` for this review cycle. Supply bounded evidence, declared validation commands/output, relevant prior counsel, and owner disposition per `## Caller lifecycle binding`.
  - Freeze all baseline paths during reservation, inference, and disposition.
  - A dispatcher failure or non-`ADVICE_READY` result fails this gate. Include advisor must-fix guidance in the findings.
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

  7. DISPLAY FULL REVIEWER + ADVISOR FINDINGS TO USER:
     ┌─────────────────────────────────────────┐
     │ Code Review Results: [score]/10         │
     ├─────────────────────────────────────────┤
     │ Critical Issues ([N]): MUST FIX         │
     │  - [issue] at [file:line]               │
     │ Warnings ([N]): SHOULD FIX              │
     │  - [issue] at [file:line]               │
     │ Suggestions ([N]): NICE TO HAVE         │
     │  - [suggestion]                         │
     └─────────────────────────────────────────┘

  8. Use AskUserQuestion (header: "Review"):
     IF critical_count > 0 OR advisor has must-fix items:
       - "Fix critical issues" → implement critical fixes, re-run tester
       - "Fix all issues" → implement all fixes, re-run tester
       - "Dispute advisor findings with evidence" → collect read-only evidence/resolution, GOTO LOOP
       - "Approve anyway" → proceed with noted issues
       - "Abort" → stop workflow
     ELSE:
       - "Fix warnings/suggestions" → implement selected fixes
       - "Approve" → proceed
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
       → Implement requested fixes across designated file ownership boundaries
       → Re-run tester to verify no regressions
       → In explicit advice mode, parent records matching truthful state outcome with actual changed paths and declared test results, advancing baseline
       → GOTO LOOP (re-run code-reviewer)
  10. ON APPROVE: PROCEED to Step 5
```

### 5. Project Management & Docs
- In explicit advice mode: follow the substantive finalization lifecycle in `## Caller lifecycle binding`. Planned docs, status, and onboarding paths are authorized writable paths. Parent records `state disposition` for finalization (registering the bounded action and declared validation command) BEFORE executing any finalization writes or Git index transitions.
- In default mode: preserve ordinary approved/validated completed status without durable controller dependencies or controller state operations.
- If approved: `project-manager` + `docs-manager` in parallel (update plans, docs, roadmap)
  - `project-manager`:
    - In explicit advice mode: "Update plan status in [plan-path]. Record implementation and finalization settled, with durable completion pending. Do NOT mark phase as DONE prematurely. Update roadmap."
    - In default mode: "Update plan status in [plan-path]. Mark plan phase [phase-name] as DONE with timestamp. Update roadmap."
  - `docs-manager`: Update docs for completed phases. Changed files: [list].
- If rejected: fix → repeat

### 6. Onboarding
- Guide user step by step (1 question at a time)

### 7. Final Report & Completion
- Summary, guide, next steps
- In default mode:
  - Ask to commit (use `git-manager` if yes). Standard approval and commit behavior without durable controller operations.
- In explicit advice mode:
  - Ask to commit (use `git-manager` if yes; staging and commit transitions settle before recording final outcome).
  - Enforce writer barrier: all documentation/roadmap writes, onboarding configuration, and selected Git staging/commit settle before recording final outcome.
  - Run declared validation across all finalized deliverables.
  - Parent records ONE truthful `state outcome` matching the registered finalization action, reporting actual changed paths and declared validation status. (A no-change outcome is valid ONLY if zero actual files were changed, declared validation passed, disposition was accept, and no must-fix/unresolved-question items remain).
  - Parent executes `state complete` to seal the task run. The durable completion receipt is authoritative; only then is the phase durably DONE.
  - After sealing, freeze all captured baseline paths: never mutate sealed evidence, documentation, reports, or index after completion, and never prescribe copying DONE into captured files after completion. Any post-completion administrative receipt must remain OUTSIDE the captured baseline snapshot, identify the approved snapshot, and not claim unreviewed edits.
**Examples:**
- Parallel: "Phases 1-3 parallel, then 4" → Launch 3 agents → Wait → Launch 1 agent
- Sequential: "Phase 1 → 2 → 3" → Main agent implements each phase
