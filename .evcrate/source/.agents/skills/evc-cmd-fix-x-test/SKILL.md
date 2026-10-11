---
name: "evc-cmd-fix-x-test"
description: "Run test suite and fix issues"
---

# evc-cmd-fix-x-test

Command Path: $evc-cmd-fix-x-test

Description: Run test suite and fix issues

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

## Reported Issues:
<issues>{{args}}</issues>

## Workflow:
1. Use `evc-tester` subagent to compile the code and fix all syntax errors if any.
2. Use `evc-tester` subagent to run the tests and report back to main agent.
3. If there are issues or failed tests, use `evc-debugger` subagent to find the root cause of the issues, then report back to main agent.
4. Use `evc-planner` subagent to create an implementation plan based on the reports, then report back to main agent.
5. Use main agent to implement the plan step by step.
6. Use `evc-tester` agent to test the fix and make sure it works, then report back to main agent.
6. Use `evc-code-reviewer` subagent to quickly review the code changes and make sure it meets requirements, then report back to main agent.
7. If there are issues or failed tests, repeat from step 2.
8. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
