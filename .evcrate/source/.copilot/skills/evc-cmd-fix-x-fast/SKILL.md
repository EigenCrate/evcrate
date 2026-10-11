---
name: "evc-cmd-fix-x-fast"
description: "Analyze and fix small issues [FAST]"
argument-hint: "[issues]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evc-cmd-fix-x-fast`. Do not split, normalize, or discard it; arguments are ordinary task data.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions.

## Available workflow assets

- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
**Think hard** to analyze and fix these issues:
<raw-issues>$ARGUMENTS</raw-issues>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.copilot/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Preserve sealed history; completed requested scope is a no-op. Children receive
exact ownership and writable/protected paths, return terminal artifacts, and
never stage/commit behind the parent. Risky/destructive actions require approval.

## Workflow
1. If the user provides a screenshots or videos, use `evc-ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.
2. Use `evc-debugger` subagent to find the root cause of the issues and report back to main agent.
3. Activate `evc-debugging` skills and `evc-problem-solving` skills to tackle the issues.
4. Start implementing the fix based the reports and solutions.
5. Use `evc-tester` agent to test the fix and make sure it works, then report back to main agent.
6. If there are issues or failed tests, repeat from step 4. On a second consecutive matching terminal blocker without progress, use ordinary debugger/user escalation before another attempt.
7. Settle writers, use `evc-code-reviewer`, wait for its terminal report, and ask
   the user for approval. Apply authorized fixes and revalidate; cap terminal
   reviews at three, then stop and ask for direction without resetting counters.
8. Respond with actual changes, validation, blockers and next steps. Parent owns
   finalization and neutral receipt/uncaptured progress publication under
   `.copilot/evcrate/workflows/plan-progress.md`; sealed paths remain immutable.
