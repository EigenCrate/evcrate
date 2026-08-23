---
description: ⚡ Execute parallel or sequential phases based on plan structure
argument-hint: [plan-path] [@advisor]
---

Raw implementation input: <raw-plan>$ARGUMENTS</raw-plan>

## Advisor Mode

A final standalone `@advisor` activates explicit review mentoring.
Before interpreting the plan, read `.claude/workflows/advisor-mentoring.md` and
derive `WORK_ARGUMENTS` plus explicit/default advisor mode. Execute the plan from
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

In explicit advisor mode, every terminal reviewer result must be followed by
exactly one blocking `advisor` call before findings are displayed, fixed, or
approved. Supply the bounded evidence required by the shared mentoring contract;
advisor failure fails this gate.

**Interactive Review-Fix Cycle (max 3 cycles):**

**Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.**

```
review_cycles = 0
LOOP:
  1. IF review_cycles >= 3:
     → Output: "⚠ 3 review cycles completed. Final decision required."
     → AskUserQuestion: "Approve with noted issues" / "Abort workflow"
     → STOP; do not start another review or advisor call
  2. review_cycles++
  3. Run code-reviewer → get score, critical_count, warnings, suggestions

  4. IF explicit advisor mode: run advisor → get terminal mentorship report

  5. DISPLAY FULL REVIEWER + ADVISOR FINDINGS TO USER:
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

  6. Use AskUserQuestion (header: "Review"):
     IF critical_count > 0 OR advisor has must-fix items:
       - "Fix critical issues" → implement critical fixes, re-run tester
       - "Fix all issues" → implement all fixes, re-run tester
       - "Approve anyway" → proceed with noted issues
       - "Abort" → stop workflow
     ELSE:
       - "Fix warnings/suggestions" → implement selected fixes
       - "Approve" → proceed
       - "Abort" → stop workflow

  7. IF user selects fix option:
     IF review_cycles >= 3:
       → Output: "⚠ 3 review cycles completed. Final decision required."
       → AskUserQuestion: "Approve with noted issues" / "Abort workflow"
       → STOP; do not run another fix/test/reviewer/advisor sequence
     ELSE:
     → Implement requested fixes
     → Re-run tester to verify no regressions
     → GOTO LOOP (re-run code-reviewer)

  8. ON APPROVE: PROCEED to Step 5
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
