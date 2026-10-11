---
name: "evc-cmd-fix-x-ci"
description: "Analyze Github Actions logs and fix issues"
---

# evc-cmd-fix-x-ci

Command Path: $evc-cmd-fix-x-ci

Description: Analyze Github Actions logs and fix issues

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
## Github Actions URL
<raw-url>{{args}}</raw-url>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
Preserve sealed history; completed requested scope is a no-op. Children receive
exact ownership and writable/protected paths, return terminal artifacts, and
never stage/commit behind the parent. Risky/destructive actions require approval.

## Workflow
1. Use `evc-debugger` subagent to read the github actions logs with `gh` command, analyze and find the root cause of the issues and report back to main agent.
2. Start implementing the fix based on the reports and solutions.
3. Use `evc-tester` agent to test the fix and make sure it works, then report back to main agent.
4. If there are issues or failed tests, repeat from step 2. On a second consecutive matching terminal blocker without progress, use ordinary debugger/user escalation before another attempt.
5. Settle writers, use `evc-code-reviewer`, wait for its terminal report, and ask
   the user for approval. Apply authorized fixes and revalidate; cap terminal
   reviews at three, then stop and ask for direction without resetting counters.
6. Respond with actual changes, validation, blockers and next steps. Parent owns
   finalization and neutral receipt/uncaptured progress publication under
   `.codex/workflows/plan-progress.md`; sealed paths remain immutable.

## Notes
- If `gh` command is not available, instruct the user to install and authorize GitHub CLI first.
