---
name: "evc-cmd-content-x-good"
description: "Write good creative & smart copy [GOOD]"
argument-hint: "[user-request]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-content-x-good`. Do not split, normalize, or discard it before the canonical command parses it.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions and activation-first ordering; load full mentoring only after resolved explicit or inherited mode.

## Available workflow assets

- `@evcrate/workflows/advice-activation.md`
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Write good creative & smart copy for this user request:
<user_request>$ARGUMENTS</user_request>

## Workflow

- If the user provides screenshots, use `evc-ai-multimodal` skill to analyze and describe the context in detail.
- If the user provides videos, use `evc-ai-multimodal` (`video-analysis`) skill to analyze video content.
- Use multiple `evc-researcher` agents in parallel to search for relevant information, then report back to main agent.
- Use `/evc-cmd-scout-x-ext` (preferred) or `/evc-cmd-scout` (fallback) slash command to search the codebase for files needed to complete the task
- Use `evc-planner` agent to plan the copy, make sure it can satisfy the user request.
- Use `evc-copywriter` agent to write the copy based on the plan, then report back to main agent.
