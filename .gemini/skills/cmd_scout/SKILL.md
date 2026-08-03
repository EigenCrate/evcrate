---
name: cmd_scout
description: Scout given directories to respond to the user's requests
---
# cmd_scout

Command Path: /scout

Description: Scout given directories to respond to the user's requests

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
