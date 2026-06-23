---
name: cmd_content_fast
description: Write creative & smart copy [FAST]
---
# cmd_content_fast

Command Path: /content/fast

Description: Write creative & smart copy [FAST]

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

Write creative & smart copy for this user request:
<user_request>{{args}}</user_request>

## Workflow

- If the user provides screenshots, use `ai-multimodal` skill to analyze and describe the context.
- If the user provides videos, use `ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use `copywriter` agent to write the copy, then report back to main agent.
