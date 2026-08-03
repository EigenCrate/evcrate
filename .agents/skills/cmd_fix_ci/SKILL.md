---
name: cmd_fix_ci
description: Analyze Github Actions logs and fix issues
---
# cmd_fix_ci

Command Path: /fix/ci

Description: Analyze Github Actions logs and fix issues

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

## Github Actions URL
<url>{{args}}</url>

## Workflow
1. Use `debugger` subagent to read the github actions logs with `gh` command, analyze and find the root cause of the issues and report back to main agent.
2. Start implementing the fix based the reports and solutions.
3. Use `tester` agent to test the fix and make sure it works, then report back to main agent.
4. If there are issues or failed tests, repeat from step 2.
5. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.

## Notes
- If `gh` command is not available, instruct the user to install and authorize GitHub CLI first.
