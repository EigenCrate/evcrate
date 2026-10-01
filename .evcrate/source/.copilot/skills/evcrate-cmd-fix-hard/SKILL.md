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

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.copilot/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/evcrate-cmd-code`.
Before analysis, read `.copilot/evcrate/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode from the raw arguments. Use
`WORK_ARGUMENTS` as the issue input and apply the shared default stuck-escalation
contract throughout discovery and planning.

`/evcrate-cmd-fix-hard` coordinates analysis, research, and planning, and delegates canonical
implementation, review, and durable task-state lifecycle ownership to `/evcrate-cmd-code`
under `## Caller lifecycle binding` in `.copilot/evcrate/workflows/advisor-mentoring.md`.
To avoid duplicate counsel and state conflict, `/evcrate-cmd-fix-hard` must not initialize a
separate task run, invoke a duplicate review checkpoint, or double advice
checkpoint/init before `/evcrate-cmd-code`.

When the caller provides an active advice run context (`task_run_id`, active
phase, project root, state revision, prior counsel/disposition/outcome),
`/evcrate-cmd-fix-hard` preserves that active caller context across the handoff to `/evcrate-cmd-code`.
Never initialize a new UUID or drop the active run state.
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
4. Then use `/evcrate-cmd-code <plan-path>` Copilot slash command to implement the plan step by step.
   This fallback handoff uses `WORK_ARGUMENTS`; append exactly one trailing
   `--advice` in explicit mode and otherwise pass no `--advice` token. Forward
   any active caller context (`task_run_id`, phase, state revision, prior
   counsel/disposition/outcome) so `/evcrate-cmd-code` continues as the single durable-state
   owner without doubling advice initialization or consultations.
5. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
  * Durable completion and any selected Git index transitions for captured paths are owned by `/evcrate-cmd-code` (which executes index transitions, matching validation, truthful outcome, and `state complete` under `## Caller lifecycle binding`); do not mutate captured baseline state, stage/commit captured paths, or fabricate completion after `/evcrate-cmd-code` seals the run.
  * Any optional post-completion administrative receipt must be strictly OUTSIDE the captured baseline snapshot, identify the approved snapshot, and cannot claim unreviewed edits.
  - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  - **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `evcrate-ai-multimodal` skills on the fly for visual assets.
- You always read and analyze the generated assets with `evcrate-ai-multimodal` skills to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
