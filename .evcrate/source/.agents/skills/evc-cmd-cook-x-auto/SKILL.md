---
name: "evc-cmd-cook-x-auto"
description: "Implement a feature automatically with plan and quality gates"
---

# evc-cmd-cook-x-auto

Command Path: $evc-cmd-cook-x-auto

Description: Implement a feature automatically with plan and quality gates

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

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
**Ultrathink** to plan & start working on these tasks follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules:
<raw-tasks>{{args}}</raw-tasks>

## Canonical checkpoint routing

When advice mode is active (`explicit` or `inherited`), named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in `.codex/workflows/advisor-mentoring.md` if present; otherwise read `~/.codex/workflows/advisor-mentoring.md` (the published install); this command supplies bounded evidence and does not duplicate route or adapter selection. In `off` mode, named checkpoints and mentoring lifecycle are never invoked.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.codex/workflows/advice-activation.md` if present; otherwise read `~/.codex/workflows/advice-activation.md` (the published install) with original `{{args}}`, canonical `context.command: "cook/auto"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "cook/auto"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.codex/workflows/advisor-mentoring.md` and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
This command is a stateless router; `$evc-cmd-code` owns implementation and finalization. Delegate structured pre-run/same-run context per the activation contract, never initialize merely to route or append a synthetic flag.
**IMPORTANT:** Analyze the list of skills  at `.agents/skills/*` and intelligently activate the skills that are needed for the task during the process.
**Ensure token efficiency while maintaining high quality.**

## Workflow

This is the lower-friction `$evc-cmd-cook` variant. It can reduce user checkpoints, but it must not bypass planning, tests, or review.

1. Create a concise preflight contract:
   - output
   - acceptance criteria
   - scope boundary
   - risk/public contract areas
   - affected systems
   - testing strategy
   - unresolved questions
2. If unresolved questions can cause incorrect implementation, use `request_user_input` before continuing.
3. Trigger slash command `$evc-cmd-plan <detailed-instruction-prompt>` to create an implementation plan based on the preflight contract and tasks.
4. Trigger slash command `$evc-cmd-code <plan>` to implement the plan with compile/typecheck, tests, code review, and approval gates without appending a synthetic `--advice` flag. Pass structured pre-run or same-run context per `.codex/workflows/advice-activation.md` when advice mode is active (`explicit` or `inherited`); pass no activation handoff when `off`. `$evc-cmd-code` is the sole durable-state owner and enforces the full lifecycle per `## Caller lifecycle binding` in `.codex/workflows/advisor-mentoring.md` and neutral reconciliation per `.codex/workflows/plan-progress.md`. Root `$evc-cmd-cook-x-auto` is a delegate router and delegates ownership to `$evc-cmd-code`; do not duplicate publication or durable controller operations. Preserved historical snapshot protection applies across runs even in `off` mode; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
5. Postimplementation, overview, and commit handling:
   - Under advice mode or plans with preserved historical snapshots: point startup and final output to the derived live overview at `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker); old sealed `plan.md` remains untouched. Parent plan-owning completion (`$evc-cmd-code`) writes mandatory outside-snapshot immutable phase completion receipts and updates live `progress.md` per `.codex/workflows/plan-progress.md`; `$evc-cmd-cook-x-auto` does not duplicate publication. Selected Git decisions and index transitions belong to the implementation owner's pre-outcome finalization and were executed by `$evc-cmd-code` before sealing.
   - In `off` mode (default operational branch): explicitly preserve existing default-mode postimplementation behavior: use `request_user_input` tool to ask user if he wants to commit to git repository, if yes trigger `$evc-cmd-git-x-cm` slash command to create a commit. Normal default plans with no history do not require, read, or output nonexistent progress links. Preserve scoped approval and commit behavior; do not execute an automatic commit without explicit user confirmation.
**Fallback handoff:** If requirements, risk, or scope require base `$evc-cmd-cook`, invoke
it with `WORK_ARGUMENTS` and structured caller context per `.codex/workflows/advice-activation.md`
(pre-run or same-run when advice mode is active; no handoff when `off`). Never append a synthetic `--advice` flag.
**Positioning:** Use this for familiar product work where the user trusts the default workflow. Use base `$evc-cmd-cook` when requirements, risk, or scope need explicit discussion.
