---
name: "evcrate-cmd-fix-hard"
description: "Use subagents to plan and fix hard issues"
argument-hint: "[issues] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-fix-hard`. Do not split, normalize, or discard it before the canonical command parses it.

Before executing this command, read these EVCrate workflow assets:
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/primary-workflow.md`

Use the orchestration protocol, development rules, and relevant skills to fix:
<raw-issues>$ARGUMENTS</raw-issues>

## Advice mode

Before analysis, read `.copilot/evcrate/workflows/advisor-mentoring.md`. Parse raw
arguments exactly as that workflow specifies, derive `WORK_ARGUMENTS`, and use
it as the issue input. A final standalone `--advice` activates explicit
checkpoint mentoring; a non-final token remains ordinary issue text.

When explicit advice mode is active, wait until the required terminal reviewer
or test evidence exists. Before displaying findings or making a dependent
decision, construct the workflow's exact ten-field checkpoint object and invoke
this command once from the repository root:

```bash
~/.evcrate/bin/evcrate-advisor <<'JSON'
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "checkpoint": "review:hard-fix",
  "question": "Which safe action should follow this terminal review?",
  "kind": "review",
  "task_or_phase": "Hard-fix review",
  "evidence": {"terminal": "Bounded terminal reviewer or test result.", "files": []},
  "changed_paths": [],
  "prior_counsel": "none",
  "owner_disposition": "none"
}
JSON
```

Replace the example values with the current named checkpoint and bounded
context. Keep the object exact: no wrapper and no route or CLI fields. Use only
an `ADVICE_READY` controller envelope as advice. A failed, missing, malformed,
interrupted, cancelled, timed-out, unavailable, or nonzero invocation leaves
the gate incomplete; do not claim that advice was received or continue a
blocked dependent action.

Advice is non-binding. Record the owner's acceptance or rejection, then keep
all implementation, tests, approvals, and user communication in the main
workflow. Never ask the controller or advisor to edit, delegate, approve,
grant permissions, or change workflow order.

## Workflow:

If the user provides a screenshots or videos, use `evcrate-ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

### Fullfill the request
**Question Everything**: Use `user input` tool to ask probing questions to fully understand the user's request, constraints, and true objectives. Don't assume - clarify until you're 100% certain.

* If you have any questions, use `user input` tool to ask the user to clarify them.
* Ask 1 question at a time, wait for the user to answer before moving to the next question.
* If you don't have any questions, start the next step.

### Fix the issue

Use `evcrate-sequential-thinking` skill to break complex problems into sequential thought steps.
Use `evcrate-problem-solving` skills to tackle the issues.
Analyze the skills catalog and activate other skills that are needed for the task during the process.

1. Use `evcrate-debugger` subagent to find the root cause of the issues and report back to main agent.
2. Use `evcrate-researcher` subagent to research quickly about the root causes on the internet (if needed) and report back to main agent.
3. Use `evcrate-planner` subagent to create an implementation plan based on the reports, then report back to main agent.
4. Then use `/evcrate-cmd-code` Copilot slash command to implement the plan step by step. This fallback
   handoff uses `WORK_ARGUMENTS`; append exactly one trailing `--advice` in explicit
   mode and otherwise pass no `--advice` token.
5. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
  * Ask the user if they want to commit and push to git repository, if yes, use `evcrate-git-manager` subagent to commit and push to git repository.
  - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  - **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

**REMEMBER**:
- You can always generate images with `evcrate-ai-multimodal` skills on the fly for visual assets.
- You always read and analyze the generated assets with `evcrate-ai-multimodal` skills to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
