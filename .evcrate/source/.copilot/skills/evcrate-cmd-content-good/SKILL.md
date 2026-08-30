---
name: "evcrate-cmd-content-good"
description: "Write good creative & smart copy [GOOD]"
argument-hint: "[user-request]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-content-good`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Write good creative & smart copy for this user request:
<user_request>$ARGUMENTS</user_request>

## Workflow

- If the user provides screenshots, use `evcrate-ai-multimodal` skill to analyze and describe the context in detail.
- If the user provides videos, use `evcrate-ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use multiple `evcrate-researcher` agents in parallel to search for relevant information, then report back to main agent.
- Use `/evcrate-cmd-scout-ext` (preferred) or `/evcrate-cmd-scout` (fallback) slash command to search the codebase for files needed to complete the task
- Use `evcrate-planner` agent to plan the copy, make sure it can satisfy the user request.
- Use `evcrate-copywriter` agent to write the copy based on the plan, then report back to main agent.
