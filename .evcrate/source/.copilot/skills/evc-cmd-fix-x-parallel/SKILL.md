---
name: "evc-cmd-fix-x-parallel"
description: "Analyze & fix issues with parallel fullstack-developer agents"
argument-hint: "[issues]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-fix-x-parallel`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

**Ultrathink parallel** to fix: <issues>$ARGUMENTS</issues>

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Issue Analysis
- Use `evc-debugger` subagent to analyze root causes
- Use `/evc-cmd-scout-x-ext` to find related files
- Categorize issues by scope/area (frontend, backend, auth, payments, etc.)
- Identify dependencies between issues

### 2. Parallel Fix Planning
- Trigger `/evc-cmd-plan-x-parallel <detailed-fix-instructions>` for parallel-executable fix plan
- Wait for plan with dependency graph, execution strategy, file ownership matrix
- Group independent fixes for parallel execution
- Sequential fixes for dependent issues

### 3. Parallel Fix Implementation
- Read `plan.md` for dependency graph
- Launch multiple `evc-fullstack-developer` agents in PARALLEL for independent fixes
  - Example: "Fix auth + Fix payments + Fix UI" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel fixes complete before dependent fixes
- Sequential fixes: launch one agent at a time

### 4. Testing
- Use `evc-tester` subagent for full test suite
- NO fake data/mocks/cheats
- Verify all issues resolved
- If fail: use `evc-debugger`, fix, repeat

### 5. Code Review
- Use `evc-code-reviewer` for all changes
- Verify fixes don't introduce regressions
- If critical issues: fix, retest

### 6. Project Management & Docs
- If approved: use `evc-project-manager` + `evc-docs-manager` in parallel
- Update plan files, docs, roadmap
- If rejected: fix and repeat

### 7. Final Report
- Summary of all fixes from parallel phases
- Verification status per issue
- Ask to commit (use `evc-git-manager` if yes)

**Example:** Fix 1 (auth) + Fix 2 (payments) + Fix 3 (UI) → Launch 3 fullstack-developer agents → Wait → Fix 4 (integration) sequential
