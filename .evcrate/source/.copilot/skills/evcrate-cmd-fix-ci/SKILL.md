---
name: "evcrate-cmd-fix-ci"
description: "⚡ Analyze Github Actions logs and fix issues"
argument-hint: "[github-actions-url]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-fix-ci`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

## Github Actions URL
<url>$ARGUMENTS</url>

## Workflow
1. Use `evcrate-debugger` subagent to read the github actions logs with `gh` command, analyze and find the root cause of the issues and report back to main agent.
2. Start implementing the fix based the reports and solutions.
3. Use `evcrate-tester` agent to test the fix and make sure it works, then report back to main agent.
4. If there are issues or failed tests, repeat from step 2.
5. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.

## Notes
- If `gh` command is not available, instruct the user to install and authorize GitHub CLI first.
