---
name: "cmd-scout-ext"
description: "Use external agentic tools to scout given directories"
---

# cmd_scout_ext

Command Path: /scout:ext

Description: Use external agentic tools to scout given directories

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

Utilize external agentic tools to scout given directories or explore the codebase for files needed to complete the task using a fast, token efficient agent.

## Variables

USER_PROMPT: $1
SCALE: $2 (defaults to 3)
RELEVANT_FILE_OUTPUT_DIR: Use `Report:` from `## Naming` section

## Workflow:
- Write a prompt for 'SCALE' number of agents to the `Task` tool that will immediately call the `Bash` tool to run these commands to kick off your agents to conduct the search:
  - `gemini -p "[prompt]" --model gemini-2.5-flash-preview-09-2025` (if count <= 3)
  - `opencode run "[prompt]" --model opencode/grok-code` (if count > 3 and count < 6)
  - if count >= 6, spawn `Explore` subagents to search the codebase in parallel

The parent agent must wait for all requested scout agents or external searches to return terminal results before synthesizing the report. Missing, interrupted, timed-out, or partial results do not satisfy the scout gate.

**Why use external agentic tools?**
- External agentic tools are faster and more efficient when using LLMs with large context windows (1M+ tokens).

**How to prompt the agents:**
- If `agy` or `opencode` is not available, ask the user if they want to install it:
  - If **yes**, install it (if there are permission issues, instruct the user to install it manually, including authentication steps)
  - If **no**, use the default `Explore` subagents.
- IMPORTANT: Kick these agents off in parallel using the `Task` tool, analyze and divide folders for each agent to scout intelligently and quickly.
- IMPORTANT: These agents are calling OTHER agentic coding tools to search the codebase. DO NOT call any search tools yourself.
- IMPORTANT: That means with the `Task` tool, you'll immediately call the Bash tool to run the respective agentic coding tool (gemini, opencode, Codex, etc.)
- IMPORTANT: Instruct the agents to quickly search the codebase for files needed to complete the task. This isn't about a full blown search, just a quick search to find the files needed to complete the task.
- Instruct the subagent to use a timeout of 3 minutes for each agent's bash call. Skip any agents that don't return within the timeout, don't restart them.
- Report every skipped or missing result and stop before downstream work; retry only as an explicit controlled retry.
- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
