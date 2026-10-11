---
name: "evc-cmd-content-x-enhance"
description: "Analyze the current copy issues and enhance it"
argument-hint: "[issues]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-content-x-enhance`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Enhance the copy based on reported issues:
<issues>$ARGUMENTS</issues>

## Workflow

- If the user provides screenshots, use `evc-ai-multimodal` skill to analyze and describe the issues in detail, ensuring the copywriter understands the context.
- If the user provides videos, use `evc-ai-multimodal` (`video-analysis`) skill to analyze video content and extract relevant copy issues.
- Use `/evc-cmd-scout-x-ext` (preferred) or `/evc-cmd-scout` (fallback) slash command to search the codebase for files needed to complete the task
- Use `evc-copywriter` agent to write the enhanced copy into the code files, then report back to main agent.
