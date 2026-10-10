---
name: evc-cmd-content-x-fast
description: Write creative & smart copy [FAST]
---
# evc-cmd-content-x-fast

Command Path: /evc-cmd-content-x-fast

Description: Write creative & smart copy [FAST]

---
description: "Write creative & smart copy [FAST]"
argument-hint: "[user-request]"
---
Write creative & smart copy for this user request:
<user_request>$ARGUMENTS</user_request>

## Workflow

- If the user provides screenshots, use `ai-multimodal` skill to analyze and describe the context.
- If the user provides videos, use `ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use `evc-copywriter` agent to write the copy, then report back to main agent.