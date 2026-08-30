---
name: "evcrate-cmd-content-enhance"
description: "Analyze the current copy issues and enhance it"
argument-hint: "[issues]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-content-enhance`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Enhance the copy based on reported issues:
<issues>$ARGUMENTS</issues>

## Workflow

- If the user provides screenshots, use `evcrate-ai-multimodal` skill to analyze and describe the issues in detail, ensuring the copywriter understands the context.
- If the user provides videos, use `evcrate-ai-multimodal` (`video-analysis`) skill to analyze video content and extract relevant copy issues.
- Use `/evcrate-cmd-scout-ext` (preferred) or `/evcrate-cmd-scout` (fallback) slash command to search the codebase for files needed to complete the task
- Use `evcrate-copywriter` agent to write the enhanced copy into the code files, then report back to main agent.
