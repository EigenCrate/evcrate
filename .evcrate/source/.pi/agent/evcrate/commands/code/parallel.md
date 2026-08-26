---
description: ⚡ Execute parallel or sequential phases based on plan structure
argument-hint: [plan-path] [--advice]
---

Raw implementation input: <raw-plan>$ARGUMENTS</raw-plan>

## Canonical checkpoint routing

Named checkpoints use the `evcrate-advisor-checkpoint/v1` dispatcher block in
`{{evcrate:workflows/advisor-mentoring.md}}`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before interpreting the plan, read `{{evcrate:workflows/advisor-mentoring.md}}` and
derive `WORK_ARGUMENTS` plus explicit/default advice mode. Execute the plan from
`WORK_ARGUMENTS` and apply the shared default stuck-escalation contract.

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
3. Wait for parallel group completion, verify no conflicts
4. Execute sequential phases (one agent per phase after dependencies)
5. Proceed to Step 3

### 2B. Sequential Execution
Follow `./{{evcrate:workflows/primary-workflow.md}}`:
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

In explicit advice mode, every terminal reviewer result must be followed by
exactly one blocking `advisor` call at `review:<workflow-step>` before findings
are displayed, fixed, or approved. Supply the bounded evidence, relevant prior
counsel, and owner disposition required by the shared mentoring contract; advisor
failure fails this gate.

**Interactive Review-Fix Cycle (max 3 cycles):**

**Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.**

```
review_cycles = 0
LOOP:
  1. IF review_cycles >= 3:
     → Output: "⚠ 3 review cycles completed. Final decision required."
     → ask_user_question: "Approve with noted issues" / "Abort workflow"
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

  8. Use ask_user_question (header: "Review"):
     IF critical_count > 0 OR advisor has must-fix items:
       - "Fix critical issues" → implement critical fixes, re-run tester
       - "Fix all issues" → implement all fixes, re-run tester
       - "Approve anyway" → proceed with noted issues
       - "Abort" → stop workflow
     ELSE:
       - "Fix warnings/suggestions" → implement selected fixes
       - "Approve" → proceed
       - "Abort" → stop workflow

  9. IF user selects fix option:
     IF review_cycles >= 3:
       → Output: "⚠ 3 review cycles completed. Final decision required."
       → ask_user_question: "Approve with noted issues" / "Abort workflow"
       → STOP; do not run another fix/test/reviewer/advisor sequence
     ELSE:
     → Implement requested fixes
     → Re-run tester to verify no regressions
     → GOTO LOOP (re-run code-reviewer)

  10. ON APPROVE: PROCEED to Step 5
```

### 5. Project Management & Docs
- If approved: `project-manager` + `docs-manager` in parallel (update plans, docs, roadmap)
- If rejected: fix → repeat

### 6. Onboarding
- Guide user step by step (1 question at a time)

### 7. Final Report
- Summary, guide, next steps
- Ask to commit (use `git-manager` if yes)

**Examples:**
- Parallel: "Phases 1-3 parallel, then 4" → Launch 3 agents → Wait → Launch 1 agent
- Sequential: "Phase 1 → 2 → 3" → Main agent implements each phase
