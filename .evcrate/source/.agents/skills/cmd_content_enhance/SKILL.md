---
name: "cmd-content-enhance"
description: "Analyze the current copy issues and enhance it"
---

# cmd_content_enhance

Command Path: /content:enhance

Description: Analyze the current copy issues and enhance it

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

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
Enhance the copy based on reported issues:
<issues>{{args}}</issues>

## Workflow

- If the user provides screenshots, use `ai-multimodal` skill to analyze and describe the issues in detail, ensuring the copywriter understands the context.
- If the user provides videos, use `ai-multimodal` (`video-analysis`) skill to analyze video content and extract relevant copy issues.
- Use `/scout:ext` (preferred) or `/scout` (fallback) slash command to search the codebase for files needed to complete the task
- Use `copywriter` agent to write the enhanced copy into the code files, then report back to main agent.
