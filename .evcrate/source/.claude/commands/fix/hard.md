---
description: "Use subagents to plan and fix hard issues"
argument-hint: "[issues] [--advice]"
---
Use the orchestration protocol, development rules, and relevant skills to fix:
<raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/code`.
Before analysis, read `.claude/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode from the raw arguments. Use
`WORK_ARGUMENTS` as the issue input and apply the shared default stuck-escalation
contract throughout discovery and planning.

**Effective advice lifecycle**: The advice lifecycle is active if explicit `--advice` was provided, OR an applicable active advisor run context is present, OR a named checkpoint is invoked. When active, all operational branches follow the advice lifecycle (durable task-state machine, registered work, review gate, phase reconciliation per `## Caller lifecycle binding` in `.claude/workflows/advisor-mentoring.md`); default branches apply ONLY when no advice lifecycle is active. The argument routing token (`--advice`) passed to sub-commands or handoffs remains explicit-only (forwarded only when explicit `--advice` was provided).

`/fix:hard` is a delegate router: it coordinates analysis, research, and planning, and delegates canonical
implementation, review, and durable task-state lifecycle ownership to `/code`
under `## Caller lifecycle binding` and `Plan progress and phase reconciliation` in `.claude/workflows/advisor-mentoring.md`.
separate task run, invoke a duplicate review checkpoint, double advice
checkpoint/init, or duplicate publication of progress receipts before or alongside `/code`.
Preserved historical snapshot protection applies across runs even without `--advice`; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
When the caller provides an active advice run context (`task_run_id`, active
phase, project root, state revision, prior counsel/disposition/outcome),
`/fix:hard` preserves that active caller context across the handoff to `/code`.
Never initialize a new UUID or drop the active run state.
## Workflow:

If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

### Fullfill the request
**Question Everything**: Use `AskUserQuestion` tool to ask probing questions to fully understand the user's request, constraints, and true objectives. Don't assume - clarify until you're 100% certain.

* If you have any questions, use `AskUserQuestion` tool to ask the user to clarify them.
* Ask 1 question at a time, wait for the user to answer before moving to the next question.
* If you don't have any questions, start the next step.

### Fix the issue

Use `sequential-thinking` skill to break complex problems into sequential thought steps.
Use `problem-solving` skills to tackle the issues.
Analyze the skills catalog and activate other skills that are needed for the task during the process.

1. Use `debugger` subagent to find the root cause of the issues and report back to main agent.
2. Use `researcher` subagent to research quickly about the root causes on the internet (if needed) and report back to main agent.
3. Use `planner` subagent to create an implementation plan based on the reports, then report back to main agent.
4. Then use `/code <plan-path>` SlashCommand to implement the plan step by step.
   This fallback handoff uses `WORK_ARGUMENTS`; append exactly one trailing
   `--advice` in explicit mode and otherwise pass no `--advice` token. Forward
   any active caller context (`task_run_id`, phase, state revision, prior
   counsel/disposition/outcome) so `/code` continues as the single durable-state
   owner without doubling advice initialization or consultations.
5. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps. For advice-controlled plans or preserved snapshots, point output to `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Normal default plans with no history do not require, read, or output nonexistent progress links.
  * Durable completion, mandatory outside-snapshot immutable receipts, and live `progress.md` updates are owned by `/code` (which executes index transitions, matching validation, truthful outcome, and `state complete` under `## Caller lifecycle binding` and `Plan progress and phase reconciliation` in `.claude/workflows/advisor-mentoring.md`); do not mutate captured baseline state, stage/commit captured paths, or fabricate completion after `/code` seals the run. Delegate routers do not duplicate publication or durable operations.
  * Any post-completion administrative receipt must be strictly OUTSIDE the captured baseline snapshot, identify the approved snapshot, and cannot claim unreviewed edits. Only bounded administrative receipt and progress publication outside baseline is permitted per `Plan progress and phase reconciliation` in `.claude/workflows/advisor-mentoring.md`.
  - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  - **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `ai-multimodal` skills on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skills to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
