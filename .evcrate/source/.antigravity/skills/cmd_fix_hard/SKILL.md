---
name: cmd_fix_hard
description: Use subagents to plan and fix hard issues
---
# cmd_fix_hard

Command Path: /fix/hard

Description: Use subagents to plan and fix hard issues

---
description: "Use subagents to plan and fix hard issues"
argument-hint: "[issues] [--advice]"
---
Use the orchestration protocol, development rules, and relevant skills to fix:
<raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.antigravity/workflows/advice-activation.md` if present; otherwise read `~/.gemini/config/workflows/advice-activation.md` (the published install) with original `$ARGUMENTS`, canonical `context.command: "fix/hard"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "fix/hard"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
8. `/fix:hard` is a delegate router: it coordinates analysis, research, and planning, and delegates canonical implementation, review, and durable task-state lifecycle ownership to `/code`. It must not initialize a separate task run, invoke a duplicate review checkpoint, double advice initialization, or duplicate publication of progress receipts before or alongside `/code`. Child agents report terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage behind the parent.
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
4. Then use `/code <plan-path>` SlashCommand to implement the plan step by step:
   - In `off` mode, invoke `/code <plan-path>` with no advice handoff and no appended token.
   - In `explicit` or `inherited` mode, pass structured exact-call handoff context, built for this delegation, to `/code`:
     * Pre-run handoff: use the activation contract's exact `{ kind, context, run }` object with selected child `command: "code"`, current project root and plan target, genuinely known selections, and `run: null`.
     * Same-run handoff: if this exact call supplies an active advice run context (`task_run_id`, project_id, revisions, prior counsel/disposition/outcome), forward that exact matching binding and context so `/code` continues as the single durable-state owner without doubling advice initialization or consultations.
     * NEVER append a synthetic `--advice` token.
5. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps. For advice-controlled plans or preserved snapshots, point output to `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Normal default plans with no history do not require, read, or output nonexistent progress links.
  * `/code` owns durable lifecycle/finalization under `## Caller lifecycle binding` in `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) only when mode is explicit/inherited, and parent-only receipt/progress publication under neutral `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install) in all applicable modes. Do not mutate captured paths/index identities or fabricate completion after `/code` seals a run; this router duplicates neither publication nor durable operations.
  * Any post-completion administrative receipt must be strictly OUTSIDE the captured baseline snapshot, identify the approved snapshot, and cannot claim unreviewed edits. Only bounded administrative receipt and progress publication outside baseline is permitted per `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install).
  - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  - **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `ai-multimodal` skills on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skills to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
