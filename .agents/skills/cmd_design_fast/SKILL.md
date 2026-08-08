---
name: "cmd-design-fast"
description: "Create a quick design"
---

# cmd_design_fast

Command Path: /design/fast

Description: Create a quick design

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

Think hard to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules: 
<tasks>{{args}}</tasks>

## Required Skills (Priority Order)
1. **`ui-ux-pro-max`** - Design intelligence database (ALWAYS ACTIVATE FIRST)
2. **`frontend-design`** - Quick implementation

**Ensure token efficiency while maintaining high quality.**

## Workflow:
1. **FIRST**: Run `ui-ux-pro-max` searches to gather design intelligence:
   ```bash
   python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "<product-type>" --domain product
   python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "<style-keywords>" --domain style
   python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "<mood>" --domain typography
   python3 $HOME/.agents/skills/ui-ux-pro-max/scripts/search.py "<industry>" --domain color
   ```
2. Use `ui-ux-designer` subagent to start the design process.
3. If user doesn't specify, create the design in pure HTML/CSS/JS.
4. Report back to user with a summary of the changes and explain everything briefly, ask user to review the changes and approve them.
5. If user approves the changes, update the `./docs/design-guidelines.md` docs if needed.

## Notes:
- Remember that you have the capability to generate images, videos, edit images, etc. with `ai-multimodal` skills. Use them to create the design and real assets.
- Always review, analyze and double check generated assets with `ai-multimodal` skills to verify quality.
- Maintain and update `./docs/design-guidelines.md` docs if needed.
