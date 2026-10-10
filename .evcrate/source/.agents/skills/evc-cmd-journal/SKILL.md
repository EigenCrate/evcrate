---
name: "evc-cmd-journal"
description: "Write some journal entries."
---

# evc-cmd-journal

Command Path: $evc-cmd-journal

Description: Write some journal entries.

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
Use the `evc-journal-writer` subagent to explore the memories and recent code changes, and write some journal entries.
Journal entries should be concise and focused on the most important events, key changes, impacts, and decisions.
Keep journal entries in the `./docs/journals/` directory.
