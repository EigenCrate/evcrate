---
argument-hint: "[tasks] [--advice]"
description: "Implement a feature automatically with plan and quality gates"
---

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

When advice mode is active (`explicit` or `inherited`), named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence and does not duplicate route or adapter selection. In `off` mode, named checkpoints and mentoring lifecycle are never invoked.

## Advice Mode

Native command execution validates and resolves advice activation prior to prompt admission, prepending the compact `evcrate_omp_command_context` header (version 2, source "native-user").
For a valid version-2 header from this command's admission, consume its validated `ADVICE_MODE = evcrate_omp_command_context.mode`, exact `context`, and `run`; `WORK_ARGUMENTS` is the work input already admitted once in this command body. Do not re-invoke the HOME helper. A header for another command is parent context, never this command's result.
When delegating directly to this command within a session or reading its definition:
- If admitted with a delegated header (source "delegated"), consume its validated mode, context, and run.
- Otherwise, resolve activation by invoking the HOME helper per `./.omp/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advice-activation.md` with the exact child arguments, canonical `context.command: "cook/auto"`, exact child `work_target`, and the direct caller's exact handoff (including null handoff when off). Never reuse a parent command's activation result or synthesize a native header. Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`.
If `evcrate_omp_command_context` is missing or invalid on native entry, or if helper evaluation fails, treat activation as failed and fail closed per the shared activation contract.
Apply neutral `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
This command is a stateless router; `/cmd-code` owns implementation and finalization. Delegate structured pre-run/same-run context per the activation contract, never initialize merely to route or append a synthetic flag.
**IMPORTANT:** Analyze the list of skills  at `.omp/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/cmd-cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `ask the user` before continuing.
3. Trigger slash command `/cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/cmd-code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates without appending a synthetic `--advice` flag. Pass structured pre-run or same-run context per `.omp/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advice-activation.md` when advice mode is active (`explicit` or `inherited`); pass no activation handoff when `off`. `/cmd-code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` in `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and neutral reconciliation per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`. Root `/cmd-cook__auto` is a delegate router and delegates ownership to `/cmd-code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even in `off` mode; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
5. Postimplementation, overview, and commit handling:
   - Under advice mode or plans with preserved historical snapshots: point startup and final output to the derived live overview at `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Parent plan-owning completion (`/cmd-code`) writes mandatory outside-snapshot immutable phase completion receipts and updates live `progress.md` per `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`; `/cmd-cook__auto` does not duplicate publication. Selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `/cmd-code` before sealing.
   - In `off` mode (default operational branch): explicitly preserve existing default-mode postimplementation behavior: use `ask the user` tool to ask user if he wants to commit to git repository, if yes trigger `/cmd-git__cm` slash command to create a commit. Normal default plans with no history do not require, read, or output nonexistent progress links. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.
**Fallback handoff:** If requirements, risk, or scope require base `/cmd-cook`, invoke
it with `WORK_ARGUMENTS` and structured caller context per `.omp/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advice-activation.md`
(pre-run or same-run when advice mode is active; no handoff when `off`). Never append a synthetic `--advice` flag.
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cmd-cook` when requirements, risk, or scope need explicit discussion.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
