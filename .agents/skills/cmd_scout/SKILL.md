---
name: cmd_scout
description: Scout given directories to respond to the user's requests
---
# cmd_scout

Command Path: /scout

Description: Scout given directories to respond to the user's requests

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

## Purpose

Search the codebase for files needed to complete the task using a fast, token efficient agent.

## Variables

USER_PROMPT: $1
SCALE: $2 (defaults to 3)
REPORT_OUTPUT_DIR: Use `Report:` from `## Naming` section

## Workflow:

- Write a prompt for 'SCALE' number of agents to the `Task` tool that will immediately call the `Bash` tool to run these commands to kick off your agents to conduct the search: spawn many `Explore` subagents to search the codebase in parallel based on the user's prompt.
- The parent agent must wait for all requested scout agents to return terminal results before synthesizing the report. A timed-out or interrupted scout is incomplete; do not silently treat it as a successful search or continue with partial coverage.

**How to prompt the agents:**
- IMPORTANT: Kick these agents off in parallel using the `Task` tool, analyze and divide folders for each agent to scout intelligently and quickly.
- IMPORTANT: Instruct the agents to quickly search the codebase for files needed to complete the task. This isn't about a full blown search, just a quick search to find the files needed to complete the task.
- Instruct the subagent to use a timeout of 3 minutes for each agent's bash call. Skip any agents that don't return within the timeout, don't restart them.
- If any agent misses the timeout, report the missing result and stop the scout gate; only retry after an explicit, controlled retry decision.

**How to write reports:**

- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
