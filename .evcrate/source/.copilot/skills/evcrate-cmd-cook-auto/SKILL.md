---
name: "evcrate-cmd-cook-auto"
description: "Implement a feature automatically with plan and quality gates"
argument-hint: "[tasks] [--advice]"
user-invocable: true
disable-model-invocation: true
---

## Invocation contract

The literal `$ARGUMENTS` is the exact raw text following `/evcrate-cmd-cook-auto`. Do not split, normalize, or discard it before the canonical command parses it.

Read the mandatory documentation ownership policy at `@evcrate/workflows/documentation-management.md`. The workflow list below is navigation, not a preload instruction. Follow the canonical command's read conditions and activation-first ordering; load full mentoring only after resolved explicit or inherited mode.

## Available workflow assets

- `@evcrate/workflows/advice-activation.md`
- `@evcrate/workflows/advisor-mentoring.md`
- `@evcrate/workflows/advisory-interview.md`
- `@evcrate/workflows/development-rules.md`
- `@evcrate/workflows/documentation-management.md`
- `@evcrate/workflows/orchestration-protocol.md`
- `@evcrate/workflows/plan-progress.md`
- `@evcrate/workflows/primary-workflow.md`

**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>$ARGUMENTS</raw-tasks>

## Canonical checkpoint routing

When advice mode is active (`explicit` or `inherited`), named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in `.copilot/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence and does not duplicate route or adapter selection. In `off` mode, named checkpoints and mentoring lifecycle are never invoked.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.copilot/evcrate/workflows/advice-activation.md` with original `$ARGUMENTS`, canonical `context.command: "cook/auto"`, the current root and any direct caller handoff.
Preserve known direct-caller selections; use `work_target: "cook/auto"` only when no caller target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.
Apply neutral `.copilot/evcrate/workflows/plan-progress.md` in every mode. Only resolved `explicit` or `inherited` loads `.copilot/evcrate/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
This command is a stateless router; `/evcrate-cmd-code` owns implementation and finalization. Delegate structured pre-run/same-run context per the activation contract, never initialize merely to route or append a synthetic flag.
**IMPORTANT:** Analyze the list of skills  at `.copilot/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `/evcrate-cmd-cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `user input` before continuing.
3. Trigger slash command `/evcrate-cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `/evcrate-cmd-code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates without appending a synthetic `--advice` flag. Pass structured pre-run or same-run context per `.copilot/evcrate/workflows/advice-activation.md` when advice mode is active (`explicit` or `inherited`); pass no activation handoff when `off`. `/evcrate-cmd-code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` in `.copilot/evcrate/workflows/advisor-mentoring.md` and neutral reconciliation per `.copilot/evcrate/workflows/plan-progress.md`. Root `/evcrate-cmd-cook-auto` is a delegate router and delegates ownership to `/evcrate-cmd-code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even in `off` mode; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
5. Postimplementation, overview, and commit handling:
   - Under advice mode or plans with preserved historical snapshots: point startup and final output to the derived live overview at `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Parent plan-owning completion (`/evcrate-cmd-code`) writes mandatory outside-snapshot immutable phase completion receipts and updates live `progress.md` per `.copilot/evcrate/workflows/plan-progress.md`; `/evcrate-cmd-cook-auto` does not duplicate publication. Selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `/evcrate-cmd-code` before sealing.
   - In `off` mode (default operational branch): explicitly preserve existing default-mode postimplementation behavior: use `user input` tool to ask user if he wants to commit to git repository, if yes trigger `/evcrate-cmd-git-cm` slash command to create a commit. Normal default plans with no history do not require, read, or output nonexistent progress links. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.
**Fallback handoff:** If requirements, risk, or scope require base `/evcrate-cmd-cook`, invoke
it with `WORK_ARGUMENTS` and structured caller context per `.copilot/evcrate/workflows/advice-activation.md`
(pre-run or same-run when advice mode is active; no handoff when `off`). Never append a synthetic `--advice` flag.
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `/evcrate-cmd-cook` when requirements, risk, or scope need explicit discussion.
