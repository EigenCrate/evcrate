---
name: "evc-cmd-fix-x-test"
description: "Run test suite and fix issues"
argument-hint: "[issues]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-fix-x-test`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Analyze the skills catalog and activate relevant skills. Fix the reported issues:
<issues>$ARGUMENTS</issues>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.copilot/evcrate/workflows/plan-progress.md` before selecting scope or dependencies;
completed requested scope is a no-op, sealed history stays immutable. Parent
coordinates exact file ownership, writable/protected paths and finalization.
Children return terminal reports and actual changed paths and never stage/commit
behind the parent. Wait for all required terminal results before dependent work.
Risky or destructive actions require explicit user approval.

## Workflow

1. Use `evc-tester` to compile the code and identify syntax errors; fix within
   authorized scope.
2. Use `evc-tester` to run tests and return actual results.
3. Use `evc-debugger` to find root causes of failures; wait for its report.
4. Use `evc-planner` to create a plan based on the reports. Reconcile scope and
   phase status before selecting work; never rewrite sealed history.
5. Main agent implements the plan step by step.
6. Use `evc-tester` to validate the fix. If failures remain, repeat test/root-cause
   analysis or implementation within authorized paths; no fake data or suppressed
   failures.

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

After required approval and actual validation, settle authorized documentation,
status and report writes. Parent alone updates ordinary plan status or publishes
immutable ordinary approval/validation receipts and uncaptured historical
`progress.md` under `.copilot/evcrate/workflows/plan-progress.md`. Preserve sealed evidence
and selected-index identities; administrative display repair never reruns
completed implementation. Report actual changes, validation, blockers and next
steps concisely, with unresolved questions last. Link the real overview only;
ordinary plans do not require nonexistent progress links.
