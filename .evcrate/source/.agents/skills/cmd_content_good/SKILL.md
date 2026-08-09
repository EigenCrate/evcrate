---
name: "cmd-content-good"
description: "Write good creative & smart copy [GOOD]"
---

# cmd_content_good

Command Path: /content:good

Description: Write good creative & smart copy [GOOD]

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

Write good creative & smart copy for this user request:
<user_request>{{args}}</user_request>

## Workflow

- If the user provides screenshots, use `ai-multimodal` skill to analyze and describe the context in detail.
- If the user provides videos, use `ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use multiple `researcher` agents in parallel to search for relevant information, then report back to main agent.
- Use `/scout:ext` (preferred) or `/scout` (fallback) slash command to search the codebase for files needed to complete the task
- Use `planner` agent to plan the copy, make sure it can satisfy the user request.
- Use `copywriter` agent to write the copy based on the plan, then report back to main agent.
