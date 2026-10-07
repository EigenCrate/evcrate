---
description: "Write good creative & smart copy [GOOD]"
argument-hint: "[user-request]"
---
Write good creative & smart copy for this user request:
<user_request>$ARGUMENTS</user_request>

## Workflow

- If the user provides screenshots, use `ai-multimodal` skill to analyze and describe the context in detail.
- If the user provides videos, use `ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use multiple `evc-researcher` agents in parallel to search for relevant information, then report back to main agent.
- Use `/evc-cmd-scout-x-ext` (preferred) or `/evc-cmd-scout` (fallback) slash command to search the codebase for files needed to complete the task
- Use `evc-planner` agent to plan the copy, make sure it can satisfy the user request.
- Use `evc-copywriter` agent to write the copy based on the plan, then report back to main agent.