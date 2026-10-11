---
name: "evc-cmd-code-x-parallel"
description: "Execute parallel or sequential phases based on plan structure"
argument-hint: "[plan-path]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-code-x-parallel`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Execute plan: <plan>$ARGUMENTS</evc-cmd-plan>

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Plan Analysis
- Read `plan.md` from given path
- **Check for:** Dependency graph, Execution strategy, Parallelization Info, File Ownership matrix
- **Decision:** IF parallel-executable → Step 2A, ELSE → Step 2B

### 2A. Parallel Execution
1. Parse execution strategy (which phases concurrent/sequential, file ownership)
2. Launch multiple `evc-fullstack-developer` agents simultaneously for parallel phases
   - Pass: phase file path, environment info, file ownership boundaries
3. Wait for parallel group completion, verify no conflicts
4. Execute sequential phases (one agent per phase after dependencies)
5. Proceed to Step 3

### 2B. Sequential Execution
Follow `./.copilot/evcrate/workflows/primary-workflow.md`:
1. Use main agent step by step
2. Read `plan.md`, implement phases one by one
3. Use `evc-project-manager` for progress updates
4. Use `evc-ui-ux-designer` for frontend
5. Run type checking after each phase
6. Proceed to Step 3

### 3. Testing
- Use `evc-tester` for full suite (NO fake data/mocks)
- If fail: `evc-debugger` → fix → repeat

### 4. Code Review (Interactive Cycle)

Call `evc-code-reviewer` subagent: "Review all changes from parallel/sequential execution. Check security, performance, architecture, YAGNI/KISS/DRY. Return score (X/10), critical issues list, warnings list, suggestions list."

**Interactive Review-Fix Cycle (max 3 cycles):**

```
cycle = 0
LOOP:
  1. Run evc-code-reviewer → get score, critical_count, warnings, suggestions

  2. DISPLAY FULL FINDINGS TO USER:
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

  3. Use user input (header: "Review"):
     IF critical_count > 0:
       - "Fix critical issues" → implement critical fixes, re-run evc-tester
       - "Fix all issues" → implement all fixes, re-run evc-tester
       - "Approve anyway" → proceed with noted issues
       - "Abort" → stop workflow
     ELSE:
       - "Fix warnings/suggestions" → implement selected fixes
       - "Approve" → proceed
       - "Abort" → stop workflow

  4. IF user selects fix option AND cycle < 3:
     → Implement requested fixes
     → Re-run evc-tester to verify no regressions
     → cycle++
     → GOTO LOOP (re-run evc-code-reviewer)

  5. IF cycle >= 3 AND still has issues:
     → Output: "⚠ 3 review cycles completed. Final decision required."
     → Use user input:
       - "Approve with noted issues"
       - "Abort workflow"

  6. ON APPROVE: PROCEED to Step 5
```

### 5. Project Management & Docs
- If approved: `evc-project-manager` + `evc-docs-manager` in parallel (update plans, docs, roadmap)
- If rejected: fix → repeat

### 6. Onboarding
- Guide user step by step (1 question at a time)

### 7. Final Report
- Summary, guide, next steps
- Ask to commit (use `evc-git-manager` if yes)

**Examples:**
- Parallel: "Phases 1-3 parallel, then 4" → Launch 3 agents → Wait → Launch 1 agent
- Sequential: "Phase 1 → 2 → 3" → Main agent implements each phase
