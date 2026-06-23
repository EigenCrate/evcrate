---
name: cmd_cook_auto
description: ⚡⚡ Implement a feature automatically ("trust me bro")
---
# cmd_cook_auto

Command Path: /cook/auto

Description: ⚡⚡ Implement a feature automatically ("trust me bro")

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules: 
<tasks>{{args}}</tasks>

**IMPORTANT:** Analyze the list of skills  at `.agents/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow:
1. Use the matching `cmd_*` skill to run `/plan <detailed-instruction-prompt>` to create an implementation plan based on the given tasks.
2. Use the matching `cmd_*` skill to run `/code <plan>` to implement the plan.
3. Finally use `request_user_input` tool to ask user if he wants to commit to git repository, if yes use the matching `cmd_*` skill to run `/git/cm` to create a commit.
