---
name: "evc-cmd-fix-x-test"
description: "Run test suite and fix issues"
argument-hint: "[issues]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-fix-x-test`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Reported Issues:
<issues>$ARGUMENTS</issues>

## Workflow:
1. Use `evc-tester` subagent to compile the code and fix all syntax errors if any.
2. Use `evc-tester` subagent to run the tests and report back to main agent.
3. If there are issues or failed tests, use `evc-debugger` subagent to find the root cause of the issues, then report back to main agent.
4. Use `evc-planner` subagent to create an implementation plan based on the reports, then report back to main agent.
5. Use main agent to implement the plan step by step.
6. Use `evc-tester` agent to test the fix and make sure it works, then report back to main agent.
6. Use `evc-code-reviewer` subagent to quickly review the code changes and make sure it meets requirements, then report back to main agent.
7. If there are issues or failed tests, repeat from step 2.
8. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
