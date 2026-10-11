---
name: "evc-cmd-fix-x-logs"
description: "Analyze logs and fix issues"
---

# evc-cmd-fix-x-logs

Command Path: $evc-cmd-fix-x-logs

Description: Analyze logs and fix issues

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
Analyze the skills catalog and activate relevant skills. Analyze logs and fix:
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

1. Check whether `./logs.txt` exists. If missing, obtain user approval before
   configuring permanent log piping in `package.json`, `Makefile`,
   `pyproject.toml`, or the applicable script configuration:
   - Bash/Unix: append `2>&1 | tee logs.txt`.
   - PowerShell: append `*>&1 | Tee-Object logs.txt`.
   Run the command to generate logs. Never expose credentials or private dumps
   in reports; inspect only bounded relevant log content.
2. Use `evc-debugger` to inspect the last 30 relevant log lines first, expanding
   bounded context only if needed, and report root causes.
3. Use `evc-scout` to locate the exact related code and return findings.
4. Use `evc-planner` to create an implementation plan from these reports and
   reconcile scope/phase status before implementation.
5. Main agent implements the fix based on the reports and solutions.
6. Use `evc-tester` to validate the fix. If failures remain, repeat scoped scout
   analysis or implementation and revalidate; never ignore failures.

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
`progress.md` under `.codex/workflows/plan-progress.md`. Preserve sealed evidence
and selected-index identities; administrative display repair never reruns
completed implementation. Report actual changes, validation, blockers and next
steps concisely, with unresolved questions last. Link the real overview only;
ordinary plans do not require nonexistent progress links.
