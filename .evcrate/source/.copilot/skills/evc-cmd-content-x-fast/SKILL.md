---
name: "evc-cmd-content-x-fast"
description: "Write creative & smart copy [FAST]"
argument-hint: "[user-request]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-content-x-fast`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Write creative & smart copy for this user request:
<user_request>$ARGUMENTS</user_request>

## Workflow

- If the user provides screenshots, use `evc-ai-multimodal` skill to analyze and describe the context.
- If the user provides videos, use `evc-ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use `evc-copywriter` agent to write the copy, then report back to main agent.
