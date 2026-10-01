---
name: "cmd-fix-hard"
description: "Use subagents to plan and fix hard issues"
---

# cmd_fix_hard

Command Path: /fix:hard

Description: Use subagents to plan and fix hard issues

Codex note: when this recipe says to run another `/...` command, invoke the matching `cmd_*` skill for that path.

For high-impact architecture, security, debugging, or review decisions, consider explicit `$advisor-strategy` use for current-session guidance; this pointer does not activate it.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
Use the orchestration protocol, development rules, and relevant skills to fix:
<raw-issues>{{args}}</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install); this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring in `/code`.
Before analysis, read `.codex/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode from the raw arguments. Use
`WORK_ARGUMENTS` as the issue input and apply the shared default stuck-escalation
contract throughout discovery and planning.

`/fix:hard` coordinates analysis, research, and planning, and delegates canonical
implementation, review, and durable task-state lifecycle ownership to `/code`
under `## Caller lifecycle binding` in `.codex/workflows/advisor-mentoring.md`.
To avoid duplicate counsel and state conflict, `/fix:hard` must not initialize a
separate task run, invoke a duplicate review checkpoint, or double advice
checkpoint/init before `/code`.

When the caller provides an active advice run context (`task_run_id`, active
phase, project root, state revision, prior counsel/disposition/outcome),
`/fix:hard` preserves that active caller context across the handoff to `/code`.
Never initialize a new UUID or drop the active run state.
## Workflow:

If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

### Fullfill the request
**Question Everything**: Use `request_user_input` tool to ask probing questions to fully understand the user's request, constraints, and true objectives. Don't assume - clarify until you're 100% certain.

* If you have any questions, use `request_user_input` tool to ask the user to clarify them.
* Ask 1 question at a time, wait for the user to answer before moving to the next question.
* If you don't have any questions, start the next step.

### Fix the issue

Use `sequential-thinking` skill to break complex problems into sequential thought steps.
Use `problem-solving` skills to tackle the issues.
Analyze the skills catalog and activate other skills that are needed for the task during the process.

1. Use `debugger` subagent to find the root cause of the issues and report back to main agent.
2. Use `researcher` subagent to research quickly about the root causes on the internet (if needed) and report back to main agent.
3. Use `planner` subagent to create an implementation plan based on the reports, then report back to main agent.
4. Then Use the matching `cmd_*` skill to run `/code <plan-path>` to implement the plan step by step.
   This fallback handoff uses `WORK_ARGUMENTS`; append exactly one trailing
   `--advice` in explicit mode and otherwise pass no `--advice` token. Forward
   any active caller context (`task_run_id`, phase, state revision, prior
   counsel/disposition/outcome) so `/code` continues as the single durable-state
   owner without doubling advice initialization or consultations.
5. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
  * Durable completion and any selected Git index transitions for captured paths are owned by `/code` (which executes index transitions, matching validation, truthful outcome, and `state complete` under `## Caller lifecycle binding`); do not mutate captured baseline state, stage/commit captured paths, or fabricate completion after `/code` seals the run.
  * Any optional post-completion administrative receipt must be strictly OUTSIDE the captured baseline snapshot, identify the approved snapshot, and cannot claim unreviewed edits.
  - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  - **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `ai-multimodal` skills on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skills to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
