---
name: "evc-cmd-fix-x-fast"
description: "Analyze and fix small issues [FAST]"
---

# evc-cmd-fix-x-fast

Command Path: $evc-cmd-fix-x-fast

Description: Analyze and fix small issues [FAST]

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
Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
**Think hard** to analyze and fix these issues:
<raw-issues>{{args}}</raw-issues>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
Preserve sealed history; completed requested scope is a no-op. Children receive
exact ownership and writable/protected paths, return terminal artifacts, and
never stage/commit behind the parent. Risky/destructive actions require approval.

## Workflow
1. If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.
2. Use `evc-debugger` subagent to find the root cause of the issues and report back to main agent.
3. Activate `debugging` skills and `problem-solving` skills to tackle the issues.
4. Start implementing the fix based the reports and solutions.
5. Use `evc-tester` agent to test the fix and make sure it works, then report back to main agent.
6. If there are issues or failed tests, repeat from step 4. On a second consecutive matching terminal blocker without progress, use ordinary debugger/user escalation before another attempt.
7. Settle writers, use `evc-code-reviewer`, wait for its terminal report, and ask
   the user for approval. Apply authorized fixes and revalidate; cap terminal
   reviews at three, then stop and ask for direction without resetting counters.
8. Respond with actual changes, validation, blockers and next steps. Parent owns
   finalization and neutral receipt/uncaptured progress publication under
   `.codex/workflows/plan-progress.md`; sealed paths remain immutable.
