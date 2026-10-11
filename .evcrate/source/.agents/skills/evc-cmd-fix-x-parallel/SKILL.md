---
name: "evc-cmd-fix-x-parallel"
description: "Analyze & fix issues with parallel evc-fullstack-developer agents"
---

# evc-cmd-fix-x-parallel

Command Path: $evc-cmd-fix-x-parallel

Description: Analyze & fix issues with parallel evc-fullstack-developer agents

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
**Ultrathink parallel** to analyze and fix independent issues:
<issues>{{args}}</issues>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) before selecting scope or dependencies;
completed requested scope is a no-op, sealed history stays immutable. Parent
coordinates exact file ownership, writable/protected paths and finalization.
Children return terminal reports and actual changed paths and never stage/commit
behind the parent. Wait for all required terminal results before dependent work.
Risky or destructive actions require explicit user approval.

## Workflow

### 1. Issue Analysis
- Use `evc-debugger` for root causes and `$evc-cmd-scout-x-ext` for related files.
- Categorize issues by area and identify dependencies.

### 2. Parallel Fix Planning
- Trigger `$evc-cmd-plan-x-parallel <detailed-fix-instructions>`.
- Reconcile scope and phase status before planning and before each batch.
- Require dependency graph, execution strategy, file ownership matrix and exact
  success criteria. No overlapping writable files across concurrent workers.
- Group independent fixes for parallel execution; dependent fixes are sequential.

### 3. Parallel Fix Implementation
- Read `plan.md` for the dependency graph.
- Launch `evc-fullstack-developer` agents in parallel for independent fixes, each
  with phase file, environment, exact ownership and writable/protected paths.
- Wait for all terminal results and verify artifacts before dependent fixes;
  sequential fixes use one agent at a time.
- Each ready batch must complete testing, review, approval and finalization for
  its own executed scope before dispatching a dependent batch. Reconcile
  prerequisites again; never claim all phases complete from a narrower batch.

### 4. Testing
- Use `evc-tester` for the full suite; no fake data, mocks or cheats to pass.
- Verify every issue is resolved. On failure use `evc-debugger`, fix, revalidate.

## Code Review and Approval

- Settle all implementation and test writers before review; use
  `evc-code-reviewer` and wait for its terminal report. Missing or partial results
  leave the gate incomplete.
- Apply bounded fixes, revalidate with `evc-tester`, and repeat review at most
  three terminal cycles. Stop at the cap and ask the user for direction; do not
  reset counters. On a second consecutive matching terminal blocker without
  progress, use ordinary debugger/user escalation before another attempt.
- Present findings and actual validation to the user and obtain approval before
  finalization. Never ignore failed tests or fabricate success.

## Finalization

Use `evc-project-manager` and `evc-docs-manager` in parallel only for
authorized disjoint plan/docs/roadmap updates; parent retains status and receipt
ownership for protected plans. Wait for both terminal artifacts.

After required approval and actual validation, settle authorized documentation,
status and report writes. Parent alone updates ordinary plan status or publishes
immutable ordinary approval/validation receipts and uncaptured historical
`progress.md` under `.codex/workflows/plan-progress.md`. Preserve sealed evidence
and selected-index identities; administrative display repair never reruns
completed implementation. Report actual changes, validation, blockers and next
steps concisely, with unresolved questions last. Link the real overview only;
ordinary plans do not require nonexistent progress links.

**Example:** auth + payments + UI → three independent workers → all terminal
results and gates → dependent integration fix.
