---
argument-hint: "[issues] [--advice]"
description: "Analyze and fix small issues [FAST]"
---

Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
**Think hard** to analyze and fix these issues:
<raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Native command execution validates and resolves advice activation prior to prompt admission, prepending the compact `evcrate_omp_command_context` header (version 2, source "native-user").
For a valid version-2 header from this command's admission, consume its validated `ADVICE_MODE = evcrate_omp_command_context.mode`, exact `context`, and `run`; `WORK_ARGUMENTS` is the work input already admitted once in this command body. Do not re-invoke the HOME helper. A header for another command is parent context, never this command's result.
When delegating directly to this command within a session or reading its definition, resolve activation by invoking the HOME helper per `./.omp/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advice-activation.md` with the exact child arguments, canonical `context.command: "fix/fast"`, exact child `work_target`, and the exact handoff of the current call. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts. Never reuse a parent command's activation result or synthesize a native header. Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`.
If `evcrate_omp_command_context` is missing or invalid on native entry, or if helper evaluation fails, treat activation as failed and fail closed per the shared activation contract.

Apply neutral `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.

## Workflow
1. If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.
2. Use `debugger` subagent to find the root cause of the issues and report back to main agent.
3. Activate `debugging` skills and `problem-solving` skills to tackle the issues.
4. Start implementing the fix based the reports and solutions.
5. Use `tester` agent to test the fix and make sure it works, then report back to main agent.
6. If there are issues or failed tests, repeat from step 4. In `off` mode, a second consecutive matching terminal blocker escalates through ordinary debugger/user handling before another attempt.
7. Review and finalization:
   - **Under `off` advice mode**: Respond back to user with a summary of the changes and explain everything briefly, ask user for approval, guide user to get started, and suggest next steps. If executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`; prior sealed paths remain immutable.
   - **Under `explicit` or `inherited` advice mode**:
     * Delegate to `code-reviewer` and wait for its terminal report. Enforce a writer barrier before checkpoint reservation.
     * Enter the canonical checkpoint dispatcher at `review:fix-fast` under `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`.
     * Parent is sole durable-state owner (`init`, `checkpoint`, `disposition`, `outcome`, `complete`). Child agents (`debugger`, `tester`, `code-reviewer`) report terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage files behind the parent.
     * Review/advisor cycle cap: at most three terminal reviewer/advisor cycles.
     * For accepted corrections, record `state disposition` with `action: "accept"` and registered action before writes, implement fix, validate, and record truthful `outcome`. For disputed counsel, record supported disposition without action, collect evidence, obtain fresh same-run counsel.
     * Complete ONCE via `state complete`. Write immutable completion receipt outside captured baseline snapshot and update derived overview `<plan-dir>/progress.md` per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
