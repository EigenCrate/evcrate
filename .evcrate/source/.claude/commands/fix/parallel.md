---
description: "Analyze & fix issues with parallel fullstack-developer agents"
argument-hint: "[issues] [--advice]"
---
**Ultrathink parallel** raw input: <raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before analysis, read `.claude/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the
issues input and apply the shared default stuck-escalation contract.

**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.

## Workflow

### 1. Issue Analysis
- Use `debugger` subagent to analyze root causes
- Use `/scout:ext` to find related files
- Categorize issues by scope/area (frontend, backend, auth, payments, etc.)
- Identify dependencies between issues

### 2. Parallel Fix Planning
- Trigger `/plan:parallel <detailed-fix-instructions>` for parallel-executable fix plan
- Wait for plan with dependency graph, execution strategy, file ownership matrix
- Group independent fixes for parallel execution
- Sequential fixes for dependent issues

### 3. Parallel Fix Implementation
- Read `plan.md` for dependency graph
- Launch multiple `fullstack-developer` agents in PARALLEL for independent fixes
  - Example: "Fix auth + Fix payments + Fix UI" → launch 3 agents simultaneously
  - Pass phase file path: `{plan-dir}/phase-XX-*.md`
  - Include environment info
- Wait for all parallel fixes complete before dependent fixes
- Sequential fixes: launch one agent at a time

### 4. Testing
- Use `tester` subagent for full test suite
- NO fake data/mocks/cheats
- Verify all issues resolved
- If fail: use `debugger`, fix, repeat

### 5. Code Review
- Use `code-reviewer` for all changes
- In explicit advice mode, after every terminal reviewer result and before any
  fix or approval, enter the canonical checkpoint dispatcher exactly once at
  `review:<workflow-step>` with the bounded evidence, relevant prior counsel,
  and owner disposition required by the shared mentoring contract. Dispatcher
  failure leaves the review gate incomplete.
- Review/advisor cycle cap: at most three terminal reviewer/advisor cycles. At
  the cap, stop without another reviewer/advisor call or cycle reset and ask the
  user if issues remain.
- Verify fixes don't introduce regressions
- If critical issues: fix, retest

### 6. Project Management & Docs
- If approved: use `project-manager` + `docs-manager` in parallel
- Update plan files, docs, roadmap
- If rejected: fix and repeat

### 7. Final Report
- Summary of all fixes from parallel phases
- Verification status per issue
- Ask to commit (use `git-manager` if yes)

**Example:** Fix 1 (auth) + Fix 2 (payments) + Fix 3 (UI) → Launch 3 fullstack-developer agents → Wait → Fix 4 (integration) sequential
