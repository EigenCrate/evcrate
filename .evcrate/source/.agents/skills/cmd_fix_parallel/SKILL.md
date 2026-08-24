---
name: "cmd-fix-parallel"
description: "Analyze & fix issues with parallel fullstack-developer agents"
---

# cmd_fix_parallel

Command Path: /fix:parallel

Description: Analyze & fix issues with parallel fullstack-developer agents

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat it as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit (including 180 seconds) for a blocking gate. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial work or silently skip/restart the agent.
- Sequential prompt format: **run one agent; wait for its terminal result; verify the report/artifacts; then run the next agent**.
- Every delegated prompt must define scope, file ownership, expected report/artifact, and validation signal.
- A spawn acknowledgement, progress event, or file change does not mean the agent completed. Completion requires the terminal response and requested validation.
- If the parent runtime ends before completion, preserve the agent identity and report the gate as incomplete; never fabricate a result or launch a replacement.

**Ultrathink parallel** raw input: <raw-issues>{{args}}</raw-issues>

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before analysis, read `.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install) and derive
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
- Use the matching `cmd_*` skill to run `/plan:parallel <detailed-fix-instructions>` for parallel-executable fix plan
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
  fix or approval, synchronously call exactly one `advisor` at
  `review:<workflow-step>` with the bounded evidence, relevant prior counsel,
  and owner disposition required by the shared mentoring contract. Advisor
  failure fails the review gate.
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
