---
description: "Implement a feature automatically with plan and quality gates"
argument-hint: "[tasks] [--advice]"
---
**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

When advice mode is active (`explicit` or `inherited`), named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in `.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence and does not duplicate route or adapter selection. In `off` mode, named checkpoints and mentoring lifecycle are never invoked.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.claude/workflows/advice-activation.md` with original `$ARGUMENTS`, canonical `context.command: "cook/auto"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "cook/auto"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.claude/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.claude/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
This command is a stateless router; `/code` owns implementation and finalization. Delegate structured pre-run/same-run context per the activation contract, never initialize merely to route or append a synthetic flag.
**IMPORTANT:** Analyze the list of skills  at `.claude/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `AskUserQuestion` before continuing.
3. Trigger slash command `/plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates without appending a synthetic `--advice` flag. Pass structured pre-run or same-run context per `.claude/workflows/advice-activation.md` when advice mode is active (`explicit` or `inherited`); pass no activation handoff when `off`. `/code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` in `.claude/workflows/advisor-mentoring.md` and neutral reconciliation per `.claude/workflows/plan-progress.md`. Root `/cook:auto` is a delegate router and delegates ownership to `/code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even in `off` mode; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
5. Postimplementation, overview, and commit handling:
   - Under advice mode or plans with preserved historical snapshots: point startup and final output to the derived live overview at `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Parent plan-owning completion (`/code`) writes mandatory outside-snapshot immutable phase completion receipts and updates live `progress.md` per `.claude/workflows/plan-progress.md`; `/cook:auto` does not duplicate publication. Selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `/code` before sealing.
   - In `off` mode (default operational branch): explicitly preserve existing default-mode postimplementation behavior: use `AskUserQuestion` tool to ask user if he wants to commit to git repository, if yes trigger `/git:cm` slash command to create a commit. Normal default plans with no history do not require, read, or output nonexistent progress links. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.
**Fallback handoff:** If requirements, risk, or scope require base `/cook`, invoke
it with `WORK_ARGUMENTS` and structured caller context per `.claude/workflows/advice-activation.md`
(pre-run or same-run when advice mode is active; no handoff when `off`). Never append a synthetic `--advice` flag.
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/cook` when requirements, risk, or scope need explicit discussion.
