---
name: "evcrate-cmd-content-fast"
description: "Write creative & smart copy [FAST]"
argument-hint: "[user-request]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-content-fast`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Write creative & smart copy for this user request:
<user_request>$ARGUMENTS</user_request>

## Workflow

- If the user provides screenshots, use `evcrate-ai-multimodal` skill to analyze and describe the context.
- If the user provides videos, use `evcrate-ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use `evcrate-copywriter` agent to write the copy, then report back to main agent.
