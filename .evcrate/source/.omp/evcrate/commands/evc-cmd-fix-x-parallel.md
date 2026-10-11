---
argument-hint: "[issues]"
description: "Analyze & fix issues with parallel evc-fullstack-developer agents"
---

**Ultrathink parallel** to analyze and fix independent issues:
<issues>$ARGUMENTS</issues>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` before selecting scope or dependencies;
completed requested scope is a no-op, sealed history stays immutable. Parent
coordinates exact file ownership, writable/protected paths and finalization.
Children return terminal reports and actual changed paths and never stage/commit
behind the parent. Wait for all required terminal results before dependent work.
Risky or destructive actions require explicit user approval.

## Workflow

### 1. Issue Analysis
- Use `evc-debugger` for root causes and `/evc-cmd-scout-x-ext` for related files.
- Categorize issues by area and identify dependencies.

### 2. Parallel Fix Planning
- Trigger `/evc-cmd-plan-x-parallel <detailed-fix-instructions>`.
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
`progress.md` under `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`. Preserve sealed evidence
and selected-index identities; administrative display repair never reruns
completed implementation. Report actual changes, validation, blockers and next
steps concisely, with unresolved questions last. Link the real overview only;
ordinary plans do not require nonexistent progress links.

**Example:** auth + payments + UI → three independent workers → all terminal
results and gates → dependent integration fix.
