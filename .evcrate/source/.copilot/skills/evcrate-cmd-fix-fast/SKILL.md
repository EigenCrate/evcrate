---
name: "evcrate-cmd-fix-fast"
description: "Analyze and fix small issues [FAST]"
argument-hint: "[issues]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-fix-fast`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
**Think hard** to analyze and fix these issues:
<issues>$ARGUMENTS</issues>

## Workflow
1. If the user provides a screenshots or videos, use `evcrate-ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.
2. Use `evcrate-debugger` subagent to find the root cause of the issues and report back to main agent.
3. Activate `evcrate-debugging` skills and `evcrate-problem-solving` skills to tackle the issues.
4. Start implementing the fix based the reports and solutions.
5. Use `evcrate-tester` agent to test the fix and make sure it works, then report back to main agent.
6. If there are issues or failed tests, repeat from step 2.
7. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
